import assert from "node:assert/strict";
import test from "node:test";

import {
  A2uiSurfaceStore,
  createA2uiV1HostExtensionCapabilitySettings,
  createA2uiV1HostExtensionRegistry,
  negotiateA2uiV1HostExtensions,
  parseA2uiV1HostExtensionManifest,
} from "../packages/a2ui/dist/index.js";
import { McpNativeRegisteredHostResultView } from "../packages/host/dist/react-native.js";
import {
  A2uiV1NativeHostSurface,
  A2uiV1NativeMountError,
  A2uiV1NativeRenderError,
  assertA2uiV1NativeMount,
  createA2uiV1NativeHost,
  createNativeHostExtensionRegistration,
  inspectA2uiV1NativeMount,
  isA2uiV1NativeHost,
} from "../packages/react-native/dist/index.js";
import { createA2uiV1NativeCatalogConformanceCases } from "../packages/react-native/dist/testing.js";
import { act, createElement } from "react";
import { createRoot } from "test-renderer";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function hostComponent(name) {
  function HostComponent(props) {
    return createElement(name, props, props.children);
  }
  HostComponent.displayName = name;
  return HostComponent;
}

const baseComponents = {
  View: hostComponent("View"),
  Text: hostComponent("Text"),
  Button: hostComponent("Button"),
  TextInput: hostComponent("TextInput"),
};

function createSurface(components, dataModel = {}) {
  const store = new A2uiSurfaceStore();
  store.apply({
    version: "v1.0",
    createSurface: { surfaceId: "main", components, dataModel },
  });
  const surface = store.get("main");
  assert.ok(surface);
  return surface;
}

test("native host derives a frozen validation and capability source of truth", () => {
  const components = { ...baseComponents, Divider: hostComponent("Divider") };
  const host = createA2uiV1NativeHost({ components, allowedEventNames: ["submit"] });

  assert.equal(isA2uiV1NativeHost(host), true);
  assert.equal(Object.isFrozen(host), true);
  assert.equal(Object.isFrozen(host.components), true);
  assert.deepEqual(host.supportedComponentNames, [
    "Button",
    "Card",
    "Column",
    "Divider",
    "List",
    "Row",
    "Text",
    "TextField",
  ]);
  assert.deepEqual(host.policy.allowedComponentNames, host.supportedComponentNames);

  const narrowedHost = createA2uiV1NativeHost({
    components,
    allowedComponentNames: ["Text", "Divider"],
  });
  assert.deepEqual(narrowedHost.supportedComponentNames, ["Text", "Divider"]);
  assert.deepEqual(narrowedHost.supportedComponentNames, narrowedHost.policy.allowedComponentNames);

  components.Divider = undefined;
  assert.notEqual(host.components.Divider, undefined);
  assert.throws(
    () =>
      createA2uiV1NativeHost({
        components: baseComponents,
        allowedComponentNames: ["Tabs"],
      }),
    /uninstalled or policy-unready component "Tabs"/,
  );
});

test("native host definitions reject malformed catalogs and layout contracts", () => {
  for (const options of [null, [], { components: null }]) {
    assert.throws(() => createA2uiV1NativeHost(options), /object/);
  }
  for (const missing of ["Button", "Text", "TextInput", "View"]) {
    const components = { ...baseComponents };
    delete components[missing];
    assert.throws(() => createA2uiV1NativeHost({ components }), /missing required component/);
  }

  const invalidLayoutContracts = [
    null,
    { Unknown: { allowedParents: ["bounded"], sizing: "intrinsic" } },
    { Tabs: { allowedParents: ["bounded"], sizing: "intrinsic" } },
    { View: null },
    { View: { allowedParents: ["bounded"], sizing: "intrinsic", unknown: true } },
    { View: { allowedParents: [], sizing: "intrinsic" } },
    { View: { allowedParents: ["bounded", "bounded"], sizing: "intrinsic" } },
    { View: { allowedParents: ["invalid"], sizing: "intrinsic" } },
    { View: { allowedParents: ["bounded"], sizing: "invalid" } },
    { View: { allowedParents: ["bounded"], sizing: "intrinsic", presentation: "sheet" } },
    { View: { allowedParents: ["bounded"], sizing: "intrinsic", ownsScrolling: "yes" } },
  ];
  for (const layoutContracts of invalidLayoutContracts) {
    assert.throws(() => createA2uiV1NativeHost({ components: baseComponents, layoutContracts }));
  }
  assert.throws(
    () =>
      createA2uiV1NativeHost({
        components: baseComponents,
        hostExtensionLayoutContracts: {
          "com.example/widget:Widget": {
            allowedParents: ["bounded"],
            sizing: "fill",
          },
        },
      }),
    /unavailable component/,
  );
  assert.throws(
    () =>
      createA2uiV1NativeHost({
        components: baseComponents,
        allowedHostExtensionComponentNames: ["com.example/widget:Widget"],
      }),
    /require an exact registry/,
  );
});

