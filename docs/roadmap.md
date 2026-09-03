# Roadmap

MCP Native has completed Milestones 0–9. The low-level React Native, A2UI, MCP Apps, MCP SDK, and
policy boundaries planned for 1.0 are in place. Milestone 10 now includes a high-level host package
so a consumer can connect a compatible MCP server, call a tool, and automatically render a supported
standard result or safe ordinary-content fallback without manually composing those layers. Final
review, validation, migration, documentation, and publication follow that host-package work.

## Path from `0.9.x` to `1.0.0`

The `1.0.0` target is a production-ready React Native host library with both high-level and low-level
adoption paths. The high-level `@mcp-native/host` package owns standard MCP connection, negotiation,
tool-result classification, resource resolution, lifecycle, and rendering orchestration. Existing
focused packages remain available to applications that need direct control. The renderer continues
to use components compiled into the host application, and MCP Apps HTML remains inside its separate
WebView policy boundary.

The product boundary is:

| Layer                  | Server may describe                                                       | Host application owns                                                                               |
| ---------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| A2UI surface           | Negotiated catalog components, bindings, validation, and declared actions | Component implementations, semantic variants, theme tokens, accessibility, and action delivery      |
| Host shell             | Content intended for a host-selected region                               | Screens, safe areas, navigation, status and keyboard UI, placement, and surface lifecycle           |
| Sensitive capabilities | A validated request supported by the negotiated profile                   | Origin and resource policy, permissions, consent, user activation, and platform APIs                |
| Host extensions        | A namespaced, versioned semantic component already advertised by the host | Registration, schema, implementation, prop/event mapping, limits, fallback, and platform support    |
| MCP Apps               | A validated `ui://` MCP App resource                                      | Isolated WebView creation, placement, bridge policy, navigation, storage, permissions, and teardown |

The release sequence is cumulative. The first three rows are shipped; the 0.9 line is now the
candidate for the stable contract:

