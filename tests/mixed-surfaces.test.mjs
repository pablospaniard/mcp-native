import assert from "node:assert/strict";
import test from "node:test";

import {
  A2uiSurfaceStore,
  createA2uiV1BasicCatalogPolicy,
  parseA2uiV1Jsonl,
} from "../packages/a2ui/dist/index.js";
import {
  MCP_NATIVE_MIXED_MAX_REGIONS,
  McpNativeMixedSurfaceCoordinator,
  createMcpNativeMixedA2uiRegion,
  createMcpNativeMixedMcpAppsRegion,
} from "../packages/mcp-native/dist/index.js";
import {
  MCP_APPS_MIME_TYPE,
  MCP_APPS_PROTOCOL_VERSION,
  McpAppsBridge,
  createMcpAppsNativeSandbox,
  isMcpAppsNativeSandboxConfiguration,
} from "../packages/webview/dist/index.js";

const policy = createA2uiV1BasicCatalogPolicy({ allowedComponentNames: ["Text"] });

function createNativeSurface() {
  const store = new A2uiSurfaceStore();
  store.applyAll(
    parseA2uiV1Jsonl(
      [
        JSON.stringify({
          version: "v1.0",
          createSurface: {
            surfaceId: "server-surface-id",
            catalogId: "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json",
          },
        }),
        JSON.stringify({
          version: "v1.0",
          updateComponents: {
            surfaceId: "server-surface-id",
            components: [{ id: "root", component: "Text", text: "Native sibling" }],
          },
        }),
      ].join("\n"),
    ),
  );
  const surface = store.get("server-surface-id");
  assert.ok(surface);
  return surface;
}

function createAppsFixture() {
  const resource = {
    uri: "ui://mixed/reference-app",
    mimeType: MCP_APPS_MIME_TYPE,
    html: "<!doctype html><html><head><title>App</title></head><body>App sibling</body></html>",
    meta: {},
  };
  const sandbox = createMcpAppsNativeSandbox(resource);
  const sent = [];
  const bridge = new McpAppsBridge({
    resource,
    sandbox,
    hostInfo: { name: "mixed-host", version: "0.9.0" },
    postMessage(serialized) {
      sent.push(JSON.parse(serialized));
    },
  });
  return { bridge, resource, sandbox, sent };
}

async function initializeBridge(fixture) {
  await fixture.bridge.receive({
    jsonrpc: "2.0",
    id: 1,
    method: "ui/initialize",
    params: {
      appInfo: { name: "reference-app", version: "1" },
      appCapabilities: {},
      protocolVersion: MCP_APPS_PROTOCOL_VERSION,
    },
  });
  await fixture.bridge.receive({
    jsonrpc: "2.0",
    method: "ui/notifications/initialized",
    params: {},
  });
  assert.equal(fixture.bridge.state, "ready");
}

test("mixed regions require host factories and opaque WebView isolation", () => {
  const apps = createAppsFixture();
  assert.equal(isMcpAppsNativeSandboxConfiguration(apps.sandbox), true);
  assert.equal(isMcpAppsNativeSandboxConfiguration({ ...apps.sandbox }), false);

  assert.throws(() => createMcpNativeMixedA2uiRegion(null), /factory options must be an object/);
  assert.throws(() => createMcpNativeMixedMcpAppsRegion(null), /factory options must be an object/);
  assert.throws(
    () =>
      createMcpNativeMixedMcpAppsRegion({
        id: "apps",
        accessibilityLabel: "App region",
        resource: apps.resource,
        sandbox: { ...apps.sandbox },
        bridge: apps.bridge,
      }),
    /opaque createMcpAppsNativeSandbox result/,
  );
  assert.throws(
    () =>
      createMcpNativeMixedMcpAppsRegion({
        id: "apps",
        accessibilityLabel: "App region",
        resource: { ...apps.resource, uri: "ui://other/app" },
        sandbox: apps.sandbox,
        bridge: apps.bridge,
      }),
    /resource URI must match/,
  );
  assert.throws(
    () =>
      new McpNativeMixedSurfaceCoordinator({
        regions: [
          {
            id: "forged",
            accessibilityLabel: "Forged",
            kind: "mcp-app",
            resource: apps.resource,
            sandbox: apps.sandbox,
            bridge: apps.bridge,
          },
        ],
      }),
    /host registration factory/,
  );
});

