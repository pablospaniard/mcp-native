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
  const otherSandbox = createMcpAppsNativeSandbox(apps.resource);
  const otherBridge = new McpAppsBridge({
    resource: apps.resource,
    sandbox: otherSandbox,
    hostInfo: { name: "other-host", version: "1" },
    postMessage() {},
  });
  assert.throws(
    () =>
      createMcpNativeMixedMcpAppsRegion({
        id: "crossed-apps",
        accessibilityLabel: "Crossed app region",
        resource: apps.resource,
        sandbox: apps.sandbox,
        bridge: otherBridge,
      }),
    /exact resource, sandbox, and bridge binding/,
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

test("mixed coordinator commits lifecycle transitions only after callbacks succeed", async () => {
  const attempts = {
    activity: 0,
    cancel: 0,
    crash: 0,
    environment: 0,
    focus: 0,
    recover: 0,
    recoveryEnvironment: 0,
    visibility: 0,
  };
  let recovering = false;
  const first = createMcpNativeMixedA2uiRegion({
    id: "first",
    accessibilityLabel: "First",
    surface: createNativeSurface(),
    policy,
    lifecycle: {
      onActivityChange(value) {
        if (value === "background" && ++attempts.activity === 1) throw new Error("activity once");
      },
      onEnvironmentChange(value) {
        if (value.reducedMotion && ++attempts.environment === 1) {
          throw new Error("environment once");
        }
      },
      onCancel() {
        if (++attempts.cancel === 1) throw new Error("cancel once");
      },
    },
  });
  const apps = createAppsFixture();
  const second = createMcpNativeMixedMcpAppsRegion({
    id: "second",
    accessibilityLabel: "Second",
    ...apps,
    lifecycle: {
      onFocusChange(focused) {
        if (focused && ++attempts.focus === 1) throw new Error("focus once");
      },
      onVisibilityChange(visibility) {
        if (visibility === "hidden" && ++attempts.visibility === 1) {
          throw new Error("visibility once");
        }
      },
      onCrash() {
        if (++attempts.crash === 1) throw new Error("crash once");
      },
      onRecover() {
        attempts.recover += 1;
        recovering = true;
      },
      onEnvironmentChange() {
        if (!recovering) return;
        recovering = false;
        if (++attempts.recoveryEnvironment === 1) {
          throw new Error("recovery environment once");
        }
      },
    },
  });
  const coordinator = new McpNativeMixedSurfaceCoordinator({
    regions: [first, second],
    initialFocusedRegionId: "first",
  });
  await coordinator.start();

  await assert.rejects(() => coordinator.setActivity("background"), /onActivityChange/);
  assert.equal(coordinator.getSnapshot().activity, "foreground");
  await coordinator.setActivity("background");
  assert.equal(coordinator.getSnapshot().activity, "background");
  assert.equal(attempts.activity, 2);

  const environment = {
    dynamicTypeScale: 2,
    keyboardVisible: true,
    orientation: "landscape-right",
    reducedMotion: true,
  };
  await assert.rejects(() => coordinator.setEnvironment(environment), /onEnvironmentChange/);
  assert.equal(coordinator.getSnapshot().environment.reducedMotion, false);
  await coordinator.setEnvironment(environment);
  assert.equal(coordinator.getSnapshot().environment.reducedMotion, true);
  assert.equal(attempts.environment, 2);

  await assert.rejects(() => coordinator.transferFocus("second"), /onFocusChange/);
  assert.equal(coordinator.getSnapshot().focusedRegionId, "first");
  await coordinator.transferFocus("second");
  assert.equal(coordinator.getSnapshot().focusedRegionId, "second");
  assert.equal(attempts.focus, 2);

  await assert.rejects(() => coordinator.setVisibleRegions(["first"]), /onVisibilityChange/);
  assert.equal(coordinator.getSnapshot().focusedRegionId, "second");
  assert.equal(coordinator.getSnapshot().regions[1].visibility, "visible");
  await coordinator.setVisibleRegions(["first"]);
  assert.equal(coordinator.getSnapshot().focusedRegionId, undefined);
  assert.equal(coordinator.getSnapshot().regions[1].visibility, "hidden");
  assert.equal(attempts.visibility, 2);

  await coordinator.setVisibleRegions(["first", "second"]);
  await coordinator.transferFocus("second");
  await assert.rejects(
    () => coordinator.reportCrash("second", new Error("renderer exited")),
    /onCrash/,
  );
  assert.equal(coordinator.getSnapshot().focusedRegionId, "second");
  assert.equal(coordinator.getSnapshot().regions[1].status, "ready");
  await coordinator.reportCrash("second", new Error("renderer exited"));
  assert.equal(coordinator.getSnapshot().focusedRegionId, undefined);
  assert.equal(coordinator.getSnapshot().regions[1].status, "crashed");
  assert.equal(attempts.crash, 2);

  await assert.rejects(() => coordinator.recover("second"), /onEnvironmentChange/);
  assert.equal(coordinator.getSnapshot().regions[1].status, "crashed");
  await coordinator.recover("second");
  assert.equal(coordinator.getSnapshot().regions[1].status, "ready");
  assert.equal(attempts.recover, 2);
  assert.equal(attempts.recoveryEnvironment, 2);

  await coordinator.transferFocus("first");
  await assert.rejects(() => coordinator.cancel("first"), /onCancel/);
  assert.equal(coordinator.getSnapshot().focusedRegionId, "first");
  assert.equal(coordinator.getSnapshot().regions[0].status, "ready");
  await coordinator.cancel("first");
  assert.equal(coordinator.getSnapshot().focusedRegionId, undefined);
  assert.equal(coordinator.getSnapshot().regions[0].status, "cancelled");
  assert.equal(attempts.cancel, 2);
});

test("mixed coordinator clears failed initial focus and skips crashed back handlers", async () => {
  let backCalls = 0;
  const region = createMcpNativeMixedA2uiRegion({
    id: "crashed",
    accessibilityLabel: "Crashed",
    surface: createNativeSurface(),
    policy,
    lifecycle: {
      onCreate() {
        throw new Error("creation failed");
      },
      onBack() {
        backCalls += 1;
        return true;
      },
    },
  });
  const coordinator = new McpNativeMixedSurfaceCoordinator({
    regions: [region],
    initialFocusedRegionId: "crashed",
  });

  await assert.rejects(() => coordinator.start(), /onCreate callback failed/);
  assert.equal(coordinator.getSnapshot().focusedRegionId, undefined);
  assert.equal(coordinator.getSnapshot().regions[0].status, "crashed");
  assert.equal(await coordinator.handleBack(), false);
  assert.equal(backCalls, 0);
});
