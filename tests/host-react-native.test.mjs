import assert from "node:assert/strict";
import test from "node:test";

import { A2UI_MIME_TYPE, createA2uiV1BasicCatalogPolicy } from "../packages/a2ui/dist/index.js";
import {
  MCP_NATIVE_HOST_EXTENSION_CAPABILITIES,
  McpNativeHostController,
  McpNativeHostControllerError,
} from "../packages/host/dist/index.js";
import {
  MCP_NATIVE_HOST_MAX_ORDINARY_TEXT_LENGTH,
  McpNativeHostProvider,
  McpNativeRegisteredHostResultView,
  McpNativeHostRenderError,
  McpNativeHostResultView,
  useMcpNativeHost,
} from "../packages/host/dist/react-native.js";
import {
  A2UI_V1_NATIVE_COMPONENT_NAMES,
  A2uiV1NativeMountError,
  createA2uiV1NativeHost,
} from "../packages/react-native/dist/index.js";
import { MCP_APPS_MIME_TYPE, MCP_APPS_PROTOCOL_VERSION } from "../packages/webview/dist/index.js";
import { StrictMode, act, createElement, useEffect } from "react";
import { createRoot } from "test-renderer";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function hostComponent(type) {
  return function HostComponent(props) {
    return createElement(type, props, props.children);
  };
}

const components = {
  View: hostComponent("View"),
  Text: hostComponent("Text"),
  Button: hostComponent("Button"),
  TextInput: hostComponent("TextInput"),
};

const a2uiPolicy = createA2uiV1BasicCatalogPolicy({
  allowedComponentNames: A2UI_V1_NATIVE_COMPONENT_NAMES,
});

const retryable = () => ({ kind: "retryable", code: "network-unavailable" });

function createController({
  tool = { name: "status", inputSchema: { type: "object" } },
  tools = [tool],
  nextCursor,
  result = { content: [{ type: "text", text: "Ready" }] },
  readResource = async () => ({ contents: [] }),
  extensions = {},
} = {}) {
  return new McpNativeHostController({
    createConnection: () => ({
      client: {
        async listTools() {
          return { tools, ...(nextCursor === undefined ? {} : { nextCursor }) };
        },
        async callTool(name, arguments_) {
          return typeof result === "function" ? result(name, arguments_) : result;
        },
        readResource,
        getClientExtensionSettings() {
          return extensions;
        },
        getServerExtensionSettings() {
          return extensions;
        },
      },
      async connect() {},
      async close() {},
    }),
    classifyError: retryable,
  });
}

function resultViewProps(overrides = {}) {
  return {
    components,
    a2uiPolicy,
    onA2uiAction() {},
    onError() {},
    ...overrides,
  };
}

async function nextTurn() {
  await new Promise((resolve) => setImmediate(resolve));
}

async function waitUntil(predicate, remainingTurns = 20) {
  if (predicate()) return;
  if (remainingTurns === 0) throw new Error("Condition did not become true");
  await nextTurn();
  await waitUntil(predicate, remainingTurns - 1);
}

async function mountHost(
  controller,
  viewProps = resultViewProps(),
  expectedToolsKind = "ready",
  ResultView = McpNativeHostResultView,
) {
  let host;
  const observedHosts = [];
  function Probe() {
    host = useMcpNativeHost();
    observedHosts.push(host);
    return null;
  }
  const errors = [];
  const root = createRoot({ textComponentTypes: ["Text"] });
  await act(async () => {
    root.render(
      createElement(
        McpNativeHostProvider,
        {
          controller,
          onError: (error) => errors.push(error),
        },
        [
          createElement(Probe, { key: "probe" }),
          createElement(ResultView, {
            key: "result",
            ...viewProps,
            onError: (error) => {
              errors.push(error);
              return viewProps.onError(error);
            },
          }),
        ],
      ),
    );
  });
  await act(async () => {
    await waitUntil(() => host?.snapshot.tools.kind === expectedToolsKind);
  });
  return {
    errors,
    observedHosts,
    get host() {
      return host;
    },
    root,
  };
}

function textValues(root) {
  return root.container
    .queryAll((element) => element.type === "Text")
    .map((element) => element.children.join(""));
}