test("high-level registered result view retains the complete native host registration", () => {
  const nativeHost = createA2uiV1NativeHost({ components: baseComponents });
  const element = McpNativeRegisteredHostResultView({
    nativeHost,
    parentLayout: "scroll",
    onA2uiAction() {},
    onError() {},
  });
  assert.equal(element.props.nativeHost, nativeHost);
  assert.equal(element.props.parentLayout, "scroll");
  assert.equal(element.props.components, nativeHost.components);
  assert.equal(element.props.a2uiPolicy, nativeHost.policy);
  assert.throws(
    () =>
      McpNativeRegisteredHostResultView({
        nativeHost: {},
        onA2uiAction() {},
        onError() {},
      }),
    /createHost/,
  );
});

test("mount preflight reports exact required slots and incompatible parent layouts", () => {
  const host = createA2uiV1NativeHost({
    components: { ...baseComponents, Divider: hostComponent("Divider") },
    layoutContracts: {
      Divider: { allowedParents: ["bounded", "unbounded"], sizing: "intrinsic" },
    },
  });
  const surface = createSurface([
    { id: "root", component: "Column", children: ["divider", "label"] },
    { id: "divider", component: "Divider", axis: "horizontal" },
    { id: "label", component: "Text", text: "Ready" },
  ]);

  const accepted = inspectA2uiV1NativeMount(surface, host);
  assert.equal(accepted.ok, true);
  assert.deepEqual(accepted.requiredNativeComponentNames, ["Divider", "Text", "View"]);

  const rejected = inspectA2uiV1NativeMount(surface, host, { parentLayout: "scroll" });
  assert.equal(rejected.ok, false);
  assert.deepEqual(rejected.diagnostics, [
    {
      code: "layout-incompatible",
      message: "A native component does not support the supplied parent layout.",
      componentName: "Divider",
      nativeElementKey: "root/divider:0",
      parentLayout: "scroll",
    },
  ]);
  assert.throws(
    () => assertA2uiV1NativeMount(surface, host, { parentLayout: "scroll" }),
    (error) => error instanceof A2uiV1NativeMountError && error.code === "layout-incompatible",
  );
});

test("mount diagnostics reject forged hosts, parent layouts, and empty errors", () => {
  const host = createA2uiV1NativeHost({ components: baseComponents });
  const surface = createSurface([{ id: "root", component: "Text", text: "Ready" }]);
  assert.equal(isA2uiV1NativeHost(null), false);
  assert.equal(isA2uiV1NativeHost({}), false);
  assert.throws(() => inspectA2uiV1NativeMount(surface, {}), /createA2uiV1NativeHost/);
  assert.throws(
    () => inspectA2uiV1NativeMount(surface, host, { parentLayout: "stack" }),
    /bounded, scroll, or unbounded/,
  );
  assert.throws(
    () =>
      new A2uiV1NativeMountError({
        ok: false,
        diagnostics: [],
        requiredNativeComponentNames: [],
      }),
    /at least one diagnostic/,
  );
  assert.equal(
    inspectA2uiV1NativeMount({ ...surface, components: {} }, host).diagnostics[0].code,
    "surface-invalid",
  );
});

