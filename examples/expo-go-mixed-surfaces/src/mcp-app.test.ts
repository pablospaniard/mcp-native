import assert from "node:assert/strict";
import test from "node:test";

import { createMcpAppsNativeSandbox } from "@mcp-native/webview";

import {
  SAVE_CITY_STOP_TOOL_NAME,
  authorizeSaveCityStop,
  cityCanvasResource,
  createCityCanvasBridge,
} from "./mcp-app";

function createBridgeHarness() {
  const sent: Record<string, unknown>[] = [];
  const saved: string[] = [];
  const sandbox = createMcpAppsNativeSandbox(cityCanvasResource);
  const bridge = createCityCanvasBridge(sandbox, {
    onSaveStop(stop) {
      saved.push(stop.id);
    },
    postMessage(serialized) {
      sent.push(JSON.parse(serialized) as Record<string, unknown>);
    },
    onProtocolError() {
      // Protocol errors are returned to the app and are asserted through the captured response.
    },
  });
  return { bridge, saved, sent };
}

async function initializeBridge(
  bridge: ReturnType<typeof createBridgeHarness>["bridge"],
  id: string,
) {
  await bridge.receive({
    jsonrpc: "2.0",
    id,
    method: "ui/initialize",
    params: {
      appInfo: { name: "city-canvas-test-app", version: "1" },
      appCapabilities: {},
      protocolVersion: "2026-01-26",
    },
  });
  await bridge.receive({
    jsonrpc: "2.0",
    method: "ui/notifications/initialized",
    params: {},
  });
}

test("the bundled MCP App is an inline, permission-free stable Apps resource", () => {
  const sandbox = createMcpAppsNativeSandbox(cityCanvasResource);

  assert.equal(cityCanvasResource.uri, "ui://city-canvas/live-plan");
  assert.match(cityCanvasResource.html, /ui\/initialize/);
  assert.match(cityCanvasResource.html, /tools\/call/);
  assert.deepEqual(sandbox.grantedPermissions, []);
  assert.equal(sandbox.storage, "ephemeral");
  assert.equal(sandbox.decideNavigation(cityCanvasResource.uri, true), "allow-in-document");
  assert.equal(sandbox.decideNavigation("https://example.com", true), "deny");
});

test("the host tool policy accepts only exact allowlisted stop arguments", () => {
  assert.equal(
    authorizeSaveCityStop({
      type: "tool",
      name: SAVE_CITY_STOP_TOOL_NAME,
      arguments: { id: "debod" },
    }),
    true,
  );
  assert.equal(
    authorizeSaveCityStop({
      type: "tool",
      name: SAVE_CITY_STOP_TOOL_NAME,
      arguments: { id: "other" },
    }),
    false,
  );
  assert.equal(
    authorizeSaveCityStop({
      type: "tool",
      name: SAVE_CITY_STOP_TOOL_NAME,
      arguments: { id: "debod", extra: true },
    }),
    false,
  );
  assert.equal(
    authorizeSaveCityStop({ type: "tool", name: "other", arguments: { id: "debod" } }),
    false,
  );
});

test("the isolated app completes initialization and a policy-approved tool call", async () => {
  const { bridge, saved, sent } = createBridgeHarness();
  await initializeBridge(bridge, "init");
  await bridge.receive({
    jsonrpc: "2.0",
    id: "save",
    method: "tools/call",
    params: { name: SAVE_CITY_STOP_TOOL_NAME, arguments: { id: "retiro" } },
  });

  assert.equal(bridge.state, "ready");
  assert.deepEqual(saved, ["retiro"]);
  assert.deepEqual(sent.at(-1)?.result, {
    content: [{ type: "text", text: "Saved Crystal Palace reflections to the native itinerary." }],
    structuredContent: { saved: true, stopId: "retiro" },
  });

  await bridge.receive({
    jsonrpc: "2.0",
    id: "denied",
    method: "tools/call",
    params: { name: SAVE_CITY_STOP_TOOL_NAME, arguments: { id: "unknown" } },
  });
  assert.deepEqual(saved, ["retiro"]);
  assert.match(
    String((sent.at(-1)?.error as { message?: unknown } | undefined)?.message),
    /denied/,
  );
});

test("a replacement WebView gets a fresh bridge that can initialize once", async () => {
  const first = createBridgeHarness();
  await initializeBridge(first.bridge, "first-init");
  assert.equal(first.bridge.state, "ready");

  const replacement = createBridgeHarness();
  assert.notEqual(replacement.bridge, first.bridge);
  assert.equal(replacement.bridge.state, "awaiting-initialize");
  await initializeBridge(replacement.bridge, "replacement-init");
  assert.equal(replacement.bridge.state, "ready");
  assert.ok(replacement.sent.some((message) => message.id === "replacement-init"));
});
