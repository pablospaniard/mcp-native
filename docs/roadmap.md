# Roadmap

This roadmap replaces feature-first growth with standards-first milestones. MCP Native is still pre-1.0, so protocol-facing APIs may change rather than preserving an incompatible proof-of-concept wire format.

## What remains valid

The standards review does not require starting over. Keep and evolve:

- the protocol-independent package boundary in `@mcp-native/core`;
- the official SDK adapter boundary in `@mcp-native/mcp`;
- strict validation and fail-closed errors;
- the internal trusted render plan and host-owned React Native catalog;
- the rule prohibiting downloaded React Native code;
- isolated HTML policy primitives;
- CI, protected-branch workflow, package smoke tests, and npm provenance.

The custom `@mcp-native/a2ui` `0.1` object remains useful as a proof and test fixture, but it must not grow into a competing public protocol. Only security and correctness fixes should land on that wire shape while the conforming adapter is built.

## Integration PoC policy

React Native integration validation is developed independently from package releases as a set of
small Expo Go apps. Maintain one focused PoC per commonly used, Expo Go-compatible React Native
component library, plus a React Native primitives baseline. Each app pins its library and Expo SDK
versions and exercises the same representative surface, adapter mapping, interaction, and
accessibility scenarios. Extend the existing app when a library's coverage grows instead of adding
parallel apps for the same library.

PoC results are informative compatibility demonstrations. They never block package releases,
milestone completion, or protocol claims, and the package documentation must not imply support for
libraries that have not been exercised. Libraries that require custom native modules are outside
the Expo Go PoC matrix until they offer an Expo Go-compatible path.

Package behavior still requires automated unit, integration, conformance, and smoke coverage. PoC
apps supplement those tests; they do not replace them. Protocol examples and hostile inputs used by
automated tests remain fixtures, not additional example applications.

## Milestone 0: proof-of-concept architecture

Status: complete.

- Transport-neutral runtime contracts
- Official TypeScript SDK v2 adapter
- Strict resource and surface validation
- Trusted native render plan
- Host-owned React Native renderer and hooks
- Deny-by-default HTML document primitive with inline opt-in, http(s)-only remote loads, and required origin allowlists
- CI, contribution controls, coordinated packages, and provenance releases
- Explicit standards and compatibility inventory

## Milestone 1: MCP `2026-07-28` conformance foundation

Status: complete for RFC-0001's initial client boundary.

- [x] Declare the complete supported core revision and backwards-compatibility policy.
- [x] Preserve official tool, content, resource, schema, annotation, `_meta`, and cache semantics across the initial `@mcp-native/mcp` and `@mcp-native/core` boundary.
- [x] Replace the lossy generic `{ type, data }` representation with official discriminated content types.
- [x] Delegate transport framing, per-request envelopes, headers, cancellation, and protocol-version behavior to official SDK v2.
- [x] Test real `2026-07-28` behavior through the SDK HTTP handler/fetch path.
- [x] Retain linked in-memory tests only as explicit older-protocol compatibility coverage.
- [x] Pin and run the applicable official MCP conformance scenarios; never rely on an unversioned suite result.
- [x] Add official fixture ingestion and cross-principal cache-scope isolation tests.

Exit criterion: the supported MCP operations pass documented `2026-07-28` scenarios without losing fields needed by A2UI or MCP Apps.

## Milestone 2: extension and capability substrate

Status: complete.

- [x] Represent MCP extension settings in the core boundary.
- [x] Negotiate extensions explicitly and implement graceful text/data fallback.
- [x] Preserve reserved and extension metadata without granting capabilities automatically.
- [x] Define the non-official A2UI-over-MCP binding under the project-owned `io.github.pablospaniard/mcp-native-a2ui` identifier; never use the reserved `io.modelcontextprotocol` namespace.
- [x] Document the [exact transport mapping](a2ui-mcp-binding.md) for ordered A2UI messages and capability exchange.

Exit criterion: UI protocols can determine mutual support without guessing from MIME types or tool results.

## Milestone 3: A2UI v1.0 Candidate adapter

Status: complete for the documented feature-scoped Candidate profile.