test("mixed coordinator serializes the complete host-owned sibling lifecycle", async () => {
  const events = [];
  const native = createMcpNativeMixedA2uiRegion({
    id: "profile-native",
    accessibilityLabel: "Native profile",
    surface: createNativeSurface(),
    policy,
    lifecycle: {
      onCreate: () => events.push("native:create"),
      onVisibilityChange: (value) => events.push(`native:visibility:${value}`),
      onActivityChange: (value) => events.push(`native:activity:${value}`),
      onFocusChange: (value) => events.push(`native:focus:${value}`),
      onEnvironmentChange: (value) => events.push(`native:motion:${value.reducedMotion}`),
      onBack: () => {
        events.push("native:back");
        return false;
      },
      onCancel: (reason) => events.push(`native:cancel:${reason}`),
      onMemoryPressure: (value) => events.push(`native:memory:${value}`),
      onDispose: () => events.push("native:dispose"),
    },
  });
  assert.notEqual(native.surface, createNativeSurface());
  assert.equal(native.id, "profile-native");
  assert.equal(native.surface.surfaceId, "server-surface-id");

  const apps = createAppsFixture();
  const appRegion = createMcpNativeMixedMcpAppsRegion({
    id: "weather-app",
    accessibilityLabel: "Interactive weather app",
    ...apps,
    lifecycle: {
      onCreate: () => events.push("apps:create"),
      onVisibilityChange: (value) => events.push(`apps:visibility:${value}`),
      onActivityChange: (value) => events.push(`apps:activity:${value}`),
      onFocusChange: (value) => events.push(`apps:focus:${value}`),
      onEnvironmentChange: (value) => events.push(`apps:keyboard:${value.keyboardVisible}`),
      onBack: () => {
        events.push("apps:back");
        return true;
      },
      onCrash: () => events.push("apps:crash"),
      onRecover: () => events.push("apps:recover"),
      onMemoryPressure: (value) => events.push(`apps:memory:${value}`),
      onDispose: () => events.push("apps:dispose"),
    },
  });

  const coordinator = new McpNativeMixedSurfaceCoordinator({
    regions: [native, appRegion],
    initialFocusedRegionId: native.id,
  });
  let notifications = 0;
  const unsubscribe = coordinator.subscribe(() => {
    notifications += 1;
  });

  assert.deepEqual(
    coordinator.getSnapshot().regions.map(({ accessibilityOrder, accessibilityTree, id }) => ({
      accessibilityOrder,
      accessibilityTree,
      id,
    })),
    [
      { accessibilityOrder: 0, accessibilityTree: "native", id: "profile-native" },
      { accessibilityOrder: 1, accessibilityTree: "isolated-webview", id: "weather-app" },
    ],
  );
  assert.equal(coordinator.getRegion("weather-app"), appRegion);

  await coordinator.start();
  assert.equal(coordinator.getSnapshot().started, true);
  assert.deepEqual(
    coordinator.getSnapshot().regions.map((region) => region.status),
    ["ready", "ready"],
  );

  await coordinator.transferFocus("weather-app");
  assert.equal(coordinator.getSnapshot().focusedRegionId, "weather-app");
  assert.equal(await coordinator.handleBack(), true);
  assert.deepEqual(events.slice(-1), ["apps:back"]);

  await coordinator.setActivity("background");
  await coordinator.setEnvironment({
    dynamicTypeScale: 2,
    keyboardVisible: true,
    orientation: "landscape-left",
    reducedMotion: true,
  });
  await coordinator.setVisibleRegions(["profile-native"]);
  assert.equal(coordinator.getSnapshot().focusedRegionId, undefined);
  assert.equal(coordinator.getSnapshot().regions[1].visibility, "hidden");

  await coordinator.setVisibleRegions(["profile-native", "weather-app"]);
  await coordinator.transferFocus("weather-app");
  await coordinator.reportCrash("weather-app", new Error("native process terminated"));
  assert.equal(coordinator.getSnapshot().regions[1].status, "crashed");
  assert.equal(coordinator.getSnapshot().focusedRegionId, undefined);
  await coordinator.recover("weather-app");
  assert.equal(coordinator.getSnapshot().regions[1].status, "ready");

  await coordinator.handleMemoryPressure("critical");
  await coordinator.cancel("profile-native", "host navigation replaced the region");
  assert.equal(coordinator.getSnapshot().regions[0].status, "cancelled");
  assert.equal(coordinator.getSnapshot().regions[0].visibility, "hidden");

  await initializeBridge(apps);
  await coordinator.dispose();
  assert.equal(coordinator.getSnapshot().disposed, true);
  assert.equal(apps.bridge.state, "closed");
  assert.equal(apps.sent.at(-1).method, "ui/resource-teardown");
  assert.deepEqual(events.slice(-2), ["apps:dispose", "native:dispose"]);
  assert.ok(notifications >= 8);
  const notificationsAfterDispose = notifications;
  unsubscribe();
  assert.ok(notificationsAfterDispose > 0);
  assert.throws(() => coordinator.subscribe(() => {}), /Cannot subscribe after/);
  await assert.rejects(() => coordinator.setActivity("foreground"), /after mixed surface disposal/);
});

