# Changelog

All notable changes to MCP Native are documented here. Until the project reaches `1.0.0`,
breaking public API changes increment the minor version; patch releases remain compatible within
their minor release line.

## Unreleased

### Added

- An issuer-bound interactive OAuth provider for the official MCP SDK v2 with host-owned secure
  storage, persisted PKCE/state/discovery data, exact callback validation, canonical RFC 8707
  resource pinning, and issuer-scoped client registrations and tokens.
- A protected Streamable HTTP factory that rejects manual credential headers and surfaces
  insufficient-scope challenges to the host by default, with an opt-in host-approved
  reauthorization path capped to one SDK retry per request.
- A headless native-host authorization driver that passes all 25 scored official MCP `2026-07-28`
  authorization client scenarios; the full pinned gate now covers 32 scenarios and 386 checks.
- Dependency-neutral native OAuth reference adapters for bounded fixed-slot Keychain/Keystore
  persistence and one exact ASWebAuthenticationSession/Android Custom Tab callback.
- An exact two-platform native OAuth evidence schema, ordinary structure check, and strict
  release-candidate gate. Both checked-in rows intentionally remain `not-run` until executed.

### Security

- Reject insecure non-loopback OAuth endpoints, redirect/callback substitution, duplicate callback
  parameters, invalid or replayed state, malformed stored credentials, cross-issuer credential
  reuse, mismatched authorization-server metadata, and protected-resource substitution.
- Keep OAuth callback error descriptions out of host-visible errors and require credential, PKCE,
  state, and discovery persistence behind an explicit keychain/keystore-grade host contract.
- Require an exact host approval decision for every interactive reauthorization while credentials
  exist, including repeated same-scope challenges, and refresh protected-resource discovery after
  callback completion so authorization-server migrations cannot reuse old credentials.
- Reject unsafe server-derived storage namespaces, oversized or corrupt stored values, concurrent
  authentication sessions, malformed native session results, callback-location substitution, and
  callback reuse. Explicit platform cancellation removes pending state and PKCE material without
  deleting registrations or tokens.
- Restrict redirect URIs to HTTPS app links, HTTP loopback URLs, or hierarchical private-use app
  schemes; reject issuer query/fragment components; and bound both individual and cumulative token
  values before parsing, persistence, or request reuse.
- Reserve one authorization attempt before state persistence so overlapping flows cannot replace its
  state or verifier, and apply total, count, name, and value limits to both native-session and direct
  process-recovery callbacks before code redemption. Direct recovery also reserves the persisted
  attempt while it atomically consumes state and clears its verifier.

## 0.5.0 - 2026-08-28

Adds the stable MCP Apps native host-adapter profile with strict capability negotiation, bounded
resource and bridge handling, and a closed native WebView sandbox contract.

### Added

- A stable MCP Apps `2026-01-26` native host-adapter profile with exact
  `io.modelcontextprotocol/ui` MIME negotiation, `_meta.ui` discovery and visibility, bounded
  `ui://` text/blob resource loading, and closed CSP/permission metadata.
- A CSP-first native WebView sandbox descriptor, explicit React Native WebView safe-prop adapter,
  fixed data-only message shim, and deny-by-default navigation, storage, cookie, download,
  external-link, dedicated-domain, and sensitive-permission policy.
- A bounded stable Apps JSON-RPC bridge covering initialization, tool data, host context, supported
  View requests/notifications, same-server app-visible tool calls, and graceful teardown, verified
  against exact official `@modelcontextprotocol/ext-apps@1.7.5` schemas.

### Security

- Reject unnegotiated Apps resources, non-`ui://` discovery, legacy or ambiguous HTML media types,
  malformed/oversized HTML and base64, unknown security metadata, unsafe CSP sources, executable
  content before CSP, unsupported dedicated origins, and permission grants the standard native
  adapter cannot enforce.
- Reject malformed, premature, unknown, oversized, visibility-bypassing, non-JSON, out-of-order, and
  excessively concurrent bridge traffic before another host callback runs; advertise bridge
  capabilities only when their corresponding explicit host callback exists. Contain rejected native
  callbacks through a required host error boundary and serialize exactly-once tool lifecycle sends
  across asynchronous transports.

## 0.4.0 - 2026-08-28

Completes the feature-scoped A2UI v1 Candidate adapter with bounded renderer functions, native
component variants, accessibility semantics, robustness gates, and real-platform release evidence.

