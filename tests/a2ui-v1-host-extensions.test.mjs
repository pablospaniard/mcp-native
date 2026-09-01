import assert from "node:assert/strict";
import test from "node:test";

import {
  A2UI_V1_HOST_EXTENSION_MAX_MANIFESTS,
  A2uiSurfaceStore,
  createA2uiV1BasicCatalogPolicy,
  createA2uiV1HostExtensionCapabilitySettings,
  createA2uiV1HostExtensionRegistry,
  getA2uiV1HostExtensionCatalogIds,
  getA2uiV1HostExtensionManifest,
  getA2uiV1HostExtensionManifestFingerprint,
  isA2uiV1HostExtensionRegistry,
  negotiateA2uiV1HostExtensions,
  parseA2uiV1Envelope,
  parseA2uiV1HostExtensionCapabilityValue,
  parseA2uiV1HostExtensionManifest,
  validateA2uiV1HostExtensionComponent,
  validateA2uiV1HostExtensionEvent,
  validateA2uiV1SurfaceState,
} from "../packages/a2ui/dist/index.js";

const extensionId = "com.example/status-badge";
const componentName = `${extensionId}:StatusBadge`;
const catalogId = `${extensionId}@1`;
const eventName = `${extensionId}:activate`;

function manifest(overrides = {}) {
  return {
    profileVersion: "1",
    extensionId,
    catalogId,
    catalogVersion: "1",
    schemaVersion: "1.0.0",
    componentName,
    propsSchema: {
      type: "object",
      properties: {
        label: { type: "string", maxLength: 64 },
        tone: { enum: ["negative", "neutral", "positive"] },
      },
      required: ["label", "tone"],
      additionalProperties: false,
    },
    events: [
      {
        name: eventName,
        payloadSchema: {
          type: "object",
          properties: { selected: { type: "boolean" } },
          required: ["selected"],
          additionalProperties: false,
        },
        requiresUserActivation: true,
      },
    ],
    platforms: ["android", "ios"],
    accessibility: {
      ownership: "host",
      requiresLabel: true,
      behavior: "Expose one labeled button and announce the current status.",
    },
    resourceNeeds: ["network.status"],
    permissionNeeds: [],
    limits: {
      maximumInstances: 2,
      maximumEventPayloadValues: 8,
      maximumEventPayloadStringCodeUnits: 256,
      maximumPropsValues: 8,
      maximumPropsStringCodeUnits: 256,
      maximumUpdatesPerSurface: 2,
    },
    fallback: { kind: "reject" },
    compatibility: {
      owner: "Example Mobile Team",
      supportUrl: "https://example.com/status-badge",
    },
    ...overrides,
  };
}

function createNegotiatedRegistry(platform = "ios") {
  const localManifest = manifest();
  const host = createA2uiV1HostExtensionCapabilitySettings([localManifest], platform);
  const negotiation = negotiateA2uiV1HostExtensions(host, host);
  assert.equal(negotiation.kind, "negotiated");
  return createA2uiV1HostExtensionRegistry({
    platform,
    manifests: [localManifest],
    negotiation,
  });
}

function extensionEnvelope(props = {}) {
  return {
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
          ...props,
        },
      ],
    },
  };
}

