/* eslint-disable no-await-in-loop -- Exercise selection and lifecycle cases in deterministic order. */
import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement } from "react";
import { createRoot } from "test-renderer";
import {
  createContractAdapter,
  createContractRegistry,
  createReviewedStandardAdapter,
  createContractHostController,
  createContractActionAuthorization,
  resolveContractResult,
  CONTRACT_EXTENSION_ID,
} from "../packages/host/dist/contracts.js";
import { runContractAdapterFixtures } from "../packages/host/dist/contracts-authoring.js";
import {
  ContractHostProvider,
  ContractNativeResultView,
  createContractNativeRegistry,
  createContractNativeRegistration,
} from "../packages/host/dist/contracts-react-native.js";
import { MIME_TYPE } from "../packages/a2ui/dist/index.js";
import { client, unit, tool, classifyError, deferred } from "./fixtures/contract-lifecycle.mjs";
import {
  createFixtureAdapter,
  schema,
  binding,
  evidence,
} from "./fixtures/reviewed-standard-package/index.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const claim = (input = { title: "Paid" }) => ({
  content: [],
  structuredContent: input,
  _meta: { [binding.resultMetaKey]: binding.resultMeta },
});
async function setup(overrides = {}) {
  let preparations = 0;
  let reads = 0;
  const adapter = await createFixtureAdapter({
    prepare: (input) => {
      preparations++;
      return input;
    },
    ...overrides,
  });
  const registry = createContractRegistry([adapter]);
  const reader = client(registry.extensionSettings, {
    readResource: async () => {
      reads++;
      throw new Error("No reads");
    },
  });
  return {
    adapter,
    registry,
    reader,
    counts: () => ({ preparations, reads }),
    resolve: (options) =>
      resolveContractResult({ registry, tool, result: claim(), client: reader, ...options }),
  };
}
const rejected = (code) => ({ kind: "contract-error", code });

test("separately packaged profile has owned review evidence, disjoint advertisements, and schema fixtures", async () => {
  const value = await setup();
  assert.equal(value.registry.contracts.length, 0);
  assert.equal(value.registry.reviewedStandards[0], value.adapter.profile);
  assert.equal(value.registry.extensionSettings[CONTRACT_EXTENSION_ID], undefined);
  assert.deepEqual(value.registry.extensionSettings[binding.extensionId], binding.settings);
  assert.ok(Object.isFrozen(value.adapter.profile.evidence.exclusions));
  assert.ok(Object.isFrozen(value.adapter.profile.binding.settings));
  assert.equal(value.adapter.profile.responsibilities.resources, "none");
  const resolved = await value.resolve();
  assert.equal(resolved.kind, "contract-data");
  assert.equal(resolved.descriptor, value.adapter.descriptor);
  assert.ok(Object.isFrozen(resolved.model));
  assert.deepEqual(value.counts(), { preparations: 1, reads: 0 });
  const report = await runContractAdapterFixtures({
    adapter: value.adapter,
    fixtures: [
      {
        name: "valid",
        input: { title: "Paid" },
        expected: { kind: "contract-data", model: { title: "Paid" } },
      },
      {
        name: "invalid",
        input: { title: 1 },
        expected: { kind: "contract-error", code: "invalid-contract-input" },
      },
    ],
    events: [
      { name: "confirm", event: { name: "confirm" }, valid: true },
      { name: "denied event", event: { name: "delete" }, valid: false },
    ],
  });
  assert.equal(report.passed, true);
});

