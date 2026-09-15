# Contract adapter authoring

Status: implemented in source, unreleased. Import build/test helpers from
`@mcp-native/host/contracts/authoring`. Runtime registration and negotiation remain in
[`@mcp-native/host/contracts`](custom-contracts.md).

## Generate and pin schemas

```ts
import {
  createContractSchemaBundle,
  runContractAdapterFixtures,
} from "@mcp-native/host/contracts/authoring";
import { createContractAdapter } from "@mcp-native/host/contracts";

const schema = {
  type: "object",
  additionalProperties: false,
  properties: { count: { type: "integer", minimum: 0, maximum: 10 } },
  required: ["count"],
} as const;
const bundle = await createContractSchemaBundle({ inputSchema: schema, modelSchema: schema });
const adapter = createContractAdapter({
  descriptor: {
    id: "com.example/count",
    version: "1.0.0",
    schemaRevision: bundle.schemaRevision,
    transport: "structured-content",
    mimeType: "application/vnd.example.count+json",
  },
  ...bundle.schemas,
  prepare: (input) => input,
});
const report = await runContractAdapterFixtures({
  adapter,
  fixtures: [
    {
      name: "count",
      input: { count: 2 },
      expected: { kind: "contract-data", model: { count: 2 } },
    },
    {
      name: "out-of-range",
      input: { count: 11 },
      expected: { kind: "contract-error", code: "invalid-contract-input" },
    },
  ],
});
if (!report.passed) throw new Error("Contract fixtures failed");
```

Persist `bundle.source` and `bundle.schemaRevision` in the application's build artifacts and use
`bundle.schemas` for registration. Mobile runtime code can import the generated schemas and digest;
it does not need Web Crypto. The helper requires platform Web Crypto SHA-256 and `TextEncoder`,
available in supported Node versions. No schema download or remote execution occurs.

`CONTRACT_SCHEMA_BUNDLE_VERSION` is exactly `"1"`. The hashed source is a JSON object containing
`formatVersion: "1"`, `inputSchema`, `modelSchema`, and optional `eventSchema`. Every object uses
UTF-16 lexical key order, including integer-looking keys; arrays preserve order. Primitive values
and key strings use JSON serialization. There is no whitespace or trailing newline. SHA-256 hashes
those exact UTF-8 bytes and returns `sha256:` plus 64 lowercase hexadecimal digits. Returned schemas,
source metadata, and bundle are owned and frozen. This is a project serialization format, not a
claim of compliance with an external canonical-JSON standard.

Only the closed runtime schema grammar is accepted. Each schema retains its existing bounds
(depth 32, 2,048 values, 32,768 string code units, 65,536 work units, 256 schema nodes,
schema tree depth 16, 64 properties). A shared bundle budget also caps copying and serialization at
10,000 values, 262,144 string code units, and 100,000 work units. Sorting, escaped output, and
intermediate serialization are charged. Individually valid schemas can exceed the combined budget.

## Run fixtures

The runner accepts custom and [reviewed standard adapters](reviewed-standard-adapters.md). Reviewed
fixtures use the profile's own exact extension and result marker. It requires factory identity and
verifies the digest against the v1 bundle before
calling preparation code. Supply at least one data fixture and at most 64 data/event fixtures in
total. Names must be unique across both arrays, 1–80 ASCII letters, digits, spaces, dots,
underscores, or hyphens, starting with a letter or digit. Fixture and expectation fields are closed.

Data fixtures run serially through the real resolver with exact mutual adapter negotiation and no
standard resource loading. Expected outcomes are exact model equality, `invalid-input`, or the
custom failures `invalid-contract-input`, `invalid-contract-model`, `contract-limit-exceeded`, and
`adapter-failed`. Object key order is ignored for model comparison; array order is significant.
Expected models share a bounded preflight budget. Each execution and actual-model comparison is
bounded independently, with at most 64 executions. Assertion metadata is snapshotted before any
asynchronous work or callback. Keep fixture input/event objects unchanged until the run completes.

Optional `events: [{ name, event, valid }]` fixtures check the installed event schema and adapter
limits. They do not authorize or deliver events; an adapter without an event schema reports
`events-disabled`. The immutable report contains `passed`, the descriptor, and named results with
actual kinds and optional redacted codes. It retains no raw payloads or callback exception messages.
A mismatched expectation returns `passed: false`; malformed harness input throws instead.

`ContractAuthoringError.code` is one of `invalid-schema-bundle`, `crypto-unavailable`,
`invalid-fixtures`, or `schema-revision-mismatch`. Tests passing establishes only these fixture
outcomes. Review compiled renderers, cooperative preparation work, connection lifecycle, host
consent, device access, and I/O separately; trusted JavaScript callbacks cannot be preempted by this
helper. Add semantic failure, schema rejection, expansion-limit, and event rejection fixtures for
each adapter. The [todo summary](../examples/expo-go-todolist/src/summary-contract.test.ts) is a
maintained example, alongside the runtime lifecycle and native failure tests.

## Migrate an existing digest

Runtime registration still accepts any syntactically valid digest with exact peer equality; it does
not recompute schema hashes. Existing hand-hashed adapters remain usable there. Adopting this fixture
runner requires regenerating the digest with the v1 helper and updating both installed and server
advertised descriptors together. Even unchanged schemas may get a different digest because the
bundle includes `formatVersion` and canonical ordering. Review the contract-version decision and
keep older descriptors only through an explicit application migration; no hash alias is inferred.
