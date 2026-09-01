import assert from "node:assert/strict";
import test from "node:test";

import { act, createElement } from "react";
import { createRoot } from "test-renderer";

import {
  A2uiSurfaceStore,
  createA2uiV1BasicCatalogPolicy,
  createA2uiV1HostExtensionCapabilitySettings,
  createA2uiV1HostExtensionRegistry,
  negotiateA2uiV1HostExtensions,
} from "../packages/a2ui/dist/index.js";
import {
  A2UI_V1_NATIVE_COMPONENT_NAMES,
  A2UI_V1_NATIVE_MAX_MEDIA,
  A2uiV1NativeSurface,
  createA2uiV1NativeRenderPlan,
  createNativeAudioPlayerAdapter,
  createNativeHostExtensionRegistration,
  createNativeVideoAdapter,
  getA2uiV1NativeSupportedComponentNames,
  getA2uiV1NativeSupportedHostExtensionCatalogIds,
} from "../packages/react-native/dist/index.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function hostComponent(type) {
  return function HostComponent(props) {
    return createElement(type, props, props.children);
  };
}

const baseComponents = {
  View: hostComponent("View"),
  Text: hostComponent("Text"),
  Button: hostComponent("Button"),
  TextInput: hostComponent("TextInput"),
};

const imageGrant = Object.freeze({
  allowedRedirectOrigins: Object.freeze([]),
  cacheMode: "no-store",
  maximumBytes: 1_000_000,
  maximumDecodedHeight: 1_024,
  maximumDecodedPixels: 1_048_576,
  maximumDecodedWidth: 1_024,
  maximumRedirects: 0,
});

function mediaGrant(kind, overrides = {}) {
  return {
    sourceOrigin: "https://media.example.com",
    allowedRedirectOrigins: ["https://cdn.example.com"],
    allowedMimeTypes: [kind === "video" ? "video/mp4" : "audio/mpeg"],
    maximumBytes: 50_000_000,
    maximumRedirects: 2,
    allowsAutoplay: false,
    allowsBackgroundPlayback: false,
    allowsExternalRoutes: false,
    requiresUserActivation: true,
    ...overrides,
  };
}

function createSurface(components, dataModel = {}) {
  const store = new A2uiSurfaceStore();
  store.apply({
    version: "v1.0",
    createSurface: { surfaceId: "m8", components, dataModel },
  });
  return store.get("m8");
}

function mediaSurface() {
  return createSurface([
    { id: "root", component: "Column", children: ["video", "audio"] },
    {
      id: "video",
      component: "Video",
      url: "https://media.example.com/video.mp4",
      posterUrl: "https://images.example.com/poster.png",
      accessibility: { label: "Product demonstration" },
    },
    {
      id: "audio",
      component: "AudioPlayer",
      url: "https://media.example.com/audio.mp3",
      description: "Product narration",
    },
  ]);
}

function mediaPolicy() {
  return createA2uiV1BasicCatalogPolicy({
    allowedComponentNames: A2UI_V1_NATIVE_COMPONENT_NAMES,
  });
}

test("Video and AudioPlayer require complete host media grants in the trusted plan", () => {
  const requests = [];
  const plan = createA2uiV1NativeRenderPlan(mediaSurface(), mediaPolicy(), {
    imagePolicy: () => imageGrant,
    mediaPolicy(request) {
      assert.equal(Object.isFrozen(request), true);
      assert.throws(() => {
        request.sourceOrigin = "https://attacker.example";
      }, TypeError);
      requests.push(request);
      return mediaGrant(request.kind);
    },
  });
  assert.deepEqual(
    plan.children.map((child) => child.component),
    ["Video", "AudioPlayer"],
  );
  assert.deepEqual(plan.children[0].props, {
    uri: "https://media.example.com/video.mp4",
    resourcePolicy: mediaGrant("video"),
    posterUri: "https://images.example.com/poster.png",
    posterResourcePolicy: imageGrant,
    accessibilityLabel: "Product demonstration",
  });
  assert.equal(plan.children[1].props.description, "Product narration");
  assert.equal(plan.children[1].props.accessibilityLabel, "Product narration");
  assert.deepEqual(
    requests.map(({ kind, sourceOrigin }) => ({ kind, sourceOrigin })),
    [
      { kind: "video", sourceOrigin: "https://media.example.com" },
      { kind: "audio", sourceOrigin: "https://media.example.com" },
    ],
  );
});