test("factory rejects incomplete evidence, executable matching, reserved markers, and oversized definitions", async () => {
  const base = await createFixtureAdapter();
  const options = {
    descriptor: base.descriptor,
    inputSchema: schema,
    modelSchema: schema,
    prepare: (input) => input,
    binding,
    evidence,
  };
  for (const change of [
    { evidence: { ...evidence, revision: "" } },
    { evidence: { ...evidence, revision: "latest" } },
    { evidence: { ...evidence, revision: "^1.0.0" } },
    { evidence: { ...evidence, review: "\nsecret" } },
    { evidence: { ...evidence, fixtures: " " } },
    { evidence: { ...evidence, exclusions: [] } },
    { evidence: { ...evidence, exclusions: Array(17).fill("x") } },
    { evidence: { ...evidence, revision: "x".repeat(513) } },
    { binding: { ...binding, match: () => true } },
    { binding: { ...binding, settings: {} } },
    { binding: { ...binding, resultMeta: [] } },
    { binding: { ...binding, extensionId: "io.modelcontextprotocol/ui" } },
    { binding: { ...binding, resultMetaKey: CONTRACT_EXTENSION_ID } },
    { binding: { ...binding, resultMetaKey: "ui" } },
    { binding: { ...binding, settings: { text: "x".repeat(9000) } } },
    { recognize: () => true },
    { resources: async () => ({}) },
  ])
    assert.throws(
      () => createReviewedStandardAdapter({ ...options, ...change }),
      /invalid-registration/,
    );
  assert.throws(() => createContractRegistry([{ ...base }]), /invalid-registry/);
  const copy = structuredClone(binding);
  const adapter = await createFixtureAdapter({ binding: copy });
  copy.settings.version = "changed";
  assert.equal(adapter.profile.binding.settings.version, binding.settings.version);
});

test("registries reject ambiguous identities, shared markers/extensions/MIME, and cumulative profile retention", async () => {
  const first = await createFixtureAdapter();
  const secondDescriptor = {
    ...first.descriptor,
    id: "com.example/second",
    mimeType: "application/vnd.example.second+json",
  };
  for (const change of [
    {},
    { binding: { ...binding, extensionId: "com.example/other" } },
    { binding: { ...binding, resultMetaKey: "com.example/other" } },
    {
      binding: { ...binding, extensionId: "com.example/other", resultMetaKey: "com.example/other" },
      descriptor: { ...secondDescriptor, mimeType: first.descriptor.mimeType },
    },
  ]) {
    const second = await createFixtureAdapter({ descriptor: secondDescriptor, ...change });
    assert.throws(() => createContractRegistry([first, second]), /invalid-registry/);
  }
  const custom = createContractAdapter({
    descriptor: secondDescriptor,
    inputSchema: schema,
    modelSchema: schema,
    prepare: (input) => input,
  });
  assert.equal(createContractRegistry([first, custom]).contracts.length, 1);
  const reusedId = createContractAdapter({
    descriptor: { ...secondDescriptor, id: first.descriptor.id, version: "2.0.0" },
    inputSchema: schema,
    modelSchema: schema,
    prepare: (input) => input,
  });
  assert.throws(() => createContractRegistry([first, reusedId]), /invalid-registry/);
  const colliding = createContractAdapter({
    descriptor: { ...secondDescriptor, mimeType: first.descriptor.mimeType },
    inputSchema: schema,
    modelSchema: schema,
    prepare: (input) => input,
  });
  assert.throws(() => createContractRegistry([first, colliding]), /invalid-registry/);
  const many = [];
  for (let i = 0; i < 32; i++)
    many.push(
      await createFixtureAdapter({
        descriptor: {
          ...first.descriptor,
          id: `com.example/profile-${i}`,
          mimeType: `application/vnd.example.profile-${i}+json`,
        },
        binding: {
          ...binding,
          extensionId: `com.example/profile-${i}`,
          resultMetaKey: `com.example/profile-${i}`,
        },
        evidence: { ...evidence, exclusions: Array(12).fill("x".repeat(500)) },
      }),
    );
  assert.throws(() => createContractRegistry(many), /invalid-registry/);
});