async function initializeMcpAppsView(appProps) {
  appProps.webViewProps.onMessage({
    nativeEvent: {
      data: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "ui/initialize",
        params: {
          appInfo: { name: "test-app", version: "1.0.0" },
          appCapabilities: {},
          protocolVersion: MCP_APPS_PROTOCOL_VERSION,
        },
      }),
    },
  });
  await nextTurn();
  appProps.webViewProps.onMessage({
    nativeEvent: {
      data: JSON.stringify({
        jsonrpc: "2.0",
        method: "ui/notifications/initialized",
        params: {},
      }),
    },
  });
  await nextTurn();
}

test("provider owns startup, snapshots, exact calls, and shutdown", async () => {
  let closes = 0;
  const controller = new McpNativeHostController({
    createConnection: () => ({
      client: {
        async listTools() {
          return { tools: [{ name: "status", inputSchema: { type: "object" } }] };
        },
        async callTool(_name, arguments_) {
          return { content: [{ type: "text", text: `Madrid: ${arguments_.unit}` }] };
        },
        async readResource() {
          return { contents: [] };
        },
        getClientExtensionSettings() {
          return {};
        },
        getServerExtensionSettings() {
          return {};
        },
      },
      async connect() {},
      async close() {
        closes += 1;
      },
    }),
    classifyError: retryable,
  });
  const mounted = await mountHost(controller);

  await act(async () => mounted.host.callTool("status", { unit: "C" }));

  assert.equal(mounted.host.snapshot.call.kind, "resolved");
  assert.equal(mounted.host.activeCall.name, "status");
  assert.deepEqual(mounted.host.activeCall.arguments, { unit: "C" });
  assert.equal(Object.isFrozen(mounted.host.activeCall.arguments), true);
  assert.deepEqual(textValues(mounted.root), ["Result", "Madrid: C"]);
  assert.deepEqual(mounted.errors, []);

  await act(async () => mounted.root.unmount());
  await waitUntil(() => closes === 1);
  assert.equal(closes, 1);
});

test("provider rejects an overlapping call without replacing the active result context", async () => {
  let resolveFirstCall;
  const controller = createController({
    result(_name, arguments_) {
      return new Promise((resolve) => {
        resolveFirstCall = () =>
          resolve({ content: [{ type: "text", text: `Madrid: ${arguments_.unit}` }] });
      });
    },
  });
  const mounted = await mountHost(controller);
  let firstCall;
  await act(async () => {
    firstCall = mounted.host.callTool("status", { unit: "C" });
    await nextTurn();
  });

  await act(async () => {
    await assert.rejects(
      () => mounted.host.callTool("status", { unit: "F" }),
      (error) =>
        error instanceof McpNativeHostControllerError && error.code === "operation-in-progress",
    );
  });
  assert.deepEqual(mounted.host.activeCall.arguments, { unit: "C" });
  assert.deepEqual(textValues(mounted.root), ["Working", "The MCP tool is running."]);

  await act(async () => {
    resolveFirstCall();
    await firstCall;
  });
  assert.deepEqual(mounted.host.activeCall.arguments, { unit: "C" });
  assert.deepEqual(textValues(mounted.root), ["Result", "Madrid: C"]);

  await act(async () => mounted.root.unmount());
});

test("provider preserves its result context when call validation or preflight is rejected", async () => {
  const mounted = await mountHost(
    createController({
      result(_name, arguments_) {
        return { content: [{ type: "text", text: `Madrid: ${arguments_.unit}` }] };
      },
    }),
  );
  await act(async () => mounted.host.callTool("status", { unit: "C" }));
  const activeCall = mounted.host.activeCall;

  await act(async () => {
    await assert.rejects(
      () => mounted.host.callTool("unknown", { unit: "F" }),
      (error) => error instanceof McpNativeHostControllerError && error.code === "tool-not-listed",
    );
  });
  assert.equal(mounted.host.activeCall, activeCall);
  assert.deepEqual(textValues(mounted.root), ["Result", "Madrid: C"]);

  await act(async () => {
    await assert.rejects(
      () => mounted.host.callTool("status", /** @type {*} */ (["private malformed input"])),
      (error) =>
        error instanceof McpNativeHostControllerError &&
        error.code === "invalid-call" &&
        !error.message.includes("private malformed input"),
    );
  });
  assert.equal(mounted.host.activeCall, activeCall);
  assert.deepEqual(textValues(mounted.root), ["Result", "Madrid: C"]);

  const abortController = new AbortController();
  abortController.abort();
  await act(async () => {
    await assert.rejects(
      () => mounted.host.callTool("status", { unit: "F" }, { signal: abortController.signal }),
      (error) => error instanceof McpNativeHostControllerError && error.code === "cancelled",
    );
  });
  assert.equal(mounted.host.activeCall, activeCall);
  assert.deepEqual(textValues(mounted.root), ["Result", "Madrid: C"]);

  await act(async () => mounted.root.unmount());
});

