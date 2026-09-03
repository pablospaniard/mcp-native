import assert from "node:assert/strict";
import test from "node:test";

import {
  createA2uiV1ActionDeliveryHandler,
  createA2uiV1ActionEnvelope,
} from "../packages/a2ui/dist/index.js";
import { createMcpNativeHostActionAuthorization } from "../packages/host/dist/index.js";
import {
  MCP_APPS_EXTENSION_CAPABILITIES,
  MCP_APPS_MIME_TYPE,
  MCP_APPS_PROTOCOL_VERSION,
  McpAppsBridge,
  createMcpAppsNativeSandbox,
  negotiateMcpApps,
  resolveMcpAppsResource,
} from "../packages/webview/dist/index.js";

function actionEnvelope(name = "continue") {
  return createA2uiV1ActionEnvelope({
    name,
    surfaceId: "main",
    sourceComponentId: "continue-button",
    context: { accountId: "local-account" },
    timestamp: "2026-09-03T10:00:00.000Z",
  });
}

function appTool(name = "refresh") {
  return {
    name,
    inputSchema: { type: "object" },
    _meta: {
      ui: {
        resourceUri: "ui://weather/dashboard",
        visibility: ["app"],
      },
    },
  };
}

function createAppsBridge(authorization, overrides = {}) {
  const tool = appTool();
  const grant = negotiateMcpApps(MCP_APPS_EXTENSION_CAPABILITIES, MCP_APPS_EXTENSION_CAPABILITIES);
  assert.equal(grant.kind, "negotiated");
  const resource = resolveMcpAppsResource(
    tool,
    {
      contents: [
        {
          uri: "ui://weather/dashboard",
          mimeType: MCP_APPS_MIME_TYPE,
          text: "<!doctype html><html><head><title>Weather</title></head><body>ok</body></html>",
        },
      ],
    },
    grant,
  );
  const sandbox = createMcpAppsNativeSandbox(resource);
  const sent = [];
  const calls = [];
  const bridge = new McpAppsBridge({
    postMessage(message) {
      sent.push(JSON.parse(message));
    },
    hostInfo: { name: "host-action-test", version: "1.0.0" },
    tools: [tool],
    resource,
    sandbox,
    handlers: {
      authorizeToolCall: authorization.authorizeMcpAppsToolCall,
      async callTool(name, arguments_, requestMeta) {
        calls.push({ name, arguments_, requestMeta });
        return { content: [{ type: "text", text: "updated" }] };
      },
      ...overrides.handlers,
    },
  });
  return { bridge, calls, sent };
}