### Added

- Complete pinned renderer-to-agent envelope parsing for `action`, `callAgentFunction`,
  `rendererFunctionResponse`, and `error`, with schema-derived interoperability fixtures and exact
  public envelope types.
- A feature-scoped A2UI v1 Candidate conformance profile covering the supported subset, explicit
  exclusions, Candidate interpretations, interoperability evidence, and custom `0.1` migration.
- Bounded, host-localized A2UI v1 `formatDate` execution for strict calendar dates, RFC 3339
  timestamps, Unix epochs, nested interpolation, and dispatch-time values.
- A2UI v1 `required`, `regex`, `length`, `numeric`, and `email` validation functions plus
  renderer-side checks for supported text fields and buttons. Failed field checks expose their
  messages to host components, while failed button checks disable dispatch.
- Policy-gated A2UI v1 `openUrl` Button actions with press-time data resolution, canonical HTTP(S)
  descriptors, host-owned platform execution, and non-dispatchable temporary invalid local edits.
- Typed React Native host adapters for mapping trusted `View`, `Text`, `Button`, and `TextInput`
  props into locally bundled third-party component APIs.
- Closed React Native component variants for host-owned `Row`, `Column`, `List`, and `Card`
  presentation plus pinned text, button, and text-field style hints, with primitive fallbacks.
- Closed React Native accessibility semantics for rendered text and buttons, explicit disabled state,
  enabled text scaling, and a real-platform verification plan with reviewable release evidence.
- A pinned native accessibility fixture and initial React Native, iOS, and Android target test matrix
  for consistent primitive, adapter, variant, dynamic-list, validation, and screen-reader runs.
- A fixed A2UI performance regression gate for maximum-size parsing and render-plan construction,
  rapid ordered updates, and retained heap, with a documented reproducible measurement method.
- Deterministic generated-input coverage for both A2UI envelope directions, lifecycle state,
  dynamic-list plans, and hostile graph, component, binding, and function-policy mutations.
- A temporary official React Native host generator pinned to `0.87.1` and `0.86.3`, with primitive,
  typed-adapter, and closed-variant accessibility catalog paths plus Android/iOS Metro and native
  build preflight workflows.
- A bounded native evidence format, WCAG 2.2 applicability assessment, negative validator tests,
  and strict release gate that prevents publication while any required real-platform row is
  missing, pending, failing, or lacks reviewable evidence.
- Reproducible Android 17 native preflight using the exact API 37 SDK package, plus a safe-area-aware
  accessibility fixture that avoids status-bar overlap and an extra root screen-reader focus target.
- Passing Android TalkBack and iOS XCUITest accessibility evidence, completing the `0.4.0` native
  accessibility release matrix. The generated iPhone fixture supports portrait and both landscape
  orientations.

### Deprecated

- The custom `A2UI_VERSION = "0.1"` parser, resolver, surface types, limits, `McpNativeSurface`, and
  legacy render-plan helpers. They remain available for migration and receive only security and
  correctness fixes; new integrations should use the pinned v1 Candidate APIs.

### Security

- Treat parsed renderer function calls, responses, and errors as bounded inert data: successful
  validation never grants execution, transport, tool, URL, device, or permission authority.
- Reject unknown or ambiguous renderer message kinds, unsupported versions and functions, malformed
  validation-error JSON Pointers, conflicting targets/results, non-JSON input, and decoded object
  graphs whose cumulative string and key data exceeds the serialized-envelope limit.
- Reject invalid date values, ambiguous 12-hour patterns, unsupported Unicode pattern tokens,
  malformed quoted literals, out-of-range epochs, and patterns exceeding the renderer work limit.
- Bound expanded renderer checks, validation accessibility output, and agent-supplied regular
  expressions; reject potentially expensive regex constructs, invalid ranges, and non-boolean
  check results.
- Require both the catalog function allowlist and a synchronous host URL policy before `openUrl`
  execution; reject relative URLs, non-HTTP(S) schemes, credentials, whitespace, control and
  Unicode format characters, oversized URLs, and cumulative dynamic-list amplification.
- Keep host component adapters behind the existing closed primitive catalog: servers cannot select
  modules, register component names, choose prop mappers, or spread unchecked props.
- Select richer host components only through pinned A2UI variant enums; server-provided style
  objects and arbitrary native props still never cross the renderer boundary.