test("provider clears stale call context when discovery or connection state resets", async () => {
  const mounted = await mountHost(
    createController({
      result(_name, arguments_) {
        return { content: [{ type: "text", text: `Madrid: ${arguments_.unit}` }] };
      },
    }),
  );

  await act(async () => mounted.host.callTool("status", { unit: "C" }));
  assert.equal(mounted.host.activeCall.result.kind, "ordinary");
  const beforeRefresh = mounted.observedHosts.length;
  await act(async () => mounted.host.refreshTools());
  assert.equal(mounted.host.activeCall, undefined);
  assert.equal(
    mounted.observedHosts
      .slice(beforeRefresh)
      .some((host) => host.snapshot.call.kind === "idle" && host.activeCall !== undefined),
    false,
  );
  assert.deepEqual(textValues(mounted.root), ["Ready", "Choose an available MCP tool."]);

  await act(async () => mounted.host.callTool("status", { unit: "F" }));
  assert.equal(mounted.host.activeCall.result.kind, "ordinary");
  const beforeDisconnect = mounted.observedHosts.length;
  await act(async () => mounted.host.setOnline(false));
  assert.equal(mounted.host.activeCall, undefined);
  assert.equal(
    mounted.observedHosts
      .slice(beforeDisconnect)
      .some((host) => host.snapshot.call.kind === "idle" && host.activeCall !== undefined),
    false,
  );
  assert.deepEqual(textValues(mounted.root), ["Disconnected", "The device is offline."]);
  await act(async () => mounted.host.setOnline(true));
  assert.equal(mounted.host.activeCall, undefined);
  assert.deepEqual(textValues(mounted.root), ["Ready", "Choose an available MCP tool."]);

  await act(async () => mounted.root.unmount());
});

test("provider retains one controller through React Strict Mode effect replay", async () => {
  let connects = 0;
  let closes = 0;
  const controller = new McpNativeHostController({
    createConnection: () => ({
      client: {
        async listTools() {
          return { tools: [] };
        },
        async callTool() {
          return { content: [] };
        },
        async readResource() {
          return { contents: [] };
        },
        getClientExtensionSettings() {
          return {};
        },
        getServerExtensionSettings() {
          return {};
        },
      },
      async connect() {
        connects += 1;
      },
      async close() {
        closes += 1;
      },
    }),
    classifyError: retryable,
  });
  let host;
  function Probe() {
    host = useMcpNativeHost();
    return null;
  }
  const root = createRoot();
  await act(async () => {
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(McpNativeHostProvider, { controller, onError() {} }, createElement(Probe)),
      ),
    );
  });
  await act(async () => waitUntil(() => host?.snapshot.tools.kind === "ready"));
  assert.equal(connects, 1);
  assert.equal(closes, 0);

  await act(async () => root.unmount());
  await waitUntil(() => closes === 1);
  assert.equal(closes, 1);
});

test("empty final tool discovery renders an explicit accessible state", async () => {
  const mounted = await mountHost(createController({ tools: [] }));

  assert.deepEqual(textValues(mounted.root), [
    "No tools",
    "The MCP server did not provide any tools.",
  ]);
  const state = mounted.root.container.queryAll((element) => element.type === "View")[0];
  const [title, detail] = mounted.root.container.queryAll((element) => element.type === "Text");
  assert.equal(state.props.accessible, false);
  assert.equal(title.props.accessibilityRole, "text");
  assert.equal(title.props.allowFontScaling, true);
  assert.equal(detail.props.accessibilityLiveRegion, "polite");
  assert.equal(detail.props.allowFontScaling, true);

  await act(async () => mounted.root.unmount());
});