test("registered hosts advertise and preflight only exact allowed local extensions", () => {
  const extensionId = "com.example/status";
  const componentName = `${extensionId}:StatusBadge`;
  const manifest = parseA2uiV1HostExtensionManifest({
    profileVersion: "1",
    extensionId,
    catalogId: `${extensionId}@1`,
    catalogVersion: "1",
    schemaVersion: "1.0.0",
    componentName,
    propsSchema: {
      type: "object",
      properties: { label: { type: "string", maxLength: 64 } },
      required: ["label"],
      additionalProperties: false,
    },
    events: [],
    platforms: ["ios"],
    accessibility: {
      ownership: "host",
      requiresLabel: true,
      behavior: "Expose one labeled status.",
    },
    resourceNeeds: [],
    permissionNeeds: [],
    limits: {
      maximumInstances: 4,
      maximumEventPayloadValues: 8,
      maximumEventPayloadStringCodeUnits: 256,
      maximumPropsValues: 8,
      maximumPropsStringCodeUnits: 256,
      maximumUpdatesPerSurface: 8,
    },
    fallback: { kind: "reject" },
    compatibility: { owner: "Example team" },
  });
  const settings = createA2uiV1HostExtensionCapabilitySettings([manifest], "ios");
  const negotiation = negotiateA2uiV1HostExtensions(settings, settings);
  assert.equal(negotiation.kind, "negotiated");
  const registry = createA2uiV1HostExtensionRegistry({
    platform: "ios",
    manifests: [manifest],
    negotiation,
  });
  const registration = createNativeHostExtensionRegistration(
    manifest,
    hostComponent("StatusBadge"),
    ({ accessibilityLabel, semanticProps }) => ({ accessibilityLabel, ...semanticProps }),
  );
  const host = createA2uiV1NativeHost({
    components: { ...baseComponents, hostExtensions: [registration] },
    hostExtensions: registry,
    allowedHostExtensionComponentNames: [componentName],
    hostExtensionPolicy: () => ({ permissions: [], resources: [] }),
    hostExtensionLayoutContracts: {
      [componentName]: { allowedParents: ["bounded"], sizing: "fill" },
    },
  });
  assert.deepEqual(host.supportedHostExtensionCatalogIds, [`${extensionId}@1`]);

  const store = new A2uiSurfaceStore({ hostExtensions: registry });
  store.apply({
    version: "v1.0",
    createSurface: {
      surfaceId: "extension",
      components: [
        { id: "root", component: "Column", children: ["status"] },
        {
          id: "status",
          component: componentName,
          catalogId: `${extensionId}@1`,
          label: "Ready",
          accessibility: { label: "Ready status" },
        },
      ],
    },
  });
  const surface = store.get("extension");
  assert.ok(surface);
  const report = inspectA2uiV1NativeMount(surface, host, { parentLayout: "scroll" });
  assert.equal(report.diagnostics[0].code, "layout-incompatible");
  assert.equal(report.diagnostics[0].componentName, componentName);

  const secondManifest = parseA2uiV1HostExtensionManifest({
    ...manifest,
    catalogId: `${extensionId}@2`,
    catalogVersion: "2",
    schemaVersion: "2.0.0",
  });
  const multiVersionSettings = createA2uiV1HostExtensionCapabilitySettings(
    [manifest, secondManifest],
    "ios",
  );
  const multiVersionNegotiation = negotiateA2uiV1HostExtensions(
    multiVersionSettings,
    multiVersionSettings,
  );
  assert.equal(multiVersionNegotiation.kind, "negotiated");
  const multiVersionRegistry = createA2uiV1HostExtensionRegistry({
    platform: "ios",
    manifests: [manifest, secondManifest],
    negotiation: multiVersionNegotiation,
  });
  assert.throws(
    () =>
      createA2uiV1NativeHost({
        components: { ...baseComponents, hostExtensions: [registration] },
        hostExtensions: multiVersionRegistry,
        allowedHostExtensionComponentNames: [componentName],
        hostExtensionPolicy: () => ({ permissions: [], resources: [] }),
      }),
    /missing an exact local registration.*catalog.*@2.*schema.*2\.0\.0/,
  );
});

test("mount preflight separates capability denial from resource-plan rejection", () => {
  const baseHost = createA2uiV1NativeHost({ components: baseComponents });
  const unsupported = createSurface([
    { id: "root", component: "Tabs", tabs: [{ title: "One", child: "content" }] },
    { id: "content", component: "Text", text: "One" },
  ]);
  assert.deepEqual(inspectA2uiV1NativeMount(unsupported, baseHost).diagnostics[0], {
    code: "component-not-allowed",
    message: "The surface requests a component this native host does not allow.",
    componentName: "Tabs",
    sourceComponentId: "root",
  });

  const imageHost = createA2uiV1NativeHost({
    components: { ...baseComponents, Image: hostComponent("Image") },
    imagePolicy: () => false,
  });
  const deniedImage = createSurface([
    {
      id: "root",
      component: "Image",
      url: "https://images.example.com/image.png",
      description: "Image",
    },
  ]);
  assert.equal(
    inspectA2uiV1NativeMount(deniedImage, imageHost).diagnostics[0].code,
    "render-plan-rejected",
  );
});

test("registered host surface contains failures and resets for component-only updates", async (t) => {
  t.mock.method(console, "error", () => {});
  function ThrowingText(props) {
    if (props.children === "fail") throw new Error("private design-system details");
    return createElement("Text", props, props.children);
  }
  const host = createA2uiV1NativeHost({
    components: { ...baseComponents, Text: ThrowingText },
  });
  const replacementHost = createA2uiV1NativeHost({ components: baseComponents });
  const errors = [];
  const root = createRoot();
  const render = (text, selectedHost = host) =>
    createElement(A2uiV1NativeHostSurface, {
      host: selectedHost,
      surface: createSurface([{ id: "root", component: "Text", text }]),
      onAction() {},
      onRenderError: (error) => errors.push(error),
      fallback: createElement("Fallback", { value: "safe" }),
    });

  await act(() => root.render(render("fail")));
  assert.equal(root.container.queryAll((element) => element.type === "Fallback").length, 1);
  assert.equal(errors.length, 1);
  assert.ok(errors[0] instanceof A2uiV1NativeRenderError);
  assert.doesNotMatch(errors[0].message, /private design-system details/);

  await act(() => root.render(render("recovered")));
  assert.equal(root.container.queryAll((element) => element.type === "Text").length, 1);

  await act(() => root.render(render("fail")));
  assert.equal(root.container.queryAll((element) => element.type === "Fallback").length, 1);
  await act(() => root.render(render("fail", replacementHost)));
  assert.equal(root.container.queryAll((element) => element.type === "Text").length, 1);
});

