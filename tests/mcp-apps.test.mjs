import assert from "node:assert/strict";
import test from "node:test";

import {
  LATEST_PROTOCOL_VERSION,
  McpUiInitializeResultSchema,
  McpUiToolInputNotificationSchema,
  McpUiToolInputPartialNotificationSchema,
  McpUiToolResultNotificationSchema,
  McpUiToolVisibilitySchema,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps";

import {
  MCP_APPS_EXTENSION_CAPABILITIES,
  MCP_APPS_EXTENSION_ID,
  MCP_APPS_MAX_PENDING_REQUESTS,
  MCP_APPS_MIME_TYPE,
  MCP_APPS_PROTOCOL_VERSION,
  McpAppsBridge,
  McpAppsBridgeError,
  McpAppsError,
  createMcpAppsContentSecurityPolicy,
  createMcpAppsNativeDeliveryScript,
  createMcpAppsNativeSandbox,
  createMcpAppsReactNativeWebViewProps,
  describeMcpAppsNativeSandbox,
  filterMcpAppsModelTools,
  getMcpAppsPermissionPolicy,
  isMcpAppsGrant,
  loadMcpAppsResource,
  negotiateMcpApps,
  parseMcpAppsToolMeta,
  resolveMcpAppsResource,
} from "../packages/webview/dist/index.js";

const appTool = {
  name: "refresh",
  inputSchema: { type: "object" },
  _meta: {
    ui: {
      resourceUri: "ui://weather/dashboard",
      visibility: ["app"],
    },
  },
};
const modelTool = {
  name: "weather",
  inputSchema: { type: "object" },
  _meta: {
    ui: {
      resourceUri: "ui://weather/dashboard",
      visibility: ["model", "app"],
    },
  },
};
const modelOnlyTool = {
  name: "private-model-tool",
  inputSchema: { type: "object" },
  _meta: { ui: { visibility: ["model"] } },
};

function createResolvedResource(overrides = {}) {
  const grant = negotiateMcpApps(MCP_APPS_EXTENSION_CAPABILITIES, MCP_APPS_EXTENSION_CAPABILITIES);
  assert.equal(grant.kind, "negotiated");
  return resolveMcpAppsResource(
    modelTool,
    {
      contents: [
        {
          uri: "ui://weather/dashboard",
          mimeType: MCP_APPS_MIME_TYPE,
          text: '<!doctype html><html lang="en"><head><title>Weather</title></head><body>ok</body></html>',
          _meta: {
            ui: {
              csp: {
                connectDomains: ["https://api.example.com", "wss://live.example.com"],
                resourceDomains: ["https://cdn.example.com", "https://*.assets.example.com"],
                frameDomains: ["https://video.example.com"],
                baseUriDomains: ["https://cdn.example.com"],
              },
              permissions: { camera: {}, clipboardWrite: {} },
              prefersBorder: true,
              ...overrides,
            },
          },
        },
      ],
    },
    grant,
  );
}

test("stable constants and extension negotiation match the pinned official Apps profile", () => {
  assert.equal(MCP_APPS_EXTENSION_ID, "io.modelcontextprotocol/ui");
  assert.equal(MCP_APPS_PROTOCOL_VERSION, "2026-01-26");
  assert.equal(MCP_APPS_MIME_TYPE, "text/html;profile=mcp-app");
  assert.equal(MCP_APPS_PROTOCOL_VERSION, LATEST_PROTOCOL_VERSION);
  assert.equal(MCP_APPS_MIME_TYPE, RESOURCE_MIME_TYPE);
  assert.equal(Object.isFrozen(MCP_APPS_EXTENSION_CAPABILITIES), true);
  assert.equal(
    Object.isFrozen(MCP_APPS_EXTENSION_CAPABILITIES[MCP_APPS_EXTENSION_ID].mimeTypes),
    true,
  );

  const grant = negotiateMcpApps(MCP_APPS_EXTENSION_CAPABILITIES, MCP_APPS_EXTENSION_CAPABILITIES);
  assert.deepEqual(grant, {
    kind: "negotiated",
    identifier: MCP_APPS_EXTENSION_ID,
    protocolVersion: MCP_APPS_PROTOCOL_VERSION,
    mimeType: MCP_APPS_MIME_TYPE,
  });
  assert.equal(isMcpAppsGrant(grant), true);
  assert.equal(isMcpAppsGrant({ ...grant, extra: true }), false);
  assert.equal(negotiateMcpApps({}, MCP_APPS_EXTENSION_CAPABILITIES).reason, "client-unsupported");
  assert.equal(negotiateMcpApps(MCP_APPS_EXTENSION_CAPABILITIES, {}).reason, "server-unsupported");
  assert.equal(
    negotiateMcpApps(
      { [MCP_APPS_EXTENSION_ID]: { mimeTypes: ["text/html"] } },
      MCP_APPS_EXTENSION_CAPABILITIES,
    ).reason,
    "incompatible-settings",
  );
});

test("tool metadata preserves resource discovery and enforces stable visibility", () => {
  assert.deepEqual(parseMcpAppsToolMeta(appTool), {
    resourceUri: "ui://weather/dashboard",
    visibility: ["app"],
  });
  assert.deepEqual(filterMcpAppsModelTools([appTool, modelTool, modelOnlyTool]), [
    modelTool,
    modelOnlyTool,
  ]);
  assert.equal(McpUiToolVisibilitySchema.safeParse("app").success, true);

  assert.throws(
    () =>
      parseMcpAppsToolMeta({
        ...modelTool,
        _meta: { ui: { resourceUri: "https://example.com/app" } },
      }),
    /credential-free ui:\/\//,
  );
  assert.throws(
    () =>
      parseMcpAppsToolMeta({
        ...modelTool,
        _meta: { ui: { visibility: ["app", "app"] } },
      }),
    /Duplicate visibility/,
  );
  assert.throws(
    () =>
      parseMcpAppsToolMeta({
        ...modelTool,
        _meta: { ui: { visibility: ["app"], permissions: { camera: {} } } },
      }),
    /Unsupported field "permissions"/,
  );
});

test("stable resource resolution preserves bounded CSP, permissions, and blob HTML", () => {
  const resource = createResolvedResource();
  assert.equal(resource.uri, "ui://weather/dashboard");
  assert.equal(resource.meta.prefersBorder, true);
  assert.deepEqual(resource.meta.permissions, { camera: {}, clipboardWrite: {} });
  assert.deepEqual(resource.meta.csp.connectDomains, [
    "https://api.example.com",
    "wss://live.example.com",
  ]);

  const grant = negotiateMcpApps(MCP_APPS_EXTENSION_CAPABILITIES, MCP_APPS_EXTENSION_CAPABILITIES);
  assert.equal(grant.kind, "negotiated");
  const blobHtml = "<!doctype html><html><head></head><body>Olá 🌤️</body></html>";
  const blobResource = resolveMcpAppsResource(
    modelTool,
    {
      contents: [
        {
          uri: "ui://weather/dashboard",
          mimeType: MCP_APPS_MIME_TYPE,
          blob: Buffer.from(blobHtml, "utf8").toString("base64"),
        },
      ],
    },
    grant,
  );
  assert.equal(blobResource.html, blobHtml);

  for (const contents of [
    [],
    [
      {
        uri: "ui://weather/dashboard",
        mimeType: MCP_APPS_MIME_TYPE,
        text: "<!doctype html><html><head></head><body></body></html>",
      },
      {
        uri: "ui://weather/other",
        mimeType: MCP_APPS_MIME_TYPE,
        text: "<!doctype html><html><head></head><body></body></html>",
      },
    ],
  ]) {
    assert.throws(
      () => resolveMcpAppsResource(modelTool, { contents }, grant),
      /Expected exactly one resource/,
    );
  }
  assert.throws(
    () =>
      resolveMcpAppsResource(
        modelTool,
        {
          contents: [
            {
              uri: "ui://weather/dashboard",
              mimeType: "text/html",
              text: "<html></html>",
            },
          ],
        },
        grant,
      ),
    /Expected MCP Apps MIME type/,
  );
  assert.throws(
    () =>
      resolveMcpAppsResource(
        modelTool,
        {
          contents: [
            {
              uri: "ui://weather/dashboard",
              mimeType: MCP_APPS_MIME_TYPE,
              blob: "!!!!",
            },
          ],
        },
        grant,
      ),
    /Invalid base64/,
  );
});

test("resource loading uses the predeclared ui URI exactly once", async () => {
  const grant = negotiateMcpApps(MCP_APPS_EXTENSION_CAPABILITIES, MCP_APPS_EXTENSION_CAPABILITIES);
  assert.equal(grant.kind, "negotiated");
  const reads = [];
  const resource = await loadMcpAppsResource(
    modelTool,
    {
      async readResource(uri) {
        reads.push(uri);
        return {
          contents: [
            {
              uri,
              mimeType: MCP_APPS_MIME_TYPE,
              text: "<!doctype html><html><head></head><body>loaded</body></html>",
            },
          ],
        };
      },
    },
    grant,
  );
  assert.deepEqual(reads, ["ui://weather/dashboard"]);
  assert.match(resource.html, /loaded/);
});

test("Apps discovery and resources fail closed across malformed metadata and content", async () => {
  const grant = negotiateMcpApps(MCP_APPS_EXTENSION_CAPABILITIES, MCP_APPS_EXTENSION_CAPABILITIES);
  assert.equal(grant.kind, "negotiated");
  assert.equal(parseMcpAppsToolMeta({ name: "plain", inputSchema: { type: "object" } }), undefined);
  assert.deepEqual(
    parseMcpAppsToolMeta({
      name: "default-visibility",
      inputSchema: { type: "object" },
      _meta: { ui: {} },
    }),
    { visibility: ["model", "app"] },
  );
  await assert.rejects(
    () =>
      loadMcpAppsResource(
        { name: "plain", inputSchema: { type: "object" } },
        { readResource: async () => ({ contents: [] }) },
        grant,
      ),
    /does not declare/,
  );
  assert.throws(
    () =>
      resolveMcpAppsResource(
        modelTool,
        {
          contents: [
            {
              uri: "ui://weather/other",
              mimeType: MCP_APPS_MIME_TYPE,
              text: "<!doctype html><html><head></head><body></body></html>",
            },
          ],
        },
        grant,
      ),
    /Expected resource URI/,
  );
  assert.throws(
    () =>
      resolveMcpAppsResource(
        modelTool,
        {
          contents: [
            {
              uri: "ui://weather/dashboard",
              mimeType: MCP_APPS_MIME_TYPE,
              text: "x\0y",
            },
          ],
        },
        grant,
      ),
    /NUL characters/,
  );
  assert.throws(
    () =>
      resolveMcpAppsResource(
        modelTool,
        {
          contents: [
            {
              uri: "ui://weather/dashboard",
              mimeType: MCP_APPS_MIME_TYPE,
              blob: "/w==",
            },
          ],
        },
        grant,
      ),
    /valid UTF-8/,
  );
  for (const overrides of [
    { csp: { connectDomains: "https://api.example.com" } },
    { csp: { connectDomains: ["javascript:alert(1)"] } },
    { csp: { resourceDomains: ["https://*.*.example.com"] } },
    { csp: { frameDomains: ["https://example.com/path"] } },
    { permissions: { camera: { mode: "always" } } },
    { permissions: { bluetooth: {} } },
    { unknownSecuritySetting: true },
  ]) {
    assert.throws(() => createResolvedResource(overrides), McpAppsError);
  }
  assert.throws(
    () =>
      createResolvedResource({
        csp: { connectDomains: Array.from({ length: 65 }, (_, index) => `https://a${index}.test`) },
      }),
    /cumulative domains/,
  );
});

test("native sandbox applies CSP and denies ambient WebView capabilities", () => {
  const resource = createResolvedResource();
  const sandbox = createMcpAppsNativeSandbox(resource, {
    grantedPermissions: ["camera", "microphone"],
    allowedExternalOrigins: ["https://docs.example.com"],
  });
  assert.match(sandbox.source.html, /<head><meta http-equiv="Content-Security-Policy"/i);
  assert.match(
    sandbox.contentSecurityPolicy,
    /connect-src https:\/\/api\.example\.com wss:\/\/live\.example\.com/,
  );
  assert.match(sandbox.contentSecurityPolicy, /frame-src https:\/\/video\.example\.com/);
  assert.match(sandbox.contentSecurityPolicy, /object-src 'none'/);
  assert.deepEqual(sandbox.grantedPermissions, ["camera"]);
  assert.deepEqual(getMcpAppsPermissionPolicy(sandbox.grantedPermissions), ["camera"]);
  assert.equal(sandbox.storage, "ephemeral");
  assert.equal(sandbox.cookiesEnabled, false);
  assert.equal(sandbox.fileAccessEnabled, false);
  assert.equal(sandbox.downloads, "host-mediated");
  assert.match(sandbox.injectedJavaScriptBeforeContentLoaded, /ReactNativeWebView/);
  assert.equal(
    sandbox.decideNavigation("ui://weather/dashboard#details", true),
    "allow-in-document",
  );
  assert.equal(sandbox.decideNavigation("https://docs.example.com/help", true), "open-externally");
  assert.equal(sandbox.decideNavigation("https://evil.example/help", true), "deny");
  assert.equal(sandbox.decideNavigation("file:///etc/passwd", true), "deny");
  assert.deepEqual(describeMcpAppsNativeSandbox(sandbox).grantedPermissions, ["camera"]);
  const delivery = createMcpAppsNativeDeliveryScript(
    JSON.stringify({ jsonrpc: "2.0", method: "ping", params: {} }),
  );
  assert.match(delivery, /__MCP_NATIVE_DELIVER__/);
  assert.doesNotMatch(delivery, /eval\(/);
  assert.throws(() => createMcpAppsNativeDeliveryScript("alert(1)"), /valid JSON/);

  assert.throws(
    () =>
      createMcpAppsReactNativeWebViewProps(sandbox, {
        onMessage() {},
        onError() {},
      }),
    /cannot enforce sensitive permission grants/,
  );
  const deniedPermissionSandbox = createMcpAppsNativeSandbox(resource);
  const nativeMessages = [];
  const externalLinks = [];
  const callbackErrors = [];
  const props = createMcpAppsReactNativeWebViewProps(deniedPermissionSandbox, {
    onMessage(message) {
      nativeMessages.push(message);
    },
    onExternalLink(uri) {
      externalLinks.push(uri);
    },
    onError(error) {
      callbackErrors.push(error);
    },
  });
  assert.equal(props.incognito, true);
  assert.equal(props.mediaCapturePermissionGrantType, "deny");
  props.onMessage({ nativeEvent: { data: '{"jsonrpc":"2.0","method":"ping"}' } });
  assert.deepEqual(nativeMessages, ['{"jsonrpc":"2.0","method":"ping"}']);
  assert.equal(
    props.onShouldStartLoadWithRequest({
      url: "https://docs.example.com/help",
      navigationType: "click",
    }),
    false,
  );
  assert.deepEqual(externalLinks, []);
  assert.deepEqual(callbackErrors, []);

  const defaults = createMcpAppsContentSecurityPolicy();
  assert.match(defaults, /connect-src 'none'/);
  assert.match(defaults, /frame-src 'none'/);
  assert.match(defaults, /base-uri 'self'/);

  assert.throws(
    () =>
      createMcpAppsNativeSandbox({
        ...resource,
        html: "<html><head></head><body>missing doctype</body></html>",
      }),
    /HTML5 doctype/,
  );
  const quotedFakeHead = createMcpAppsNativeSandbox({
    ...resource,
    html: '<!doctype html><html data-marker="><head>"><head><script>fetch("https://evil.test")</script></head><body></body></html>',
  });
  assert.match(
    quotedFakeHead.source.html,
    /^<!doctype html><html data-marker="><head>"><head><meta http-equiv="Content-Security-Policy"/i,
  );
  assert.equal(
    quotedFakeHead.source.html.indexOf('<meta http-equiv="Content-Security-Policy"'),
    quotedFakeHead.source.html.lastIndexOf('<meta http-equiv="Content-Security-Policy"'),
  );
  assert.throws(
    () =>
      createMcpAppsNativeSandbox({
        ...resource,
        html: '<!doctype html><html a"><head><script>alert(1)</script></head><body x="><head>',
      }),
    /HTML5 doctype, html element, and head element/,
  );
  assert.throws(
    () => createMcpAppsNativeSandbox(createResolvedResource({ domain: "view.example.com" })),
    /sandbox domain is unsupported/,
  );
});

test("native sandbox covers explicit origins, permissions, and adapter failure paths", () => {
  const resource = createResolvedResource();
  const sandbox = createMcpAppsNativeSandbox(resource, {
    grantedPermissions: ["clipboardWrite", "geolocation"],
    allowedExternalOrigins: ["https://docs.example.com"],
  });
  assert.deepEqual(sandbox.grantedPermissions, ["clipboardWrite"]);
  assert.deepEqual(getMcpAppsPermissionPolicy(["microphone", "geolocation", "clipboardWrite"]), [
    "microphone",
    "geolocation",
    "clipboard-write",
  ]);
  assert.equal(sandbox.allowsPermission("clipboardWrite"), true);
  assert.equal(sandbox.allowsPermission("camera"), false);
  assert.equal(sandbox.decideNavigation("about:blank", false), "allow-in-document");
  assert.equal(sandbox.decideNavigation("not a uri", true), "deny");

  const dedicated = createMcpAppsNativeSandbox(createResolvedResource({ domain: "view.example" }), {
    approveDedicatedDomain: (domain) => domain === "view.example",
  });
  assert.equal(dedicated.source.baseUrl, "ui://weather/dashboard");
  assert.throws(
    () => createMcpAppsNativeSandbox(resource, { grantedPermissions: ["bluetooth"] }),
    /Unsupported native WebView permission/,
  );
  for (const origins of [
    ["file:///tmp/app"],
    ["https://user:secret@example.com"],
    ["https://example.com/path"],
    Array.from({ length: 65 }, (_, index) => `https://a${index}.test`),
  ]) {
    assert.throws(
      () => createMcpAppsNativeSandbox(resource, { allowedExternalOrigins: origins }),
      McpAppsError,
    );
  }
  assert.throws(
    () => createMcpAppsNativeDeliveryScript(JSON.stringify(["not", "an", "object"])),
    /JSON-RPC object/,
  );
  assert.throws(
    () => createMcpAppsNativeDeliveryScript(" ".repeat(1_048_577)),
    /serialized size limit/,
  );

  const noPermissionSandbox = createMcpAppsNativeSandbox(resource, {
    allowedExternalOrigins: ["https://docs.example.com"],
  });
  const opened = [];
  const callbackErrors = [];
  const props = createMcpAppsReactNativeWebViewProps(noPermissionSandbox, {
    onMessage() {},
    onExternalLink(uri) {
      opened.push(uri);
    },
    onError(error) {
      callbackErrors.push(error);
    },
  });
  assert.equal(
    props.onShouldStartLoadWithRequest({
      url: "https://docs.example.com/help",
      navigationType: "click",
    }),
    false,
  );
  assert.deepEqual(opened, ["https://docs.example.com/help"]);
  props.onMessage({ nativeEvent: { data: { jsonrpc: "2.0" } } });
  assert.match(callbackErrors.at(-1).message, /messages must be strings/);
  assert.throws(
    () =>
      createMcpAppsReactNativeWebViewProps(noPermissionSandbox, {
        onMessage() {},
      }),
    /onError callback/,
  );
});

test("native WebView adapter contains synchronous and asynchronous callback failures", async () => {
  const sandbox = createMcpAppsNativeSandbox(createResolvedResource(), {
    allowedExternalOrigins: ["https://docs.example.com"],
  });
  const callbackErrors = [];
  const props = createMcpAppsReactNativeWebViewProps(sandbox, {
    async onMessage() {
      throw new Error("message rejected");
    },
    onExternalLink() {
      throw new Error("link rejected");
    },
    onError(error) {
      callbackErrors.push(error);
    },
  });

  props.onMessage({ nativeEvent: { data: "{}" } });
  assert.equal(
    props.onShouldStartLoadWithRequest({
      url: "https://docs.example.com/help",
      navigationType: "click",
    }),
    false,
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(callbackErrors.map((error) => error.message).sort(), [
    "link rejected",
    "message rejected",
  ]);

  const brokenBoundary = createMcpAppsReactNativeWebViewProps(sandbox, {
    onMessage() {
      throw new Error("contained callback failure");
    },
    async onError() {
      throw new Error("contained boundary failure");
    },
  });
  assert.doesNotThrow(() => brokenBoundary.onMessage({ nativeEvent: { data: "{}" } }));
  await new Promise((resolve) => setImmediate(resolve));
});

function createBridgeFixture(overrides = {}) {
  const sent = [];
  const calls = [];
  const resource = createResolvedResource();
  const sandbox = createMcpAppsNativeSandbox(resource, { grantedPermissions: ["camera"] });
  const bridge = new McpAppsBridge({
    postMessage(message) {
      const parsed = JSON.parse(message);
      sent.push(parsed);
      return overrides.afterPostMessage?.(parsed);
    },
    hostInfo: { name: "mcp-native-test", version: "0.5.0" },
    hostContext: {
      platform: "mobile",
      theme: "dark",
      displayMode: "inline",
      availableDisplayModes: ["inline", "fullscreen"],
    },
    tools: [appTool, modelTool, modelOnlyTool],
    resource,
    sandbox,
    handlers: {
      authorizeToolCall() {
        return true;
      },
      async callTool(name, arguments_, requestMeta) {
        calls.push(["callTool", name, arguments_, requestMeta]);
        return { content: [{ type: "text", text: "fresh" }], structuredContent: { ok: true } };
      },
      async readResource(uri) {
        calls.push(["readResource", uri]);
        return { contents: [{ uri, mimeType: "text/plain", text: "resource" }] };
      },
      async openLink(url) {
        calls.push(["openLink", url]);
        return url.startsWith("https://docs.example.com/");
      },
      async sendMessage(message) {
        calls.push(["message", message]);
      },
      async updateModelContext(context) {
        calls.push(["context", context]);
      },
      async requestDisplayMode(mode) {
        calls.push(["display", mode]);
        return mode;
      },
      log(message) {
        calls.push(["log", message]);
      },
      sizeChanged(size) {
        calls.push(["size", size]);
      },
      ...overrides.handlers,
    },
    ...overrides.options,
  });
  return { bridge, calls, sent };
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function initializeBridge(fixture) {
  await fixture.bridge.receive(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "ui/initialize",
      params: {
        appInfo: { name: "weather-app", version: "1.0.0" },
        appCapabilities: { availableDisplayModes: ["inline", "fullscreen"] },
        protocolVersion: MCP_APPS_PROTOCOL_VERSION,
      },
    }),
  );
  assert.equal(fixture.bridge.state, "awaiting-initialized");
  assert.equal(McpUiInitializeResultSchema.safeParse(fixture.sent.at(-1).result).success, true);
  await fixture.bridge.receive({
    jsonrpc: "2.0",
    method: "ui/notifications/initialized",
    params: {},
  });
  assert.equal(fixture.bridge.state, "ready");
}

test("bridge implements the official initialization and tool-data lifecycle", async () => {
  const fixture = createBridgeFixture();
  await assert.rejects(
    () => fixture.bridge.sendToolInput({ location: "Madrid" }),
    /bridge state is awaiting-initialize/,
  );
  await initializeBridge(fixture);
  assert.deepEqual(fixture.bridge.hostCapabilities.sandbox.permissions, { camera: {} });

  await fixture.bridge.sendPartialToolInput({ loc: "Mad" });
  assert.equal(
    McpUiToolInputPartialNotificationSchema.safeParse(fixture.sent.at(-1)).success,
    true,
  );
  await fixture.bridge.sendToolInput({ location: "Madrid" });
  assert.equal(McpUiToolInputNotificationSchema.safeParse(fixture.sent.at(-1)).success, true);
  await fixture.bridge.sendToolResult({
    content: [{ type: "text", text: "Sunny" }],
    structuredContent: { temperature: 31 },
  });
  assert.equal(McpUiToolResultNotificationSchema.safeParse(fixture.sent.at(-1)).success, true);
  await assert.rejects(() => fixture.bridge.sendToolResult({ content: [] }), /exactly once/);
});

test("bridge bounds concurrent inbound work before invoking more host callbacks", async () => {
  const gate = createDeferred();
  const protocolErrors = [];
  let handlerCalls = 0;
  const fixture = createBridgeFixture({
    handlers: {
      callTool() {
        handlerCalls += 1;
        return gate.promise;
      },
    },
    options: {
      onProtocolError(error) {
        protocolErrors.push(error.code);
      },
    },
  });
  await initializeBridge(fixture);

  const pending = Array.from({ length: MCP_APPS_MAX_PENDING_REQUESTS }, (_, index) =>
    fixture.bridge.receive({
      jsonrpc: "2.0",
      id: index + 100,
      method: "tools/call",
      params: { name: "refresh", arguments: {} },
    }),
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(handlerCalls, MCP_APPS_MAX_PENDING_REQUESTS);

  await assert.rejects(
    () =>
      fixture.bridge.receive({
        jsonrpc: "2.0",
        id: 999,
        method: "tools/call",
        params: { name: "refresh", arguments: {} },
      }),
    (error) => error instanceof McpAppsBridgeError && error.code === -32000,
  );
  assert.equal(handlerCalls, MCP_APPS_MAX_PENDING_REQUESTS);
  assert.deepEqual(protocolErrors, [-32000]);

  gate.resolve({ content: [{ type: "text", text: "bounded" }] });
  await Promise.all(pending);
  await fixture.bridge.receive({
    jsonrpc: "2.0",
    id: 1000,
    method: "tools/call",
    params: { name: "refresh", arguments: {} },
  });
  assert.equal(handlerCalls, MCP_APPS_MAX_PENDING_REQUESTS + 1);
});

test("bridge serializes and reserves exactly-once tool lifecycle sends", async () => {
  let deferLifecycle = false;
  const transportGates = [];
  const fixture = createBridgeFixture({
    afterPostMessage(message) {
      if (deferLifecycle && message.method?.startsWith("ui/notifications/tool-")) {
        const gate = createDeferred();
        transportGates.push(gate);
        return gate.promise;
      }
    },
  });
  await initializeBridge(fixture);
  deferLifecycle = true;

  const firstInput = fixture.bridge.sendToolInput({ location: "Madrid" });
  const duplicateInput = assert.rejects(
    fixture.bridge.sendToolInput({ location: "Barcelona" }),
    /exactly once/,
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    fixture.sent.filter((message) => message.method === "ui/notifications/tool-input").length,
    1,
  );
  transportGates[0].resolve();
  await firstInput;
  await duplicateInput;

  const result = fixture.bridge.sendToolResult({
    content: [{ type: "text", text: "Sunny" }],
  });
  const competingCancellation = assert.rejects(
    fixture.bridge.sendToolCancelled("late cancellation"),
    /exactly once/,
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    fixture.sent.filter((message) =>
      ["ui/notifications/tool-result", "ui/notifications/tool-cancelled"].includes(message.method),
    ).length,
    1,
  );
  transportGates[1].resolve();
  await result;
  await competingCancellation;

  const failedTransport = createBridgeFixture({
    afterPostMessage(message) {
      if (message.method === "ui/notifications/tool-input") {
        return Promise.reject(new Error("transport failed"));
      }
    },
  });
  await initializeBridge(failedTransport);
  await assert.rejects(() => failedTransport.bridge.sendToolInput({}), /transport failed/);
  await assert.rejects(() => failedTransport.bridge.sendToolInput({}), /exactly once/);
});

test("bridge proxies only closed, app-visible methods after initialization", async () => {
  const fixture = createBridgeFixture();
  await initializeBridge(fixture);

  await fixture.bridge.receive({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "refresh", arguments: { page: 2 }, _meta: { progressToken: "p1" } },
  });
  assert.deepEqual(fixture.calls.at(-1), [
    "callTool",
    "refresh",
    { page: 2 },
    { progressToken: "p1" },
  ]);
  assert.deepEqual(fixture.sent.at(-1).result.structuredContent, { ok: true });

  await fixture.bridge.receive({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "private-model-tool", arguments: {} },
  });
  assert.equal(fixture.sent.at(-1).error.code, -32001);
  assert.match(fixture.sent.at(-1).error.message, /not visible to apps/);

  await fixture.bridge.receive({
    jsonrpc: "2.0",
    id: 4,
    method: "ui/open-link",
    params: { url: "https://docs.example.com/help" },
  });
  assert.deepEqual(fixture.sent.at(-1).result, {});
  await fixture.bridge.receive({
    jsonrpc: "2.0",
    id: 5,
    method: "ui/open-link",
    params: { url: "javascript:alert(1)" },
  });
  assert.equal(fixture.sent.at(-1).error.code, -32602);

  await fixture.bridge.receive({
    jsonrpc: "2.0",
    id: 6,
    method: "ui/request-display-mode",
    params: { mode: "fullscreen" },
  });
  assert.deepEqual(fixture.sent.at(-1).result, { mode: "fullscreen" });

  await fixture.bridge.receive({
    jsonrpc: "2.0",
    method: "ui/notifications/size-changed",
    params: { width: 400, height: 600 },
  });
  assert.deepEqual(fixture.calls.at(-1), ["size", { width: 400, height: 600 }]);

  await fixture.bridge.receive({
    jsonrpc: "2.0",
    id: 7,
    method: "ui/message",
    params: { role: "user", content: [{ type: "image", data: "AA==", mimeType: "image/png" }] },
  });
  assert.equal(fixture.sent.at(-1).error.code, -32602);

  await fixture.bridge.receive({
    jsonrpc: "2.0",
    id: 8,
    method: "ui/message",
    params: { role: "user", content: [{ type: "text" }] },
  });
  assert.equal(fixture.sent.at(-1).error.code, -32602);
});

test("bridge requires explicit host authorization before an app tool call", async () => {
  const reviewed = [];
  const deliveredArguments = [];
  let handlerCalls = 0;
  const fixture = createBridgeFixture({
    handlers: {
      authorizeToolCall(action) {
        reviewed.push(action);
        const allowed = action.arguments?.page === 1;
        if (allowed) action.arguments.page = 99;
        return allowed;
      },
      callTool(_name, arguments_) {
        handlerCalls += 1;
        deliveredArguments.push(arguments_);
        return { content: [] };
      },
    },
  });
  await initializeBridge(fixture);

  await fixture.bridge.receive({
    jsonrpc: "2.0",
    id: 30,
    method: "tools/call",
    params: { name: "refresh", arguments: { page: 2 }, _meta: { untrusted: true } },
  });
  assert.equal(fixture.sent.at(-1).error.code, -32001);
  assert.equal(handlerCalls, 0);
  assert.deepEqual(reviewed, [{ type: "tool", name: "refresh", arguments: { page: 2 } }]);

  await fixture.bridge.receive({
    jsonrpc: "2.0",
    id: 31,
    method: "tools/call",
    params: { name: "refresh", arguments: { page: 1 } },
  });
  assert.equal(fixture.sent.at(-1).result !== undefined, true);
  assert.equal(handlerCalls, 1);
  assert.deepEqual(deliveredArguments, [{ page: 1 }]);
});

test("bridge rejects malformed, premature, unknown, and amplified input", async () => {
  const fixture = createBridgeFixture();
  await fixture.bridge.receive({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "refresh", arguments: {} },
  });
  assert.equal(fixture.sent.at(-1).error.code, -32002);

  await assert.rejects(
    () => fixture.bridge.receive("{"),
    (error) => error instanceof McpAppsBridgeError && error.code === -32700,
  );
  await assert.rejects(
    () => fixture.bridge.receive("x".repeat(1_048_577)),
    /serialized size limit/,
  );
  await initializeBridge(fixture);

  await fixture.bridge.receive({
    jsonrpc: "2.0",
    id: 9,
    method: "ui/execute-javascript",
    params: { source: "alert(1)" },
  });
  assert.equal(fixture.sent.at(-1).error.code, -32601);
  await assert.rejects(
    () =>
      fixture.bridge.receive({
        jsonrpc: "2.0",
        method: "ui/notifications/size-changed",
        params: { width: 1, nativeProps: { javaScriptEnabled: true } },
      }),
    /Unsupported field "nativeProps"/,
  );
});