test("host-extension manifests require namespaced identity and closed local schemas", () => {
  const parsed = parseA2uiV1HostExtensionManifest(manifest());
  assert.equal(parsed.componentName, componentName);
  assert.equal(Object.isFrozen(parsed), true);
  assert.throws(
    () =>
      parseA2uiV1HostExtensionManifest(
        manifest({ propsSchema: { type: "object", properties: {} } }),
      ),
    /closed JSON Schema/,
  );
  assert.throws(
    () =>
      parseA2uiV1HostExtensionManifest(
        manifest({
          propsSchema: {
            type: "object",
            properties: { children: { type: "array" } },
            additionalProperties: false,
          },
        }),
      ),
    /Reserved host-extension prop/,
  );
  assert.throws(
    () =>
      parseA2uiV1HostExtensionManifest(
        manifest({
          events: [],
          propsSchema: {
            type: "object",
            properties: { value: { $ref: "https://attacker.example/schema" } },
            additionalProperties: false,
          },
        }),
      ),
    /Remote JSON Schema references/,
  );
  assert.throws(
    () =>
      parseA2uiV1HostExtensionManifest(
        manifest({
          propsSchema: {
            type: "object",
            properties: {
              config: { type: "object", properties: { mode: { type: "string" } } },
            },
            additionalProperties: false,
          },
        }),
      ),
    /closed JSON Schema.*config/,
  );
  assert.throws(
    () =>
      parseA2uiV1HostExtensionManifest(
        manifest({
          propsSchema: {
            type: "object",
            properties: {},
            patternProperties: { "^remote-": { type: "string" } },
            additionalProperties: false,
          },
        }),
      ),
    /Pattern-based host-extension properties/,
  );
});

test("host-extension manifest metadata and bounded declarations fail closed", () => {
  const invalidManifests = [
    [manifest({ unknown: true }), /Unexpected field/],
    [manifest({ profileVersion: "2" }), /profile version/],
    [manifest({ extensionId: "local" }), /namespaced extension identifier/],
    [manifest({ catalogVersion: "01" }), /stable numeric version/],
    [manifest({ schemaVersion: "latest" }), /stable numeric version/],
    [manifest({ catalogId: `${extensionId}@2` }), /catalogId/],
    [manifest({ componentName: "com.example/other:StatusBadge" }), /PascalCase component name/],
    [manifest({ componentName: `${extensionId}:status-badge` }), /PascalCase component name/],
    [
      manifest({ accessibility: { ownership: "server", requiresLabel: true, behavior: "x" } }),
      /string "host"/,
    ],
    [
      manifest({ accessibility: { ownership: "host", requiresLabel: "yes", behavior: "x" } }),
      /boolean/,
    ],
    [manifest({ platforms: [] }), /one or two host platforms/],
    [manifest({ platforms: ["ios", "ios"] }), /unique host platforms/],
    [manifest({ platforms: ["web"] }), /android.*ios/],
    [manifest({ resourceNeeds: "network.status" }), /capability needs/],
    [manifest({ resourceNeeds: ["Network Status"] }), /closed capability identifier/],
    [manifest({ resourceNeeds: ["network.status", "network.status"] }), /unique capability needs/],
    [manifest({ limits: { ...manifest().limits, maximumInstances: 0 } }), /integer from 1/],
    [
      manifest({ limits: { ...manifest().limits, maximumUpdatesPerSurface: 1.5 } }),
      /integer from 1/,
    ],
    [manifest({ fallback: { kind: "text" } }), /fail-closed/],
    [
      manifest({ compatibility: { owner: "Example", supportUrl: "http://example.com" } }),
      /credential-free HTTPS/,
    ],
    [
      manifest({ compatibility: { owner: "Example", supportUrl: "https://user@example.com" } }),
      /credential-free HTTPS/,
    ],
    [
      manifest({
        compatibility: { owner: "Example", supportUrl: "https://example.com/#fragment" },
      }),
      /credential-free HTTPS/,
    ],
    [
      manifest({ compatibility: { owner: "Example", supportUrl: "not a url" } }),
      /absolute HTTPS URL/,
    ],
  ];
  for (const [candidate, expected] of invalidManifests) {
    assert.throws(() => parseA2uiV1HostExtensionManifest(candidate), expected);
  }

  const withoutSupportUrl = parseA2uiV1HostExtensionManifest(
    manifest({ compatibility: { owner: "Example" } }),
  );
  assert.equal(withoutSupportUrl.compatibility.supportUrl, undefined);
});