test("registered host surface retries after the parent layout becomes compatible", async (t) => {
  t.mock.method(console, "error", () => {});
  const host = createA2uiV1NativeHost({
    components: baseComponents,
    layoutContracts: {
      Text: { allowedParents: ["bounded"], sizing: "intrinsic" },
    },
  });
  const surface = createSurface([{ id: "root", component: "Text", text: "Ready" }]);
  const errors = [];
  const root = createRoot();
  const render = (parentLayout) =>
    createElement(A2uiV1NativeHostSurface, {
      host,
      surface,
      parentLayout,
      onAction() {},
      onRenderError: (error) => errors.push(error),
      fallback: createElement("Fallback", { value: "safe" }),
    });

  await act(() => root.render(render("scroll")));
  assert.equal(root.container.queryAll((element) => element.type === "Fallback").length, 1);
  assert.equal(errors.length, 1);
  assert.ok(errors[0] instanceof A2uiV1NativeMountError);

  await act(() => root.render(render("bounded")));
  assert.equal(root.container.queryAll((element) => element.type === "Text").length, 1);
  assert.equal(root.container.queryAll((element) => element.type === "Fallback").length, 0);
});

test("surface boundary contains a throwing error observer and defaults to no partial fallback", async (t) => {
  t.mock.method(console, "error", () => {});
  function ThrowingText() {
    throw new Error("private failure");
  }
  const host = createA2uiV1NativeHost({
    components: { ...baseComponents, Text: ThrowingText },
  });
  const root = createRoot();
  await act(() =>
    root.render(
      createElement(A2uiV1NativeHostSurface, {
        host,
        surface: createSurface([{ id: "root", component: "Text", text: "fail" }]),
        onAction() {},
        onRenderError() {
          throw new Error("broken observer");
        },
      }),
    ),
  );
  assert.deepEqual(root.container.children, []);
});

test("surface boundary contains a rejected asynchronous error observer", async (t) => {
  t.mock.method(console, "error", () => {});
  function ThrowingText() {
    throw new Error("private failure");
  }
  const host = createA2uiV1NativeHost({
    components: { ...baseComponents, Text: ThrowingText },
  });
  const root = createRoot();
  await act(async () => {
    root.render(
      createElement(A2uiV1NativeHostSurface, {
        host,
        surface: createSurface([{ id: "root", component: "Text", text: "fail" }]),
        onAction() {},
        onRenderError() {
          return Promise.reject(new Error("broken async observer"));
        },
      }),
    );
    await new Promise((resolve) => setImmediate(resolve));
  });
  assert.deepEqual(root.container.children, []);
});

test("registered host structural preflight does not repeat resource authorization", async () => {
  let calls = 0;
  const host = createA2uiV1NativeHost({
    components: { ...baseComponents, Image: hostComponent("Image") },
    imagePolicy() {
      calls += 1;
      return {
        allowedRedirectOrigins: [],
        cacheMode: "no-store",
        maximumBytes: 1024,
        maximumDecodedHeight: 100,
        maximumDecodedPixels: 10_000,
        maximumDecodedWidth: 100,
        maximumRedirects: 0,
      };
    },
  });
  const surface = createSurface([
    {
      id: "root",
      component: "Image",
      url: "https://images.example.com/image.png",
      description: "Image",
    },
  ]);
  const root = createRoot();
  await act(() =>
    root.render(
      createElement(A2uiV1NativeHostSurface, {
        host,
        surface,
        onAction() {},
        onRenderError() {},
      }),
    ),
  );
  assert.equal(calls, 1);
});

test("catalog conformance kit returns fresh bounded protocol fixtures", () => {
  const first = createA2uiV1NativeCatalogConformanceCases();
  const second = createA2uiV1NativeCatalogConformanceCases();
  assert.deepEqual(
    first.map((fixture) => fixture.id),
    [
      "divider-axes",
      "choice-picker-modes",
      "slider-partition",
      "tabs-selection",
      "modal-lifecycle",
    ],
  );
  assert.notEqual(first[0].surface, second[0].surface);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(
    first.every((fixture) => fixture.expectedBehaviors.length > 0),
    true,
  );
});