test("bridge waits for the matching teardown response before closing", async () => {
  const completed = [];
  const fixture = createBridgeFixture({
    options: {
      onTeardownComplete(result) {
        completed.push(result);
      },
    },
  });
  await initializeBridge(fixture);
  const id = await fixture.bridge.requestResourceTeardown();
  assert.equal(fixture.bridge.state, "closing");
  assert.deepEqual(fixture.sent.at(-1), {
    jsonrpc: "2.0",
    id,
    method: "ui/resource-teardown",
    params: {},
  });
  await fixture.bridge.receive({ jsonrpc: "2.0", id, result: {} });
  assert.equal(fixture.bridge.state, "closed");
  assert.deepEqual(completed, ["success"]);
  await assert.rejects(() => fixture.bridge.sendToolInput({}), /bridge state is closed/);
});

test("bridge exercises supported callbacks and closed capability fallbacks", async () => {
  const fixture = createBridgeFixture();
  await initializeBridge(fixture);
  await fixture.bridge.receive({
    jsonrpc: "2.0",
    id: 10,
    method: "resources/read",
    params: { uri: "ui://weather/data", _meta: { trace: "t1" } },
  });
  assert.equal(fixture.sent.at(-1).result.contents[0].text, "resource");
  await fixture.bridge.receive({
    jsonrpc: "2.0",
    id: 11,
    method: "ui/message",
    params: { role: "user", content: [{ type: "text", text: "refresh please" }] },
  });
  assert.deepEqual(fixture.sent.at(-1).result, {});
  await fixture.bridge.receive({
    jsonrpc: "2.0",
    id: 12,
    method: "ui/update-model-context",
    params: { structuredContent: { selected: 2 } },
  });
  assert.deepEqual(fixture.sent.at(-1).result, {});
  await fixture.bridge.receive({
    jsonrpc: "2.0",
    method: "notifications/message",
    params: { level: "info", logger: "view", data: "ready" },
  });
  assert.equal(fixture.calls.at(-1)[0], "log");
  await fixture.bridge.sendHostContextChanged({ theme: "light" });
  assert.equal(fixture.sent.at(-1).method, "ui/notifications/host-context-changed");

  const cancelled = createBridgeFixture();
  await initializeBridge(cancelled);
  await cancelled.bridge.sendToolCancelled("user action");
  assert.equal(cancelled.sent.at(-1).method, "ui/notifications/tool-cancelled");

  const minimal = createBridgeFixture({ options: { handlers: {} } });
  await initializeBridge(minimal);
  const unsupportedRequests = [
    { id: 20, method: "tools/call", params: { name: "refresh" } },
    { id: 21, method: "resources/read", params: { uri: "ui://x" } },
    { id: 22, method: "ui/open-link", params: { url: "https://example.com" } },
    { id: 23, method: "ui/message", params: { role: "user", content: [] } },
    { id: 24, method: "ui/update-model-context", params: { structuredContent: {} } },
  ];
  await Promise.all(
    unsupportedRequests.map((request) => minimal.bridge.receive({ jsonrpc: "2.0", ...request })),
  );
  for (const request of unsupportedRequests) {
    assert.equal(minimal.sent.find((message) => message.id === request.id).error.code, -32601);
  }
  await minimal.bridge.receive({
    jsonrpc: "2.0",
    id: 25,
    method: "ui/request-display-mode",
    params: { mode: "pip" },
  });
  assert.deepEqual(minimal.sent.at(-1).result, { mode: "inline" });
});