- [x] Verify a pinned official JSON Schema bundle.
- [x] Parse official `v1.0` agent-to-renderer lifecycle envelopes (`createSurface`, `updateComponents`, `updateDataModel`, `deleteSurface`) and every pinned renderer-to-agent message kind.
- [x] Implement ordered create, component update, data-model update, and delete behavior.
- [x] Validate the pinned catalog identity, host component/event/function allowlists, reachable graph references and cycles, JSON Pointer syntax, template-relative bindings, and beyond-schema placement rules before rendering.
- [x] Parse and validate literal `formatString` sources, including nested bindings and named function calls, against the pinned catalog, template context, host allowlist, and explicit complexity limits; reject runtime-provided format sources.
- [x] Validate closed renderer and agent capability metadata beyond schema checks, require normative catalog declarations, negotiate exact catalog overlap, and keep inline catalogs disabled.
- [x] Expand bounded dynamic `List` templates, resolve template-relative bindings into renderer-local state, evaluate `@index`, and retain template-instance identity through dispatch-time action resolution.
- [x] Execute literal `formatString` with bounded interpolation, official JSON coercion, nested supported expressions, renderer-local state, and `@index` offsets.
- [x] Execute host-localized `formatNumber` and `formatCurrency` with dynamic arguments, bounded output, validated locale/precision/currency options, nested interpolation, and dispatch-time state.
- [x] Execute host-localized `formatDate` for strict Candidate date inputs and its documented Unicode token subset, with bounded patterns, nested interpolation, and dispatch-time state.
- [x] Execute host-localized `pluralize` and pure `and`, `or`, and `not` with dynamic arguments, strict operand types, bounded output, nested calls, and dispatch-time state.
- [x] Execute `required`, bounded `regex`, `length`, `numeric`, and `email`; evaluate renderer checks for supported `TextField` and `Button` components, expose field messages to host components, and make invalid buttons undispatchable.
- [x] Execute bounded HTTP(S) `openUrl` through a synchronous host policy and host opener only from the originating Button press.
- [x] Adapt the supported component subset, container alignment, absolute data bindings, dynamic lists, supported formatting and validation functions, supported renderer checks, and `openUrl` into the existing trusted native render plan.
- [x] Add official protocol fixtures, schema-derived bidirectional fixtures, negative fixtures, and lifecycle tests for the implemented profile.
- [x] Publish the exact [feature-scoped conformance profile](a2ui-v1-conformance.md), exclusions, Candidate interpretations, and interoperability coverage.
- [x] Deprecate and freeze the custom `0.1` parser, resolver, types, and React Native renderer with an explicit v1 migration path.

Exit criterion: conformance is reported per implemented A2UI feature against the pinned Candidate revision; the custom `0.1` input is deprecated or made explicitly internal.

## Milestone 4: production native renderer behavior

Status: complete for `0.4.0` — renderer-local state, action-envelope emission, closed accessibility
semantics, a generated platform fixture, a WCAG assessment, CI performance/fuzz gates, and recorded
Android 17 emulator and iOS 26.5 simulator results.

- [x] Add renderer-local data-model updates without network calls on each keystroke.
- [x] Resolve A2UI action context at dispatch time and construct the pinned official renderer-to-agent action envelope; transport delivery remains host-owned.
- [x] Add typed host adapters that map the trusted `View`, `Text`, `Button`, and `TextInput` primitive props into locally bundled third-party component APIs without expanding the wire catalog.
- [x] Add richer host-owned components and styling through closed semantic/style variant slots,
      primitive fallbacks, and explicit prop selection without unchecked prop spreading.
- [x] Mount explicit label, description, live-region, and hidden accessibility attributes for the supported subset, with inferred button and input labels.
- [x] Derive closed text and button roles, button disabled state, hidden-element focus exclusion, and explicit Text/TextInput font scaling at the host boundary; add regression coverage and a real-platform test plan.
- [x] Define the initial iOS, Android, and React Native target test matrix and add one pinned fixture that exercises base primitives, adapters, variants, dynamic lists, validation, and screen-reader semantics.
- [x] Execute the fixture across the release matrix; test TalkBack plus iOS accessibility semantics, dynamic type, focus structure, reduced motion, contrast, touch targets, orientation, and accessibility actions.
- [x] Establish [parse, update, render-plan, and retained-memory budgets](a2ui-v1-performance.md) for supported surface sizes, with large-surface and rapid-update stress tests.
- [x] Add deterministic fuzz and property tests for bidirectional protocol parsing, lifecycle state, render-plan conversion, and renderer failure paths.
- [x] Assess applicable [WCAG 2.2 Level AA outcomes](wcag-2.2-native-assessment.md), record the passing fixture results, and separate library and host responsibilities.

Exit criterion: the supported A2UI subset remains within documented accessibility and performance
limits without weakening the component or capability boundary. Library-specific rendering is
demonstrated separately through the non-blocking Expo Go PoCs.