test("an incomplete paginated tool list renders a retryable error", async () => {
  const mounted = await mountHost(
    createController({ tools: [], nextCursor: "next-page" }),
    resultViewProps(),
    "error",
  );

  assert.deepEqual(textValues(mounted.root), [
    "Tools unavailable",
    "The MCP tool list could not be loaded.",
  ]);
  assert.doesNotMatch(textValues(mounted.root).join(" "), /No tools/);
  assert.deepEqual(mounted.host.snapshot.tools, { kind: "error", code: "invalid-tool-list" });
  const retry = mounted.root.container.queryAll((element) => element.type === "Button")[0];
  assert.equal(retry.props.accessibilityLabel, "Retry");
  await act(async () => retry.props.onPress());
  await act(async () => nextTurn());
  assert.equal(mounted.errors[0].code, "invalid-tool-list");

  await act(async () => mounted.root.unmount());
});

test("ordinary fallback is inert, bounded, and hides errored tool text", async () => {
  const oversized = "x".repeat(MCP_NATIVE_HOST_MAX_ORDINARY_TEXT_LENGTH + 1_000);
  const mounted = await mountHost(
    createController({
      result: {
        content: [
          { type: "text", text: oversized },
          { type: "resource_link", name: "ignored", uri: "https://example.com/private" },
        ],
      },
    }),
  );
  await act(async () => mounted.host.callTool("status"));
  const detail = textValues(mounted.root)[1];
  const state = mounted.root.container.queryAll((element) => element.type === "View")[0];
  assert.equal(state.props.accessible, false);
  assert.equal(detail.length, MCP_NATIVE_HOST_MAX_ORDINARY_TEXT_LENGTH);
  assert.match(detail, /\[Additional MCP content omitted\]$/);
  assert.doesNotMatch(detail, /example\.com/);
  await act(async () => mounted.root.unmount());

  const errored = await mountHost(
    createController({
      result: { isError: true, content: [{ type: "text", text: "server secret" }] },
    }),
  );
  await act(async () => errored.host.callTool("status"));
  assert.deepEqual(textValues(errored.root), ["Tool error", "The MCP tool returned an error."]);
  assert.doesNotMatch(textValues(errored.root).join(" "), /server secret/);
  await act(async () => errored.root.unmount());
});

test("a running tool call renders a busy state and announces it", async () => {
  const announcements = [];
  let resolveCall;
  const controller = createController({
    result: () =>
      new Promise((resolve) => {
        resolveCall = resolve;
      }),
  });
  const mounted = await mountHost(
    controller,
    resultViewProps({ onAnnounce: (message) => announcements.push(message) }),
  );
  let callPromise;
  await act(async () => {
    callPromise = mounted.host.callTool("status");
  });
  const state = mounted.root.container.queryAll((element) => element.type === "View")[0];
  const detail = mounted.root.container.queryAll((element) => element.type === "Text")[1];
  assert.equal(state.props.accessibilityState, undefined);
  assert.deepEqual(detail.props.accessibilityState, { busy: true });
  assert.deepEqual(textValues(mounted.root), ["Working", "The MCP tool is running."]);
  assert.ok(announcements.includes("Working. The MCP tool is running."));

  resolveCall({ content: [{ type: "text", text: "Ready" }] });
  await act(async () => callPromise);
  await act(async () => mounted.root.unmount());
});

test("a failed tool call renders a retry action, assertive severity, and announces it", async () => {
  const announcements = [];
  let callCount = 0;
  const controller = createController({
    result: () => {
      callCount += 1;
      if (callCount === 1) throw new Error("transport down");
      return { content: [{ type: "text", text: "Ready" }] };
    },
  });
  const mounted = await mountHost(
    controller,
    resultViewProps({ onAnnounce: (message) => announcements.push(message) }),
  );
  await act(async () => {
    await mounted.host.callTool("status", { a: 1 }).catch(() => {});
  });
  assert.deepEqual(textValues(mounted.root), [
    "Tool failed",
    "The MCP tool call did not complete.",
  ]);
  const detailText = mounted.root.container.queryAll((element) => element.type === "Text")[1];
  assert.equal(detailText.props.accessibilityLiveRegion, "assertive");
  assert.ok(announcements.includes("Tool failed. The MCP tool call did not complete."));

  const retry = mounted.root.container.queryAll((element) => element.type === "Button")[0];
  await act(async () => retry.props.onPress());
  await act(async () => nextTurn());
  assert.equal(callCount, 2);
  assert.deepEqual(textValues(mounted.root), ["Result", "Ready"]);

  await act(async () => mounted.root.unmount());
});