test("media source, MIME, redirect, playback, and activation policy failures are closed", () => {
  assert.throws(
    () => createA2uiV1NativeRenderPlan(mediaSurface(), mediaPolicy()),
    /explicit host media policy/,
  );
  assert.throws(
    () =>
      createA2uiV1NativeRenderPlan(mediaSurface(), mediaPolicy(), {
        imagePolicy: () => imageGrant,
        mediaPolicy: ({ kind }) => mediaGrant(kind, { sourceOrigin: "https://attacker.example" }),
      }),
    /match the requested media origin/,
  );
  assert.throws(
    () =>
      createA2uiV1NativeRenderPlan(mediaSurface(), mediaPolicy(), {
        imagePolicy: () => imageGrant,
        mediaPolicy: ({ kind }) => mediaGrant(kind, { allowedMimeTypes: ["text/html"] }),
      }),
    /exact lower-case video MIME type/,
  );
  assert.throws(
    () =>
      createA2uiV1NativeRenderPlan(mediaSurface(), mediaPolicy(), {
        imagePolicy: () => imageGrant,
        mediaPolicy: ({ kind }) =>
          mediaGrant(kind, { allowsAutoplay: true, requiresUserActivation: true }),
      }),
    /cannot allow autoplay while requiring user activation/,
  );
  assert.throws(
    () =>
      createA2uiV1NativeRenderPlan(mediaSurface(), mediaPolicy(), {
        imagePolicy: () => imageGrant,
        mediaPolicy: ({ kind }) => mediaGrant(kind, { unsupportedControl: true }),
      }),
    /Unexpected field "unsupportedControl"/,
  );
});

test("media instance and cumulative transfer amplification is bounded before mounting", () => {
  const ids = Array.from({ length: A2UI_V1_NATIVE_MAX_MEDIA + 1 }, (_, index) => `video-${index}`);
  const surface = createSurface([
    { id: "root", component: "Column", children: ids },
    ...ids.map((id, index) => ({
      id,
      component: "Video",
      url: `https://media.example.com/${index}.mp4`,
    })),
  ]);
  assert.throws(
    () =>
      createA2uiV1NativeRenderPlan(surface, mediaPolicy(), {
        mediaPolicy: () => mediaGrant("video", { maximumBytes: 1 }),
      }),
    new RegExp(`maximum of ${A2UI_V1_NATIVE_MAX_MEDIA} media components`),
  );
  assert.throws(
    () =>
      createA2uiV1NativeRenderPlan(mediaSurface(), mediaPolicy(), {
        imagePolicy: () => imageGrant,
        mediaPolicy: ({ kind }) => mediaGrant(kind, { maximumBytes: 1_500_000_000 }),
      }),
    /maximum total media transfer budget/,
  );
});

