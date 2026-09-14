# Inline custom contract data

Status: implemented in source for the next compatible release; not included in published `1.0.1`.
This first headless slice of [Milestone 11](roadmap.md#milestone-11-standard-contract-registry-and-custom-input-adapters)
provides validated immutable JSON. It does not mount UI, dispatch actions, or load custom resources.
The existing high-level provider and controller continue to accept their built-in profiles.

## Local registration

Import from `@mcp-native/host/contracts`. `createContractAdapter` snapshots an exact descriptor,
closed input/model schemas, optional lower limits, and synchronous local `prepare` callback.
`createContractRegistry` accepts only factory-issued adapters and rejects duplicate ID/version pairs.
A spread copy or cast is not a registration.

```ts
import {
  createContractAdapter,
  createContractRegistry,
  resolveContractResult,
  type ContractSchema,
} from "@mcp-native/host/contracts";
import { receiptDescriptor } from "./receipt-contract.js";

const receiptSchema: ContractSchema = {
  type: "object",
  properties: { title: { type: "string", maxLength: 80 } },
  required: ["title"],
  additionalProperties: false,
};
const registry = createContractRegistry([
  createContractAdapter({
    descriptor: receiptDescriptor,
    inputSchema: receiptSchema,
    modelSchema: receiptSchema,
    prepare(input, budget) {
      // Charge additional input-dependent work before performing it.
      budget.consume(1);
      return input;
    },
  }),
]);

// Advertise registry.extensionSettings when creating the actual MCP client/adapter.
// These application-owned values must come from that same active connection and discovered call.
const resolved = await resolveContractResult({ registry, client, tool, result });
if (resolved.kind === "contract-data") {
  consumeReceiptData(resolved.model); // Application-owned use of inert validated data.
}
```

The example assumes application-owned `receiptDescriptor`, `client`, `tool`, `result`, and
`consumeReceiptData` values. Supply `registry.extensionSettings` as `extensions` to
`createMcpNativeClientOptions`, then wrap the connected SDK client with `McpSdkClientAdapter` using
the same map as `clientExtensions`. Never manufacture settings independently of the connection or
reuse data across principals. Each client/server settings snapshot is read once through the same
connection-bound resource reader. Client advertisements of uninstalled descriptors are errors.

The registry includes unchanged built-in A2UI and MCP Apps maps. An empty registry advertises only
those maps. Custom registration enables headless data preparation only. There is no renderer grant,
surface handle, or `/contracts/react-native` entry point in this slice.

## Project-owned binding `0.1`

Extension ID: `io.github.pablospaniard/mcp-native-contracts`. These rules are MCP Native project
policy, not an official MCP UI contract. On the pinned MCP `2026-07-28` path, the existing SDK
extension substrate advertises client settings in
`io.modelcontextprotocol/clientCapabilities.extensions` per-request metadata and reads server
settings from `server/discover` capabilities. Existing core MCP, A2UI, and MCP Apps pins are unchanged.

Settings contain exactly two required fields: `bindingVersion: "0.1"` and `contracts`, an array of
at most 32 descriptors with no duplicate ID/version pairs. Unknown binding versions, extra fields,
and malformed descriptors fail closed. An absent extension means no custom negotiation. Otherwise
all five descriptor fields must match in the registry and both connection snapshots. No aliases,
ranges, normalization, or automatic downgrades apply.

Each descriptor is a closed object of five required strings, each at most 192 UTF-16 code units:

| Field            | Accepted value                                                                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | Lowercase reverse-DNS namespace with at least two labels, `/`, and local name; regex `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)+/[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$` |
| `version`        | Stable `major.minor.patch`, each integer 0–999999999; no leading zeros, prerelease, or build suffix                                                                                          |
| `schemaRevision` | `sha256:` followed by exactly 64 lowercase hexadecimal digits                                                                                                                                |
| `transport`      | Exactly `structured-content`                                                                                                                                                                 |
| `mimeType`       | Regex `^application/vnd\.[a-z0-9]+(?:[.-][a-z0-9]+)*\+json$`; no parameters or wildcards                                                                                                     |

The namespaces `io.modelcontextprotocol`, `io.github.pablospaniard`, `io.mcp-native`, `org.a2ui`, and
their dot-separated subnamespaces are reserved. Vendor JSON MIME syntax excludes current A2UI and
MCP Apps MIME types. For example, a host may install `com.example/receipt`, version `1.0.0`, MIME
`application/vnd.example.receipt+json`, and its exact locally generated schema revision.

Generate `schemaRevision` during the application's build from the exact UTF-8 bytes of a checked-in
JSON bundle with `inputSchema` and `modelSchema`: use Node's SHA-256 `createHash` on those bytes and
parse that same file for registration. Runtime checks digest syntax and exact equality; it neither
fetches schemas nor recomputes hashes. Keeping the digest consistent with installed schemas is a
trusted adapter-author build/fixture responsibility. A schema change requires a new digest and a
reviewed contract-version decision.

A result claims exactly one descriptor at
`result._meta["io.github.pablospaniard/mcp-native-contracts"]`. The value is the five-field descriptor
itself, without a settings wrapper. The complete `result.structuredContent` object is the payload.
Return useful ordinary text alongside it for hosts without that exact contract. The binding has no
inline schemas, linked custom resources, renderer names, scripts, or action definitions.

## Closed schemas and preparation

Both schemas require an object root. They are local declarations, never supplied by server results.
Unknown keywords are rejected at registration.

| Type                 | Allowed fields besides `type`                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `object`             | Required `properties`, `required`, `additionalProperties: false`; at most 64 properties with names 1–128 code units; required names are unique declared properties |
| `array`              | Required `items`, `maxItems` (0–1024); optional `minItems` (0–maxItems)                                                                                            |
| `string`             | Required `maxLength` (0–65536); optional `minLength` (0–maxLength), and unique string `enum` with 1–32 in-range entries                                            |
| `number` / `integer` | Optional finite `minimum` and `maximum`, in order; integer data must be a safe integer                                                                             |
| `boolean` / `null`   | None                                                                                                                                                               |

Length uses UTF-16 code units, not JSON Schema's Unicode code-point semantics. This is a narrower
project schema format, not full JSON Schema conformance. References, regex, unions, conditionals,
defaults, and coercion are disabled. Each schema permits 256 schema nodes and schema depth 16;
its enclosing JSON graph permits 2048 values, depth 32, and 32768 string/key code units. Schema
copying has a 65536-work-unit budget.

Input is copied, frozen, and validated before one `prepare` call; output is copied, frozen, and
validated against `modelSchema`. The original custom claim and payload are checked so SDK optional
field normalization cannot erase unknown `undefined` properties. Sparse/decorated arrays, accessors,
symbols, cycles, non-plain objects, functions, and nonfinite numbers are rejected in custom data.
Checks stop at the first failure and expose a fixed host code without a validation-message list.
Callbacks may perform additional semantic checks and throw on failure.

`prepare` is trusted synchronous application code. Output is inert JSON, without renderer or action
authority. Future rendering must explicitly map validated semantic fields to host components.
Native Promise outputs are rejected and their rejections contained. No transport or device object
is supplied to callbacks. The library cannot preempt arbitrary local JavaScript: authors must charge
additional input-driven work with `budget.consume()` before doing it. Throws are redacted; async
preparation is unsupported.

## Budgets and outcomes

Default per-call ceilings, shared by input copying/validation, preparation, and output copying/
validation: `maxDepth: 32`, `maxValues: 10000`, `maxStringCodeUnits: 262144`, `maxWork: 100000`.
Each copied value costs one work unit, each copied string/key code unit costs one, and schema
visits, required/key lookup lengths, and enum comparisons also consume work. Work may exhaust before
the string ceiling. Adapter and per-call host options can only lower positive integer limits;
effective limits are their minimum. A caught budget-exhaustion exception cannot restore allowance.

Registry construction charges all retained descriptors and both schemas together: at most 32
adapters, 16384 values, 131072 string/key code units, depth 32, and 524288 work units. Repeated
references count at each occurrence. There is no retained custom-result cache or live surface state.
Applications own concurrent-call limits, connection generation, cancellation, disposal of their data
references, and later use of returned models.

The opt-in resolver also caps each complete extension snapshot at 1048576 cumulative string/key
code units before negotiation, including unrecognized extension data. Existing per-value MCP JSON
limits still apply. This added cap is local to the new API; the existing host resolver is unchanged.

| Condition                                                                                            | Outcome                                                                        |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| No custom claim                                                                                      | Existing `a2ui`, `mcp-app`, `ordinary`, or `invalid` behavior                  |
| Malformed MCP input/extension map                                                                    | Existing `invalid` input/settings code                                         |
| Malformed custom settings or uninstalled client advertisement                                        | `contract-error` / `invalid-contract-settings`                                 |
| Custom claim plus A2UI/Apps MIME marker or tool `_meta.ui`, including unnegotiated/malformed markers | `contract-error` / `conflicting-contract-claims`; no resource/adapter callback |
| Malformed custom descriptor                                                                          | `contract-error` / `invalid-claim`                                             |
| Valid claim without an exact installed and mutually negotiated descriptor, or `isError: true`        | Inert `ordinary`; no adapter callback                                          |
| Valid selected payload and prepared model                                                            | `contract-data` with exact descriptor and immutable model                      |
| Selected input/model failure, exhausted budget, or callback throw                                    | `contract-error`; no other adapter, standard path, or ordinary retry           |

Precedence is MCP/extension validation, custom settings, standard/custom conflict, descriptor,
negotiation, then input/preparation/model validation. Standard markers include top-level and embedded
resource MIME types `application/a2ui+json` and `text/html;profile=mcp-app`, plus any tool `_meta.ui`.
Malformed custom claims fail even without negotiation. Error results never call custom adapters.

Registration, registry construction, and descriptor parsing throw `ContractError` with respectively
`invalid-registration`, `invalid-registry`, and `invalid-claim`. Resolver custom codes are
`invalid-registry`, `invalid-contract-settings`, `conflicting-contract-claims`, `invalid-claim`,
`invalid-contract-input`, `invalid-contract-model`, `contract-limit-exceeded`, and `adapter-failed`.
Malformed resolver options use existing `invalid` / `invalid-input`. Error output never retains a
server value or original callback exception.

Tests cover SDK-backed resolution, standard parity, forbidden claims, strict schemas, callback
counts, aggregate budgets, immutable ownership, and packed runtime/declaration consumers. Native
rendering, actions, updates, additional maintained standard factories, resource transports, and
controller/provider integration remain later [RFC-0002](RFC-0002-contract-registry.md) work.
