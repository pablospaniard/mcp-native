# Changelog

All notable changes to MCP Native are documented here. Until the project reaches `1.0.0`,
breaking public API changes increment the minor version; patch releases remain compatible within
their minor release line.

## Unreleased

### Changed

- Restore the README's descriptive product heading and architecture diagrams, remove the lead
  screenshot, and move the Expo Go example below the package overview.

## 0.9.2 - 2026-09-02

Adds the runnable Expo Go proof and restores the React Native `0.86.0` minimum while preserving the
frozen `1.0.0` candidate API.

### Changed

- Rewrite the main documentation path around a plain-language introduction, working Expo example,
  package choices, and task-based guide map; remove repeated release-status boilerplate from package
  READMEs and keep exact conformance language in the technical reference pages.
- Align current documentation around the feature-complete `0.9.x` release candidate, lead with
  implemented workflows and adoption guidance, and present compatibility and security boundaries as
  precise integration contracts.
- Include the exact MIT license in every public package and make package smoke verification reject
  missing exports, licenses, or invalid JavaScript and declaration source maps before installation.
- Publish an evidence-based `1.0.0` readiness checklist that separates automated release gates from
  the remaining independent reviews, migration decision, and final registry publication checks.
- Add a pull-request upgrade smoke gate that installs the latest coordinated published `0.9.x`
  packages, exercises migration-ready modern and `/legacy` imports, replaces every dependency with
  its local candidate tarball, and runs the same consumer again.
- Restore React Native `0.86.0` as the supported minimum and focus generated native-host CI on that
  minimum with the default Hermes engine. Optional engine combinations no longer narrow the package
  peer range or imply incompatibility when they do not have a dedicated lane.
- Add a complete Expo Go todo application with validated A2UI lifecycle messages, a trusted React
  Native primitives catalog, renderer-local bindings, official action envelopes, persistence,
  accessibility, focused tests, three current screenshots, and an end-to-end package walkthrough.
- Replace the old empty React Native demonstration-policy placeholder with the runnable app and make
  it the prominent try-it-now path in the root documentation.
- Add a one-click Expo Snack launch for the complete todo app and provide a default ESM export-map
  fallback so condition-based bundlers such as Snackager can consume the published packages.

## 0.9.1 - 2026-09-02

Documents the shipped `0.9` release candidate as feature-complete for the React Native host scope
and separates completed implementation work from the final `1.0.0` review and stability gates.

### Changed

- Replace outdated status descriptions with the actual `0.9.x` state: feature-complete for the
  documented React Native host scope, with a frozen proposed `1.0.0` API.
- Separate remaining `1.0.0` independent review and stability guarantees from already completed
  product implementation, package, conformance, performance, and platform evidence.
- Present the root and package documentation around implemented `0.9.0` behavior with exact A2UI
  Candidate, project-owned binding, MCP operation, native WebView, and host-integration profiles.

## 0.9.0 - 2026-09-02

Completes Milestone 9 with host-owned mixed native/WebView composition, a production-shaped
reference host, and the frozen `1.0.0` release-candidate API.

### Added

- A host-owned mixed-surface coordinator for fixed native A2UI and isolated MCP Apps sibling
  regions, with serialized activity, visibility, environment, focus, back, cancellation, crash,
  recovery, memory-pressure, and teardown lifecycle.
- A production-shaped generated React Native reference host combining primitives, typed
  design-system adapters, closed variants, media policy, a local Fabric component, and an isolated
  MCP Apps WebView with platform crash recovery.
- Exact generated-host matrices for React Native `0.87.0` and `0.87.1` across Hermes and community
  JavaScriptCore, including typecheck, Android/iOS bundles, and native platform builds.
- Human product, mixed-surface, support-matrix, compatibility, and `1.0.0` migration guides, plus a
  machine-verified public export and declaration baseline.
- Explicit `@mcp-native/a2ui/legacy`, `@mcp-native/react-native/legacy`, and `mcp-native/legacy`
  migration entry points.

### Changed

- `createMcpAppsNativeSandbox()` now returns an opaque, frozen factory-branded descriptor so mixed
  registrations reject copied or server-forged sandbox objects. Sandboxes, resources, and bridges
  are now bound by exact host-created object identity rather than URI equality alone.
