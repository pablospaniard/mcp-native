import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  CAPABILITY_BINDING_VERSION,
  CAPABILITY_EXTENSION_ID,
  CAPABILITY_RISK_PROFILES,
  CapabilitySetupError,
  HAPTICS_CAPABILITY_MANIFEST,
  createCapabilityBroker,
  createCapabilityProvider,
  createCapabilityRegistry,
  createHapticsProvider,
  negotiateCapabilities,
} from "../packages/host/dist/capabilities.js";

const requestSchema = {
  type: "object",
  properties: { message: { type: "string", minLength: 1, maxLength: 16 } },
  required: ["message"],
  additionalProperties: false,
};
const resultSchema = {
  type: "object",
  properties: { accepted: { type: "boolean" } },
  required: ["accepted"],
  additionalProperties: false,
};
const eventSchema = {
  type: "object",
  properties: { progress: { type: "integer", minimum: 0, maximum: 100 } },
  required: ["progress"],
  additionalProperties: false,
};
const errorSchema = {
  type: "object",
  properties: {
    code: { type: "string", minLength: 6, maxLength: 11, enum: ["denied", "unavailable"] },
  },
  required: ["code"],
  additionalProperties: false,
};

function manifest(overrides = {}) {
  return {
    manifestVersion: "1",
    descriptor: {
      id: "com.example/device-message",
      version: "1.0.0",
      schemaRevision: `sha256:${"a".repeat(64)}`,
    },
    requestSchema,
    resultSchema,
    eventSchema,
    errorSchema,
    platforms: [
      { platform: "ios", minimumOsVersion: "17.0", provider: "example-ios" },
      { platform: "android", minimumOsVersion: "34", provider: "example-android" },
    ],
    permissions: ["device.message"],
    entitlements: ["com.example.message"],
    activation: "user",
    consent: "per-request",
    execution: "foreground",
    sensitivity: ["communications"],
    limits: {
      maxDepth: 8,
      maxValues: 64,
      maxStringCodeUnits: 512,
      maxWork: 4_096,
      maxSessionValues: 256,
      maxSessionStringCodeUnits: 2_048,
      maxSessionWork: 16_384,
      maxCallsPerSession: 8,
      maxConcurrentCalls: 1,
      maxEventsPerCall: 2,
      maxDurationMs: 1_000,
      maxCleanupMs: 100,
    },
    cancellation: "cooperative",
    cleanup: "always",
    fallback: "ordinary-mcp",
    threatModel: "docs/threat-models/example-device-message.md",
    ...overrides,
  };
}

function provider(options = {}) {
  const calls = { invoke: 0, cleanup: [], events: 0 };
  const registration = createCapabilityProvider({
    manifest: manifest(options.manifest),
    async invoke(context) {
      calls.invoke++;
      if (options.invoke) return options.invoke(context, calls);
      context.emit({ progress: 100 });
      calls.events++;
      return { kind: "result", value: { accepted: true } };
    },
    async cleanup(requestId, reason) {
      calls.cleanup.push([requestId, reason]);
      await options.cleanup?.(requestId, reason);
    },
  });
  return { registration, calls };
}

function setup(options = {}) {
  const local = provider(options.provider);
  const registry = createCapabilityRegistry([local.registration], {
    platform: "ios",
    osVersion: "18.1",
  });
  const grant = negotiateCapabilities(registry, registry.extensionSettings);
  assert.equal(grant.kind, "negotiated");
  const audit = [];
  const reviews = [];
  const permissions = [];
  const broker = createCapabilityBroker({
    registry,
    async authorize(request) {
      reviews.push(request);
      return options.authorize?.(request) ?? true;
    },
    async ensurePermissions(request) {
      permissions.push(request);
      return options.ensurePermissions?.(request) ?? true;
    },
    audit(event) {
      audit.push(event);
      options.audit?.(event);
    },
  });
  const invoke = (overrides = {}) =>
    broker.invoke({
      grant,
      requestId: "request-1",
      capability: local.registration.manifest.descriptor,
      request: { message: "hello" },
      userActivated: true,
      foreground: true,
      onEvent() {},
      ...overrides,
    });
  return { ...local, registry, grant, broker, invoke, audit, reviews, permissions };
}