test("mixed coordinator rejects unbounded, invalid, and impossible host state", async () => {
  const region = createMcpNativeMixedA2uiRegion({
    id: "native",
    accessibilityLabel: "Native",
    surface: createNativeSurface(),
    policy,
    lifecycle: { onBack: () => "yes" },
  });
  assert.throws(
    () =>
      new McpNativeMixedSurfaceCoordinator({
        regions: Array.from({ length: MCP_NATIVE_MIXED_MAX_REGIONS + 1 }, () => region),
      }),
    /require 1-32 regions/,
  );
  assert.throws(
    () => new McpNativeMixedSurfaceCoordinator({ regions: [region, region] }),
    /Duplicate mixed surface region id/,
  );
  assert.throws(
    () =>
      new McpNativeMixedSurfaceCoordinator({
        regions: [region],
        initialFocusedRegionId: "native",
        initialVisibleRegionIds: [],
      }),
    /initially focused region must be visible/,
  );

  const coordinator = new McpNativeMixedSurfaceCoordinator({ regions: [region] });
  assert.throws(
    () => new McpNativeMixedSurfaceCoordinator({ regions: [region] }),
    /already belongs to a coordinator/,
  );
  await assert.rejects(() => coordinator.transferFocus("native"), /not started/);
  await coordinator.start();
  await assert.rejects(() => coordinator.handleBack(), /onBack must return a boolean/);
  await assert.rejects(
    () =>
      coordinator.setEnvironment({
        dynamicTypeScale: 100,
        keyboardVisible: false,
        orientation: "portrait",
        reducedMotion: false,
      }),
    /dynamic type scale/,
  );
  await assert.rejects(() => coordinator.recover("native"), /Only a crashed mixed surface/);
  await assert.rejects(() => coordinator.setVisibleRegions(["unknown"]), /Unknown mixed surface/);
});

test("mixed coordinator contains callback and listener failures", async () => {
  const healthy = createMcpNativeMixedA2uiRegion({
    id: "healthy",
    accessibilityLabel: "Healthy region",
    surface: createNativeSurface(),
    policy,
  });
  const failing = createMcpNativeMixedA2uiRegion({
    id: "failing",
    accessibilityLabel: "Failing region",
    surface: createNativeSurface(),
    policy,
    lifecycle: {
      onCreate: () => {
        throw new Error("creation failed");
      },
      onDispose: () => {
        throw new Error("disposal failed");
      },
    },
  });
  const coordinator = new McpNativeMixedSurfaceCoordinator({ regions: [failing, healthy] });
  coordinator.subscribe(() => {
    throw new Error("listener failed");
  });
  await assert.rejects(() => coordinator.start(), /onCreate callback failed/);
  assert.equal(coordinator.getSnapshot().started, true);
  assert.deepEqual(
    coordinator.getSnapshot().regions.map((region) => region.status),
    ["crashed", "ready"],
  );
  await coordinator.recover("failing");
  assert.equal(coordinator.getSnapshot().regions[0].status, "ready");
  await coordinator.cancel("failing");
  await assert.rejects(
    () => coordinator.reportCrash("failing", new Error("late crash")),
    /cancelled mixed surface cannot crash/,
  );
  await assert.rejects(() => coordinator.dispose(), /onDispose callback failed/);
  assert.equal(coordinator.getSnapshot().disposed, true);
});