- Mixed-surface lifecycle state is committed only after the corresponding host callback succeeds,
  so a failed activity, environment, focus, visibility, cancel, crash, or recovery callback can be
  retried without the coordinator publishing a transition the host did not apply.
- Raise the React Native peer minimum from `0.86.0` to `0.87.0`: the community JavaScriptCore
  integration is not compatible with the `0.86.0` runtime-factory API. iOS JSC lanes build React
  Native core and dependencies from source and repair the pinned `0.87.x` AppDelegate podspec flag
  separator; Hermes lanes retain prebuilt artifacts.
- Move repository CI actions to their Node.js 24-backed major versions.
- The proposed `1.0.0` API is frozen for release-candidate review. Deprecated custom A2UI `0.1`
  aliases remain at package roots throughout `0.9.x`, then move exclusively to the explicit
  `/legacy` subpaths at `1.0.0`.

### Security

- Mixed composition has no server-described layout, WebView configuration, navigation, raw bridge,
  or component-resolution channel; Apps regions retain the closed origin, storage, permission,
  navigation, message, and teardown policy.
- Callback failures publish bounded recoverable state, listener failures cannot break lifecycle
  serialization, disposal closes every Apps bridge, and cancelled regions cannot re-enter through
  crash reporting.

## 0.8.0 - 2026-09-01

Completes Milestone 8 with the full pinned A2UI basic catalog and an exact, locally compiled
host-extension boundary.

### Added

- Trusted-plan and mounted React Native support for `Video` and `AudioPlayer`, including typed host
  adapters and installed/policy-ready capability discovery.
- Deny-by-default media grants for exact source and redirect origins, MIME types, redirects,
  transfer bytes, autoplay, background playback, external routes, and user activation, with
  surface-wide instance and transfer budgets.
- A project-owned `io.mcp-native/a2ui-host-extensions` profile with exact extension, catalog,
  schema, and component negotiation; opaque registries; closed local prop/event schemas;
  platform, accessibility, resource/permission, complexity, fallback, and owner declarations; and
  inline catalogs disabled.
- Typed local React Native/Fabric registration, exact capability grants, schema-valid local events,
  and helper-derived advertisable extension catalogs without module, class, command, child, raw
  prop, or style resolution from server data.
- Generated Codegen/Fabric fixtures backed by UIKit and Android View, plus hostile-input,
  unavailable-platform, forged-event, update, instance, and resource-policy amplification tests.
- A [media and host-extension author guide](docs/media-and-host-extensions.md) and complete local
  compatibility manifest fixture.

### Changed

- Raise the tested React Native peer minimum from `0.76.0` to `0.86.0`; generated-host CI now tests
  the exact `0.86.0` minimum and current `0.87.1` latest boundary instead of adjacent patch lines.
- Run generated Android and iOS native builds for both React Native boundaries on pull requests,
  while retaining manual dispatch for independent preflight runs.
- Deep-freeze parsed host-extension schemas, validated semantic props, and host policy requests so
  compatibility fingerprints and authorization decisions cannot diverge through callback mutation.

### Security

- Reject unknown or mismatched extension identities and versions, forged registry and registration
  objects, open or externally referenced schemas, structural children or generic actions on leaf
  extensions, undeclared fields/events, unavailable platforms,
  over-granted capabilities, contradictory playback controls, unsafe origins or MIME types, and
  cumulative media/extension amplification before mounting.
- Keep native imperative commands host-only and require declared user activation for sensitive
  local extension events.

## 0.7.0 - 2026-09-01

Completes Milestone 7 with every non-media component in the pinned A2UI basic catalog, typed
design-system boundaries, exact installed-capability discovery, bounded image authorization, typed
renderer-local state, generated iOS/Android host coverage, and human-oriented capability guidance.

### Added

- Trusted-plan and mounted React Native support for the nine remaining non-media components in the
  pinned A2UI basic catalog: `Image`, `Icon`, `Divider`, `CheckBox`, `ChoicePicker`, `Slider`,
  `DateTimeInput`, `Tabs`, and `Modal`.
- Typed host adapters for every non-media semantic component, closed image and choice-picker
  variants, and exact installed-catalog capability discovery.
- Typed renderer-local boolean, number, date/time string, and string-array binding updates with
  validation and dispatch-time reconstruction.