const setupCode = (expected) => (error) =>
  error instanceof CapabilitySetupError && error.code === expected && error.message === expected;

test("capability manifests are closed, namespaced, versioned and bounded", () => {
  const good = provider().registration;
  assert.equal(Object.isFrozen(good.manifest), true);
  assert.equal(Object.isFrozen(good.manifest.requestSchema), true);
  for (const mutation of [
    { manifestVersion: "2" },
    { descriptor: { ...manifest().descriptor, id: "message" } },
    { descriptor: { ...manifest().descriptor, id: "io.github.pablospaniard/forged" } },
    { descriptor: { ...manifest().descriptor, version: "1" } },
    { descriptor: { ...manifest().descriptor, schemaRevision: "latest" } },
    { platforms: [{ platform: "web", minimumOsVersion: "1", provider: "bad" }] },
    { permissions: ["same", "same"] },
    { activation: "none" },
    { activation: "server" },
    { consent: "none" },
    { consent: "session" },
    { execution: "foreground-or-background" },
    { execution: "background" },
    { sensitivity: ["unknown"] },
    { sensitivity: [], activation: "none", consent: "none" },
    { cancellation: "ignore" },
    { cleanup: "optional" },
    { fallback: "native-command" },
    { limits: { ...manifest().limits, maxConcurrentCalls: 17 } },
    { limits: { ...manifest().limits, maxSessionValues: 1 } },
    { threatModel: "../../etc/passwd" },
    { threatModel: "/docs/threat-models/example.md" },
    { threatModel: "https://example.com/threat-model.md" },
    { extra: true },
  ]) {
    assert.throws(
      () =>
        createCapabilityProvider({
          manifest: { ...manifest(), ...mutation },
          async invoke() {
            return { kind: "result", value: { accepted: true } };
          },
          cleanup() {},
        }),
      setupCode("invalid-provider"),
    );
  }
});

test("the built-in schema digest pins the exact four-schema bundle", () => {
  const builtIn = HAPTICS_CAPABILITY_MANIFEST;
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        requestSchema: builtIn.requestSchema,
        resultSchema: builtIn.resultSchema,
        eventSchema: builtIn.eventSchema,
        errorSchema: builtIn.errorSchema,
      }),
    )
    .digest("hex");
  assert.equal(builtIn.descriptor.schemaRevision, `sha256:${digest}`);
});

test("registry snapshots only providers available on the exact platform range", () => {
  const { registration } = provider();
  const unavailable = createCapabilityRegistry([registration], {
    platform: "ios",
    osVersion: "16.9",
  });
  assert.deepEqual(unavailable.capabilities, []);
  assert.deepEqual(unavailable.extensionSettings, {
    bindingVersion: CAPABILITY_BINDING_VERSION,
    capabilities: [],
  });
  assert.throws(
    () => createCapabilityRegistry([{ ...registration }], { platform: "ios", osVersion: "18" }),
    setupCode("invalid-registry"),
  );
  assert.throws(
    () =>
      createCapabilityRegistry([registration, registration], { platform: "ios", osVersion: "18" }),
    setupCode("invalid-registry"),
  );

  const unsupportedA = provider({
    manifest: {
      platforms: [{ platform: "android", minimumOsVersion: "34", provider: "android-a" }],
    },
  }).registration;
  const unsupportedB = provider({
    manifest: {
      platforms: [{ platform: "android", minimumOsVersion: "34", provider: "android-b" }],
    },
  }).registration;
  assert.throws(
    () =>
      createCapabilityRegistry([unsupportedA, unsupportedB], {
        platform: "ios",
        osVersion: "18",
      }),
    setupCode("invalid-registry"),
  );

  const alternateRevision = provider({
    manifest: {
      descriptor: { ...manifest().descriptor, schemaRevision: `sha256:${"b".repeat(64)}` },
    },
  }).registration;
  const revisionRegistry = createCapabilityRegistry([registration, alternateRevision], {
    platform: "ios",
    osVersion: "18",
  });
  assert.equal(revisionRegistry.capabilities.length, 2);
});