test("host-extension events and nested schemas reject undeclared behavior", () => {
  const baseEvent = manifest().events[0];
  const invalidEvents = [
    [manifest({ events: null }), /at most 64 entries/],
    [manifest({ events: [{ ...baseEvent, name: "activate" }] }), /namespaced event name/],
    [
      manifest({ events: [{ ...baseEvent, name: `${extensionId}:Activate` }] }),
      /namespaced event name/,
    ],
    [manifest({ events: [baseEvent, baseEvent] }), /Duplicate host-extension event/],
    [manifest({ events: [{ ...baseEvent, requiresUserActivation: "yes" }] }), /boolean/],
    [
      manifest({ events: [{ ...baseEvent, payloadSchema: { type: "string", properties: {} } }] }),
      /object JSON Schema/,
    ],
    [
      manifest({
        propsSchema: {
          type: "object",
          properties: {
            configs: {
              type: "array",
              items: { type: "object", properties: {}, unevaluatedProperties: false },
            },
          },
          additionalProperties: false,
        },
      }),
      null,
    ],
    [
      manifest({
        propsSchema: {
          type: "object",
          properties: { value: { type: "not-a-json-schema-type" } },
          additionalProperties: false,
        },
      }),
      /Invalid host-extension JSON Schema/,
    ],
  ];
  for (const [candidate, expected] of invalidEvents) {
    if (expected === null) {
      assert.doesNotThrow(() => parseA2uiV1HostExtensionManifest(candidate));
    } else {
      assert.throws(() => parseA2uiV1HostExtensionManifest(candidate), expected);
    }
  }
});

test("host extensions negotiate exact profile, catalog, schema, and component versions", () => {
  const host = createA2uiV1HostExtensionCapabilitySettings([manifest()], "ios");
  assert.deepEqual(negotiateA2uiV1HostExtensions(host, host), {
    kind: "negotiated",
    profileId: "io.mcp-native/a2ui-host-extensions",
    profileVersion: "1",
    extensions: [
      {
        extensionId,
        catalogId,
        catalogVersion: "1",
        schemaVersion: "1.0.0",
        componentName,
      },
    ],
    inlineCatalogsEnabled: false,
  });
  const mismatched = structuredClone(host);
  mismatched["io.mcp-native/a2ui-host-extensions"].extensions[0].schemaVersion = "2.0.0";
  assert.deepEqual(negotiateA2uiV1HostExtensions(host, mismatched), {
    kind: "fallback",
    profileId: "io.mcp-native/a2ui-host-extensions",
    reason: "no-exact-extension-match",
  });
  assert.deepEqual(createA2uiV1HostExtensionCapabilitySettings([manifest()], "android"), host);
  assert.deepEqual(
    createA2uiV1HostExtensionCapabilitySettings([manifest({ platforms: ["ios"] })], "android")[
      "io.mcp-native/a2ui-host-extensions"
    ].extensions,
    [],
  );
});