test("bridge covers lifecycle validation, downloads, modalities, and constructor guards", async () => {
  const resource = createResolvedResource();
  const sandbox = createMcpAppsNativeSandbox(resource);
  assert.throws(
    () =>
      new McpAppsBridge({
        postMessage: null,
        hostInfo: { name: "x", version: "1" },
        resource,
        sandbox,
      }),
    /postMessage/,
  );
  assert.throws(
    () =>
      new McpAppsBridge({
        postMessage() {},
        hostInfo: { name: "x", version: "1" },
        resource,
        sandbox,
        handlers: { sendMessage() {} },
        messageModalities: [],
      }),
    /modalities/,
  );
  assert.throws(
    () =>
      new McpAppsBridge({
        postMessage() {},
        hostInfo: { name: "x", version: "1" },
        resource,
        sandbox,
        tools: [modelTool, modelTool],
      }),
    /Duplicate bridge tool name/,
  );
  assert.throws(
    () =>
      new McpAppsBridge({
        postMessage() {},
        hostInfo: { name: "x", version: "1" },
        resource,
        sandbox,
        handlers: { callTool: async () => ({ content: [] }) },
      }),
    /requires both authorizeToolCall and callTool/,
  );
  assert.throws(
    () =>
      new McpAppsBridge({
        postMessage() {},
        hostInfo: { name: "x", version: "1" },
        resource,
        sandbox,
        handlers: { authorizeToolCall: () => true },
      }),
    /requires both authorizeToolCall and callTool/,
  );

  const protocolErrors = [];
  const downloads = [];
  const teardowns = [];
  const fixture = createBridgeFixture({
    handlers: {
      downloadFile(contents) {
        downloads.push(contents);
      },
      requestTeardown() {
        teardowns.push("requested");
      },
    },
    options: {
      messageModalities: ["text", "image", "audio", "resource", "resourceLink"],
      updateModelContextModalities: ["text", "image", "structuredContent"],
      onProtocolError(error) {
        protocolErrors.push(error.code);
      },
    },
  });
  await fixture.bridge.receive({
    jsonrpc: "2.0",
    id: 1,
    method: "ui/initialize",
    params: {
      appInfo: {
        name: "rich-app",
        version: "1",
        title: "Rich App",
        websiteUrl: "https://example.com/app",
      },
      appCapabilities: {
        experimental: { "com.example/feature": {} },
        tools: { listChanged: true },
      },
      protocolVersion: MCP_APPS_PROTOCOL_VERSION,
    },
  });
  await fixture.bridge.receive({ jsonrpc: "2.0", method: "ui/notifications/initialized" });
  await fixture.bridge.receive({ jsonrpc: "2.0", id: "ping-1", method: "ping" });
  assert.deepEqual(fixture.sent.at(-1).result, {});
  await fixture.bridge.receive({
    jsonrpc: "2.0",
    id: 30,
    method: "tools/call",
    params: { name: "refresh" },
  });
  assert.deepEqual(fixture.calls.at(-1), ["callTool", "refresh", {}, undefined]);
  await fixture.bridge.receive({
    jsonrpc: "2.0",
    id: 31,
    method: "ui/download-file",
    params: {
      contents: [
        { type: "resource_link", name: "Export", uri: "ui://weather/export" },
        {
          type: "resource",
          resource: { uri: "ui://weather/export.txt", mimeType: "text/plain", text: "data" },
        },
      ],
    },
  });
  assert.equal(downloads[0].length, 2);
  await fixture.bridge.receive({
    jsonrpc: "2.0",
    id: 32,
    method: "ui/message",
    params: {
      role: "user",
      content: [
        { type: "image", data: "AA==", mimeType: "image/png" },
        { type: "audio", data: "AA==", mimeType: "audio/wav" },
        { type: "resource_link", name: "Data", uri: "ui://weather/data" },
      ],
    },
  });
  assert.deepEqual(fixture.sent.at(-1).result, {});
  await fixture.bridge.receive({
    jsonrpc: "2.0",
    id: 33,
    method: "ui/update-model-context",
    params: { content: [{ type: "text", text: "current selection" }] },
  });
  assert.deepEqual(fixture.sent.at(-1).result, {});
  const messageCalls = fixture.calls.filter(([kind]) => kind === "message").length;
  const invalidLinks = [
    [40, { type: "resource_link", name: "Data", uri: "ui://data", size: -1 }],
    [41, { type: "resource_link", name: "Data", uri: "ui://data", icons: [{ src: 1 }] }],
    [
      42,
      {
        type: "resource_link",
        name: "Data",
        uri: "ui://data",
        annotations: { audience: ["system"] },
      },
    ],
  ];
  await Promise.all(
    invalidLinks.map(([id, link]) =>
      fixture.bridge.receive({
        jsonrpc: "2.0",
        id,
        method: "ui/message",
        params: { role: "user", content: [link] },
      }),
    ),
  );
  for (const [id] of invalidLinks) {
    assert.equal(fixture.sent.find((message) => message.id === id).error.code, -32602);
  }
  assert.equal(fixture.calls.filter(([kind]) => kind === "message").length, messageCalls);
  await fixture.bridge.receive({
    jsonrpc: "2.0",
    method: "ui/notifications/request-teardown",
  });
  assert.deepEqual(teardowns, ["requested"]);
  await assert.rejects(
    () =>
      fixture.bridge.receive({
        jsonrpc: "2.0",
        method: "ui/notifications/size-changed",
        params: {},
      }),
    /requires width or height/,
  );
  await fixture.bridge.receive({
    jsonrpc: "2.0",
    id: 34,
    method: "ui/initialize",
    params: {
      appInfo: { name: "again", version: "1" },
      appCapabilities: {},
      protocolVersion: MCP_APPS_PROTOCOL_VERSION,
    },
  });
  assert.equal(fixture.sent.at(-1).error.code, -32002);
  assert.ok(protocolErrors.includes(-32002));

  const teardownId = await fixture.bridge.requestResourceTeardown();
  await assert.rejects(() => fixture.bridge.requestResourceTeardown(), /bridge state is closing/);
  await fixture.bridge.receive({
    jsonrpc: "2.0",
    id: teardownId,
    error: { code: -32000, message: "cleanup failed" },
  });
  assert.equal(fixture.bridge.state, "closed");
});