## Milestone 5: stable MCP Apps compatibility

Status: complete for the documented native host-adapter profile pinned to MCP Apps `2026-01-26` and
official SDK `1.7.5` schemas.

- [x] Implement `io.modelcontextprotocol/ui` capability negotiation.
- [x] Preserve `_meta.ui.resourceUri`, visibility, CSP, permissions, and related UI metadata.
- [x] Require `ui://` resources and `text/html;profile=mcp-app` for the stable Apps profile.
- [x] Implement the same pinned, schema-shaped JSON-RPC lifecycle because official AppBridge targets
      the v1 MCP SDK and browser window transport rather than this repository's v2/native boundary.
- [x] Build a platform WebView sandbox descriptor and closed React Native WebView prop adapter with
      explicit origin, navigation, storage, external-link, download, and device-permission policy.
- [x] Record where native WebView isolation differs from browser iframe guarantees.
- [x] Add hostile-bridge interoperability tests against official protocol schemas and fixtures.

Exit criterion: complete. `@mcp-native/webview` satisfies the documented stable native host-adapter
profile and fails closed for unsupported methods, resource shapes, capabilities, permission grants,
and platform controls. See [the exact compatibility profile](mcp-apps-compatibility.md).

## Milestone 6: remote authorization and release readiness

Status: in progress. The issuer-bound interactive OAuth host boundary, every scored official
`2026-07-28` authorization client scenario, and dependency-neutral platform reference adapters are
implemented. Broader host controls, lifecycle/operability, and the Expo Go integration PoCs remain
open.

- [x] Add an official SDK v2 interactive OAuth provider with a host secure-storage contract, PKCE
      and state persistence, exact callback validation, issuer-bound registrations/tokens, validated
      redirect-bound discovery state with post-callback refresh, and an exact RFC 8707 resource
      indicator. Redirect schemes, issuer components, and individual/cumulative registration,
      discovery, and token sizes fail closed before parsing, browser handoff, persistence, caching,
      or reuse; actionable discovered endpoints require fragment-free HTTPS or HTTP loopback;
      every registered redirect URI is validated, duplicate configured query names are rejected,
      redirects must leave bounded capacity for the authorization response, and literal empty
      fragments fail closed; one-attempt reservation remains held from callback
      claim through verifier cleanup and is bound to its live provider, while cancellation locking
      also covers full and verifier invalidation, authorization URLs are bounded before handoff, and
      callback budgets cover native-session and process-recovery paths. Browser handoff requires
      reserved state and exactly one saved PKCE verifier for the attempt.
- [x] Add the protected Streamable HTTP factory without issuer-validation opt-outs or manual
      credential headers, and surface `insufficient_scope` to the host before step-up authorization.
- [x] Pass and pin every applicable official MCP `2026-07-28` authorization client scenario before
      claiming the complete protected Streamable HTTP profile.
- [x] Add bounded platform keychain/keystore and OS authentication-session reference adapters; the
      library contract deliberately cannot treat AsyncStorage or plain files as secure storage or
      use an embedded WebView for authorization. Same-namespace store objects serialize state
      operations in one JS runtime so duplicate instances cannot both consume one callback state.
- [ ] Add broader consent, tool-risk review, capability approval, privacy controls, and host
      integration guidance for persistent cross-request scope-upgrade tracking. The transport now
      defaults to throwing on `insufficient_scope`; its opt-in retry path requires a host approval
      callback and caps SDK work to one retry per request.
- [ ] Define production connection lifecycle behavior for timeouts, cancellation, bounded retry and
      backoff, reconnection, offline transitions, and graceful shutdown while leaving wire behavior
      to the official SDK.
- [ ] Add structured logs, metrics, and traces with explicit credential, token, server-data, and
      user-data redaction rules.
- [ ] Provide actionable loading, empty, denied, disconnected, retryable, and terminal error states
      for host applications.
- [ ] Publish a host-integration checklist covering component catalogs, action policies,
      permissions, binding state ownership, error handling, transport configuration, token
      non-forwarding, and lifecycle cleanup.
- [x] Continue npm trusted publishing with OIDC, provenance, protected release environments, and
      exact version verification.
- [ ] Maintain a separate Expo Go PoC for the React Native primitives baseline and each selected
      common Expo Go-compatible component library, and document the exact versions exercised.

Exit criterion: a release candidate passes protocol, security, accessibility, performance,
reliability, operability, package, and end-to-end interoperability gates. Expo Go PoC status is
reported separately and is not an exit criterion.