test("host-extension capability parsing and registry construction require exact opaque inputs", () => {
  const settings = createA2uiV1HostExtensionCapabilitySettings([manifest()], "ios");
  const value = settings["io.mcp-native/a2ui-host-extensions"];
  const entry = value.extensions[0];
  const invalidValues = [
    [{ ...value, profileVersion: "2" }, /profile version/],
    [{ ...value, extensions: null }, /at most 64 entries/],
    [{ ...value, extensions: [{ ...entry, extensionId: "local" }] }, /namespaced identifier/],
    [{ ...value, extensions: [{ ...entry, catalogVersion: "01" }] }, /stable numeric version/],
    [
      { ...value, extensions: [{ ...entry, catalogId: `${extensionId}@2` }] },
      /Inconsistent namespaced identity/,
    ],
    [
      { ...value, extensions: [{ ...entry, componentName: `${extensionId}:status-badge` }] },
      /Inconsistent namespaced identity/,
    ],
    [{ ...value, extensions: [entry, entry] }, /Duplicate host-extension capability/],
  ];
  for (const [candidate, expected] of invalidValues) {
    assert.throws(() => parseA2uiV1HostExtensionCapabilityValue(candidate), expected);
  }

  assert.throws(
    () => createA2uiV1HostExtensionCapabilitySettings({}, "ios"),
    /host-extension manifests/,
  );
  assert.throws(
    () =>
      createA2uiV1HostExtensionCapabilitySettings(
        Array.from({ length: A2UI_V1_HOST_EXTENSION_MAX_MANIFESTS + 1 }, () => manifest()),
        "ios",
      ),
    /at most 64 host-extension manifests/,
  );
  assert.throws(
    () => createA2uiV1HostExtensionCapabilitySettings([manifest(), manifest()], "ios"),
    /Duplicate host-extension manifest/,
  );

  assert.deepEqual(negotiateA2uiV1HostExtensions({}, settings), {
    kind: "fallback",
    profileId: "io.mcp-native/a2ui-host-extensions",
    reason: "host-unsupported",
  });
  assert.deepEqual(negotiateA2uiV1HostExtensions(settings, {}), {
    kind: "fallback",
    profileId: "io.mcp-native/a2ui-host-extensions",
    reason: "server-unsupported",
  });

  assert.throws(() => createA2uiV1HostExtensionRegistry(null), /options to be an object/);
  assert.throws(
    () =>
      createA2uiV1HostExtensionRegistry({
        platform: "ios",
        manifests: [manifest()],
        negotiation: {
          kind: "negotiated",
          profileId: "io.mcp-native/a2ui-host-extensions",
          profileVersion: "1",
          extensions: value.extensions,
          inlineCatalogsEnabled: false,
        },
      }),
    /exact negotiated capability set/,
  );
});

test("only an opaque negotiated registry admits schema-valid extension leaf components", () => {
  const registry = createNegotiatedRegistry();
  assert.equal(isA2uiV1HostExtensionRegistry(registry), true);
  assert.equal(isA2uiV1HostExtensionRegistry(null), false);
  assert.equal(isA2uiV1HostExtensionRegistry({ platform: "ios", manifests: [] }), false);
  assert.deepEqual(getA2uiV1HostExtensionCatalogIds(registry), [catalogId]);
  assert.equal(getA2uiV1HostExtensionManifest(registry, 1, componentName), undefined);
  assert.equal(getA2uiV1HostExtensionManifest(registry, catalogId, "unknown"), undefined);
  assert.equal(
    getA2uiV1HostExtensionManifest(registry, catalogId, componentName).componentName,
    componentName,
  );
  assert.throws(() => getA2uiV1HostExtensionCatalogIds({}), /opaque host-extension registry/);
  assert.throws(() => parseA2uiV1Envelope(extensionEnvelope()), /schema validation failed/);
  const envelope = parseA2uiV1Envelope(extensionEnvelope(), { hostExtensions: registry });
  assert.equal(envelope.createSurface.components[1].component, componentName);

  const store = new A2uiSurfaceStore({ hostExtensions: registry });
  store.apply(envelope);
  const surface = store.get("extension");
  const policy = createA2uiV1BasicCatalogPolicy({
    allowedComponentNames: ["Column"],
    hostExtensions: registry,
    allowedHostExtensionComponentNames: [componentName],
  });
  assert.equal(validateA2uiV1SurfaceState(surface, policy).components.size, 2);

  assert.throws(
    () =>
      parseA2uiV1Envelope(extensionEnvelope({ tone: "forged" }), {
        hostExtensions: registry,
      }),
    /props schema validation failed/,
  );
  assert.throws(
    () =>
      parseA2uiV1Envelope(extensionEnvelope({ component: `${extensionId}:UnknownComponent` }), {
        hostExtensions: registry,
      }),
    /schema validation failed/,
  );

  const strictManifest = parseA2uiV1HostExtensionManifest(
    manifest({ limits: { ...manifest().limits, maximumPropsValues: 2 } }),
  );
  const strictSettings = createA2uiV1HostExtensionCapabilitySettings([strictManifest], "ios");
  const strictNegotiation = negotiateA2uiV1HostExtensions(strictSettings, strictSettings);
  const strictRegistry = createA2uiV1HostExtensionRegistry({
    platform: "ios",
    manifests: [strictManifest],
    negotiation: strictNegotiation,
  });
  assert.throws(
    () =>
      validateA2uiV1HostExtensionComponent(
        strictRegistry,
        extensionEnvelope().createSurface.components[1],
      ),
    /props exceed maximum/,
  );
  assert.equal(
    getA2uiV1HostExtensionManifestFingerprint(structuredClone(strictManifest)),
    getA2uiV1HostExtensionManifestFingerprint(strictManifest),
  );
});