| Release      | Outcome                                                                                        | Release gate                                                                                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0.7.0`      | Complete the non-media A2UI basic-catalog renderer and stable design-system boundary           | Every supported component passes schema, hostile-input, interaction, accessibility, and iOS/Android fixture coverage                                                         |
| `0.8.0`      | Add policy-gated media and compiled host-extension components                                  | The complete pinned basic catalog is covered, and no server value can resolve code, native classes, commands, or unchecked props                                             |
| `0.9.0`      | Deliver mixed native/WebView hosting and freeze the proposed public API                        | One production-shaped reference host passes lifecycle, isolation, accessibility, performance, migration, and package-consumer tests                                          |
| `0.9.x`      | Polish the candidate with package checks, documentation, and an optional Expo Go example       | The coordinated package artifacts pass repository and native-host checks; the example is not a package release gate                                                          |
| `1.0.0`      | Ship plug-and-play standard-result hosting and publish the reviewed stable contract            | A consumer can connect, call, and safely render supported results through one host API; no release-blocking review, compatibility, documentation, or conformance gaps remain |
| Post-`1.0.0` | Add contract extensibility, native renderers and capabilities, and protocol-profile expansions | Every new contract, renderer, capability, and protocol feature remains namespaced, versioned, explicitly installed or negotiated, bounded, tested, and fail-closed           |

## Deliberate `1.0.0` scope

- The host supplies all React Native packages, platform classes, components, props, styles, and
  commands.
- The host owns navigation, safe areas, status bars, application screens, and the surrounding app
  shell.
- A2UI native regions and MCP Apps WebViews compose as host-created siblings with separate policy
  boundaries.
- `@mcp-native/host` composes the official MCP adapter, runtime, supported A2UI and MCP Apps paths,
  ordinary MCP fallback, React Native mounting, lifecycle, and error states behind one documented
  workflow without moving SDK, renderer, or WebView dependencies into `@mcp-native/core`.
- The v1 host automatically handles only its documented built-in standard profiles. A public registry
  for additional standard revisions and application-defined custom input contracts begins after
  `1.0.0`; v1 never guesses or silently converts an unknown server format.
- Compatibility is reported against exact pinned MCP, A2UI, and MCP Apps profiles plus the React
  peer requirement and automated native-host, iOS, and Android integration fixtures.
- First-class SwiftUI and Jetpack Compose renderers begin after the stable React Native release.

UIKit, Android View, SwiftUI, and Compose implementations may still be used when the application
deliberately exposes them to React Native through a locally compiled Fabric component and maps that
component through the host-extension boundary. That is host integration, not server-selected native
resolution. First-class SwiftUI and Jetpack Compose renderers are a committed post-`1.0.0` track;
they must reuse the protocol-independent core and trusted semantic boundary rather than introducing
React Native dependencies into `@mcp-native/core`.

## Architecture retained through the roadmap

The standards review confirmed these foundations, which remain part of the frozen contract:

- the protocol-independent package boundary in `@mcp-native/core`;
- the official SDK adapter boundary in `@mcp-native/mcp`;
- strict validation and fail-closed errors;
- the internal trusted render plan and host-owned React Native catalog;
- the rule prohibiting downloaded React Native code;
- isolated HTML policy primitives;
- CI, protected-branch workflow, package smoke tests, and npm provenance.

The custom `@mcp-native/a2ui` `0.1` object remains useful only for migration. It is deprecated and
frozen except for security and critical correctness fixes. Milestone 9 isolates it behind explicit
`/legacy` subpaths; the current release candidate removes its deprecated package-root aliases.

## Integration proof

The maintained [Expo Go todo app](../examples/expo-go-todolist/README.md) is the runnable React
Native primitives proof. The [City Canvas example](../examples/expo-go-mixed-surfaces/README.md)
adds a two-screen mixed-hosting proof with native A2UI, an isolated MCP Apps WebView, a stable bridge,
and a policy-approved tool call. Both pin their application dependencies for local reproduction;
those fixture versions do not define package dependencies or framework support boundaries.

Package behavior still requires automated unit, integration, conformance, generated-host, and smoke
coverage. The Expo app supplements those tests with an approachable end-to-end workflow; it does
not create a version-by-version certification matrix. Protocol examples and hostile inputs used by
automated tests remain fixtures, not additional example applications.

## Milestone 0: architecture foundation

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

Status: complete for RFC-0001's documented client boundary.

- [x] Declare the complete supported core revision and backwards-compatibility policy.
- [x] Preserve official tool, content, resource, schema, annotation, `_meta`, and cache semantics across the documented `@mcp-native/mcp` and `@mcp-native/core` boundary.
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

Status: complete for `0.4.0` package behavior — renderer-local state, action-envelope emission,
closed accessibility semantics, a generated platform fixture, a WCAG responsibility assessment,
and CI performance/fuzz gates. Application-level behavior is demonstrated by the Expo Go todo app.

- [x] Add renderer-local data-model updates without network calls on each keystroke.
- [x] Resolve A2UI action context at dispatch time and construct the pinned official renderer-to-agent action envelope; transport delivery remains host-owned.
- [x] Add typed host adapters that map the trusted `View`, `Text`, `Button`, and `TextInput` primitive props into locally bundled third-party component APIs without expanding the wire catalog.
- [x] Add richer host-owned components and styling through closed semantic/style variant slots,
      primitive fallbacks, and explicit prop selection without unchecked prop spreading.
- [x] Mount explicit label, description, live-region, and hidden accessibility attributes for the supported subset, with inferred button and input labels.
- [x] Derive closed text and button roles, button disabled state, hidden-element focus exclusion, and explicit Text/TextInput font scaling at the host boundary; add regression coverage and a real-platform test plan.
- [x] Define the minimum React Native support gate and iOS/Android fixtures that exercise base primitives, adapters, variants, dynamic lists, validation, and screen-reader semantics.
- [x] Define shared TalkBack and iOS accessibility, dynamic type, focus, contrast, touch-target, orientation, and action scenarios for the Expo Go proof.
- [x] Establish [parse, update, render-plan, and retained-memory budgets](a2ui-v1-performance.md) for supported surface sizes, with large-surface and rapid-update stress tests.
- [x] Add deterministic fuzz and property tests for bidirectional protocol parsing, lifecycle state, render-plan conversion, and renderer failure paths.
- [x] Assess applicable [WCAG 2.2 Level AA responsibilities](wcag-2.2-native-assessment.md) and separate library and host responsibilities.

Exit criterion: the supported A2UI subset remains within documented accessibility and performance
limits without weakening the component or capability boundary. The Expo Go todo app demonstrates
the primitives workflow at application level.

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

Status: complete for `0.6.0` package behavior. The issuer-bound interactive OAuth host boundary,
every scored official `2026-07-28` authorization client scenario, dependency-neutral platform
reference adapters, policy gates at current action boundaries, persistent host controls, bounded
lifecycle coordination, actionable states, redacted operations, and host integration guidance are
implemented. The Expo Go todo proof supplies separate runnable native application evidence.

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
- [x] Add a bounded consent policy for core `McpNativeRuntime.dispatch()` tool actions with explicit
      host-authored risk, capability, sensitive-data, and external-sharing descriptors. Unknown
      tools and arguments, incomplete descriptors, non-boolean decisions, and overlapping review
      prompts fail closed; server tool annotations remain non-authorizing and no approval is retained.
- [x] Integrate broader consent UX and policy guidance at direct trusted tool calls, MCP Apps host
      callbacks, A2UI v1 action delivery, and other host action boundaries, including expiring,
      revocable grants and persistent cross-request scope-upgrade tracking. The transport defaults
      to throwing on `insufficient_scope`; its opt-in retry path requires a host approval callback and
      caps SDK work to one retry per request. MCP Apps tool review/delivery is single-flight, and
      OAuth responses that omit scope preserve durable state-bound authorization scopes during
      callback completion, including process recovery, or previously granted scopes during refresh.
- [x] Define production connection lifecycle behavior for timeouts, cancellation, bounded retry and
      backoff, reconnection, serialized offline/online/shutdown transitions, and graceful shutdown
      while leaving wire behavior to the official SDK.
- [x] Add structured logs, metrics, and traces with explicit credential, token, server-data, and
      user-data redaction rules.
- [x] Provide actionable loading, empty, denied, disconnected, retryable, and terminal error states
      for host applications.
- [x] Publish a host-integration checklist covering component catalogs, action policies,
      permissions, binding state ownership, error handling, transport configuration, token
      non-forwarding, and lifecycle cleanup.
- [x] Continue npm trusted publishing with OIDC, provenance, protected release environments, and
      exact version verification.
- [x] Maintain a runnable Expo Go primitives proof with a complete todo workflow, three screenshots,
      exact app dependencies, package walkthrough, and focused tests.
- [x] Maintain a two-screen Expo Go mixed-surface proof with a native A2UI region, isolated MCP Apps
      WebView, host-authorized bridge action, lifecycle coordination, screenshots, and focused tests.

Exit criterion: met by the `0.6.0` package candidate, which passes protocol, security,
accessibility, performance, reliability, operability, package, and end-to-end interoperability
gates. The Expo Go proof is maintained as complementary application evidence rather than a package
release exit criterion.

## Milestone 7: non-media A2UI catalog and design systems (`0.7.0`)

Status: released in `0.7.0`.

- [x] Implement trusted render-plan and React Native mappings for `Image`, `Icon`, `Divider`,
      `CheckBox`, `ChoicePicker`, `Slider`, `DateTimeInput`, `Tabs`, and `Modal` from the pinned basic
      catalog. Continue rejecting every undeclared component and property.
- [x] Define deny-by-default image resource policy: accepted schemes, exact origins, redirects,
      credentials, maximum URI and decoded dimensions, per-surface image/byte/pixel totals, caching
      responsibility, and failure placeholders remain host-controlled.
- [x] Use host-owned icon identifiers or exact mappings. Never treat an agent value as an import,
      glyph font name, SVG payload, or arbitrary platform symbol.
- [x] Add renderer-local state, validation, event reconstruction, and dispatch-time revalidation for
      every new interactive component, with cumulative work and output limits.
- [x] Specify focus, dismissal, escape/back behavior, focus restoration, and accessibility semantics
      for tabs, modals, inputs, images, and icon-only controls.
- [x] Generalize the existing typed component adapters and closed variant slots to the new semantic
      components. Permit design-system components and semantic theme tokens, but not server-supplied
      React Native style objects or unchecked prop spreading.
- [x] Advertise only the component and function subset for which the host installed complete
      implementations and policies; missing optional adapters must fail capability negotiation or
      surface validation before mounting.
- [x] Add generated iOS and Android host fixtures using built-in React Native mappings where they
      exist, explicit host adapters for the remaining controls, and at least one representative
      design-system mapping. Keep the Expo Go proof informative and non-blocking.
- [x] Update the A2UI conformance profile, standards matrix, human-oriented capability guide,
      package READMEs, migration notes, and changelog with exact supported and excluded fields.

Exit criterion: met by the `0.7.0` release. A host can render every non-media component in the pinned A2UI basic catalog with
closed props and documented native behavior, while component implementations and visual design
remain entirely application-owned.

## Milestone 8: media and host extensions (`0.8.0`)

Status: released in `0.8.0`.

- [x] Implement `Video` and `AudioPlayer` with explicit source, redirect, origin, MIME, size,
      autoplay, background playback, external-route, and user-activation policies. Unsupported
      platform controls fail closed.
- [x] Define a project-owned, versioned host-extension profile without enabling server-provided
      inline catalogs. An extension identity must be namespaced and must match an exact catalog and
      schema version advertised by both host and server.
- [x] Require each extension to declare closed JSON schemas for inputs and emitted events, platform
      availability, accessibility behavior, resource and permission needs, complexity limits,
      fallback behavior, and compatibility ownership.
- [x] Provide typed registration helpers that map validated semantic props and events to a locally
      imported React Native or Fabric component. Do not accept module paths, component classes,
      generic command dispatch, arbitrary children, or raw prop/style passthrough from wire data.
      Parsed schemas, semantic props, and policy requests are immutable snapshots.
- [x] Keep imperative native commands host-only unless a specific command is separately modeled as
      a validated, policy-gated semantic action with user activation where required.
- [x] Add one UIKit-backed iOS fixture and one Android View-backed fixture through Fabric. A
      SwiftUI- or Compose-backed wrapper may be demonstrated, but it is not a direct renderer or a
      portability guarantee. The pinned generated host compiles these native fixtures with the
      default engine automatically on pull requests without defining a framework version boundary.
- [x] Add negative and amplification tests for unknown extension IDs and versions, malformed props,
      forged events, unavailable platforms, oversized graphs and values, excessive updates, and
      permission or resource-policy bypass attempts.
- [x] Publish an [extension-author guide and compatibility manifest format](media-and-host-extensions.md) that clearly assigns
      implementation, versioning, security, and accessibility responsibility to the host author.

Exit criterion: met by the `0.8.0` release. The full pinned basic catalog is implemented, and an
application can safely expose one locally compiled semantic component without giving the server a
code-resolution, native-command, unchecked-prop, or capability-escalation path.

## Milestone 9: mixed hosting and API freeze (`0.9.0`)

Status: released in `0.9.0`.

- [x] Define a host-owned surface coordinator that can place native A2UI and isolated MCP Apps
      WebView surfaces in the same application screen as sibling regions. A2UI content cannot create,
      configure, navigate, or send raw bridge messages to a WebView.
- [x] Specify lifecycle ownership for creation, visibility, backgrounding, focus transfer, back
      handling, cancellation, crash recovery, teardown, and memory pressure across mixed surfaces.
- [x] Preserve the existing MCP Apps origin, navigation, bridge-message, storage, download, external
      link, permission, and teardown isolation for every WebView region.
- [x] Add cross-surface accessibility order, focus, reduced-motion, dynamic-type, orientation, and
      keyboard scenarios without implying one shared accessibility tree where platforms cannot
      provide it.
- [x] Build one production-shaped reference host demonstrating React Native primitives, a mapped
      design system, a Fabric-backed host extension, and native plus MCP Apps regions together.
- [x] Publish a short human-oriented guide covering what the packages do, the end-to-end server/host
      flow, component and styling ownership, supported renderers, WebView tradeoffs, and safe extension
      examples before the API reference.
- [x] Audit all public exports, package boundaries, dependency directions, declaration output,
      error types, wire names, defaults, and deprecations. Publish the proposed `1.0.0` compatibility
      and migration policy and freeze the release-candidate API.
- [x] Decide and document removal or isolation of the deprecated custom A2UI `0.1` proof surface;
      it must not remain ambiguous with the supported A2UI v1 Candidate profile in `1.0.0`.
- [x] Run package-consumer fixtures against the declared React Native minimum, React, TypeScript,
      Node.js, iOS, Android, New Architecture, and default JavaScript engine, with exact ranges and
      the automated baseline recorded.

Exit criterion: met by the `0.9.0` release. The release-candidate API is frozen, the reference host
exercises the promised native, extension, and mixed-WebView flows, and adopters can understand and
integrate the package without reading its implementation.

## Milestone 10: stable release (`1.0.0`)

Status: host-package implementation and release preparation.

GitHub tracking: [milestone](https://github.com/pablospaniard/mcp-native/milestone/1) ·
[host-package issue #90](https://github.com/pablospaniard/mcp-native/issues/90)

The [`1.0.0` readiness checklist](1.0-readiness.md) separates checks already enforced in the
repository from the new host-package work, remaining independent reviews, migration step, and final
publication actions.

The `@mcp-native/host` workspace now includes a headless controller and an optional React Native
provider/result renderer above its closed, bounded result resolver. It owns fresh connection units,
automatic tool discovery, calls, cancellation, reconnect, stale-result rejection, teardown, and
bounded immutable snapshots. Calls use only the exact tool definition and extension snapshots
discovered on the active connection, then render A2UI, MCP Apps, ordinary, or invalid without
cross-format retry. A single fail-closed application action policy supplies the protocol-specific
A2UI delivery and MCP Apps bridge authorization callbacks.

### Host-package gate

- [x] Add `@mcp-native/host` as the top-level orchestration package above the existing package
      boundaries. It may depend on the official SDK adapter and UI layers; `@mcp-native/core` must
      remain independent of MCP SDK, A2UI, React Native, and WebView implementations.
- [x] Provide one stable host API for connection, authentication handoff, tool discovery and calls,
      cancellation, reconnect, shutdown, and bounded operational state. Applications must still own
      server selection, secure-store and OS authentication-session implementations, and user policy.
- [x] Classify each tool result deterministically as negotiated A2UI, negotiated MCP Apps, ordinary
      MCP content, or invalid. Load linked resources, validate every server-controlled value, and
      produce a closed renderable-result union without MIME guessing or fallback from failed standard
      validation into another executable UI path.
- [x] Provide React Native integration for the complete host flow, including a provider or equivalent
      stable ownership boundary, tool-call state, one result renderer, safe primitive defaults,
      optional host-owned catalog overrides, accessible loading/error/empty/fallback states, and exact
      WebView lifecycle cleanup.
- [x] Route A2UI and MCP Apps actions through one documented application authorization boundary while
      retaining protocol-specific validation, serialization, consent, and delivery rules. Unknown or
      sensitive actions remain denied until explicitly approved.
- [x] Keep the low-level packages public and independently usable. Document the choice between the
      plug-and-play host path and manual connection, negotiation, parsing, storage, policy, and
      rendering composition.
- [x] Add focused official-SDK integration and hostile-input tests for the supported host flow,
      including connection, tool discovery and calls, result classification, cancellation,
      reconnect, teardown, and rejection of malformed, ambiguous, or oversized results.
- [x] Run the host package through the repository's normal build, lint, typecheck, public-API,
      dependency-boundary, package-smoke, and relevant native checks locally or in CI. Summarize the
      result in the pull request or release; do not commit generated applications, raw logs,
      screenshots, reports, matrices, or transcripts solely as release evidence.

### Stable-release gate

- [ ] Resolve every release-blocking result from independent security review, public-API review,
      protocol/schema diff review, accessibility audit, and native WebView isolation review.
- [ ] Pass the pinned MCP, A2UI, and MCP Apps conformance suites for the exact documented profiles,
      plus unit, integration, hostile-input, fuzz, performance, memory, generated-host, package smoke,
      and end-to-end tests.
- [x] Enforce the documented support matrix in CI and verify clean installation, declarations,
      exports, peer dependencies, source maps, licenses, and upgrade behavior from the latest
      `0.9.x` release candidate. Registry provenance remains part of the publication check below.
- [x] Remove or isolate the deprecated custom A2UI `0.1` public surface according to the published
      migration decision, with no silent wire-format reinterpretation.
- [ ] Publish stable documentation: human introduction, host integration guide, component matrix,
      styling and design-system guide, host-extension guide, mixed-surface guide, security model,
      compatibility policy, migration guide, API reference, examples, and release notes.
- [ ] Freeze the `1.x` compatibility promise: breaking public API, wire, schema pin, default policy,
      or behavior changes require an explicit major-version migration plan.
- [ ] Publish all coordinated packages at `1.0.0` through the existing protected OIDC/provenance
      workflow and verify registry contents, tags, signatures/provenance, and installability.

Exit criterion: a clean React Native consumer can install the high-level host, connect a compatible
MCP server, call a tool, and automatically receive validated native A2UI, isolated MCP Apps, or safe
ordinary MCP content through one supported workflow. The low-level APIs remain available, the `1.x`
stability policy is published, and every release-blocking review result is resolved.

## Committed post-`1.0.0` roadmap

The stable React Native host is a foundation, not the end of the product. The following initiatives
are deliberately excluded from the `1.0.0` exit criteria and tracked as separate GitHub milestones.
Release numbers and dates will be assigned only after the stable host API and `1.x` compatibility
policy ship. Work may overlap, but dependency order remains explicit.

| Milestone                                                     | Initiative                                                                                                    | Depends on                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [11](https://github.com/pablospaniard/mcp-native/milestone/3) | [Standard contract registry and custom input adapters](https://github.com/pablospaniard/mcp-native/issues/91) | Stable v1 host result union and policy boundary                          |
| [12](https://github.com/pablospaniard/mcp-native/milestone/2) | [Platform-neutral renderer foundation](https://github.com/pablospaniard/mcp-native/issues/92)                 | Stable v1 semantic and lifecycle behavior                                |
| [13](https://github.com/pablospaniard/mcp-native/milestone/4) | [First-class SwiftUI renderer](https://github.com/pablospaniard/mcp-native/issues/93)                         | Platform-neutral renderer foundation                                     |
| [14](https://github.com/pablospaniard/mcp-native/milestone/5) | [First-class Jetpack Compose renderer](https://github.com/pablospaniard/mcp-native/issues/94)                 | Platform-neutral renderer foundation                                     |
| [15](https://github.com/pablospaniard/mcp-native/milestone/6) | [Universal native-capability providers](https://github.com/pablospaniard/mcp-native/issues/95)                | Stable capability manifest and broker contracts                          |
| [16](https://github.com/pablospaniard/mcp-native/milestone/7) | [Protocol-profile evolution](https://github.com/pablospaniard/mcp-native/issues/96)                           | Upstream stable revisions and separately reviewed compatibility profiles |

### Milestone 11: standard contract registry and custom input adapters

The v1 host has a closed built-in set of standard result handlers. This milestone adds the public
choice between maintained standard contracts and explicitly installed application-defined contracts.

- [ ] Define a closed, versioned renderable-result adapter interface with separate recognition,
      parsing, validation, resource access, rendering, action, lifecycle, and fallback responsibilities.
- [ ] Publish a standard-contract registry for supported MCP, A2UI, and MCP Apps profiles. Each entry
      has an exact identifier, version or revision, negotiation requirements, MIME types, limits,
      compatibility status, and conformance status.
- [ ] Allow applications to register namespaced custom input contracts with exact runtime schemas,
      cumulative work/output limits, locally installed renderers, action policies, and deterministic
      failure behavior.
- [ ] Keep standard and custom lanes disjoint. Failed standard validation never retries through a
      custom adapter, custom metadata cannot impersonate a reserved standard, and unrecognized input
      falls back only to inert ordinary MCP content.
- [ ] Add adapter-author tooling, fixtures, negative tests, package-consumer tests, compatibility
      guidance, and migration rules without allowing server-selected JavaScript, imports, components,
      native classes, WebView options, commands, raw props, or styles.

Exit criterion: applications can add audited custom input formats or additional reviewed standard
profiles without modifying the host package or weakening its built-in validation and policy boundary.

### Milestone 12: platform-neutral renderer foundation

- [ ] Extract and freeze platform-neutral renderer inputs, state transitions, actions, errors,
      lifecycle, limits, and conformance fixtures without moving SwiftUI, Compose, React Native,
      A2UI, or WebView implementations into `@mcp-native/core`.
- [ ] Define package and dependency boundaries for platform renderers, shared semantic fixtures, and
      host-shell integration while keeping navigation and platform view ownership in each application.
- [ ] Prove that React Native continues to pass the shared fixtures before another renderer claims
      compatibility.

Exit criterion: multiple native renderers can consume the same trusted semantic contract and shared
behavioral fixtures without introducing platform dependencies into protocol-independent core.

### Milestone 13: first-class SwiftUI renderer

- [ ] Build a SwiftUI renderer and Apple-platform host integration with native view lifecycle,
      bindings, focus, navigation handoff, accessibility, Dynamic Type, reduced motion, localization,
      RTL, resources, media, and extension adapters.
- [ ] Reach behavioral parity for the documented semantic catalog and functions rather than merely
      matching component names.
- [ ] Support application-owned UIKit, AppKit, and SwiftUI components through the same namespaced,
      versioned, schema-validated host-extension model.
- [ ] Run shared positive, hostile-input, lifecycle, accessibility, performance, memory, and
      conformance fixtures with an exact Apple OS and toolchain support matrix.
- [ ] Preserve host ownership of navigation and view-controller types; server data cannot select a
      route, class, selector, module, command, or executable view implementation.

Exit criterion: SwiftUI is a first-class renderer for the documented semantic profile with the same
fail-closed boundary and published platform-specific compatibility limits as React Native.

### Milestone 14: first-class Jetpack Compose renderer

- [ ] Build a Jetpack Compose renderer and Android host integration with native lifecycle, state,
      focus, back handling, accessibility, font scaling, reduced motion, localization, RTL, resources,
      media, and extension adapters.
- [ ] Reach behavioral parity for the documented semantic catalog and functions rather than merely
      matching component names.
- [ ] Support application-owned Android View and Compose components through the same namespaced,
      versioned, schema-validated host-extension model.
- [ ] Run shared positive, hostile-input, lifecycle, accessibility, performance, memory, and
      conformance fixtures with an exact Android API and toolchain support matrix.
- [ ] Preserve host ownership of navigation and Android types; server data cannot select an activity,
      fragment, composable function, class, intent, module, command, or executable implementation.

Exit criterion: Jetpack Compose is a first-class renderer for the documented semantic profile with
the same fail-closed boundary and published platform-specific compatibility limits as React Native.

### Milestone 15: universal native-capability providers

“Support all native capabilities” means that any native capability can be integrated through a
stable typed provider contract without allowing arbitrary native invocation. It does not mean every
operating-system API is automatically installed, universally available, or safe for a server to use.

- [ ] Define a namespaced and versioned capability manifest containing exact request, result, event,
      and error schemas; supported platforms and OS versions; permission and entitlement needs; user
      activation and consent requirements; foreground/background behavior; data sensitivity;
      resource limits; cancellation; cleanup; and fallback behavior.
- [ ] Add explicit negotiation so a server may request only a capability and version that the host
      has installed, advertised, and authorized. Metadata alone never grants access.
- [ ] Add a host broker that validates every request, enforces cumulative limits, obtains policy or
      user approval, invokes a locally registered provider, validates output, and records redacted
      lifecycle and audit events.
- [ ] Provide built-in profiles and reference adapters, prioritized by risk and demand, for media;
      files and sharing; location and maps; haptics, sensors, Bluetooth, and NFC; biometrics and secure
      storage; contacts, calendar, notifications, and communication; payments and wallets; and
      background or system-integrated experiences.
- [ ] Allow applications to add platform-specific or future capabilities through the same provider
      contract. Unknown identities, versions, schemas, permissions, events, and outputs fail closed.
- [ ] Require capability-specific threat models and tests for permission bypass, confused-deputy
      behavior, sensitive-data disclosure, replay, background execution, resource amplification,
      cancellation, process death, and unavailable or revoked platform state.
- [ ] Publish an exact capability matrix per renderer, platform, OS range, provider, and package
      version, and prohibit reflection, generic invocation, raw intents, native commands, downloaded
      code, and unchecked payload forwarding.

Exit criterion: new native capabilities can be added as audited host providers without weakening
protocol validation or changing protocol-independent core, while users and servers can determine
exact availability through negotiation and the published matrix.

### Milestone 16: protocol-profile evolution

- [ ] Track upstream MCP, A2UI, and MCP Apps revisions without silently following moving branches;
      adopt each revision through an exact pin, compatibility review, migration plan, and conformance
      update.
- [ ] Add A2UI renderer-function execution and standardized capability transport placement only when
      the selected upstream profile defines the required authorization and lifecycle behavior.
- [ ] Add optional stable MCP Apps methods and browser-host double-iframe isolation as separate,
      explicitly negotiated profiles with native/browser differences documented and tested.
- [ ] Retire project-owned bindings only through an explicit interoperable migration path with useful
      ordinary MCP fallback throughout the transition.

Exit criterion: supported protocol profiles can evolve with upstream standards without ambiguous
version acceptance, silent wire reinterpretation, or regressions in fallback and security behavior.