test("negotiation requires an exact installed, advertised descriptor and returns an opaque grant", () => {
  const { registry, grant } = setup();
  assert.deepEqual(grant.capabilities, registry.capabilities);
  assert.deepEqual(negotiateCapabilities(registry, undefined), {
    kind: "fallback",
    reason: "absent",
  });
  assert.deepEqual(negotiateCapabilities(registry, { capabilities: registry.capabilities }), {
    kind: "fallback",
    reason: "invalid",
  });
  assert.deepEqual(
    negotiateCapabilities(registry, {
      ...registry.extensionSettings,
      capabilities: [{ ...registry.capabilities[0], version: "2.0.0" }],
    }),
    { kind: "fallback", reason: "unsupported" },
  );
});

test("broker validates, authorizes, checks permissions, invokes, validates output and audits without payloads", async () => {
  const context = setup();
  const events = [];
  const result = await context.invoke({ onEvent: (event) => events.push(event) });
  assert.deepEqual(result, { kind: "result", value: { accepted: true } });
  assert.deepEqual(events, [{ progress: 100 }]);
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(context.reviews[0].request), true);
  assert.deepEqual(context.calls.cleanup, [["request-1", "completed"]]);
  assert.deepEqual(
    context.audit.map(({ phase }) => phase),
    ["requested", "started", "event", "succeeded", "cleanup"],
  );
  for (const event of context.audit) {
    assert.equal("request" in event, false);
    assert.equal("result" in event, false);
    assert.equal("event" in event, false);
  }
  assert.deepEqual(context.permissions[0].permissions, ["device.message"]);
});

test("activation, foreground, policy and permission boundaries fail before provider invocation", async () => {
  for (const [overrides, options, code] of [
    [{ userActivated: false }, {}, "activation-required"],
    [{ foreground: false }, {}, "background-denied"],
    [{}, { authorize: () => false }, "policy-denied"],
    [{}, { authorize: () => Promise.reject(new Error("secret policy detail")) }, "policy-denied"],
    [{}, { ensurePermissions: () => false }, "permission-denied"],
    [
      {},
      { ensurePermissions: () => Promise.reject(new Error("secret permission detail")) },
      "permission-denied",
    ],
  ]) {
    const context = setup(options);
    // eslint-disable-next-line no-await-in-loop -- each isolated policy case verifies its own callback count.
    assert.deepEqual(await context.invoke(overrides), { kind: "capability-error", code });
    assert.equal(context.calls.invoke, 0);
  }
});

test("failed admission does not consume the call quota or replay identifier", async () => {
  const context = setup({
    provider: { manifest: { limits: { ...manifest().limits, maxCallsPerSession: 1 } } },
  });
  assert.deepEqual(await context.invoke({ userActivated: false }), {
    kind: "capability-error",
    code: "activation-required",
  });
  assert.equal((await context.invoke()).kind, "result");
});

test("unknown, forged and replayed invocation authority fails closed", async () => {
  const context = setup();
  assert.deepEqual(await context.invoke({ grant: { ...context.grant } }), {
    kind: "capability-error",
    code: "invalid-grant",
  });
  assert.deepEqual(
    await context.invoke({ capability: { ...context.registry.capabilities[0], version: "2.0.0" } }),
    { kind: "capability-error", code: "unavailable" },
  );
  assert.equal((await context.invoke()).kind, "result");
  assert.deepEqual(await context.invoke(), {
    kind: "capability-error",
    code: "replayed-request",
  });
});