test("extension update amplification and forged local events fail closed", () => {
  const registry = createNegotiatedRegistry();
  const store = new A2uiSurfaceStore({ hostExtensions: registry });
  store.apply(extensionEnvelope());
  store.apply({
    version: "v1.0",
    updateComponents: {
      surfaceId: "extension",
      components: [
        {
          id: "status",
          component: componentName,
          catalogId,
          label: "Waiting",
          tone: "neutral",
          accessibility: { label: "Connection status" },
        },
      ],
    },
  });
  assert.throws(
    () =>
      store.apply({
        version: "v1.0",
        updateComponents: {
          surfaceId: "extension",
          components: [
            {
              id: "status",
              component: componentName,
              catalogId,
              label: "Disconnected",
              tone: "negative",
              accessibility: { label: "Connection status" },
            },
          ],
        },
      }),
    /exceeds maximum of 2 updates/,
  );

  const parsedManifest = parseA2uiV1HostExtensionManifest(manifest());
  assert.deepEqual(
    validateA2uiV1HostExtensionEvent(parsedManifest, eventName, { selected: true }, true),
    { selected: true },
  );
  assert.throws(
    () => validateA2uiV1HostExtensionEvent(parsedManifest, eventName, { selected: true }, false),
    /requires explicit user activation/,
  );
  assert.throws(
    () => validateA2uiV1HostExtensionEvent(parsedManifest, eventName, { selected: "yes" }, true),
    /event schema validation failed/,
  );
  assert.throws(
    () => validateA2uiV1HostExtensionEvent(parsedManifest, `${extensionId}:command`, {}, true),
    /Unknown host-extension event/,
  );
  assert.throws(
    () => validateA2uiV1HostExtensionEvent(parsedManifest, 1, {}, true),
    /string host-extension event name/,
  );
  assert.throws(
    () => validateA2uiV1HostExtensionEvent(parsedManifest, eventName, { selected: true }, "yes"),
    /user activation/,
  );

  const strictEventManifest = parseA2uiV1HostExtensionManifest(
    manifest({
      events: [
        {
          ...manifest().events[0],
          requiresUserActivation: false,
        },
      ],
      limits: { ...manifest().limits, maximumEventPayloadValues: 1 },
    }),
  );
  assert.throws(
    () =>
      validateA2uiV1HostExtensionEvent(strictEventManifest, eventName, { selected: true }, false),
    /event exceeds maximum/,
  );
  assert.throws(
    () => validateA2uiV1HostExtensionEvent(strictEventManifest, eventName, {}, "yes"),
    /boolean host-extension user-activation marker/,
  );
});

test("unavailable-platform registries cannot be constructed from an advertised iOS-only entry", () => {
  const localManifest = manifest({ platforms: ["ios"] });
  const ios = createA2uiV1HostExtensionCapabilitySettings([localManifest], "ios");
  const negotiation = negotiateA2uiV1HostExtensions(ios, ios);
  assert.throws(
    () =>
      createA2uiV1HostExtensionRegistry({
        platform: "android",
        manifests: [localManifest],
        negotiation,
      }),
    /locally available manifest/,
  );
});