test("bridge rejects invalid initialization and notification details", async () => {
  const fixture = createBridgeFixture();
  await fixture.bridge.receive({
    jsonrpc: "2.0",
    id: 1,
    method: "ui/initialize",
    params: {
      appInfo: { name: "bad-version", version: "1" },
      appCapabilities: {},
      protocolVersion: "draft",
    },
  });
  assert.equal(fixture.sent.at(-1).error.code, -32602);
  await assert.rejects(
    () =>
      fixture.bridge.receive({
        jsonrpc: "2.0",
        method: "ui/notifications/initialized",
      }),
    /Unexpected initialized/,
  );

  const minimal = createBridgeFixture({ options: { handlers: {} } });
  await initializeBridge(minimal);
  await assert.rejects(
    () =>
      minimal.bridge.receive({
        jsonrpc: "2.0",
        method: "notifications/message",
        params: { level: "info", data: "x" },
      }),
    /Logging is not enabled/,
  );
  await assert.rejects(
    () =>
      minimal.bridge.receive({
        jsonrpc: "2.0",
        method: "ui/notifications/size-changed",
        params: { width: -1 },
      }),
    /finite dimension/,
  );
  await assert.rejects(
    () =>
      minimal.bridge.receive({
        jsonrpc: "2.0",
        method: "ui/notifications/request-teardown",
      }),
    /not enabled/,
  );
  minimal.bridge.close();
  assert.equal(minimal.bridge.state, "closed");
});

test("controlled Apps errors retain stable classes", () => {
  assert.equal(new McpAppsError("x").name, "McpAppsError");
  assert.equal(new McpAppsBridgeError("x").name, "McpAppsBridgeError");
});