- A deny-by-default image grant covering canonical HTTP(S) URLs, exact redirect origins, redirect
  count, transfer bytes, decoded dimensions/pixels, and cache mode; the installed host loader owns
  enforcement. Expanded plans additionally cap image count and the cumulative granted transfer-byte
  and decoded-pixel budgets before host loading.
- A complete non-media iOS/Android generated-host fixture and human-oriented capability guide.

### Changed

- The native icon boundary now accepts only pinned semantic names and rejects SVG paths, import
  names, font/glyph selection, and arbitrary platform symbols.
- The declared A2UI native component profile now contains 16 non-media basic-catalog components;
  `Video` and `AudioPlayer` remain planned for Milestone 8.

## 0.6.0 - 2026-09-01

Completes Milestone 6 with an issuer-bound protected-HTTP OAuth host boundary, explicit consent
gates and persistent host-owned grants, bounded connection lifecycle coordination, actionable
host states, redacted operations, and production integration guidance.

### Added

- A bounded consent policy for core `McpNativeRuntime.dispatch()` tool actions with explicit
  host-authored risk, capability, sensitive-data, and external-sharing descriptors.
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
- A non-blocking Expo Go integration policy with separate apps for the React Native primitives
  baseline and each selected common Expo Go-compatible component library. App results are reported
  independently from package and milestone gates.
- Mandatory host authorization before MCP Apps tool callbacks and a serialized A2UI v1 action
  delivery gate that isolates policy input from transport input. MCP Apps bridges permit only one
  tool authorization and delivery at a time so concurrent View requests cannot amplify prompts.
- Optional policy review for direct core `callTool()` operations plus bounded, host-keyed,
  persistent consent grants with expiry and explicit revocation.
- Persistent resource/issuer-bound OAuth scope history for cross-request step-up decisions.
  A durable state-bound pending-authorization record preserves omitted callback scopes across
  process recovery, while refreshes inherit only previously granted scopes.
- A bounded official-SDK connection lifecycle coordinator with timeout, cancellation, exponential
  backoff, offline/reconnection/shutdown behavior, actionable host states, and fixed data-free
  operational events for logs, metrics, and traces.
- A production host checklist covering catalogs, action/permission policy, binding state, errors,
  transport/OAuth configuration, token non-forwarding, diagnostics redaction, and cleanup.

### Security

- Deny unknown tool/argument consent profiles, incomplete privacy declarations, overlapping consent
  reviews, malformed host descriptors, and non-boolean decisions without trusting server
  annotations; grants are retained only through the explicit bounded host-owned wrapper.
- Treat persisted consent grants, OAuth scope history, and pending authorization records as
  untrusted, bind them to host-authored keys or exact resources/issuers, and reject malformed,
  substituted, oversized, or expired state. Consent revocation serializes with grant persistence.
- Keep lifecycle diagnostics free of raw errors, URLs, credentials, tokens, server payloads, user
  payloads, and arbitrary labels.
- Bound complete MCP SDK results, downstream A2UI result collections, decoded JSON string/key
  totals, sequential cumulative A2UI lifecycle-batch work, and cumulative state retained by one
  surface store; overlapping action delivery is rejected before parsing.
- Validate complete MCP Apps content annotations, icons, sizes, metadata objects, and resource-link
  fields before host callbacks, and make CSP insertion scan quoted start-tag attributes correctly.
- Apply A2UI component updates without repeatedly reconstructing every retained component.
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
- Restrict every registered redirect URI to HTTPS app links, HTTP loopback URLs, or hierarchical
  private-use app schemes; reject issuer query/fragment components and literal empty fragments on
  server, redirect, authorization, and callback URLs; and bound both individual and cumulative token
  values before parsing, persistence, or request reuse.
- Bound dynamic client-registration records and authorization discovery metadata by value size,
  cumulative text, collection width, depth, and total structure before schema parsing, persistence,
  caching, or reuse.
- Apply the same structural and cumulative bounds to complete token responses, including
  schema-permitted extension fields, before parsing, persistence, or reuse.
- Reject own `undefined` values in bounded OAuth token, registration, and discovery structures
  instead of treating them as JSON `null`.
- Require authorization-server endpoint and URI fields retained from discovery to use HTTPS or an
  HTTP loopback address and contain no fragment before the provider caches or returns them.
- Reject empty and non-empty fragments on fetched or cached protected-resource metadata URLs.
- Bound server-controlled protected-resource identifiers before URL parsing and serialize OAuth
  authorization cleanup so overlapping cancellation cannot erase a newly started attempt.