test("media slots advertise and mount only with an explicit media policy", async () => {
  const components = {
    ...baseComponents,
    Video: createNativeVideoAdapter(hostComponent("DesignVideo"), (props) => ({
      source: props.uri,
      mimeTypes: props.resourcePolicy.allowedMimeTypes,
      activationRequired: props.resourcePolicy.requiresUserActivation,
    })),
    AudioPlayer: createNativeAudioPlayerAdapter(hostComponent("DesignAudio"), (props) => ({
      source: props.uri,
      background: props.resourcePolicy.allowsBackgroundPlayback,
      title: props.description,
    })),
  };
  assert.equal(getA2uiV1NativeSupportedComponentNames(components).includes("Video"), false);
  assert.equal(
    getA2uiV1NativeSupportedComponentNames(components, {
      mediaPolicy: ({ kind }) => mediaGrant(kind),
    }).includes("AudioPlayer"),
    true,
  );

  const root = createRoot();
  await act(async () => {
    root.render(
      createElement(A2uiV1NativeSurface, {
        surface: mediaSurface(),
        policy: mediaPolicy(),
        components,
        imagePolicy: () => imageGrant,
        mediaPolicy: ({ kind }) => mediaGrant(kind),
        onAction() {},
      }),
    );
  });
  const video = root.container.queryAll((element) => element.type === "DesignVideo")[0];
  const audio = root.container.queryAll((element) => element.type === "DesignAudio")[0];
  assert.deepEqual(video.props.mimeTypes, ["video/mp4"]);
  assert.equal(video.props.activationRequired, true);
  assert.equal(audio.props.background, false);
});

const extensionId = "com.example/status-badge";
const componentName = `${extensionId}:StatusBadge`;
const catalogId = `${extensionId}@1`;
const extensionEvent = `${extensionId}:activate`;

function extensionManifest(maximumInstances = 2) {
  return {
    profileVersion: "1",
    extensionId,
    catalogId,
    catalogVersion: "1",
    schemaVersion: "1.0.0",
    componentName,
    propsSchema: {
      type: "object",
      properties: { label: { type: "string" }, tone: { enum: ["positive", "negative"] } },
      required: ["label", "tone"],
      additionalProperties: false,
    },
    events: [
      {
        name: extensionEvent,
        payloadSchema: {
          type: "object",
          properties: { selected: { type: "boolean" } },
          required: ["selected"],
          additionalProperties: false,
        },
        requiresUserActivation: true,
      },
    ],
    platforms: ["ios", "android"],
    accessibility: {
      ownership: "host",
      requiresLabel: true,
      behavior: "Expose one labeled status button.",
    },
    resourceNeeds: ["network.status"],
    permissionNeeds: [],
    limits: {
      maximumInstances,
      maximumEventPayloadValues: 8,
      maximumEventPayloadStringCodeUnits: 256,
      maximumPropsValues: 8,
      maximumPropsStringCodeUnits: 256,
      maximumUpdatesPerSurface: 8,
    },
    fallback: { kind: "reject" },
    compatibility: { owner: "Example Mobile Team" },
  };
}

function extensionSetup(maximumInstances = 2) {
  const manifest = extensionManifest(maximumInstances);
  const settings = createA2uiV1HostExtensionCapabilitySettings([manifest], "ios");
  const negotiation = negotiateA2uiV1HostExtensions(settings, settings);
  const registry = createA2uiV1HostExtensionRegistry({
    platform: "ios",
    manifests: [manifest],
    negotiation,
  });
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
          catalogId,
          label: "Connected",
          tone: "positive",
          accessibility: { label: "Connection status" },
        },
      ],
    },
  });
  const policy = createA2uiV1BasicCatalogPolicy({
    allowedComponentNames: ["Column"],
    hostExtensions: registry,
    allowedHostExtensionComponentNames: [componentName],
  });
  return { manifest, registry, surface: store.get("extension"), policy };
}

