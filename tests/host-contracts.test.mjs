/* eslint-disable no-await-in-loop -- Exercise each isolated fixture and verify callback counts before the next case. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  CONTRACT_EXTENSION_ID,
  CONTRACT_LIMITS,
  ContractError,
  createContractAdapter,
  createContractRegistry,
  parseContractDescriptor,
  resolveContractResult,
} from "../packages/host/dist/contracts.js";
import {
  MCP_NATIVE_HOST_EXTENSION_CAPABILITIES,
  resolveMcpNativeHostResult,
} from "../packages/host/dist/index.js";
import { MIME_TYPE } from "../packages/a2ui/dist/index.js";
import { McpSdkClientAdapter } from "../packages/mcp/dist/index.js";

const schema = {
  type: "object",
  properties: { title: { type: "string", maxLength: 80 } },
  required: ["title"],
  additionalProperties: false,
};
const descriptor = {
  id: "com.example/receipt",
  version: "1.0.0",
  schemaRevision: `sha256:${createHash("sha256")
    .update(JSON.stringify({ inputSchema: schema, modelSchema: schema }))
    .digest("hex")}`,
  transport: "structured-content",
  mimeType: "application/vnd.example.receipt+json",
};
const tool = { name: "receipt", inputSchema: { type: "object" } };
function adapter(options = {}) {
  return createContractAdapter({
    descriptor,
    inputSchema: schema,
    modelSchema: schema,
    prepare: (input) => input,
    ...options,
  });
}
function payload(claim = descriptor, structuredContent = { title: "Paid" }) {
  return {
    content: [{ type: "text", text: "Receipt: paid" }],
    structuredContent,
    _meta: { [CONTRACT_EXTENSION_ID]: claim },
  };
}
function setup(adapterOptions = {}) {
  const calls = { prepare: 0, reads: 0, clientSettings: 0, serverSettings: 0 };
  const registration = adapter({
    prepare(input) {
      calls.prepare++;
      return input;
    },
    ...adapterOptions,
  });
  const registry = createContractRegistry([registration]);
  const client = {
    getClientExtensionSettings() {
      calls.clientSettings++;
      return registry.extensionSettings;
    },
    getServerExtensionSettings() {
      calls.serverSettings++;
      return registry.extensionSettings;
    },
    async readResource() {
      calls.reads++;
      throw new Error("unexpected resource read");
    },
  };
  const options = { tool, result: payload(), client, registry };
  return { calls, options, registry, client };
}
const code = (expected) => (error) =>
  error instanceof ContractError && error.code === expected && error.message === expected;

test("inline contracts validate and freeze locally prepared data through the exported subpath", async () => {
  const { options, calls } = setup();
  const resolved = await resolveContractResult(options);
  assert.deepEqual(resolved, { kind: "contract-data", descriptor, model: { title: "Paid" } });
  options.result.structuredContent.title = "Changed";
  assert.equal(resolved.model.title, "Paid");
  assert.equal(Object.isFrozen(resolved), true);
  assert.equal(Object.isFrozen(resolved.model), true);
  assert.equal(Object.isFrozen(resolved.descriptor), true);
  assert.deepEqual(calls, { prepare: 1, reads: 0, clientSettings: 1, serverSettings: 1 });
});

test("registry snapshots schemas, callbacks, settings and identity without structural forgery", async () => {
  const mutableSchema = structuredClone(schema);
  const config = {
    descriptor: { ...descriptor },
    inputSchema: mutableSchema,
    modelSchema: mutableSchema,
    prepare: (value) => value,
  };
  const registration = createContractAdapter(config);
  config.prepare = () => {
    throw new Error("mutated");
  };
  config.descriptor.id = "com.example/other";
  mutableSchema.properties.title.type = "number";
  const entries = [registration];
  const registry = createContractRegistry(entries);
  entries.length = 0;
  assert.equal(Object.isFrozen(registry.extensionSettings[CONTRACT_EXTENSION_ID].contracts), true);
  const { options } = setup();
  assert.equal((await resolveContractResult({ ...options, registry })).kind, "contract-data");
  for (const invalid of [
    [{ ...registration }],
    [registration, registration],
    Array(1),
    Array(33).fill(registration),
    null,
  ]) {
    assert.throws(() => createContractRegistry(invalid), code("invalid-registry"));
  }
  assert.deepEqual(await resolveContractResult({ ...options, registry: { ...registry } }), {
    kind: "contract-error",
    code: "invalid-registry",
  });
  assert.deepEqual(
    createContractRegistry([]).extensionSettings,
    MCP_NATIVE_HOST_EXTENSION_CAPABILITIES,
  );
});

test("custom descriptors reject reserved namespaces, malformed identities, versions and wire claims", () => {
  const mutations = [
    { id: "io.modelcontextprotocol/receipt" },
    { id: "io.modelcontextprotocol.child/receipt" },
    { id: "io.github.pablospaniard/receipt" },
    { id: "io.mcp-native/receipt" },
    { id: "org.a2ui/receipt" },
    { id: "Receipt" },
    { id: "com.Example/receipt" },
    { id: "com.example/a/b" },
    { id: "a".repeat(193) },
    { version: "1" },
    { version: "01.0.0" },
    { version: "1.0.0-beta.1" },
    { version: "*" },
    { schemaRevision: "sha256:bad" },
    { schemaRevision: `sha256:${"A".repeat(64)}` },
    { transport: "resource" },
    { mimeType: MIME_TYPE },
    { mimeType: "text/html;profile=mcp-app" },
    { mimeType: "application/vnd.example+json;charset=utf-8" },
    { mimeType: "application/*" },
    { extra: true },
  ];
  for (const mutation of mutations)
    assert.throws(
      () => parseContractDescriptor({ ...descriptor, ...mutation }),
      code("invalid-claim"),
    );
  for (const key of Object.keys(descriptor)) {
    const incomplete = { ...descriptor };
    delete incomplete[key];
    assert.throws(() => parseContractDescriptor(incomplete), code("invalid-claim"));
  }
  let accessed = false;
  const getter = {
    ...descriptor,
    get version() {
      accessed = true;
      return "1.0.0";
    },
  };
  assert.throws(() => parseContractDescriptor(getter), code("invalid-claim"));
  assert.equal(accessed, false);
  for (const value of [null, [], new Date(), { ...descriptor, [Symbol()]: 1 }]) {
    assert.throws(() => parseContractDescriptor(value), code("invalid-claim"));
  }
});

test("local schemas reject unknown or unbounded features before server data is accepted", () => {
  for (const inputSchema of [
    { ...schema, $ref: "https://example.com/schema.json" },
    { ...schema, additionalProperties: true },
    { ...schema, required: ["missing"] },
    { ...schema, required: ["title", "title"] },
    { ...schema, properties: { title: { type: "string" } } },
    { ...schema, properties: { title: { type: "string", maxLength: 10, pattern: "(a+)+$" } } },
    {
      ...schema,
      properties: { title: { type: "array", maxItems: 1025, items: { type: "null" } } },
    },
    { ...schema, properties: { title: { type: "number", minimum: 2, maximum: 1 } } },
    { ...schema, properties: { title: { type: "string", minLength: 4, maxLength: 3 } } },
    { ...schema, properties: { title: { type: "string", enum: ["a", "a"], maxLength: 10 } } },
    { ...schema, properties: { title: { type: "string", enum: [], maxLength: 10 } } },
    { ...schema, properties: { title: { type: "unknown" } } },
    { ...schema, properties: { title: { type: "number", maximum: Infinity } } },
    { type: "string", maxLength: 20 },
  ])
    assert.throws(() => adapter({ inputSchema }), code("invalid-registration"));
  for (const options of [
    { prepare: undefined },
    { lane: "standard" },
    { limits: { maxWork: 0 } },
    { limits: { maxWork: CONTRACT_LIMITS.maxWork + 1 } },
    { limits: { maxWork: 1.5 } },
    { limits: { unknown: 2 } },
  ]) {
    assert.throws(() => adapter(options), code("invalid-registration"));
  }
});

test("registry rejects aggregate schema retention even when each adapter is individually valid", () => {
  const wideSchema = {
    ...schema,
    properties: Object.fromEntries(
      Array.from({ length: 60 }, (_, i) => [
        `property${i}${"x".repeat(100)}`,
        { type: "string", maxLength: 100, enum: ["x".repeat(100)] },
      ]),
    ),
    required: [],
  };
  const entries = Array.from({ length: 16 }, (_, i) =>
    adapter({
      descriptor: { ...descriptor, id: `com.example/item${i}` },
      inputSchema: wideSchema,
      modelSchema: wideSchema,
    }),
  );
  assert.throws(() => createContractRegistry(entries), code("invalid-registry"));
  assert.throws(
    () =>
      createContractRegistry([
        adapter(),
        adapter({ descriptor: { ...descriptor, schemaRevision: `sha256:${"0".repeat(64)}` } }),
      ]),
    code("invalid-registry"),
  );
});

test("unknown contracts and exact negotiation mismatches stay ordinary without adapter work", async () => {
  for (const mode of [
    "no-client",
    "no-server",
    "revision",
    "version",
    "mime",
    "unknown",
    "error",
  ]) {
    const { options, calls, registry } = setup();
    if (mode === "no-client") options.client.getClientExtensionSettings = () => ({});
    if (mode === "no-server") options.client.getServerExtensionSettings = () => ({});
    if (["revision", "version", "mime"].includes(mode)) {
      const change =
        mode === "revision"
          ? { schemaRevision: `sha256:${"0".repeat(64)}` }
          : mode === "version"
            ? { version: "2.0.0" }
            : { mimeType: "application/vnd.example.other+json" };
      options.client.getServerExtensionSettings = () => ({
        [CONTRACT_EXTENSION_ID]: {
          bindingVersion: "0.1",
          contracts: [{ ...descriptor, ...change }],
        },
      });
    }
    if (mode === "unknown") options.result = payload({ ...descriptor, id: "com.example/unknown" });
    if (mode === "error") options.result.isError = true;
    const result = await resolveContractResult(options);
    assert.equal(result.kind, "ordinary", mode);
    assert.equal(Object.isFrozen(result.result), true);
    assert.equal(calls.prepare, 0, mode);
    assert.equal(calls.reads, 0, mode);
    assert.equal(registry.contracts.length, 1);
  }
});

test("malformed contract settings and uninstalled client advertisements never grant support", async () => {
  for (const settings of [
    null,
    { bindingVersion: "0.2", contracts: [] },
    { bindingVersion: "0.1", contracts: [descriptor, descriptor] },
    { bindingVersion: "0.1", contracts: [], extra: true },
    { bindingVersion: "0.1" },
    { bindingVersion: "0.1", contracts: Array(33).fill(descriptor) },
    { bindingVersion: "0.1", contracts: [{ ...descriptor, id: "io.modelcontextprotocol/fake" }] },
  ]) {
    const { options, calls } = setup();
    options.client.getServerExtensionSettings = () => ({ [CONTRACT_EXTENSION_ID]: settings });
    const result = await resolveContractResult(options);
    assert.ok(["invalid-contract-settings", "invalid-extension-settings"].includes(result.code));
    assert.equal(calls.prepare + calls.reads, 0);
  }
  const { options } = setup();
  options.client.getClientExtensionSettings = () => ({
    [CONTRACT_EXTENSION_ID]: {
      bindingVersion: "0.1",
      contracts: [{ ...descriptor, version: "2.0.0" }],
    },
  });
  assert.equal((await resolveContractResult(options)).code, "invalid-contract-settings");
});

test("malformed custom claims never reach adapters or ordinary fallback", async () => {
  for (const claim of [
    null,
    [],
    { ...descriptor, unknown: true },
    { ...descriptor, transport: "resource" },
  ]) {
    const { options, calls } = setup();
    options.result = payload(claim);
    assert.deepEqual(await resolveContractResult(options), {
      kind: "contract-error",
      code: "invalid-claim",
    });
    assert.equal(calls.prepare + calls.reads, 0);
  }
});

test("standard markers exclude custom input even without negotiation or with malformed Apps metadata", async () => {
  for (const mode of ["a2ui", "apps", "malformed-apps", "embedded", "apps-mime"]) {
    const { options, calls } = setup();
    if (mode === "apps" || mode === "malformed-apps")
      options.tool = {
        ...tool,
        _meta: { ui: mode === "apps" ? { resourceUri: "ui://receipt" } : "invalid" },
      };
    else if (mode === "embedded")
      options.result.content.push({
        type: "resource",
        resource: { uri: "ui://receipt", mimeType: MIME_TYPE, text: "invalid" },
      });
    else
      options.result.content.push({
        type: "resource_link",
        uri: "ui://receipt",
        name: "receipt",
        mimeType: mode === "apps-mime" ? "text/html;profile=mcp-app" : MIME_TYPE,
      });
    assert.equal((await resolveContractResult(options)).code, "conflicting-contract-claims", mode);
    assert.equal(calls.prepare + calls.reads, 0);
  }
});

test("selected schema failures and callback failures are contained with stable codes", async () => {
  for (const invalid of [
    null,
    [],
    "receipt",
    {},
    { title: 1 },
    { title: "x".repeat(81) },
    { title: "Paid", extra: true },
  ]) {
    const { options, calls } = setup();
    options.result = payload(descriptor, invalid);
    assert.equal((await resolveContractResult(options)).code, "invalid-contract-input");
    assert.equal(calls.prepare, 0);
  }
  for (const prepare of [
    () => {
      throw new Error("secret diagnostic");
    },
    () => ({ title: 1 }),
    () => ({ title: "Paid", extra: "secret" }),
    () => Promise.reject(new Error("secret diagnostic")),
    () => ({ title: () => 1 }),
    () => {
      const cycle = {};
      cycle.self = cycle;
      return cycle;
    },
    () =>
      Object.defineProperty({}, "title", {
        get() {
          throw new Error("secret getter");
        },
        enumerable: true,
      }),
  ]) {
    const { options } = setup({ prepare });
    const result = await resolveContractResult(options);
    assert.equal(result.kind, "contract-error");
    assert.doesNotMatch(JSON.stringify(result), /secret/);
  }
});

test("one budget bounds copying input, output, validation and cooperative preparation work", async () => {
  const { options } = setup();
  // Each object is two values, but input plus output is four; individually valid graphs cannot reset the budget.
  options.limits = { maxValues: 3 };
  assert.equal((await resolveContractResult(options)).code, "contract-limit-exceeded");
  options.limits = { maxStringCodeUnits: 10 };
  assert.equal((await resolveContractResult(options)).code, "contract-limit-exceeded");
  const limited = setup({ limits: { maxValues: 3 } });
  assert.equal((await resolveContractResult(limited.options)).code, "contract-limit-exceeded");
  const exhausted = setup({
    prepare(input, budget) {
      try {
        budget.consume(CONTRACT_LIMITS.maxWork);
      } catch {}
      return input;
    },
  });
  assert.equal((await resolveContractResult(exhausted.options)).code, "contract-limit-exceeded");
  const invalidWork = setup({
    prepare(input, budget) {
      budget.consume(-1);
      return input;
    },
  });
  assert.equal((await resolveContractResult(invalidWork.options)).code, "adapter-failed");
  const validWork = setup({
    prepare(input, budget) {
      budget.consume(5);
      assert.ok(Object.isFrozen(input));
      return input;
    },
  });
  assert.equal((await resolveContractResult(validWork.options)).kind, "contract-data");
});

test("nested schema subset validates collections, required values, bounds and enums", async () => {
  const nested = {
    type: "object",
    properties: {
      values: {
        type: "array",
        maxItems: 2,
        minItems: 1,
        items: {
          type: "object",
          properties: {
            n: { type: "integer", minimum: 0, maximum: 5 },
            b: { type: "boolean" },
            s: { type: "string", minLength: 1, maxLength: 3, enum: ["yes", "no"] },
            z: { type: "null" },
          },
          required: ["n", "b", "s", "z"],
          additionalProperties: false,
        },
      },
    },
    required: ["values"],
    additionalProperties: false,
  };
  const { options } = setup({ inputSchema: nested, modelSchema: nested });
  const valid = { n: 1, b: true, s: "yes", z: null };
  options.result = payload(descriptor, { values: [valid] });
  assert.equal((await resolveContractResult(options)).kind, "contract-data");
  for (const values of [
    [],
    [valid, valid, valid],
    [{ ...valid, n: 1.2 }],
    [{ ...valid, n: -1 }],
    [{ ...valid, n: 6 }],
    [{ ...valid, b: 0 }],
    [{ ...valid, s: "bad" }],
    [{ ...valid, s: "" }],
    [{ ...valid, z: false }],
    [null],
  ]) {
    options.result = payload(descriptor, { values });
    assert.equal((await resolveContractResult(options)).code, "invalid-contract-input");
  }
});

test("real SDK adapter carries negotiated contract metadata and the old resolver remains ordinary", async () => {
  const { registry } = setup();
  const client = new McpSdkClientAdapter(
    {
      getServerCapabilities: () => ({ extensions: registry.extensionSettings }),
      async readResource() {
        throw new Error("unexpected read");
      },
    },
    { clientExtensions: registry.extensionSettings },
  );
  const options = { registry, client, tool, result: payload() };
  assert.equal((await resolveContractResult(options)).kind, "contract-data");
  assert.equal((await resolveMcpNativeHostResult(options)).kind, "ordinary");
});

test("built-in result resolution preserves outcomes and resource reads with the opt-in registry", async () => {
  const registry = createContractRegistry([]);
  const link = { type: "resource_link", name: "surface", uri: "ui://surface", mimeType: MIME_TYPE };
  for (const fixture of [
    { result: { content: [{ type: "text", text: "hello" }] } },
    { result: { content: [link] }, serverSettings: {} },
    {
      result: { content: [link] },
      text: JSON.stringify({ version: "v1.0", createSurface: { surfaceId: "main" } }),
    },
    { result: { content: [link] }, text: "not valid JSON" },
    { result: { content: [link] }, tool: { ...tool, _meta: { ui: { resourceUri: "ui://app" } } } },
    { result: { content: [] }, tool: { ...tool, _meta: { ui: "invalid" } } },
    { result: { content: [{ type: "unknown" }] } },
  ]) {
    const resolve = async (fn) => {
      let reads = 0;
      const result = await fn({
        registry,
        tool: fixture.tool ?? tool,
        result: fixture.result,
        client: {
          getClientExtensionSettings: () => registry.extensionSettings,
          getServerExtensionSettings: () => fixture.serverSettings ?? registry.extensionSettings,
          async readResource(uri) {
            reads++;
            return { contents: [{ uri, mimeType: MIME_TYPE, text: fixture.text ?? "invalid" }] };
          },
        },
      });
      return { reads, result };
    };
    assert.deepEqual(
      await resolve(resolveContractResult),
      await resolve(resolveMcpNativeHostResult),
    );
  }
});

test("non-JSON inputs and invalid connection/options fail before preparation", async () => {
  for (const result of [
    undefined,
    { content: [], structuredContent: { x: NaN } },
    { content: [], structuredContent: { x: [undefined] } },
  ]) {
    const { options, calls } = setup();
    assert.equal((await resolveContractResult({ ...options, result })).code, "invalid-input");
    assert.equal(calls.prepare + calls.reads, 0);
  }
  const { options, calls } = setup();
  assert.equal((await resolveContractResult(null)).code, "invalid-input");
  assert.equal((await resolveContractResult({ ...options, client: {} })).code, "invalid-input");
  options.client.getServerExtensionSettings = () => {
    throw new Error("secret transport message");
  };
  assert.equal((await resolveContractResult(options)).code, "invalid-extension-settings");
  assert.equal(calls.prepare + calls.reads, 0);
});

test("custom claims and payloads reject fields that SDK optional-field normalization would omit", async () => {
  const { options, calls } = setup();
  options.result = payload({ ...descriptor, extra: undefined });
  assert.equal((await resolveContractResult(options)).code, "invalid-claim");
  options.result = payload(undefined);
  options.result["_meta"][CONTRACT_EXTENSION_ID] = undefined;
  assert.equal((await resolveContractResult(options)).code, "invalid-claim");
  options.result = payload(descriptor, { title: "Paid", extra: undefined });
  assert.equal((await resolveContractResult(options)).code, "invalid-contract-input");
  options.result = payload();
  options.tool = { ...tool, _meta: { ui: undefined } };
  assert.equal((await resolveContractResult(options)).code, "conflicting-contract-claims");
  assert.equal(calls.prepare + calls.reads, 0);
});

test("schema count, depth, strings and property-name limits reject oversized registrations", () => {
  let nested = { type: "null" };
  for (let i = 0; i < 17; i++) nested = { type: "array", maxItems: 1, items: nested };
  const properties = Object.fromEntries(
    Array.from({ length: 65 }, (_, i) => [`k${i}`, { type: "boolean" }]),
  );
  for (const child of [
    nested,
    { type: "object", properties, required: [], additionalProperties: false },
    { type: "string", maxLength: 65_537 },
    { type: "string", maxLength: 10, minLength: -1 },
    { type: "string", maxLength: 2, enum: ["long"] },
    { type: "boolean", additional: 1 },
    {
      type: "object",
      properties: { ["x".repeat(129)]: { type: "null" } },
      required: [],
      additionalProperties: false,
    },
  ])
    assert.throws(
      () => adapter({ inputSchema: { ...schema, properties: { title: child } } }),
      code("invalid-registration"),
    );
  assert.throws(() => adapter({ limits: null }), code("invalid-registration"));
});

test("model copy rejects non-JSON objects, sparse or decorated arrays and respects repeated-reference budgets", async () => {
  const modelSchema = {
    ...schema,
    properties: { title: { type: "array", maxItems: 10, items: { type: "number" } } },
  };
  const decorated = [1];
  decorated.extra = true;
  for (const output of [
    { title: new Date() },
    { title: [NaN] },
    { title: Array(1) },
    { title: decorated },
    { title: [undefined] },
    { title: [() => 1] },
    { title: [], [Symbol()]: "hidden" },
    Object.defineProperty({ title: [] }, "hidden", { value: 1 }),
  ]) {
    const { options } = setup({ modelSchema, prepare: () => output });
    assert.equal((await resolveContractResult(options)).code, "invalid-contract-model");
  }
  const valid = setup({ modelSchema, prepare: () => ({ title: [1.5] }) });
  assert.equal((await resolveContractResult(valid.options)).kind, "contract-data");
  const repeated = setup({
    prepare: () => {
      const value = { title: "x".repeat(80) };
      return { values: Array(100).fill(value) };
    },
  });
  repeated.options.limits = { maxStringCodeUnits: 1000 };
  assert.equal((await resolveContractResult(repeated.options)).code, "contract-limit-exceeded");
});

test("prototype-like property names stay owned inert data throughout schema validation", async () => {
  const localSchema = {
    type: "object",
    properties: JSON.parse('{"__proto__":{"type":"string","maxLength":10}}'),
    required: ["__proto__"],
    additionalProperties: false,
  };
  const { options } = setup({ inputSchema: localSchema, modelSchema: localSchema });
  options.result = payload(descriptor, JSON.parse('{"__proto__":"inert"}'));
  const result = await resolveContractResult(options);
  assert.equal(result.kind, "contract-data");
  assert.equal(Object.getPrototypeOf(result.model), Object.prototype);
  assert.equal(Object.hasOwn(result.model, "__proto__"), true);
  assert.equal(result.model["__proto__"], "inert");
});

test("opt-in extension snapshots bound cumulative unrecognized metadata before negotiation", async () => {
  const { options, calls } = setup();
  options.client.getServerExtensionSettings = () => ({
    "com.example/large": { values: Array(17).fill("x".repeat(65_536)) },
  });
  assert.deepEqual(await resolveContractResult(options), {
    kind: "invalid",
    code: "invalid-extension-settings",
  });
  assert.equal(calls.prepare + calls.reads, 0);
});

test("catching an invalid preparation charge cannot turn the failed call into a valid model", async () => {
  for (const work of [0, -1, NaN, Infinity, 0.5]) {
    let secondRejected = false;
    let returnedModel = false;
    const { options } = setup({
      prepare(input, context) {
        try {
          context.consume(work);
        } catch {
          /* An author callback cannot clear the failed charge. */
        }
        try {
          context.consume(1);
        } catch (error) {
          secondRejected = error.code === "adapter-failed";
        }
        returnedModel = true;
        return input;
      },
    });
    assert.deepEqual(await resolveContractResult(options), {
      kind: "contract-error",
      code: "adapter-failed",
    });
    assert.equal(returnedModel, true);
    assert.equal(secondRejected, true);
  }
});
