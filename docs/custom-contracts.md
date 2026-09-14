# Custom contract data and native rendering

Status: implemented in source for the next compatible release; not included in published `1.0.1`.
The data, lifecycle, and static native rendering slices of [Milestone 11](roadmap.md#milestone-11-standard-contract-registry-and-custom-input-adapters)
provide validated immutable JSON, connection ownership, and explicitly installed native renderers.
Custom events require a local schema and authorization; custom resource loading remains unavailable.
The existing high-level provider and controller continue to accept their built-in profiles.

## Local registration

Import from `@mcp-native/host/contracts`. `createContractAdapter` snapshots an exact descriptor,
closed input/model schemas, an optional closed `eventSchema`, optional lower limits, and synchronous
local `prepare` callback. Include `eventSchema` in the exact schema bundle digest when present;
omitting it disables custom events.
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

By default the registry includes unchanged built-in A2UI and MCP Apps maps. An empty custom list advertises only
those maps. Data registration alone enables headless preparation. Native mounting additionally requires a
factory-issued local renderer registration and its matching native registry, described below.

## Managed connection lifecycle

Use `createContractHostController` when the host should own discovery, calls, cancellation,
reconnection, and the current result. Its immutable registry is fixed before connecting. The
connection factory receives the frozen extension map; use it for both actual SDK advertising and
adapter settings, and return a fresh client/transport unit for every attempt:

```ts
import { Client } from "@modelcontextprotocol/client";
import { createMcpNativeClientOptions, McpSdkClientAdapter } from "@mcp-native/mcp";
import { createContractHostController } from "@mcp-native/host/contracts";

const controller = createContractHostController({
  registry,
  createConnection(extensions) {
    const transport = createTransport(); // Application-owned server and authentication setup.
    const sdk = new Client(
      { name: "receipt-host", version: "1.0.0" },
      createMcpNativeClientOptions("auto", { extensions }),
    );
    return {
      client: new McpSdkClientAdapter(sdk, { clientExtensions: extensions }),
      connect: (signal) => sdk.connect(transport, { signal }),
      close: () => sdk.close(),
    };
  },
  classifyError: () => ({ kind: "retryable", code: "connection-failed" }),
});

await controller.start();
const result = await controller.callTool("receipt", {}, { signal: abortController.signal });
if (result.kind === "contract-data" && controller.isCurrentResult(result)) {
  consumeReceiptData(result.model);
}
controller.clearResult();
await controller.shutdown();
```

The snippet uses the registry above and application-owned `createTransport`, `abortController`,
and `consumeReceiptData`. The controller accepts the existing host retry, timeout, diagnostics,
online-state, and A2UI parsing options, plus optional lower contract `limits`. It snapshots those
contract limits. `getSnapshot()`/`subscribe()` expose `ContractHostSnapshot`; only its resolved
call result uses the extended `ContractResult` union. `retry()`, `setOnline()`, `refreshTools()`,
and `cancelCurrentCall()` follow the existing host lifecycle. Discovery rejects partial tool lists;
calls use only exact definitions discovered on the current connection. Reusing a connection unit or
adapted client across attempts fails. Applications remain responsible for fresh transport ownership,
server selection, authentication, secure storage, and truthful connection settings.

One discovery or call may run at a time. The existing controller ceilings also apply: 8 unsettled
operations, including abandoned work, and 64 snapshot listeners. Cancelled requests keep their slot
until the underlying promise settles. Reconnect clears tools and results and requires discovery
again. Cancellation and connection-generation checks run before SDK requests, resource processing,
and custom preparation, and before publishing completion. Late responses cannot invoke preparation
or replace current data. Operational failures reject with `McpNativeHostControllerError`; selected
contract validation failures resolve as `contract-error` in a resolved call snapshot.

`clearResult()` releases the controller's resolved result and reports whether anything was cleared.
`isCurrentResult(result)` checks reference identity and live connection ownership; it is not an action
permission. A new call, discovery refresh, connection replacement, explicit clear, or shutdown drops
that ownership. Already returned JSON remains readable and inert; callers own their retained copies.
`shutdown()` immediately revokes operations, clears tools/results/listeners, and exposes a shutdown
snapshot, then awaits bounded transport cleanup. Repeated calls share the same completion promise.

Standalone `resolveContractResult` accepts an optional `signal` and returns `contract-error` /
`cancelled` when cancellation is observed. It suppresses subsequent preparation and late resource
processing, but does not interrupt synchronous local code or make an unsettled resource promise
finish. Standalone callers still own connection generations and concurrent-call limits.

## React lifecycle provider

Import `ContractHostProvider` and `useContractHost` from
`@mcp-native/host/contracts/react-native`. Supply one fresh controller and a required `onError`
callback; the provider starts it and exposes `{ controller, snapshot }` through the hook:

```tsx
<ContractHostProvider controller={controller} onError={reportHostError}>
  <ReceiptDataConsumer />
</ContractHostProvider>
```

The child calls `useContractHost()` to observe snapshots and invoke controller methods. Do not
replace the controller prop or share one controller between mounted providers. Real unmount cancels
pending calls immediately and schedules shutdown in a microtask; Strict Mode effect replay retains
the same connection. Throwing or rejecting error observers cannot interrupt cleanup. Application
code must create a new controller for a later mount after shutdown.

The original provider options remain lifecycle-only. To render custom results, supply a
`nativeRegistry` created from compiled renderers and construct the controller with that exact
`nativeRegistry.registry`. `ContractNativeResultView` mounts only the controller's current
`contract-data`; ordinary, invalid, and built-in results use its required host-authored fallback.
Existing A2UI/Apps views remain separate integrations; this view does not relabel those results.

## Static native rendering and events

`createContractNativeRegistration({ adapter, component })` binds one factory-issued adapter to a
compiled function or class component. `createContractNativeRegistry(registrations)` creates the
matching data registry and advertisements; forged registrations, duplicate adapters, and more than
32 entries fail. Advertising this registry therefore includes only custom adapters with installed
renderers. A separately created data registry with identical descriptors is not interchangeable.

The renderer receives exactly `{ model, dispatchEvent, consume }`. Map model fields explicitly to
local props. Charge model-dependent rendering work with `consume(work)` before performing it. No
server field selects components, props, styles, or code. The private mount lease binds the current
result, registry, and mounted view; there is one active view per provider. Unmount revokes handlers
immediately, while remounting the same result preserves its lifetime budget. A whole-surface error
boundary revokes the lease, reports a generic error, and renders `fallback("render-failed")`.
A fresh result resets the boundary. `fallback("unavailable")` covers absent/custom-ineligible data.
Supply accessible host-owned fallback UI; raw exception text is never passed to it.

```tsx
import { createContractActionAuthorization } from "@mcp-native/host/contracts";
import {
  createContractNativeRegistration, createContractNativeRegistry,
  ContractHostProvider, ContractNativeResultView,
  type ContractNativeRendererProps,
} from "@mcp-native/host/contracts/react-native";

function Receipt({ model, dispatchEvent, consume }: ContractNativeRendererProps) {
  consume(1);
  return <Button title={String(model.title)}
    onPress={() => { void dispatchEvent({ name: "acknowledge" }); }} />;
}
const nativeRegistry = createContractNativeRegistry([
  createContractNativeRegistration({ adapter: receiptAdapterWithEvents, component: Receipt }),
]);
// Create the controller with registry: nativeRegistry.registry before connecting.
const authorization = createContractActionAuthorization({
  authorize: request => request.kind === "contract" && request.event.name === "acknowledge",
});
<ContractHostProvider controller={controller} nativeRegistry={nativeRegistry}
  authorization={authorization} onEvent={deliverAcknowledgment} onError={reportHostError}>
  <ContractNativeResultView fallback={status => <Text accessibilityRole="alert">
    {status === "render-failed" ? "Receipt unavailable" : "No receipt to display"}
  </Text>} />;
```

Here `Button`/`Text` are application-imported native primitives. The application supplies
`receiptAdapterWithEvents` with a closed schema admitting `{ name: "acknowledge" }`, a digest that
includes that schema, and local delivery/error callbacks. Construct native configuration once:
replacing registry, authorization, delivery callback, limits, or deadline on a mounted provider is
rejected. Model editing and custom resource/streaming protocols are outside this static slice.

`createContractActionAuthorization` returns a factory-issued shared gate with
`authorizeA2uiAction` and `authorizeMcpAppsToolCall` policies for existing protocol integrations.
Its new request union also admits `kind: "contract"` with an exact descriptor, current immutable
model, validated immutable `event`, and host abort `signal`. Omitted policy, overlap, policy failure,
and any decision other than exact `true` deny. Review is serialized across all three lanes; a
cancelled/timed-out policy still occupies that gate until its promise settles. Existing protocol
parsers and action delivery boundaries remain responsible for their own inputs and lifecycle.

Before calling `onEvent`, custom dispatch rechecks mount and controller identity after asynchronous
review. No tool client or native capability is supplied. The host delivery callback owns any I/O and
must observe `signal` for its own cancellable work; the library cannot undo a callback already invoked.
Clearing/replacing the result, disconnect, shutdown, unmount, or render failure revokes pending work
and prevents late approval from invoking delivery. Outcomes are `delivered` or `rejected` with
`denied`, `invalid-event`, `stale`, `busy`, `limit-exceeded`, `delivery-failed`, or `timeout`.

Each result has a separate surface-lifetime budget shared by event copying/validation and cooperative
render work. Defaults are the existing `CONTRACT_LIMITS`, lowered by adapter limits and provider
`surfaceLimits`; budgets do not reset per event or on view remount. At most 128 event attempts run per
result, one event is active per view, and 8 unsettled event operations are retained per provider
across replacements. Rejected input consumes its attempted work. Exhaustion remains exhausted even
if local rendering catches the exception. There is no event queue. Review plus delivery has a
30-second deadline, lowerable with `eventTimeoutMs`; timeout aborts authority but unsettled callbacks
continue counting against capacity. React owns synchronous mount cleanup; no asynchronous adapter
disposal hook or public transferable surface handle is introduced.

The maintained [todo example](../examples/expo-go-todolist/README.md) exercises a native task-count
snapshot, exact event schema digest, explicit acknowledgment policy, and modal mount/unmount.

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

Generate `schemaRevision` with `createContractSchemaBundle` from
`@mcp-native/host/contracts/authoring` during the application build. Persist its exact canonical UTF-8
source and register the returned input/model/optional event schemas. See the [authoring guide](contract-authoring.md)
for the versioned byte format, fixture runner, and migration from a previously hand-hashed bundle. Runtime checks digest syntax and exact equality; it neither
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
references count at each occurrence. There is no custom-result cache or live surface state. The optional controller owns one current
result and bounded operations; standalone callers own concurrent-call limits and connection
generations. Applications own their retained data references and later use of returned models.

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

Precedence is MCP/extension validation, installed standard settings, custom settings, standard/custom conflict, descriptor,
negotiation, then input/preparation/model validation. Standard markers include top-level and embedded
resource MIME types `application/a2ui+json` and `text/html;profile=mcp-app`, plus any tool `_meta.ui`.
Malformed custom claims fail even without negotiation. Error results never call custom adapters.

Registration, registry construction, and descriptor parsing throw `ContractError` with respectively
`invalid-registration`, `invalid-registry`, and `invalid-claim`. Resolver custom codes are
`invalid-registry`, `invalid-standard-settings`, `invalid-contract-settings`, `conflicting-contract-claims`, `invalid-claim`,
`invalid-contract-input`, `invalid-contract-model`, `contract-limit-exceeded`, `adapter-failed`,
and `cancelled`.
Malformed resolver options use existing `invalid` / `invalid-input`. Error output never retains a
server value or original callback exception.

Tests cover SDK-backed resolution, standard parity, forbidden claims, strict schemas, callback
counts, aggregate budgets, immutable ownership, and packed runtime/declaration consumers. Live
updates, independently shipped standard adapters, and custom resource transports remain later [RFC-0002](RFC-0002-contract-registry.md) work.

The optional registry `standards` selection and immutable `.standards` inventory are documented in
[maintained standard contracts](standard-contracts.md). Omission preserves defaults; excluded client
advertisements fail before reads. [Authoring tools](contract-authoring.md) provide reproducible schema
bundles and bounded fixture reports without granting runtime authority.
