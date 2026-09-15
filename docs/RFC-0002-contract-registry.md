# RFC-0002: standard contract registry and custom input adapters

- Status: Bounded inline implementation available in source, including separately packaged reviewed profiles; unreleased and pending acceptance review
- Date: 2026-09-14
- Tracking: [Milestone 11 / issue #91](https://github.com/pablospaniard/mcp-native/issues/91)
- Foundation: [RFC-0001](RFC-0001-architecture.md) and the [1.x compatibility policy](compatibility-policy.md)

## Problem and scope

The first implementation exports `@mcp-native/host/contracts`: local adapter/registry factories,
strict inline schemas, and `resolveContractResult`. See [the binding and API guide](custom-contracts.md)
for the exact implemented grammar, limits, fallback table, and author responsibilities. This is an
unreleased addition; published `1.0.1` does not contain it. The rest of this design includes later
standard-profile and resource integration.

This slice returns inert `contract-data`, not a live surface handle. Its separate result union
retains no executable surface state. Data-adapter registration alone enables headless preparation;
native mounting and schema-validated events now require an explicit native registry whose
advertisements include only locally installed renderers. The opt-in controller/provider own
data-result lifecycle and private mount leases; no transferable public surface handle is exposed. The schema digest is authored and checked at build/fixture time;
runtime validates its syntax and exact negotiation. The [authoring subpath](contract-authoring.md) now generates
versioned canonical bundles and checks bounded data/event fixtures. The [maintained inventory](standard-contracts.md)
provides factories and subset selection for the existing three profiles. The [reviewed standard adapter
interface](reviewed-standard-adapters.md) now supports separately packaged inline-JSON profiles with
exact own-extension negotiation and result metadata; broader resource/wire interfaces remain proposed.

The v1 host recognizes a fixed set of A2UI and MCP Apps results. An application with its own
receipt, itinerary, or other semantic document must currently orchestrate that format outside the
host. Applications need to install a reviewed local adapter and retain the host's validation,
connection ownership, cancellation, action policy, and rendering containment.

This proposal defines a registry of exact result contracts and the responsibilities of locally
installed adapters. It also allows additional reviewed standard profiles without changing the
host resolver for each profile. Registration never downloads code or lets server data select an
import, native class, arbitrary component, prop mapper, WebView configuration, or command.

The first implementation slice covers bounded, inline custom JSON results and registry validation.
Linked custom resources, streaming updates, generic device capabilities, and new standard revisions
remain later slices. Existing A2UI host extensions continue to serve applications that only need
additional components inside the current A2UI contract.

All new rules and wire fields are MCP Native project policy, not requirements or approved
extensions of MCP, A2UI, or MCP Apps. The implemented inline binding is documented separately;
existing standard profiles, schema pins, package versions, and v1 public types are unchanged.
Shared controller cleanup now skips cancelled work before parsing/preparation and releases state
immediately on shutdown.

## Compatibility and package ownership

`McpNativeHostResult` remains the closed `a2ui | mcp-app | ordinary | invalid` union. Existing
resolver, controller, provider, hook, action-authorization union, error codes, and result views
retain their current types and defaults. Adding another member to those unions would break
exhaustive consumers and is not an additive minor-release change.

The opt-in entry point `@mcp-native/host/contracts` provides registration, resolution, and
`ContractHostController`. `@mcp-native/host/contracts/react-native` exports
`ContractHostProvider` and `useContractHost`. The same subpath now also exports local renderer/registry factories and `ContractNativeResultView`.
A separate shared authorization factory adds custom event requests without widening the v1 union.
These APIs share private orchestration with the existing host without changing its defaults.

The headless entry point owns selection, registration validation, operation ownership, and budget
accounting. The React Native entry point owns provider lifecycle, snapshots, compiled renderer bindings, and
whole-surface mount failure containment. Its static view handles custom data; a combined view for
registered built-in profiles remains future work. Protocol packages retain parsing, negotiation, action
serialization, and sandbox authority for their profiles. No implementation or registry moves into
`@mcp-native/core`, and no new package dependency is required for this design.

Adoption is explicit: an application installs adapters, creates a frozen registry before connecting,
and opts into the contract controller/provider for data lifecycle. Native mounting requires a matching native registry and result view; custom event delivery additionally
requires an event schema and explicit policy. Applications remaining on the v1 API
need no migration. The new API can ship in a minor release only after declaration and packed-consumer
tests demonstrate that the old API is unchanged. No release number is assigned here.

## Registry and registration rules

A registry is an immutable, host-created snapshot. It has separate maintained-standard and custom
registration lists. There is no process-global registry, runtime installation, priority ordering,
wildcard matching, or first-match callback chain. Changing registrations requires a new registry
and connection; existing operations keep their original snapshot until invalidated.

Each contract descriptor contains:

| Field            | Meaning                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `id`             | Exact namespaced identifier; custom IDs use an application-owned reverse-DNS namespace and a local name separated by `/` |
| `version`        | Exact semantic contract version, independent of the package version; no ranges or aliases                                |
| `schemaRevision` | Exact digest of the locally installed input/model/event schemas; no remote schema lookup                                 |
| `transport`      | One reviewed transport; initially `structured-content` for custom contracts                                              |
| `mimeType`       | One exact canonical MIME type; parameters and wildcards are rejected in the initial custom binding                       |
| Local policy     | Input, model, output, resource, action, and lifecycle limits plus required renderer capabilities                         |
| Evidence         | Local schema, adapter implementation, support/compatibility status, conformance fixtures, and documentation              |

Registration rejects malformed or unknown descriptor fields, duplicate identity/version tuples,
conflicting schema revisions, unsupported transports, missing validators/renderers, invalid bounds,
and custom claims on reserved standard identifiers or MIME types. Custom IDs cannot use
`io.modelcontextprotocol`, the project's `io.github.pablospaniard` namespace, or their subnamespaces.
The accepted identifier grammar, semantic-version grammar, lengths, and digest serialization must
be frozen with runtime validators and negative tests before the first export; comparison never
silently normalizes server identifiers. The initial schema bundle uses fixed bytes and a SHA-256
digest, avoiding dependence on object-key serialization order.

Standard registrations come from explicitly imported, maintained factories with runtime-checked
registration identity. A user-supplied `lane: "standard"` flag or TypeScript cast cannot create one.
Custom factories cannot replace standard recognizers or reserved-marker checks. Separately packaged
inline standards use `createReviewedStandardAdapter` and an exact locally reviewed profile manifest; server metadata cannot confer
standard status. This is an API trust boundary, not a sandbox for malicious application code.

The initial standard inventory wraps the existing implementations:

| Entry                | Exact baseline                                                                                          | Existing authority                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| MCP ordinary content | MCP `2026-07-28` client boundary; no executable renderer                                                | [MCP profile](protocol-support.md) and current bounded inert fallback                     |
| A2UI native UI       | `v1.0` Candidate at `8ff4651232ab0e02b0123730b502711170637a3a`; binding `0.1`, `application/a2ui+json`  | [A2UI binding](a2ui-mcp-binding.md), profile validators, host catalog and action policy   |
| MCP Apps             | `2026-01-26`; `@modelcontextprotocol/ext-apps@1.7.5`, source `92f46a574568a3ddac7600343b7d3c4c4ed7b588` | [Apps profile](mcp-apps-compatibility.md), existing resource, sandbox and bridge policies |

Each maintained entry records its existing negotiation requirements, MIME types, limits, supported
features, exclusions, and conformance status by reference to those profiles. The inventory does not
turn ordinary content into a negotiated UI contract or imply complete upstream protocol support.
The five-field custom descriptor does not replace standard wire identities: maintained entries
retain their protocol-specific version syntax, including dated revisions, and existing negotiation.

## Implemented custom binding

The initial custom transport is a project-owned extension under
`io.github.pablospaniard/mcp-native-contracts`. Its closed settings object contains
`bindingVersion: "0.1"` and a bounded `contracts` array of the five wire descriptor fields above.
Local policy and implementation objects never cross the wire. Duplicate tuples, unknown settings,
and malformed declarations are rejected. Both peers must advertise the exact binding version;
eligible contracts are the exact descriptor intersection, including version, schema digest,
transport, and MIME type. No range selection or automatic downgrade occurs.

A data registry may advertise headless adapters. A native registry advertises only adapters with
explicitly installed compiled renderers. Neither advertisement satisfies action policy; events
require their own schema, host authorization, and delivery callback.
The registry and client/server extension snapshots belong to the same authenticated connection
generation as the discovered tool and its result. A caller cannot independently supply a
negotiation grant. Reconnect or principal changes invalidate grants and retained results.

A result declares at most one custom contract through a closed descriptor at
`result._meta["io.github.pablospaniard/mcp-native-contracts"]`. Its value contains exactly the five
wire descriptor fields. The payload is the complete `result.structuredContent` object, validated
against the installed schema. The initial transport performs no resource reads. Text blocks remain
useful inert fallback; they cannot supply the custom payload or select a renderer.

For example, an application may install `com.example/receipt` version `1.0.0`. A mutually negotiated
result with that exact descriptor and a schema-valid receipt object can reach the application's
compiled receipt renderer. Merely writing that ID into `_meta`, embedding JavaScript in the payload,
or linking a renderer URL cannot register or enable anything.

The [implemented binding](custom-contracts.md) specifies the schema subset, examples, bounds,
MCP capability placement, and mismatch behavior for headless inline data. The current project-owned
A2UI binding and official Apps extension keep their exact wire contracts.

## Deterministic selection and fallback

The registered resolver first performs the existing bounded SDK-shaped tool/result and extension
validation. It then examines standard markers and the custom descriptor using fixed,
bounded host logic. Recognition is pure: it cannot fetch resources, call adapters, render, dispatch,
or ask for permission. Custom selection is an exact registry lookup, not a parser trial.

| Input state                                                                   | Registered-host outcome                            | Permitted work                                                 |
| ----------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| Invalid MCP input or malformed extension settings                             | Existing invalid outcome where applicable          | No adapter or resource callback                                |
| Both maintained A2UI and Apps claims negotiated                               | Existing `ambiguous-standard-result`               | No resource loading                                            |
| Any recognized standard marker together with a custom descriptor              | New registered-host conflict error                 | No custom callback, even if the standard is unnegotiated       |
| Maintained A2UI or Apps marker without another lane claim                     | Existing standard resolver outcome                 | Existing negotiation, validation, and fallback rules           |
| No standard or custom claim                                                   | Ordinary MCP content                               | Bounded inert presentation only                                |
| Malformed custom descriptor or reserved identity/MIME                         | New registered-host invalid-claim error            | No adapter callback                                            |
| Well-formed custom descriptor with no exact installed and negotiated contract | Ordinary MCP content                               | No custom callback or resource loading                         |
| Exactly one installed and negotiated custom claim                             | Validate its payload, then prepare its local model | Selected adapter only                                          |
| Selected custom payload, model, limit, policy, or renderer failure            | Stable registered-host error                       | Tear down that surface; no alternate adapter or ordinary retry |

Separately installed reviewed profiles add their own exact result markers and extension settings.
Multiple reviewed markers, or a reviewed claim mixed with a built-in/custom claim, return
`conflicting-contract-claims` even without negotiation. Incorrect installed-profile settings return
`invalid-standard-settings`; malformed installed markers return `invalid-standard-claim`. A single
exact negotiated reviewed claim validates inline input and prepares only its installed adapter.
Missing negotiation leaves a valid claim inert. See the complete [reviewed selection rules](reviewed-standard-adapters.md#selection-and-failures).

Standard markers include the current A2UI resource MIME and Apps tool `_meta.ui` declaration, plus
the exact markers and MIME identities of installed reviewed profiles. Invalid standard-shaped
declarations remain standard claims for exclusion from custom routing. The implementation
enumerates these markers and tests malformed and unnegotiated variants; an unknown arbitrary
MIME type is never guessed to be executable. Adding a profile must review recognition overlap.

If `result.isError` is true, a custom-only result remains inert ordinary content after descriptor
validation; the adapter is not invoked. Existing built-in error-result behavior is preserved.
Host-authored errors contain closed local codes, never exception messages or server-authored text.
The registered API uses its own error union rather than extending existing v1 error-code unions.

## Adapter responsibilities

The proposed logical interface separates the following stages. Exact exported TypeScript names
and signatures belong to the implementation PR and must retain these ownership constraints.

| Stage            | Input and output                                                                | Authority                                                                                   |
| ---------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Recognize        | Validated MCP metadata to one exact registered descriptor                       | Host-owned pure lookup; no custom predicate                                                 |
| Parse            | Bounded inline JSON to an owned candidate model                                 | Local parser; no I/O or actions                                                             |
| Validate         | Candidate model and fixed local schema to a checked model or closed failure     | Strict schema plus semantic checks; unknown fields and unsupported values rejected          |
| Prepare          | Checked model and bounded local options to immutable semantic presentation data | No React elements, functions, raw native props/styles, or executable references in the data |
| Access resources | A validated resource declaration to owned resource data                         | Initially unavailable for custom adapters; future access only through a scoped host broker  |
| Render           | Checked presentation data and host-issued event handlers to local UI            | Explicit prop mapping in a compiled renderer, within a whole-surface error boundary         |
| Dispatch         | Local interaction plus current validated model to a declared event              | Revalidate event and cumulative output; require host authorization before delivery          |
| Dispose          | Host-owned surface lifetime ends                                                | Idempotent local cleanup; revoke handles before awaiting adapter cleanup                    |

An implementation should expose a local registration factory that captures the schema, parser,
semantic validator, model preparer, event schema, limits, and renderer binding as one immutable
unit. Neither a structural object supplied by the server nor a fabricated registration handle can
stand in for that unit. The broader design permits an opaque surface handle bound to registry, adapter, connection, and
operation. The implemented static slice instead retains inert `contract-data` and issues private
mount leases only for the controller's current result. Native registries bind factory-issued adapters
to compiled components; forged or foreign registries cannot mount. No executable renderer reference
is returned in JSON.

A future generalized registered result type may contain existing built-in outcomes plus separately named
contract-surface and contract-error outcomes. A contract-surface handle records its exact installed
profile and lane; it can represent a custom contract or a future maintained standard without adding
a union member for every profile. The initial built-ins retain their existing outcomes. The API
never relabels arbitrary custom data as a validated A2UI resource or MCP App. A custom adapter cannot
produce HTML that bypasses the existing Apps sandbox.

Adapters are trusted application code and must be reviewed like native component implementations.
Exceptions and rejected promises are contained, but same-runtime JavaScript cannot preempt a
malicious synchronous callback or undo arbitrary I/O performed by application code. The public
interface supplies no ambient transport, tool client, device access, or component resolver; adapter
conformance must verify cooperative work accounting and absence of input-driven unbounded work.

## Limits, lifecycle, and actions

Registration has bounded count and total descriptor/schema/profile size. MCP/extension parsing has
its existing bounds; reviewed-profile selection shares a cumulative settings/marker budget across
installed profiles. Selected inline input copying, schema validation, preparation, and output share
one separate per-call adapter/host budget. Resource expansion is not part of this inline interface. Count limits and aggregate byte/work limits apply together;
individually valid values cannot multiply work through list expansion, interpolation, copying,
validation, or repeated dispatch. Existing standard-profile limits remain unchanged.

The custom implementation must publish finite ceilings and defaults before shipping for registry
entries, input/model depth and nodes, cumulative strings/bytes, validation issues, prepared output,
work units, retained handles, listeners, queued events, pending operations, and cleanup deadlines.
Effective limits are the minimum of library ceilings, installed contract limits, and host policy.
Per-event limits are supplemented by surface-lifetime budgets; repeated dispatch cannot reset a
cumulative allowance. Future resource caching or deduplication must still charge retained and expanded
output, and must preserve server/principal/registry isolation.

Parsing and preparation complete before mounting; failures expose no partially actionable surface.
Replacement, cancellation, reconnect, unmount, and shutdown revoke the surface and action handles
before releasing retained data. Late asynchronous completion cannot publish state, read a resource,
or dispatch an event. Disposal is exactly once at the host boundary, its errors are contained, and
unsettled callbacks count toward the pending-work limit until they settle. Timeouts revoke authority
but do not claim to stop arbitrary trusted code; a full pending-work budget rejects further work.

The first custom slice is a static snapshot, not a server-driven live-update protocol. A fresh tool
result creates a new surface with an immutable model. Local model editing is not supported by this
interface; adding it would require bounded validation and events tied to the current edited model. No server-authored
event name alone grants an action. Events require an installed closed schema, a current surface,
a host-created interaction handler, and explicit host policy before an application-owned delivery
callback runs. The default is denial; grants are not cached or inherited from A2UI or Apps.

Authorization is serialized across registered custom, A2UI, and Apps actions through a new opt-in
decision union. After asynchronous review, the host rechecks surface identity and revocation before
delivery. Existing A2UI and Apps validation/serialization still run at their own boundaries. There
is no generic native command or implicit tool execution in the custom event contract.

## Delivery and acceptance gates

1. **Design PR (this document):** propose the contract, trust boundaries, compatibility path,
   selection table, and verification plan. Correct the shipped v1 release status. Mark the RFC
   proposed and leave implementation checkboxes open.
2. **Registry and inline resolution:** add the exact custom binding/schema and local registration
   factories, fixed selection, immutable validated models, shared limits, and a separate result API.
   Verify built-in parity and failure routing before any custom mounting is enabled.
3. **Registered host integration:** controller/provider lifecycle, static native registry/view,
   private mount leases, whole-surface containment, schema-validated custom events, serialized
   authorization, bounded event lifetime, cancellation, and a maintained native example are
   implemented. A combined registered built-in view, editable models, and generalized public
   surface handles remain outside this slice.
4. **Adapter-author and maintained inventory:** canonical schema bundles, bounded data/event fixtures,
   maintained standard factories and selection, compatibility/migration guidance, and packed-consumer
   coverage are implemented. Separately packaged reviewed inline adapters now share the bounded
   data/native lifecycle while retaining their own exact wire markers and advertisements. The
   synthetic tarball fixture proves installation without changing host source; actual upstream
   compatibility claims require profile-specific review. Resource transports remain separate work.

Required regression and failure-path coverage includes:

- Existing host-result fixtures and exhaustive TypeScript consumers retain their old outcomes,
  declarations, exports, pins, and error codes; opting into the new API is explicit.
- Unknown fields/versions, reserved claims, duplicate registrations, revision mismatches, forged
  handles, registry mutation, and wrong-connection negotiation fail before adapter work.
- The complete selection table is exercised with callback counts: ambiguous, invalid, unsupported,
  and failed-standard inputs cannot trigger custom parsing, rendering, resource reads, or actions.
- Malformed/non-JSON/cyclic input, schema and semantic failures, nested collections, oversized
  validation messages, expansion, and repeated dispatch hit controlled cumulative limits.
- Adapter throws, render failures, cancellation, replacement, reconnect, shutdown, double disposal,
  slow cleanup, stale events, and late completions never leave an actionable stale surface.
- Denied/rejected authorization, overlapping review, and cancellation during review cannot deliver
  actions; server payloads cannot choose components, code, native props, or WebView policy.
- Clean packed consumers exercise every new export and a pre-existing v1 consumer alongside the
  new API. Native fixtures cover interaction, accessibility, lifecycle, and unavailable renderers.

Implementation requires `npm run check`, `npm run package:smoke` for added exports/declarations,
and applicable native integration checks. Update the API baseline intentionally, compatibility and
migration guides, standards inventory, roadmap, and changelog with implemented scope and exact pins.
The bounded inline implementation now includes the independently packaged adapter interface,
negative tests, native lifecycle tests, and separate tarball consumer gate. Issue #91 remains open for
acceptance review; the synthetic fixture does not claim a new real upstream standard is certified.

See the [implementation acceptance review](milestone-11-acceptance.md) for the requirement/evidence
mapping, fixed lifecycle/budget findings, and remaining maintainer decision.

Review correction: native rendering uses a fresh cumulative budget for each render invocation;
React render attempts never mutate lifetime event accounting. Single-flight event ownership persists
after timeout until actual review/delivery settlement. See the [corrected review record](milestone-11-acceptance.md).