test("an ordinary result contains a rejected announcer and avoids announcing full text", async () => {
  const announcements = [];
  const oversized = "x".repeat(500);
  const mounted = await mountHost(
    createController({ result: { content: [{ type: "text", text: oversized }] } }),
    resultViewProps({
      onAnnounce(message) {
        announcements.push(message);
        return Promise.reject(new Error("broken async announcer"));
      },
    }),
  );
  await act(async () => mounted.host.callTool("status"));
  await act(async () => nextTurn());
  assert.equal(announcements.at(-1), "Result ready");
  assert.doesNotMatch(announcements.join(" "), new RegExp(oversized));
  assert.equal(textValues(mounted.root)[1], oversized);
  await act(async () => mounted.root.unmount());
});

test("one negotiated A2UI result mounts through the local catalog", async () => {
  const uri = "ui://surface/main";
  const controller = createController({
    result: {
      content: [{ type: "resource_link", name: "surface", uri, mimeType: A2UI_MIME_TYPE }],
    },
    extensions: MCP_NATIVE_HOST_EXTENSION_CAPABILITIES,
    async readResource(requestedUri) {
      assert.equal(requestedUri, uri);
      return {
        contents: [
          {
            uri,
            mimeType: A2UI_MIME_TYPE,
            text: `${JSON.stringify({
              version: "v1.0",
              createSurface: {
                surfaceId: "main",
                components: [{ id: "root", component: "Text", text: "Native result" }],
              },
            })}\n`,
          },
        ],
      };
    },
  });
  const announcements = [];
  const mounted = await mountHost(
    controller,
    resultViewProps({ onAnnounce: (message) => announcements.push(message) }),
  );
  await act(async () => mounted.host.callTool("status"));

  assert.deepEqual(textValues(mounted.root), ["Native result"]);
  const surfaceContainer = mounted.root.container.queryAll((element) => element.type === "View")[0];
  assert.equal(surfaceContainer.props.accessible, false);
  assert.equal(surfaceContainer.props.accessibilityLabel, undefined);
  assert.ok(announcements.includes("Interactive app content ready"));
  assert.deepEqual(mounted.errors, []);
  await act(async () => mounted.root.unmount());
});

test("registered high-level A2UI results contain rejected observers", async (t) => {
  t.mock.method(console, "error", () => {});
  const uri = "ui://surface/layout";
  const controller = createController({
    result: {
      content: [{ type: "resource_link", name: "surface", uri, mimeType: A2UI_MIME_TYPE }],
    },
    extensions: MCP_NATIVE_HOST_EXTENSION_CAPABILITIES,
    async readResource() {
      return {
        contents: [
          {
            uri,
            mimeType: A2UI_MIME_TYPE,
            text: `${JSON.stringify({
              version: "v1.0",
              createSurface: {
                surfaceId: "layout",
                components: [{ id: "root", component: "Divider", axis: "horizontal" }],
              },
            })}\n`,
          },
        ],
      };
    },
  });
  const nativeHost = createA2uiV1NativeHost({
    components: { ...components, Divider: hostComponent("Divider") },
    layoutContracts: {
      Divider: { allowedParents: ["bounded"], sizing: "intrinsic" },
    },
  });
  const mounted = await mountHost(
    controller,
    {
      nativeHost,
      parentLayout: "scroll",
      onA2uiAction() {},
      onError() {
        return Promise.reject(new Error("broken async observer"));
      },
    },
    "ready",
    McpNativeRegisteredHostResultView,
  );

  await act(async () => mounted.host.callTool("status"));
  await act(async () => nextTurn());
  assert.deepEqual(textValues(mounted.root), [
    "Result unavailable",
    "The validated result could not be rendered.",
  ]);
  assert.equal(mounted.errors.length, 1);
  assert.ok(mounted.errors[0] instanceof A2uiV1NativeMountError);
  assert.equal(mounted.errors[0].code, "layout-incompatible");
  await act(async () => mounted.root.unmount());
});

