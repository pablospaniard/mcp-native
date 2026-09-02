# Roadmap

MCP Native has completed Milestones 0–9. The React Native feature set planned for 1.0 is in place,
and the current work is independent review, final validation, documentation polish, the documented
legacy import change, and publication of the 1.x compatibility promise.

## Path from `0.9.x` to `1.0.0`

The `1.0.0` target is a production-ready React Native host library. It renders the pinned A2UI basic
catalog through components compiled into the host application, keeps MCP Apps HTML inside its
separate WebView policy boundary, and provides an explicit extension contract for application-owned
semantic components.

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

| Release      | Outcome                                                                                          | Release gate                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0.7.0`      | Complete the non-media A2UI basic-catalog renderer and stable design-system boundary             | Every supported component passes schema, hostile-input, interaction, accessibility, and iOS/Android fixture coverage                                                      |
| `0.8.0`      | Add policy-gated media and compiled host-extension components                                    | The complete pinned basic catalog is covered, and no server value can resolve code, native classes, commands, or unchecked props                                          |
| `0.9.0`      | Deliver mixed native/WebView hosting and freeze the proposed public API                          | One production-shaped reference host passes lifecycle, isolation, accessibility, performance, migration, and package-consumer tests                                       |
| `0.9.x`      | Polish the candidate with the Expo Go proof, package checks, and documentation                   | The complete example and coordinated package artifacts pass the same repository and native-host gates                                                                     |
| `1.0.0`      | Publish the reviewed stable contract and compatibility guarantees                                | No unresolved release-blocking security, compatibility, documentation, or conformance gaps remain                                                                         |
| Post-`1.0.0` | Add first-class SwiftUI and Jetpack Compose renderers plus universal native-capability providers | Both native renderers share the trusted protocol boundary, and any additional native capability can be integrated through a typed, advertised, policy-gated host provider |

## Deliberate `1.0.0` scope

- The host supplies all React Native packages, platform classes, components, props, styles, and
  commands.
- The host owns navigation, safe areas, status bars, application screens, and the surrounding app
  shell.
- A2UI native regions and MCP Apps WebViews compose as host-created siblings with separate policy
  boundaries.
- Compatibility is reported against exact pinned MCP, A2UI, and MCP Apps profiles plus the declared
  React Native, iOS, and Android support policy and automated minimum-version baseline.
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
`/legacy` subpaths; deprecated root aliases remain through `0.9.x` and are removed at `1.0.0`.

## Integration proof

The maintained [Expo Go todo app](../examples/expo-go-todolist/README.md) is the runnable React
Native primitives proof. The [City Canvas example](../examples/expo-go-mixed-surfaces/README.md)
adds a two-screen mixed-hosting proof with native A2UI, an isolated MCP Apps WebView, a stable bridge,
and a policy-approved tool call. Both pin their Expo SDK and application dependencies for local
reproduction while the package support policy remains React Native `>=0.86.0 <1`.

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
      portability guarantee. The declared minimum React Native boundary compiles these native
      fixtures with the default engine automatically on pull requests.
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

Status: in release preparation.

The [`1.0.0` readiness checklist](1.0-readiness.md) separates evidence already enforced in the
repository from the remaining independent reviews, migration step, and final publication actions.

- [ ] Resolve every release-blocking result from independent security review, public-API review,
      protocol/schema diff review, accessibility audit, and native WebView isolation review.
- [ ] Pass the pinned MCP, A2UI, and MCP Apps conformance suites for the exact documented profiles,
      plus unit, integration, hostile-input, fuzz, performance, memory, generated-host, package smoke,
      and end-to-end tests.
- [ ] Enforce the documented support matrix in CI and verify clean installation, declarations,
      exports, peer dependencies, source maps, licenses, provenance, and upgrade behavior from the
      latest `0.9.x` release candidate.
- [ ] Remove or isolate the deprecated custom A2UI `0.1` public surface according to the published
      migration decision, with no silent wire-format reinterpretation.
- [ ] Publish stable documentation: human introduction, host integration guide, component matrix,
      styling and design-system guide, host-extension guide, mixed-surface guide, security model,
      compatibility policy, migration guide, API reference, examples, and release notes.
- [ ] Freeze the `1.x` compatibility promise: breaking public API, wire, schema pin, default policy,
      or behavior changes require an explicit major-version migration plan.
- [ ] Publish all coordinated packages at `1.0.0` through the existing protected OIDC/provenance
      workflow and verify registry contents, tags, signatures/provenance, and installability.

Exit criterion: the documented product contract is implemented and verified, the `1.x` stability
policy is published, and every release-blocking review result has been resolved and documented.

## Committed post-`1.0.0` direction

The stable React Native release is a foundation, not the end of native-platform development. Work
immediately after `1.0.0` has two parallel tracks: first-class SwiftUI and Jetpack Compose renderers,
and a universal framework for host-owned native capabilities. These tracks are deliberately not
`1.0.0` exit criteria, but they must remain visible in the roadmap and release planning after the
stable contract ships.

Post-`1.0.0` release numbers will be assigned after the `1.0.0` API and compatibility policy are
frozen. The implementation order is fixed even if individual items move between minor releases:

1. Extract and freeze the platform-neutral semantic render-plan and capability-provider contracts.
2. Publish preview SwiftUI and Jetpack Compose renderers with shared conformance fixtures.
3. Reach non-media A2UI catalog parity on both renderers and ship the first common capability
   profiles.
4. Reach media, extension, mixed-surface, accessibility, performance, and lifecycle parity.
5. Expand built-in capability profiles while keeping the provider contract open to new and
   platform-specific OS capabilities.

### First-class SwiftUI and Jetpack Compose renderers

- [ ] Define platform-neutral renderer inputs, state transitions, actions, errors, limits, and
      conformance fixtures without moving SwiftUI, Compose, React Native, A2UI, or WebView
      implementations into `@mcp-native/core`.
- [ ] Build a SwiftUI renderer and Apple-platform host integration with native view lifecycle,
      bindings, focus, navigation handoff, accessibility, Dynamic Type, reduced motion, localization,
      RTL, resources, media, and extension adapters.
- [ ] Build a Jetpack Compose renderer and Android host integration with equivalent lifecycle,
      state, focus, back handling, accessibility, font scaling, reduced motion, localization, RTL,
      resources, media, and extension adapters.
- [ ] Reach behavioral parity for the pinned A2UI basic catalog and documented functions rather than
      merely matching component names. Platform-specific presentation may differ while semantic
      actions, validation, policies, and failure behavior remain compatible.
- [ ] Support application-owned UIKit, AppKit, Android View, SwiftUI, and Compose components through
      the same namespaced, versioned, schema-validated host-extension model.
- [ ] Run shared positive, hostile-input, lifecycle, accessibility, performance, memory, and
      conformance fixtures across React Native, SwiftUI, and Compose, with exact OS and toolchain
      support matrices.
- [ ] Preserve host ownership of application navigation and shell on every renderer. Native renderer
      support must not turn routes, view-controller classes, activities, fragments, or composable
      function names into server-controlled values.

Exit criterion: SwiftUI and Jetpack Compose are first-class renderers for the documented semantic
profile, with the same fail-closed security boundary and published platform-specific compatibility
limits as the React Native renderer.

### Universal native-capability framework

“Support all native capabilities” means that any native capability can be integrated through a
stable typed provider contract without modifying protocol-independent core or allowing arbitrary
native invocation. It does not mean every operating-system API is automatically installed,
available on every platform, or safe for a server to invoke.

- [ ] Define a namespaced and versioned capability manifest containing exact request, result, event,
      and error schemas; supported platforms and OS versions; permission and entitlement needs; user
      activation and consent requirements; foreground/background behavior; data sensitivity;
      resource limits; cancellation; cleanup; and fallback behavior.
- [ ] Add explicit capability negotiation so a server may request only a capability and version that
      the host has installed, advertised, and authorized. Metadata alone never grants access.
- [ ] Add a host capability broker that validates every request, enforces cumulative limits, obtains
      policy or user approval, invokes a locally registered provider, validates its output, and
      records redacted lifecycle and audit events.
- [ ] Provide built-in profiles and reference adapters, prioritized by risk and demand, for media
      capture and libraries; files, documents, sharing, and clipboard; location and maps; haptics,
      motion, sensors, Bluetooth, and NFC; biometrics, credentials, and secure storage; contacts,
      calendar, notifications, and communication intents; payments and wallets; and background or
      system-integrated experiences.
- [ ] Allow applications to add platform-specific or future capabilities through the same provider
      contract when no built-in profile exists. Unknown identities, versions, schemas, permissions,
      events, and outputs must fail closed.
- [ ] Require capability-specific threat models and tests for permission bypass, confused-deputy
      behavior, sensitive-data disclosure, replay, background execution, resource amplification,
      cancellation, process death, and unavailable or revoked platform state.
- [ ] Publish an exact capability matrix per renderer, platform, OS range, provider, and package
      version. A capability is never implied merely because the underlying device exposes a related
      API.
- [ ] Prohibit generic reflection, selector or method invocation, arbitrary native commands, raw
      intent construction, class/module names, downloaded code, and unchecked prop or payload
      forwarding.

Exit criterion: new native capabilities, including future platform APIs, can be added as audited
host providers without weakening protocol validation or shipping a new core abstraction, while
users and servers can determine exact availability through negotiation and the published matrix.