test("exact mutual settings are required; absent negotiation stays inert and malformed settings fail before callbacks", async () => {
  const value = await setup();
  for (const side of ["client", "server"]) {
    const withSettings = (settings) =>
      client(side === "client" ? settings : value.registry.extensionSettings, {
        getServerExtensionSettings: () =>
          side === "server" ? settings : value.registry.extensionSettings,
      });
    assert.equal((await value.resolve({ client: withSettings({}) })).kind, "ordinary");
    for (const settings of [
      {},
      { ...binding.settings, version: "next" },
      { ...binding.settings, extra: true },
      { profile: "bounded" },
    ]) {
      assert.deepEqual(
        await value.resolve({ client: withSettings({ [binding.extensionId]: settings }) }),
        rejected("invalid-standard-settings"),
      );
    }
  }
  assert.equal((await value.resolve({ result: { ...claim(), isError: true } })).kind, "ordinary");
  assert.deepEqual(value.counts(), { preparations: 0, reads: 0 });
  const reordered = { [binding.extensionId]: { profile: "bounded", version: "2026-09-14" } };
  assert.equal((await value.resolve({ client: client(reordered) })).kind, "contract-data");
});

test("standard claims cannot be malformed, ambiguous, mixed with built-ins/custom, or replayed through custom negotiation", async () => {
  const value = await setup();
  for (const marker of [
    null,
    [],
    { version: "next" },
    { version: "2026-09-14", extra: true },
    {},
  ]) {
    assert.deepEqual(
      await value.resolve({ result: { ...claim(), _meta: { [binding.resultMetaKey]: marker } } }),
      rejected("invalid-standard-claim"),
    );
  }
  const builtin = { type: "resource_link", name: "a2ui", uri: "ui://surface", mimeType: MIME_TYPE };
  for (const options of [
    { result: { ...claim(), content: [builtin] } },
    { tool: { ...tool, _meta: { ui: { resourceUri: "ui://app" } } } },
    {
      result: {
        ...claim(),
        _meta: {
          [binding.resultMetaKey]: binding.resultMeta,
          [CONTRACT_EXTENSION_ID]: value.adapter.descriptor,
        },
      },
    },
    { result: { ...claim(), _meta: { [CONTRACT_EXTENSION_ID]: value.adapter.descriptor } } },
  ])
    assert.deepEqual(await value.resolve(options), rejected("conflicting-contract-claims"));
  const ads = {
    ...value.registry.extensionSettings,
    [CONTRACT_EXTENSION_ID]: { bindingVersion: "0.1", contracts: [value.adapter.descriptor] },
  };
  assert.deepEqual(
    await value.resolve({ client: client(ads) }),
    rejected("invalid-contract-settings"),
  );
  const second = await createFixtureAdapter({
    descriptor: {
      ...value.adapter.descriptor,
      id: "com.example/second",
      mimeType: "application/vnd.example.second+json",
    },
    binding: { ...binding, extensionId: "com.example/second", resultMetaKey: "com.example/second" },
  });
  const registry = createContractRegistry([value.adapter, second], { standards: [] });
  assert.deepEqual(
    await value.resolve({
      registry,
      client: client(registry.extensionSettings),
      result: {
        ...claim(),
        _meta: {
          [binding.resultMetaKey]: binding.resultMeta,
          "com.example/second": binding.resultMeta,
        },
      },
    }),
    rejected("conflicting-contract-claims"),
  );
  assert.deepEqual(value.counts(), { preparations: 0, reads: 0 });
});

test("selected schema, preparation, and budget failures never retry or read resources", async () => {
  for (const [overrides, result, code] of [
    [{}, claim({ title: 3 }), "invalid-contract-input"],
    [
      {
        prepare: (input, context) => {
          try {
            context.consume(NaN);
          } catch {}
          return input;
        },
      },
      claim(),
      "adapter-failed",
    ],
    [
      {
        prepare: () => {
          throw new Error("secret");
        },
      },
      claim(),
      "adapter-failed",
    ],
    [{ prepare: () => ({ title: 3 }) }, claim(), "invalid-contract-model"],
    [
      {
        prepare: (input, context) => {
          context.consume(100001);
          return input;
        },
      },
      claim(),
      "contract-limit-exceeded",
    ],
    [
      {
        prepare: (input, context) => {
          try {
            context.consume(100001);
          } catch {}
          return input;
        },
      },
      claim(),
      "contract-limit-exceeded",
    ],
  ]) {
    const value = await setup(overrides);
    assert.deepEqual(await value.resolve({ result }), rejected(code));
    assert.equal(value.counts().reads, 0);
  }
  const value = await setup();
  const controller = new AbortController();
  controller.abort();
  assert.deepEqual(await value.resolve({ signal: controller.signal }), rejected("cancelled"));
  assert.deepEqual(value.counts(), { preparations: 0, reads: 0 });
});