async function initializeAppsBridge(fixture) {
  await fixture.bridge.receive({
    jsonrpc: "2.0",
    id: 1,
    method: "ui/initialize",
    params: {
      appInfo: { name: "weather-app", version: "1.0.0" },
      appCapabilities: {},
      protocolVersion: MCP_APPS_PROTOCOL_VERSION,
    },
  });
  await fixture.bridge.receive({
    jsonrpc: "2.0",
    method: "ui/notifications/initialized",
    params: {},
  });
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test("one host policy receives immutable, protocol-specific action requests", async () => {
  const reviewed = [];
  const authorization = createMcpNativeHostActionAuthorization({
    authorize(request) {
      reviewed.push(request);
      assert.equal(Object.isFrozen(request), true);
      if (request.kind === "a2ui") {
        assert.equal(Object.isFrozen(request.envelope), true);
        assert.equal(Object.isFrozen(request.envelope.action.context), true);
        assert.equal(Object.isFrozen(request.dataModel), true);
      } else {
        assert.equal(Object.isFrozen(request.action), true);
        assert.equal(Object.isFrozen(request.action.arguments), true);
      }
      return true;
    },
  });

  assert.equal(Object.isFrozen(authorization), true);
  assert.equal(
    await authorization.authorizeA2uiAction(actionEnvelope(), { profile: { edited: true } }),
    true,
  );
  assert.equal(
    await authorization.authorizeMcpAppsToolCall({
      type: "tool",
      name: "refresh",
      arguments: { page: 1 },
    }),
    true,
  );
  assert.deepEqual(
    reviewed.map((request) => request.kind),
    ["a2ui", "mcp-app"],
  );
});

test("authorization denies by default and rejects non-boolean policy decisions", async () => {
  const denyAll = createMcpNativeHostActionAuthorization();
  assert.equal(await denyAll.authorizeA2uiAction(actionEnvelope()), false);
  assert.equal(await denyAll.authorizeMcpAppsToolCall({ type: "tool", name: "refresh" }), false);

  const invalid = createMcpNativeHostActionAuthorization({ authorize: () => "yes" });
  await assert.rejects(
    () => invalid.authorizeA2uiAction(actionEnvelope()),
    /policy must return a boolean/,
  );
  assert.throws(
    () => createMcpNativeHostActionAuthorization({ authorize: true }),
    /policy must be a function/,
  );
});

test("authorization rejects malformed and wrong-protocol action inputs before review", async () => {
  let reviews = 0;
  const authorization = createMcpNativeHostActionAuthorization({
    authorize() {
      reviews += 1;
      return true;
    },
  });

  await assert.rejects(
    () =>
      authorization.authorizeA2uiAction({
        version: "v1.0",
        error: {
          code: "VALIDATION_FAILED",
          surfaceId: "main",
          path: "/components/root",
          message: "Invalid surface",
        },
      }),
    /Expected an A2UI v1 action envelope/,
  );
  await assert.rejects(
    () =>
      authorization.authorizeMcpAppsToolCall({
        type: "tool",
        name: "refresh",
        executable: true,
      }),
    /Unsupported field.*executable/,
  );
  assert.equal(reviews, 0);
});

test("one pending review denies overlapping actions across both protocols", async () => {
  const started = deferred();
  const decision = deferred();
  let reviews = 0;
  const authorization = createMcpNativeHostActionAuthorization({
    async authorize() {
      reviews += 1;
      started.resolve();
      return decision.promise;
    },
  });

  const pending = authorization.authorizeA2uiAction(actionEnvelope());
  await started.promise;
  assert.equal(
    await authorization.authorizeMcpAppsToolCall({ type: "tool", name: "refresh" }),
    false,
  );
  assert.equal(reviews, 1);
  decision.resolve(true);
  assert.equal(await pending, true);
});

test("a failed policy review releases the shared authorization boundary", async () => {
  let fail = true;
  const authorization = createMcpNativeHostActionAuthorization({
    authorize() {
      if (fail) {
        fail = false;
        throw new Error("local review failed");
      }
      return true;
    },
  });

  await assert.rejects(
    () => authorization.authorizeMcpAppsToolCall({ type: "tool", name: "refresh" }),
    (error) =>
      error instanceof TypeError &&
      error.message === "MCP native host action authorization policy failed" &&
      error.cause instanceof Error &&
      error.cause.message === "local review failed",
  );
  assert.equal(await authorization.authorizeA2uiAction(actionEnvelope()), true);
});

test("A2UI retains its validation and delivery boundary behind the shared policy", async () => {
  const delivered = [];
  const authorization = createMcpNativeHostActionAuthorization({
    authorize(request) {
      return request.kind === "a2ui" && request.envelope.action.name === "continue";
    },
  });
  const handleAction = createA2uiV1ActionDeliveryHandler({
    authorize: authorization.authorizeA2uiAction,
    deliver(envelope, dataModel) {
      delivered.push({ envelope, dataModel });
    },
  });

  assert.equal(await handleAction(actionEnvelope("cancel")), "denied");
  assert.equal(await handleAction(actionEnvelope(), { accepted: true }), "delivered");
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].envelope.action.name, "continue");
  assert.deepEqual(delivered[0].dataModel, { accepted: true });
});

test("MCP Apps retains tool visibility, bridge serialization, and delivery behind the shared policy", async () => {
  const reviewed = [];
  const authorization = createMcpNativeHostActionAuthorization({
    authorize(request) {
      reviewed.push(request);
      return (
        request.kind === "mcp-app" &&
        request.action.name === "refresh" &&
        request.action.arguments?.page === 1
      );
    },
  });
  const fixture = createAppsBridge(authorization);
  await initializeAppsBridge(fixture);

  await fixture.bridge.receive({
    jsonrpc: "2.0",
    id: 10,
    method: "tools/call",
    params: { name: "refresh", arguments: { page: 2 } },
  });
  assert.equal(fixture.sent.at(-1).error.code, -32001);
  assert.equal(fixture.calls.length, 0);

  await fixture.bridge.receive({
    jsonrpc: "2.0",
    id: 11,
    method: "tools/call",
    params: { name: "refresh", arguments: { page: 1 }, _meta: { trace: "local" } },
  });
  assert.equal(fixture.sent.at(-1).result.content[0].text, "updated");
  assert.deepEqual(fixture.calls, [
    { name: "refresh", arguments_: { page: 1 }, requestMeta: { trace: "local" } },
  ]);
  assert.deepEqual(
    reviewed.map((request) => request.kind),
    ["mcp-app", "mcp-app"],
  );

  await fixture.bridge.receive({
    jsonrpc: "2.0",
    id: 12,
    method: "tools/call",
    params: { name: "undeclared", arguments: {} },
  });
  assert.equal(fixture.sent.at(-1).error.code, -32001);
  assert.equal(reviewed.length, 2);
});

test("MCP Apps receives a stable error instead of an application policy failure", async () => {
  const authorization = createMcpNativeHostActionAuthorization({
    authorize() {
      throw new Error("secure store failed for local-account@example.com");
    },
  });
  const fixture = createAppsBridge(authorization);
  await initializeAppsBridge(fixture);

  await fixture.bridge.receive({
    jsonrpc: "2.0",
    id: 20,
    method: "tools/call",
    params: { name: "refresh", arguments: { page: 1 } },
  });

  assert.deepEqual(fixture.sent.at(-1).error, {
    code: -32602,
    message: "MCP native host action authorization policy failed",
  });
  assert.doesNotMatch(JSON.stringify(fixture.sent.at(-1)), /local-account|secure store/i);
  assert.equal(fixture.calls.length, 0);
});
