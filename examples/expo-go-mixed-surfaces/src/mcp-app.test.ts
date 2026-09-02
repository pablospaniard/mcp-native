import assert from "node:assert/strict";
import test from "node:test";

import { McpAppsBridge, createMcpAppsNativeSandbox } from "@mcp-native/webview";

import {
  SAVE_CITY_STOP_TOOL_NAME,
  authorizeSaveCityStop,
  cityCanvasResource,
  createSavedStopResult,
  parseSavedStop,
  saveCityStopTool,
} from "./mcp-app";

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
  const sent: Record<string, unknown>[] = [];
  const saved: string[] = [];
  const sandbox = createMcpAppsNativeSandbox(cityCanvasResource);
  const bridge = new McpAppsBridge({
    resource: cityCanvasResource,
    sandbox,
    hostInfo: { name: "city-canvas-test", version: "1" },
    tools: [saveCityStopTool],
    handlers: {
      authorizeToolCall: authorizeSaveCityStop,
      callTool(_name, arguments_) {
        const stop = parseSavedStop(arguments_);
        assert.ok(stop);
        saved.push(stop.id);
        return createSavedStopResult(stop);
      },
    },
    postMessage(serialized) {
      sent.push(JSON.parse(serialized) as Record<string, unknown>);
    },
  });

  await bridge.receive({
    jsonrpc: "2.0",
    id: "init",
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