test("A2UI render failures contain a throwing observer and reset for the next call", async (t) => {
  t.mock.method(console, "error", () => {});
  const uri = "ui://surface/main";
  let calls = 0;
  function ThrowingText(props) {
    if (props.children === "Native result") throw new Error("private component failure");
    return createElement("Text", props, props.children);
  }
  const controller = createController({
    result() {
      calls += 1;
      return calls === 1
        ? { content: [{ type: "resource_link", name: "surface", uri, mimeType: A2UI_MIME_TYPE }] }
        : { content: [{ type: "text", text: "Recovered" }] };
    },
    extensions: MCP_NATIVE_HOST_EXTENSION_CAPABILITIES,
    async readResource() {
      return {
        contents: [
          {
            uri,
            mimeType: A2UI_MIME_TYPE,
            text: `${JSON.stringify({
              version: "v1.0",
              createSurface: {
                surfaceId: "main",
                components: [{ id: "root", component: "Text", text: "Native result" }],
              },
            })}\n`,
          },
        ],
      };
    },
  });
  const mounted = await mountHost(
    controller,
    resultViewProps({
      components: { ...components, Text: ThrowingText },
      onError() {
        throw new Error("broken observer");
      },
    }),
  );

  await act(async () => mounted.host.callTool("status"));
  assert.deepEqual(textValues(mounted.root), [
    "Result unavailable",
    "The validated result could not be rendered.",
  ]);
  assert.equal(mounted.errors.length, 1);
  assert.ok(mounted.errors[0] instanceof McpNativeHostRenderError);
  assert.equal(mounted.errors[0].code, "a2ui-render-failed");
  assert.doesNotMatch(mounted.errors[0].message, /private component failure/);

  await act(async () => mounted.host.callTool("status"));
  assert.deepEqual(textValues(mounted.root), ["Result", "Recovered"]);
  await act(async () => mounted.root.unmount());
});

test("MCP Apps session binds one sandbox, sends input and result, and closes", async () => {
  const uri = "ui://weather/app";
  const tool = {
    name: "weather",
    inputSchema: { type: "object" },
    _meta: { ui: { resourceUri: uri, visibility: ["model", "app"] } },
  };
  const toolResult = { content: [{ type: "text", text: "Sunny" }] };
  const outbound = [];

  function AppsView(props) {
    useEffect(
      () => props.bindPostMessage((message) => outbound.push(JSON.parse(message))),
      [props.bindPostMessage],
    );
    return createElement("AppsView", props);
  }

  const mounted = await mountHost(
    createController({
      tool,
      result: toolResult,
      extensions: MCP_NATIVE_HOST_EXTENSION_CAPABILITIES,
      async readResource() {
        return {
          contents: [
            {
              uri,
              mimeType: MCP_APPS_MIME_TYPE,
              text: "<!doctype html><html><head></head><body>Weather</body></html>",
            },
          ],
        };
      },
    }),
    resultViewProps({
      mcpApps: {
        View: AppsView,
        bridgeOptions: {
          hostInfo: { name: "test-host", version: "1.0.0" },
          handlers: {
            authorizeToolCall: () => true,
            callTool: (name, arguments_) => ({
              content: [{ type: "text", text: `${name}:${arguments_.city}` }],
            }),
          },
        },
      },
    }),
  );
  await act(async () => mounted.host.callTool("weather", { city: "Madrid" }));
  await act(async () => {
    await waitUntil(
      () => mounted.root.container.queryAll((element) => element.type === "AppsView").length === 1,
    );
  });
  const app = mounted.root.container.queryAll((element) => element.type === "AppsView")[0];
  assert.ok(app, `errors=${mounted.errors.map((error) => error.code ?? error).join(",")}`);

  await act(async () => {
    app.props.webViewProps.onMessage({
      nativeEvent: {
        data: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "ui/initialize",
          params: {
            appInfo: { name: "test-app", version: "1.0.0" },
            appCapabilities: {},
            protocolVersion: MCP_APPS_PROTOCOL_VERSION,
          },
        }),
      },
    });
    await nextTurn();
    app.props.webViewProps.onMessage({
      nativeEvent: {
        data: JSON.stringify({
          jsonrpc: "2.0",
          method: "ui/notifications/initialized",
          params: {},
        }),
      },
    });
    await nextTurn();
    app.props.webViewProps.onMessage({
      nativeEvent: {
        data: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "weather", arguments: { city: "Madrid" } },
        }),
      },
    });
    await nextTurn();
  });

  assert.ok(
    outbound.some(
      (message) =>
        message.method === "ui/notifications/tool-input" &&
        message.params.arguments.city === "Madrid",
    ),
  );
  assert.ok(
    outbound.some(
      (message) =>
        message.method === "ui/notifications/tool-result" &&
        message.params.content[0].text === "Sunny",
    ),
  );
  assert.ok(
    outbound.some(
      (message) => message.id === 2 && message.result.content[0].text === "weather:Madrid",
    ),
  );

  await act(async () => mounted.root.unmount());
  await nextTurn();
  assert.ok(outbound.some((message) => message.method === "ui/resource-teardown"));
});