test("hostile requests and provider output never cross unchecked", async () => {
  const invalidRequest = setup();
  assert.deepEqual(
    await invalidRequest.invoke({ request: { message: "hello", command: "open" } }),
    {
      kind: "capability-error",
      code: "invalid-request",
    },
  );
  assert.equal(invalidRequest.calls.invoke, 0);

  assert.deepEqual(await invalidRequest.broker.invoke(null), {
    kind: "capability-error",
    code: "invalid-request",
  });
  assert.deepEqual(invalidRequest.audit.at(-1), {
    phase: "failed",
    operationId: "2",
    capabilityId: "unresolved",
    capabilityVersion: "unresolved",
    code: "invalid-request",
  });
  assert.deepEqual(
    await invalidRequest.invoke({
      requestId: "bad-shape",
      foreground: "yes",
    }),
    { kind: "capability-error", code: "invalid-request" },
  );
  assert.deepEqual(
    invalidRequest.audit.slice(-2).map(({ phase, code }) => [phase, code]),
    [
      ["requested", undefined],
      ["failed", "invalid-request"],
    ],
  );
  assert.deepEqual(
    await invalidRequest.invoke({
      requestId: "bad-descriptor",
      capability: { ...invalidRequest.registry.capabilities[0], version: 1 },
    }),
    { kind: "capability-error", code: "invalid-request" },
  );

  const invalidResult = setup({
    provider: {
      invoke: async () => ({ kind: "result", value: { accepted: true, raw: "native" } }),
    },
  });
  assert.deepEqual(await invalidResult.invoke(), {
    kind: "capability-error",
    code: "invalid-result",
  });
  assert.deepEqual(invalidResult.calls.cleanup, [["request-1", "completed"]]);

  const invalidError = setup({
    provider: { invoke: async () => ({ kind: "error", error: { code: "native-stack" } }) },
  });
  assert.deepEqual(await invalidError.invoke(), {
    kind: "capability-error",
    code: "invalid-provider-error",
  });
  assert.deepEqual(invalidError.calls.cleanup, [["request-1", "provider-error"]]);

  const malformedOutcome = setup({
    provider: { invoke: async () => null },
  });
  assert.deepEqual(await malformedOutcome.invoke(), {
    kind: "capability-error",
    code: "provider-failed",
  });
  assert.deepEqual(malformedOutcome.calls.cleanup, [["request-1", "provider-error"]]);
});

test("event count, event schema and cumulative work are bounded", async () => {
  const tooMany = setup({
    provider: {
      invoke: async (context) => {
        context.emit({ progress: 1 });
        context.emit({ progress: 2 });
        context.emit({ progress: 3 });
        return { kind: "result", value: { accepted: true } };
      },
    },
  });
  assert.deepEqual(await tooMany.invoke(), { kind: "capability-error", code: "limit-exceeded" });

  const malformed = setup({
    provider: {
      invoke: async (context) => {
        context.emit({ progress: 101 });
        return { kind: "result", value: { accepted: true } };
      },
    },
  });
  assert.deepEqual(await malformed.invoke(), { kind: "capability-error", code: "invalid-event" });

  const handlerFailure = setup();
  assert.deepEqual(
    await handlerFailure.invoke({
      onEvent() {
        throw new Error("host callback failed");
      },
    }),
    { kind: "capability-error", code: "event-handler-failed" },
  );
  assert.deepEqual(handlerFailure.calls.cleanup, [["request-1", "failed"]]);

  const work = setup({
    provider: {
      invoke: async (context) => {
        context.consume(4_096);
        return { kind: "result", value: { accepted: true } };
      },
    },
  });
  assert.deepEqual(await work.invoke(), { kind: "capability-error", code: "limit-exceeded" });
});

test("session totals and concurrent provider work cannot amplify valid individual calls", async () => {
  const limited = setup({
    provider: {
      manifest: {
        limits: {
          ...manifest().limits,
          maxValues: 16,
          maxSessionValues: 16,
        },
      },
    },
  });
  assert.equal((await limited.invoke()).kind, "result");
  assert.equal((await limited.invoke({ requestId: "request-2" })).kind, "result");
  assert.deepEqual(await limited.invoke({ requestId: "request-3" }), {
    kind: "capability-error",
    code: "limit-exceeded",
  });

  let release;
  let started;
  const entered = new Promise((resolve) => (started = resolve));
  const concurrent = setup({
    provider: {
      invoke: () => {
        started();
        return new Promise((resolve) => (release = resolve));
      },
    },
  });
  const first = concurrent.invoke();
  await entered;
  assert.deepEqual(await concurrent.invoke({ requestId: "request-2" }), {
    kind: "capability-error",
    code: "limit-exceeded",
  });
  release({ kind: "result", value: { accepted: true } });
  assert.equal((await first).kind, "result");
});