- Reject configured redirects that cannot fit bounded OAuth callback names, values, required
  response fields, or total URL size.
- Bind each reserved authorization attempt to one PKCE verifier and one browser handoff, require
  both state and verifier before that handoff, and reject callback completion while state/verifier
  setup or the browser handoff is still active.
- Fail closed with controlled OAuth errors when a custom secure store returns a non-object
  registration, token response, or discovery-state root.
- Validate the complete host storage/callback contract and reject non-string state, verifier, and
  secure-store namespace values without JavaScript regular-expression coercion.
- Apply the reference store's issuer-length limit in the provider before issuer URL parsing,
  persistence, or reuse.
- Classify malformed or insecure issuers and discovery endpoints from OAuth storage as storage
  failures instead of host configuration failures.
- Convert malformed protected-resource identifiers into controlled OAuth storage errors before
  they reach URL matching.
- Classify malformed platform and process-recovery callback URLs as `invalid-callback` rather than
  host configuration failures.
- Resolve the public `@mcp-native/mcp/oauth` subpath through its ESM export condition from the
  packed consumer during package smoke verification.
- Keep the OS authorization-session adapter exclusive until callback token exchange finishes.
- Reserve one authorization attempt before state persistence so overlapping flows cannot replace its
  state or verifier, and apply total, count, name, and value limits to both native-session and direct
  process-recovery callbacks before code redemption. Direct recovery also reserves the persisted
  attempt while it atomically claims state, clears its verifier, and then releases the state slot.
- Serialize state save, claim, release, and full invalidation across reference-store objects using
  the same fixed namespace in one JS runtime, so duplicate instances cannot both accept one callback
  state or reserve a new attempt during verifier cleanup.
- Make the store state reservation exclusive per namespace so a second provider, or a duplicate
  store object over one backend, cannot overwrite a live attempt's redirect state. Cancellation
  releases the reserved slot even when an earlier process persisted it, without deleting
  registrations or tokens.
- Reject direct cancellation while state setup, a system authorization handoff, or callback
  completion is active, preventing cleanup from racing the attempt's state and PKCE verifier.
- Bind each live state reservation to its provider so another provider sharing the namespace cannot
  cancel the active handoff or delete its PKCE verifier; allow stale cleanup only when no live owner
  remains after process restart.
- Apply the same active-flow and ownership checks to full or verifier credential invalidation so
  neither can bypass authorization cancellation serialization.
- Bound authorization URLs before reparsing or copying them into the host opener, and accept the
  complete IPv4 `127.0.0.0/8` loopback range for native OAuth endpoints and redirects.
- Reject registered redirect URIs with duplicate query parameter names instead of accepting a
  configuration that no callback could satisfy.

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
component variants, accessibility semantics, and automated robustness gates.

### Added

- Complete pinned renderer-to-agent envelope parsing for `action`, `callAgentFunction`,
  `rendererFunctionResponse`, and `error`, with schema-derived interoperability fixtures and exact
  public envelope types.
- A feature-scoped A2UI v1 Candidate conformance profile covering the supported subset, explicit
  exclusions, Candidate interpretations, interoperability fixtures, and custom `0.1` migration.
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
  enabled text scaling, and shared platform scenarios for separate integration PoCs.
- A pinned native accessibility fixture and initial React Native, iOS, and Android target test matrix
  for consistent primitive, adapter, variant, dynamic-list, validation, and screen-reader runs.
- A fixed A2UI performance regression gate for maximum-size parsing and render-plan construction,
  rapid ordered updates, and retained heap, with a documented reproducible measurement method.
- Deterministic generated-input coverage for both A2UI envelope directions, lifecycle state,
  dynamic-list plans, and hostile graph, component, binding, and function-policy mutations.
- A temporary official React Native host generator pinned to `0.87.1` and `0.86.3`, with primitive,
  typed-adapter, and closed-variant accessibility catalog paths plus Android/iOS Metro and native
  build preflight workflows.
- A WCAG 2.2 responsibility assessment separating library-enforced behavior from host and
  component-library integration checks.
- Reproducible Android 17 native preflight using the exact API 37 SDK package, plus a safe-area-aware
  accessibility fixture that avoids status-bar overlap and an extra root screen-reader focus target.
- A generated iPhone fixture supporting portrait and both landscape orientations.

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