test("reviewed native adapters share event authorization, stale-result revocation, and connection ownership", async () => {
  let renderer;
  let deliveries = 0;
  const pending = deferred();
  const adapter = await createFixtureAdapter();
  const nativeRegistry = createContractNativeRegistry(
    [
      createContractNativeRegistration({
        adapter,
        component: (props) => {
          renderer = props;
          props.createRenderBudget().consume(1);
          return createElement("Text", null, props.model.title);
        },
      }),
    ],
    { standards: [] },
  );
  const snapshots = [];
  const controller = createContractHostController({
    registry: nativeRegistry.registry,
    classifyError,
    createConnection: (extensions) => {
      snapshots.push(extensions);
      return unit(client(extensions, { callTool: async () => claim() }));
    },
  });
  const root = createRoot({ textComponentTypes: ["Text"] });
  const authorization = createContractActionAuthorization({ authorize: () => pending.promise });
  await act(async () => {
    root.render(
      createElement(
        ContractHostProvider,
        {
          controller,
          nativeRegistry,
          authorization,
          onError: (error) => assert.fail(error.code),
          onEvent: () => {
            deliveries++;
          },
        },
        createElement(ContractNativeResultView, {
          fallback: (status) => createElement("Text", null, status),
        }),
      ),
    );
  });
  await act(async () => {
    await controller.callTool(tool.name);
  });
  assert.equal(renderer.model.title, "Paid");
  assert.deepEqual(await renderer.dispatchEvent({ name: "delete" }), {
    kind: "rejected",
    code: "invalid-event",
  });
  const previous = renderer;
  const event = previous.dispatchEvent({ name: "confirm" });
  await act(async () => {
    controller.clearResult();
  });
  pending.resolve(true);
  assert.deepEqual(await event, { kind: "rejected", code: "stale" });
  assert.equal(deliveries, 0);
  await act(async () => {
    await controller.setOnline(false);
    await controller.setOnline(true);
    await controller.callTool(tool.name);
  });
  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[0], nativeRegistry.registry.extensionSettings);
  assert.deepEqual(await previous.dispatchEvent({ name: "confirm" }), {
    kind: "rejected",
    code: "stale",
  });
  assert.deepEqual(await renderer.dispatchEvent({ name: "confirm" }), { kind: "delivered" });
  assert.equal(deliveries, 1);
  await act(async () => root.unmount());
  assert.deepEqual(await renderer.dispatchEvent({ name: "confirm" }), {
    kind: "rejected",
    code: "stale",
  });
});

test("selection charges cumulative peer settings across independently bounded installed profiles", async () => {
  const first = await createFixtureAdapter();
  let preparations = 0;
  const installed = [];
  for (let i = 0; i < 16; i++)
    installed.push(
      await createFixtureAdapter({
        descriptor: {
          ...first.descriptor,
          id: `com.example/large-${i}`,
          mimeType: `application/vnd.example.large-${i}+json`,
        },
        binding: {
          ...binding,
          extensionId: `com.example/large-${i}`,
          resultMetaKey: `com.example/large-${i}`,
          settings: { pin: "x".repeat(3200) },
        },
        prepare: (input) => {
          preparations++;
          return input;
        },
      }),
    );
  const registry = createContractRegistry(installed, { standards: [] });
  assert.deepEqual(
    await resolveContractResult({
      registry,
      tool,
      client: client(registry.extensionSettings),
      result: {
        ...claim(),
        _meta: { "com.example/large-0": binding.resultMeta },
      },
    }),
    rejected("contract-limit-exceeded"),
  );
  assert.equal(preparations, 0);
});