test("session quotas, replay IDs and concurrency are scoped to each provider", async () => {
  const first = provider({
    manifest: { limits: { ...manifest().limits, maxCallsPerSession: 1 } },
  });
  const second = provider({
    manifest: {
      descriptor: { ...manifest().descriptor, id: "com.example/second-message" },
      limits: { ...manifest().limits, maxCallsPerSession: 1 },
    },
  });
  const registry = createCapabilityRegistry([first.registration, second.registration], {
    platform: "ios",
    osVersion: "18",
  });
  const grant = negotiateCapabilities(registry, registry.extensionSettings);
  const broker = createCapabilityBroker({
    registry,
    authorize: () => true,
    ensurePermissions: () => true,
    audit() {},
  });
  const invoke = (registration, requestId) =>
    broker.invoke({
      grant,
      requestId,
      capability: registration.manifest.descriptor,
      request: { message: "hello" },
      userActivated: true,
      foreground: true,
    });

  assert.equal((await invoke(first.registration, "same-id")).kind, "result");
  assert.equal((await invoke(second.registration, "same-id")).kind, "result");
  assert.deepEqual(await invoke(first.registration, "over-limit"), {
    kind: "capability-error",
    code: "limit-exceeded",
  });
  assert.deepEqual(await invoke(first.registration, "over-limit"), {
    kind: "capability-error",
    code: "limit-exceeded",
  });
});

test("policy and permission waits do not consume provider execution time", async () => {
  const wait = () => new Promise((resolve) => setTimeout(() => resolve(true), 15));
  const context = setup({
    authorize: wait,
    ensurePermissions: wait,
    provider: { manifest: { limits: { ...manifest().limits, maxDurationMs: 5 } } },
  });
  assert.deepEqual(await context.invoke(), {
    kind: "result",
    value: { accepted: true },
  });
});

test("provider contexts reject events and work after finalization", async () => {
  let retained;
  const events = [];
  const context = setup({
    provider: {
      invoke: async (providerContext) => {
        retained = providerContext;
        return { kind: "result", value: { accepted: true } };
      },
    },
  });
  assert.equal((await context.invoke({ onEvent: (event) => events.push(event) })).kind, "result");
  const auditLength = context.audit.length;
  retained.emit({ progress: 50 });
  retained.consume(1_000_000);
  assert.deepEqual(events, []);
  assert.equal(context.audit.length, auditLength);
});