- Scope component-variant selection to the A2UI v1 renderer so sharing a catalog cannot change
  legacy `0.1` component selection.
- Derive native accessibility role, disabled state, focus eligibility, and text-scaling props inside
  the trusted renderer; servers cannot choose these values or inject arbitrary native semantics.
- Require generated hostile inputs to fail through controlled parser errors without exposing
  executable components, malformed graphs, unsupported bindings, or policy-bypassing functions.

## 0.3.0 - 2026-08-26

Expands the standards-pinned A2UI v1 Candidate path from static native plans into bounded,
interactive rendering with capability negotiation, dynamic lists, and the first executable
catalog functions, with fail-closed handling for server-controlled renderer semantics.

### Added

- Strict agent and renderer capability parsing with exact catalog overlap negotiation and inline
  catalogs disabled.
- Renderer-local data-model updates, dispatch-time action context resolution, and official
  renderer-to-agent action envelope construction.
- Bounded dynamic `List` templates with relative bindings, stable instance identity, and
  dispatch-time `@index` evaluation.
- Bounded `formatString` execution with official JSON coercion, nested supported expressions, and
  renderer-local state.
- Host-localized `formatNumber`, `formatCurrency`, and `pluralize` execution with validated dynamic
  arguments, locale options, and bounded output.
- Strict `and`, `or`, and `not` evaluation across render and dispatch-time state.

### Security

- Validate nested boolean operands against the host function allowlist before rendering or
  dispatching actions.
- Reject unsupported locales, currencies, precision settings, plural operands, and boolean values
  with controlled parse errors.
- Preserve renderer expansion and formatted-output budgets across dynamic lists and nested
  function evaluation.

## 0.2.0 - 2026-08-26

Adds the first standards-pinned A2UI v1 Candidate path while retaining the custom `0.1` surface
model for compatibility and enforcing a closed, fail-closed renderer profile.

### Added

- MCP extension capability negotiation and the project-owned A2UI-over-MCP transport binding.
- Checksum-verified A2UI v1 Candidate schemas pinned to an exact upstream revision.
- Ordered v1 lifecycle parsing and bounded surface state for create, component update, data-model
  update, and delete messages.
- Pre-render catalog, graph, binding, placement, event, function, and nested `formatString`
  validation with explicit host allowlists.
- A React Native adapter for the supported static A2UI v1 component subset.

### Security

- Reject runtime-provided `formatString` sources and validate literal-source interpolations
  against the pinned catalog before rendering.
- Bound interpolation depth, expression count, and cumulative source length.
- Make npm trusted-publishing recovery retry-safe while retaining immutable release-commit
  verification and package provenance.

## 0.1.0 - 2026-08-25

First coordinated experimental API baseline. The package release version is independent of the
custom A2UI proof-of-concept surface value `"0.1"`.

### Added

- Published `@mcp-native/mcp`, the validated official MCP TypeScript SDK v2 adapter, as part of the
  coordinated package set.

### Security

- Bounded untrusted JSON graphs, serialized A2UI surfaces, and surface string fields.
- Rejected undeclared surface, node, and action fields instead of silently discarding them.
- Rejected unsupported task execution declarations at the MCP adapter boundary.
- Corrected metadata-key validation to reject empty names.

## 0.0.3 - 2026-08-25

Documentation and package-discovery release.

### Changed

- Expanded the repository README with direct npm links and installation guidance.
- Replaced every package placeholder README with standalone installation, usage, API,
  security, and related-package documentation.
- Added npm keywords, homepage links, issue links, and normalized repository metadata to all
  public package manifests.
- Made packaged-artifact smoke testing independent of a hard-coded release version.

## 0.0.2 - 2026-08-25

First functional preview of MCP Native.

### Added

- Protocol-independent MCP client and runtime primitives in `@mcp-native/core`.
- Strict parsing for the initial A2UI surface model in `@mcp-native/a2ui`.
- A trusted React Native render plan with an explicit component allowlist in
  `@mcp-native/react-native`.
- Policy-gated inline and remote HTML document handling in `@mcp-native/webview`.
- The `mcp-native` convenience package, which re-exports the public package APIs.
- Automated validation, package smoke testing, and provenance-backed npm releases.

### Status

This release is experimental. It proves the package boundaries and security model; it is not
yet a complete MCP-to-React-Native application runtime.