test("MCP Apps retries retain their own transport and ignore stale failures", async () => {
  const uri = "ui://weather/app";
  const tool = {
    name: "weather",
    inputSchema: { type: "object" },
    _meta: { ui: { resourceUri: uri } },
  };
  const outboundSessions = [];
  let appProps;
  function AppsView(props) {
    appProps = props;
    useEffect(() => {
      const outbound = [];
      outboundSessions.push(outbound);
      return props.bindPostMessage((message) => outbound.push(JSON.parse(message)));
    }, [props.bindPostMessage]);
    return createElement("AppsView", props);
  }
  const mounted = await mountHost(
    createController({
      tool,
      result: { content: [{ type: "text", text: "Sunny" }] },
      extensions: MCP_NATIVE_HOST_EXTENSION_CAPABILITIES,
      async readResource() {
        return {
          contents: [
            {
              uri,
              mimeType: MCP_APPS_MIME_TYPE,
              text: "<!doctype html><html><head></head><body>Weather</body></html>",
            },
          ],
        };
      },
    }),
    resultViewProps({
      mcpApps: {
        View: AppsView,
        bridgeOptions: { hostInfo: { name: "test-host", version: "1.0.0" } },
      },
    }),
  );

  await act(async () => mounted.host.callTool("weather"));
  const firstAppProps = appProps;
  await act(async () => initializeMcpAppsView(firstAppProps));
  assert.equal(outboundSessions.length, 1);

  firstAppProps.webViewProps.onMessage({ nativeEvent: { data: "not-json" } });
  await act(async () => nextTurn());
  const retry = mounted.root.container.queryAll((element) => element.type === "Button")[0];
  await act(async () => retry.props.onPress());
  await act(async () => waitUntil(() => outboundSessions.length === 2));
  await nextTurn();
  const replacementAppProps = appProps;
  await act(async () => initializeMcpAppsView(replacementAppProps));
  assert.ok(outboundSessions[1].some((message) => message.id === 1 && message.result));

  firstAppProps.webViewProps.onMessage({ nativeEvent: { data: "not-json" } });
  await act(async () => nextTurn());
  assert.equal(mounted.root.container.queryAll((element) => element.type === "AppsView").length, 1);
  assert.equal(mounted.errors.length, 1);
  assert.equal(mounted.errors[0].code, "mcp-app-session-failed");
  await act(async () => mounted.root.unmount());
});

test("MCP Apps session errors close the failed bridge before rendering recovery", async () => {
  const uri = "ui://weather/app";
  const tool = {
    name: "weather",
    inputSchema: { type: "object" },
    _meta: { ui: { resourceUri: uri, visibility: ["model", "app"] } },
  };
  let appProps;
  let proxiedCalls = 0;
  function AppsView(props) {
    appProps = props;
    useEffect(() => props.bindPostMessage(() => {}), [props.bindPostMessage]);
    return createElement("AppsView", props);
  }
  const mounted = await mountHost(
    createController({
      tool,
      result: { content: [{ type: "text", text: "Sunny" }] },
      extensions: MCP_NATIVE_HOST_EXTENSION_CAPABILITIES,
      async readResource() {
        return {
          contents: [
            {
              uri,
              mimeType: MCP_APPS_MIME_TYPE,
              text: "<!doctype html><html><head></head><body>Weather</body></html>",
            },
          ],
        };
      },
    }),
    resultViewProps({
      mcpApps: {
        View: AppsView,
        bridgeOptions: {
          hostInfo: { name: "test-host", version: "1.0.0" },
          handlers: {
            authorizeToolCall: () => true,
            callTool: () => {
              proxiedCalls += 1;
              return { content: [] };
            },
          },
        },
      },
    }),
  );

  await act(async () => mounted.host.callTool("weather"));
  const failedAppProps = appProps;
  await act(async () => initializeMcpAppsView(failedAppProps));
  failedAppProps.webViewProps.onMessage({ nativeEvent: { data: "not-json" } });
  await act(async () => nextTurn());
  assert.deepEqual(textValues(mounted.root), [
    "Interactive result unavailable",
    "The isolated MCP Apps session could not continue.",
  ]);

  failedAppProps.webViewProps.onMessage({
    nativeEvent: {
      data: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "weather", arguments: {} },
      }),
    },
  });
  await act(async () => nextTurn());
  assert.equal(proxiedCalls, 0);
  assert.equal(mounted.errors.length, 1);
  assert.equal(mounted.errors[0].code, "mcp-app-session-failed");
  await act(async () => mounted.root.unmount());
});