test("deadline timers preserve their runtime receiver", async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  globalThis.setTimeout = function (...args) {
    assert.equal(this, globalThis);
    return Reflect.apply(originalSetTimeout, globalThis, args);
  };
  globalThis.clearTimeout = function (...args) {
    assert.equal(this, globalThis);
    return Reflect.apply(originalClearTimeout, globalThis, args);
  };
  try {
    assert.equal((await setup().invoke()).kind, "result");
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test("provider deadlines suppress late results and record timeout cleanup", async () => {
  const context = setup({
    provider: {
      manifest: { limits: { ...manifest().limits, maxDurationMs: 5 } },
      invoke: () => new Promise(() => {}),
    },
  });
  assert.deepEqual(await context.invoke(), { kind: "capability-error", code: "timed-out" });
  assert.deepEqual(context.calls.cleanup, [["request-1", "timed-out"]]);
});

test("cancelled provider work retains its concurrency slot until settlement", async () => {
  let release;
  let invocations = 0;
  const context = setup({
    provider: {
      manifest: { limits: { ...manifest().limits, maxDurationMs: 5 } },
      invoke: () => {
        invocations += 1;
        return invocations === 1
          ? new Promise((resolve) => (release = resolve))
          : Promise.resolve({ kind: "result", value: { accepted: true } });
      },
    },
  });
  assert.deepEqual(await context.invoke(), { kind: "capability-error", code: "timed-out" });
  assert.deepEqual(await context.invoke({ requestId: "request-2" }), {
    kind: "capability-error",
    code: "limit-exceeded",
  });
  release({ kind: "result", value: { accepted: true } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await context.invoke({ requestId: "request-3" })).kind, "result");
});

test("cancellation suppresses late provider results and cleanup runs exactly once", async () => {
  let release;
  let started;
  const entered = new Promise((resolve) => (started = resolve));
  const context = setup({
    provider: {
      invoke: () => {
        started();
        return new Promise((resolve) => (release = resolve));
      },
    },
  });
  const controller = new AbortController();
  const pending = context.invoke({ signal: controller.signal });
  await entered;
  controller.abort();
  assert.deepEqual(await pending, { kind: "capability-error", code: "cancelled" });
  release({ kind: "result", value: { accepted: true } });
  await Promise.resolve();
  assert.deepEqual(context.calls.cleanup, [["request-1", "cancelled"]]);
});

test("closing the broker revokes future and active calls", async () => {
  let started;
  const entered = new Promise((resolve) => (started = resolve));
  const context = setup({
    provider: {
      async invoke({ signal }) {
        started();
        await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
        return { kind: "result", value: { accepted: true } };
      },
    },
  });
  const pending = context.invoke();
  await entered;
  await context.broker.close();
  assert.deepEqual(await pending, { kind: "capability-error", code: "cancelled" });
  assert.deepEqual(context.calls.cleanup, [["request-1", "closed"]]);
  assert.deepEqual(await context.invoke({ requestId: "request-2" }), {
    kind: "capability-error",
    code: "closed",
  });
});

test("closing the broker cancels a pending policy review without invoking or cleaning a provider", async () => {
  let reviewing;
  const entered = new Promise((resolve) => (reviewing = resolve));
  const context = setup({
    authorize: () => {
      reviewing();
      return new Promise(() => {});
    },
  });
  const pending = context.invoke();
  await entered;
  await context.broker.close();
  assert.deepEqual(await pending, { kind: "capability-error", code: "cancelled" });
  assert.equal(context.calls.invoke, 0);
  assert.deepEqual(context.calls.cleanup, []);
});

test("process restart and unavailable platform state require fresh negotiation", async () => {
  const local = provider();
  const firstRegistry = createCapabilityRegistry([local.registration], {
    platform: "ios",
    osVersion: "18",
  });
  const oldGrant = negotiateCapabilities(firstRegistry, firstRegistry.extensionSettings);
  const restartedRegistry = createCapabilityRegistry([local.registration], {
    platform: "ios",
    osVersion: "18",
  });
  const broker = createCapabilityBroker({
    registry: restartedRegistry,
    authorize: () => true,
    ensurePermissions: () => true,
    audit() {},
  });
  assert.deepEqual(
    await broker.invoke({
      grant: oldGrant,
      requestId: "after-restart",
      capability: local.registration.manifest.descriptor,
      request: { message: "hello" },
      userActivated: true,
      foreground: true,
    }),
    { kind: "capability-error", code: "invalid-grant" },
  );

  const unavailable = createCapabilityRegistry([local.registration], {
    platform: "tvos",
    osVersion: "18",
  });
  assert.deepEqual(negotiateCapabilities(unavailable, firstRegistry.extensionSettings), {
    kind: "fallback",
    reason: "unsupported",
  });
});

test("built-in risk floors cover every roadmap family and haptics stays app-owned", async () => {
  assert.deepEqual(
    CAPABILITY_RISK_PROFILES.map(({ category }) => category),
    [
      "media",
      "files-and-sharing",
      "location-and-maps",
      "proximity-and-sensors",
      "biometrics-and-secrets",
      "contacts-and-calendar",
      "communication",
      "payments-and-wallets",
      "background",
    ],
  );
  assert.equal(HAPTICS_CAPABILITY_MANIFEST.descriptor.id.endsWith("/haptics"), true);
  const effects = [];
  const haptics = createHapticsProvider({
    impact(effect) {
      effects.push(effect);
    },
  });
  const registry = createCapabilityRegistry([haptics], { platform: "ios", osVersion: "18" });
  const grant = negotiateCapabilities(registry, registry.extensionSettings);
  const broker = createCapabilityBroker({
    registry,
    authorize: () => true,
    ensurePermissions: () => true,
    audit() {},
  });
  assert.deepEqual(
    await broker.invoke({
      grant,
      requestId: "haptic-1",
      capability: haptics.manifest.descriptor,
      request: { effect: "light" },
      userActivated: true,
      foreground: true,
    }),
    { kind: "result", value: { performed: true } },
  );
  assert.deepEqual(effects, ["light"]);
  assert.deepEqual(registry.extensionSettings, {
    bindingVersion: CAPABILITY_BINDING_VERSION,
    capabilities: [haptics.manifest.descriptor],
  });
  assert.equal(CAPABILITY_EXTENSION_ID.includes("capabilities"), true);
});