test("a locally registered extension receives only validated props and an exact capability grant", async () => {
  const setup = extensionSetup();
  const registration = createNativeHostExtensionRegistration(
    setup.manifest,
    hostComponent("FabricStatusBadge"),
    (props) => ({
      label: props.semanticProps.label,
      tone: props.semanticProps.tone,
      grant: props.capabilityGrant,
      emit: props.onEvent,
      accessibilityLabel: props.accessibilityLabel,
    }),
  );
  const hostExtensionPolicy = () => ({ permissions: [], resources: ["network.status"] });
  assert.deepEqual(
    getA2uiV1NativeSupportedHostExtensionCatalogIds(
      { ...baseComponents, hostExtensions: [registration] },
      setup.registry,
      hostExtensionPolicy,
    ),
    [catalogId],
  );
  assert.deepEqual(
    getA2uiV1NativeSupportedHostExtensionCatalogIds(
      { ...baseComponents, hostExtensions: [registration] },
      setup.registry,
      undefined,
    ),
    [],
  );
  assert.throws(
    () =>
      getA2uiV1NativeSupportedHostExtensionCatalogIds(
        { ...baseComponents, hostExtensions: [registration] },
        { platform: "ios", manifests: [setup.manifest] },
        hostExtensionPolicy,
      ),
    /opaque negotiated host-extension registry/,
  );
  const events = [];
  const root = createRoot();
  await act(async () => {
    root.render(
      createElement(A2uiV1NativeSurface, {
        surface: setup.surface,
        policy: setup.policy,
        components: { ...baseComponents, hostExtensions: [registration] },
        hostExtensionPolicy(request) {
          assert.equal(request.platform, "ios");
          assert.equal(Object.isFrozen(request), true);
          assert.equal(Object.isFrozen(request.semanticProps), true);
          assert.deepEqual(request.semanticProps, { label: "Connected", tone: "positive" });
          assert.throws(() => {
            request.semanticProps.injected = "unchecked";
          }, TypeError);
          return { permissions: [], resources: ["network.status"] };
        },
        onHostExtensionEvent(event) {
          events.push(event);
        },
        onAction() {},
      }),
    );
  });
  const badge = root.container.queryAll((element) => element.type === "FabricStatusBadge")[0];
  assert.equal(badge.props.label, "Connected");
  assert.deepEqual(badge.props.grant, { permissions: [], resources: ["network.status"] });
  assert.equal(badge.props.accessibilityLabel, "Connection status");
  await act(async () => {
    badge.props.emit(extensionEvent, { selected: true }, { userActivated: true });
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].sourceComponentId, "status");
  assert.deepEqual(events[0].payload, { selected: true });
  assert.throws(
    () => badge.props.emit(extensionEvent, { selected: "forged" }, { userActivated: true }),
    /event schema validation failed/,
  );
  assert.throws(
    () => badge.props.emit(extensionEvent, { selected: true }, { userActivated: false }),
    /requires explicit user activation/,
  );
});

test("extension mounting rejects missing policy, over-grants, unregistered components, and instance amplification", () => {
  const setup = extensionSetup();
  assert.throws(
    () => createA2uiV1NativeRenderPlan(setup.surface, setup.policy),
    /explicit capability policy/,
  );
  assert.throws(
    () =>
      createA2uiV1NativeRenderPlan(setup.surface, setup.policy, {
        hostExtensionPolicy: () => ({
          permissions: ["device.camera"],
          resources: ["network.status"],
        }),
      }),
    /exactly grant the manifest-declared needs/,
  );

  const limited = extensionSetup(1);
  const store = new A2uiSurfaceStore({ hostExtensions: limited.registry });
  store.apply({
    version: "v1.0",
    createSurface: {
      surfaceId: "repeat",
      components: [
        {
          id: "root",
          component: "List",
          children: { path: "/items", componentId: "status" },
        },
        {
          id: "status",
          component: componentName,
          catalogId,
          label: "Connected",
          tone: "positive",
          accessibility: { label: "Connection status" },
        },
      ],
      dataModel: { items: [{}, {}] },
    },
  });
  const policy = createA2uiV1BasicCatalogPolicy({
    allowedComponentNames: ["List"],
    hostExtensions: limited.registry,
    allowedHostExtensionComponentNames: [componentName],
  });
  assert.throws(
    () =>
      createA2uiV1NativeRenderPlan(store.get("repeat"), policy, {
        hostExtensionPolicy: () => ({ permissions: [], resources: ["network.status"] }),
      }),
    /maximum of 1 instances/,
  );
});