test("malformed MCP Apps HTML fails closed before mounting a WebView", async () => {
  const uri = "ui://weather/app";
  const errors = [];
  const tool = {
    name: "weather",
    inputSchema: { type: "object" },
    _meta: { ui: { resourceUri: uri } },
  };
  const mounted = await mountHost(
    createController({
      tool,
      result: { content: [{ type: "text", text: "Sunny" }] },
      extensions: MCP_NATIVE_HOST_EXTENSION_CAPABILITIES,
      async readResource() {
        return {
          contents: [
            {
              uri,
              mimeType: MCP_APPS_MIME_TYPE,
              text: "<!doctype html><html><body>Missing head</body></html>",
            },
          ],
        };
      },
    }),
    resultViewProps({
      onError: (error) => {
        errors.push(error);
        return Promise.reject(new Error("broken async observer"));
      },
      mcpApps: {
        View: hostComponent("AppsView"),
        bridgeOptions: {
          hostInfo: { name: "test-host", version: "1.0.0" },
        },
      },
    }),
  );
  await act(async () => {
    await mounted.host.callTool("weather");
    await nextTurn();
  });

  assert.deepEqual(textValues(mounted.root), [
    "Interactive result unavailable",
    "The isolated MCP Apps session could not be created.",
  ]);
  assert.equal(mounted.root.container.queryAll((element) => element.type === "AppsView").length, 0);
  assert.equal(errors.length, 1);
  assert.ok(errors[0] instanceof McpNativeHostRenderError);
  assert.equal(errors[0].code, "mcp-app-session-failed");
  await act(async () => mounted.root.unmount());
});

test("MCP Apps crashes close the session and expose a recoverable host state", async () => {
  const uri = "ui://weather/app";
  let appProps;
  function AppsView(props) {
    appProps = props;
    useEffect(() => props.bindPostMessage(() => {}), [props.bindPostMessage]);
    return createElement("AppsView", props);
  }
  const mounted = await mountHost(
    createController({
      tool: {
        name: "weather",
        inputSchema: { type: "object" },
        _meta: { ui: { resourceUri: uri } },
      },
      result: { content: [{ type: "text", text: "Sunny" }] },
      extensions: MCP_NATIVE_HOST_EXTENSION_CAPABILITIES,
      async readResource() {
        return {
          contents: [
            {
              uri,
              mimeType: MCP_APPS_MIME_TYPE,
              text: "<!doctype html><html><head></head><body>Weather</body></html>",
            },
          ],
        };
      },
    }),
    resultViewProps({
      mcpApps: {
        View: AppsView,
        bridgeOptions: { hostInfo: { name: "test-host", version: "1.0.0" } },
      },
    }),
  );
  await act(async () => mounted.host.callTool("weather"));
  assert.equal(typeof appProps.onCrash, "function");

  await act(async () => appProps.onCrash());
  assert.deepEqual(textValues(mounted.root), [
    "Interactive view stopped",
    "The isolated MCP Apps view stopped unexpectedly.",
  ]);
  assert.equal(mounted.errors.length, 1);
  assert.equal(mounted.errors[0].code, "mcp-app-crashed");

  const retry = mounted.root.container.queryAll((element) => element.type === "Button")[0];
  const state = mounted.root.container.queryAll((element) => element.type === "View")[0];
  assert.equal(state.props.accessible, false);
  assert.equal(retry.props.accessible, true);
  await act(async () => retry.props.onPress());
  assert.equal(mounted.root.container.queryAll((element) => element.type === "AppsView").length, 1);
  await act(async () => mounted.root.unmount());
});

test("hook rejects use outside the provider", async () => {
  function Probe() {
    useMcpNativeHost();
    return null;
  }
  const root = createRoot();
  await assert.rejects(async () => {
    await act(async () => root.render(createElement(Probe)));
  }, /requires a parent McpNativeHostProvider/);
});
