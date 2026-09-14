/* eslint-disable no-await-in-loop -- Isolate authoring fixtures and callback accounting. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  createContractSchemaBundle,
  runContractAdapterFixtures,
  ContractAuthoringError,
  CONTRACT_MAX_AUTHORING_FIXTURES,
} from "../packages/host/dist/contracts-authoring.js";
import { createContractAdapter } from "../packages/host/dist/contracts.js";
const schema = {
  type: "object",
  properties: { title: { type: "string", maxLength: 80 } },
  required: ["title"],
  additionalProperties: false,
};
const events = {
  type: "object",
  properties: { name: { type: "string", maxLength: 7, enum: ["confirm"] } },
  required: ["name"],
  additionalProperties: false,
};
async function setup(prepare = (input) => input, extra = {}) {
  const bundle = await createContractSchemaBundle({
    inputSchema: schema,
    modelSchema: schema,
    eventSchema: events,
  });
  const adapter = createContractAdapter({
    descriptor: {
      id: "com.example/authoring",
      version: "1.0.0",
      mimeType: "application/vnd.example.authoring+json",
      transport: "structured-content",
      schemaRevision: bundle.schemaRevision,
    },
    ...bundle.schemas,
    prepare,
    ...extra,
  });
  return { bundle, adapter };
}
const good = {
  name: "valid",
  input: { title: "Paid" },
  expected: { kind: "contract-data", model: { title: "Paid" } },
};
const error = (code) => (e) =>
  e instanceof ContractAuthoringError && e.code === code && e.message === code;

test("schema bundles pin canonical UTF-8 bytes with stable object keys and preserved arrays", async () => {
  const first = await createContractSchemaBundle({ inputSchema: schema, modelSchema: schema });
  const reordered = {
    additionalProperties: false,
    required: ["title"],
    properties: { title: { maxLength: 80, type: "string" } },
    type: "object",
  };
  const second = await createContractSchemaBundle({
    modelSchema: reordered,
    inputSchema: reordered,
  });
  assert.equal(first.source, second.source);
  assert.equal(
    first.schemaRevision,
    "sha256:" + createHash("sha256").update(first.source, "utf8").digest("hex"),
  );
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.schemas.inputSchema.properties));
  assert.equal(JSON.parse(first.source).formatVersion, "1");
  const withEvents = await createContractSchemaBundle({
    inputSchema: schema,
    modelSchema: schema,
    eventSchema: events,
  });
  assert.notEqual(first.schemaRevision, withEvents.schemaRevision);
  const numbered = {
    type: "object",
    properties: { 2: { type: "boolean" }, 10: { type: "boolean" }, é: { type: "boolean" } },
    required: ["2", "10"],
    additionalProperties: false,
  };
  const numeric = await createContractSchemaBundle({
    inputSchema: numbered,
    modelSchema: numbered,
  });
  assert.ok(numeric.source.indexOf('"10":') < numeric.source.indexOf('"2":'));
  assert.equal(
    numeric.schemaRevision,
    "sha256:" + createHash("sha256").update(numeric.source).digest("hex"),
  );
  const reversed = await createContractSchemaBundle({
    inputSchema: { ...numbered, required: ["10", "2"] },
    modelSchema: numbered,
  });
  assert.notEqual(numeric.schemaRevision, reversed.schemaRevision);
});

test("authoring rejects malformed, executable, oversized, and cyclic schemas before hashing", async () => {
  const cycle = {};
  cycle.self = cycle;
  for (const input of [
    null,
    { inputSchema: schema, modelSchema: schema, extra: true },
    {
      inputSchema: {
        ...schema,
        properties: { title: { type: "string", pattern: "x", maxLength: 80 } },
      },
      modelSchema: schema,
    },
    { inputSchema: cycle, modelSchema: schema },
    { inputSchema: schema, modelSchema: { ...schema, required: Array(10000).fill("title") } },
    { inputSchema: schema, modelSchema: schema, eventSchema: () => {} },
  ])
    await assert.rejects(createContractSchemaBundle(input), error("invalid-schema-bundle"));
});

test("data, preparation failure, and event fixtures use exact schemas without exposing payloads", async () => {
  const { adapter } = await setup((input) => {
    if (input.title === "throw") throw new Error("private callback message");
    return input;
  });
  const report = await runContractAdapterFixtures({
    adapter,
    fixtures: [
      good,
      {
        name: "missing",
        input: {},
        expected: { kind: "contract-error", code: "invalid-contract-input" },
      },
      {
        name: "non-JSON",
        input: { title: Infinity },
        expected: { kind: "invalid", code: "invalid-input" },
      },
      {
        name: "callback",
        input: { title: "throw" },
        expected: { kind: "contract-error", code: "adapter-failed" },
      },
    ],
    events: [
      { name: "event", event: { name: "confirm" }, valid: true },
      { name: "unknown event", event: { name: "execute" }, valid: false },
      { name: "unknown field", event: { name: "confirm", tool: "secret" }, valid: false },
    ],
  });
  assert.equal(report.passed, true);
  assert.equal(report.results.length, 7);
  assert.ok(Object.isFrozen(report.results));
  assert.equal(JSON.stringify(report).includes("private"), false);
  assert.equal(JSON.stringify(report).includes("Paid"), false);
});

test("fixture mismatches remain visible and failed output never counts as successful conformance", async () => {
  const { adapter } = await setup();
  const report = await runContractAdapterFixtures({
    adapter,
    fixtures: [{ ...good, expected: { kind: "contract-data", model: { title: "different" } } }],
    events: [{ name: "bad expectation", event: { name: "invalid" }, valid: true }],
  });
  assert.equal(report.passed, false);
  assert.deepEqual(
    report.results.map((result) => result.passed),
    [false, false],
  );
  const malformed = await setup(() => ({ title: 123 }));
  assert.equal(
    (
      await runContractAdapterFixtures({
        adapter: malformed.adapter,
        fixtures: [
          {
            name: "model",
            input: {},
            expected: { kind: "contract-error", code: "invalid-contract-model" },
          },
        ],
      })
    ).passed,
    false,
  );
  assert.equal(
    (
      await runContractAdapterFixtures({
        adapter: malformed.adapter,
        fixtures: [
          {
            name: "model",
            input: good.input,
            expected: { kind: "contract-error", code: "invalid-contract-model" },
          },
        ],
      })
    ).passed,
    true,
  );
});

test("wrong pins, forged adapters, oversized or malformed fixture suites fail before callbacks", async () => {
  let calls = 0;
  const prepare = (input) => {
    calls++;
    return input;
  };
  const { adapter } = await setup(prepare);
  const wrong = await setup(prepare, {
    descriptor: { ...adapter.descriptor, schemaRevision: "sha256:" + "0".repeat(64) },
  });
  await assert.rejects(
    runContractAdapterFixtures({ adapter: wrong.adapter, fixtures: [good] }),
    error("schema-revision-mismatch"),
  );
  for (const options of [
    { adapter: { ...adapter }, fixtures: [good] },
    { adapter, fixtures: [] },
    {
      adapter,
      fixtures: Array.from({ length: CONTRACT_MAX_AUTHORING_FIXTURES + 1 }, (_, i) => ({
        ...good,
        name: `fixture ${i}`,
      })),
    },
    { adapter, fixtures: [good, good] },
    { adapter, fixtures: [good], events: [{ name: "valid", event: {}, valid: false }] },
    { adapter, fixtures: [{ ...good, expected: { kind: "contract-error", code: "invented" } }] },
    { adapter, fixtures: [good], extra: true },
  ])
    await assert.rejects(runContractAdapterFixtures(options), error("invalid-fixtures"));
  assert.equal(calls, 0);
});

test("fixture assertion metadata cannot be changed by preparation callbacks", async () => {
  const fixture = { ...good, expected: { kind: "contract-data", model: { title: "different" } } };
  const { adapter } = await setup((input) => {
    fixture.name = "changed";
    fixture.expected = { kind: "contract-data", model: input };
    return input;
  });
  const report = await runContractAdapterFixtures({ adapter, fixtures: [fixture] });
  assert.equal(report.passed, false);
  assert.equal(report.results[0].name, "valid");
});

test("event fixtures report disabled events and enforce installed event work limits", async () => {
  const bundle = await createContractSchemaBundle({ inputSchema: schema, modelSchema: schema });
  const ready = await setup();
  const adapter = createContractAdapter({
    descriptor: { ...ready.adapter.descriptor, schemaRevision: bundle.schemaRevision },
    ...bundle.schemas,
    prepare: (input) => input,
  });
  const report = await runContractAdapterFixtures({
    adapter,
    fixtures: [good],
    events: [{ name: "disabled", event: { name: "confirm" }, valid: false }],
  });
  assert.equal(report.passed, true);
  assert.equal(report.results[1].code, "events-disabled");
  const limited = await setup((input) => input, { limits: { maxWork: 1 } });
  const limits = await runContractAdapterFixtures({
    adapter: limited.adapter,
    fixtures: [{ ...good, expected: { kind: "contract-error", code: "contract-limit-exceeded" } }],
    events: [{ name: "too big", event: { name: "confirm" }, valid: false }],
  });
  assert.equal(limits.passed, true);
  assert.equal(limits.results[1].code, "contract-limit-exceeded");
});

test("missing Web Crypto fails with a bounded authoring error", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  try {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
    await assert.rejects(
      createContractSchemaBundle({ inputSchema: schema, modelSchema: schema }),
      error("crypto-unavailable"),
    );
  } finally {
    if (original) Object.defineProperty(globalThis, "crypto", original);
    else delete globalThis.crypto;
  }
});

test("aggregate expected-model and source work is bounded before callbacks", async () => {
  let calls = 0;
  const { adapter } = await setup((input) => {
    calls++;
    return input;
  });
  await assert.rejects(
    runContractAdapterFixtures({
      adapter,
      fixtures: Array.from({ length: 64 }, (_, i) => ({
        ...good,
        name: `case ${i}`,
        expected: { kind: "contract-data", model: { title: "x".repeat(4096) } },
      })),
    }),
    error("invalid-fixtures"),
  );
  assert.equal(calls, 0);
  // Each individual schema is valid; cumulative repeated serialization work must still be bounded.
  const large = {
    type: "object",
    properties: Object.fromEntries(
      Array.from({ length: 60 }, (_, i) => [
        "x".repeat(100) + i,
        { type: "string", maxLength: 100 },
      ]),
    ),
    required: [],
    additionalProperties: false,
  };
  await assert.rejects(
    createContractSchemaBundle({ inputSchema: large, modelSchema: large, eventSchema: large }),
    error("invalid-schema-bundle"),
  );
});
