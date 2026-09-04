# Production host integration checklist

Use this checklist to take an MCP Native integration from package setup to a production host. It
connects the validated package boundaries with the application-owned policy, native permission,
networking, storage, accessibility, and operations choices.

## Protocol and catalog boundary

- Construct the official SDK client with `createMcpNativeClientOptions()` and use only a documented
  protocol mode.
- Advertise only extensions and A2UI catalog IDs the installed host fully implements. Require exact
  mutual negotiation; never infer support from MIME types, metadata, or content.
- Derive native component names with
  `getA2uiV1NativeSupportedComponentNames(catalog, { imagePolicy, mediaPolicy })`. Supply the same
  enforcing policies to discovery and mounting; do not advertise `Image`, `Video`, or `AudioPlayer`
  for a loader/player that cannot enforce its exact grant. Treat them as render-time resource
  authorization; action and `openUrl` reconstruction will not invoke them again.
- Prefer `createA2uiV1NativeHost` so the installed catalog, resource policies, validation policy,
  extension registrations, and advertised capabilities have one immutable owner. If composing the
  low-level APIs manually, prove that these independent inputs cannot drift.
- Run `inspectA2uiV1NativeMount` before React and pass the actual `bounded`, `unbounded`, or `scroll`
  shell layout. Reject missing registrations and unsupported parent-layout combinations instead of
  discovering them through component render failures.
- Parse local extension manifests, negotiate exact tuples, create the platform registry, and pass
  that same opaque registry through parsing, storage, validation, discovery, and mounting. Derive
  extension catalog IDs only with `getA2uiV1NativeSupportedHostExtensionCatalogIds` after installing
  a helper-created local registration and exact capability policy.
- Validate every SDK result through `McpSdkClientAdapter`, every A2UI lifecycle stream through the
  v1 parser/store, and every MCP Apps resource through the Apps loader and sandbox.
- Keep renderer/component resolution in a closed app-owned allowlist. Do not load code, component
  names, WebView options, or native module options selected by a server.
- Keep host-extension manifests, component imports, prop/event mappers, native commands, and
  compatibility ownership in app code. Inline catalogs and generic commands remain disabled.

## Host-composition layer

Most integrators should prefer this higher-level path over composing `McpNativeRuntime.dispatch()`,
the A2UI parser/store, and connection lifecycle by hand:

- Own one `McpNativeHostController` per connection and mount it with `McpNativeHostProvider`
  (`onError` is required). Read state and dispatch calls through `useMcpNativeHost()` inside the
  provider's subtree.
- Render the full state machine — connecting, empty, denied, retryable/terminal error, tool
  loading/result/error — with `McpNativeHostResultView` (or `McpNativeRegisteredHostResultView`
  when using `createA2uiV1NativeHost`). It already applies the accessibility, retry, and busy-state
  behavior described below; do not reimplement that state machine in application code.
- Pair this with `createMcpNativeHostActionAuthorization` (`@mcp-native/host`) for the equivalent
  higher-level action-authorization seam to `authorizeToolCall`/`createA2uiV1ActionDeliveryHandler`.
- The `onError` callback receives an `McpNativeHostRenderError` (and controller errors) with a
  stable `.code` (`"a2ui-render-failed"`, `"mcp-app-crashed"`, `"mcp-app-session-failed"`,
  `"result-render-failed"`) and a fixed, non-sensitive `.message`; discriminate on `.code` /
  `instanceof McpNativeHostRenderError` rather than parsing message text, since other error shapes
  reaching this callback (e.g. thrown `McpNativeHostControllerError`) do not share that code union.

## Actions, consent, and permissions

- Give `McpNativeRuntime.dispatch()` an explicit policy. If direct host `callTool()` operations also
  need review, set `trustedToolPolicy`; omission is a deliberately trusted seam.
- Require `authorizeToolCall` beside every MCP Apps `callTool` handler, and route A2UI actions through
  `createA2uiV1ActionDeliveryHandler` before application transport delivery.
- Build consent descriptions only from app-authored risk, capability, sensitive-data, and external-
  sharing profiles. Server annotations, labels, and descriptions are non-authorizing hints.
- Use `createExpiringGrantActionPolicy` only with a host-authored key that includes the policy
  revision, server/account partition, tool, and argument class. Bound the lifetime, provide a user-
  visible revoke path, and revoke on account/server removal or material policy change.
- Obtain platform permission and any required user confirmation at the moment of sensitive use.
  Consent to an MCP action is not camera, microphone, location, contacts, files, notification, or
  biometric permission.
- Deny overlapping prompts and disable or visibly mark actions while review/delivery is active.

## State and user experience

- Keep A2UI server data, renderer-local edits, binding revisions, and application state separately
  owned. Apply ordered envelopes atomically and render only `getValidated()` snapshots.
- Present every `McpNativeHostState`: loading progress, a useful empty state, a denied state with a
  safe recovery route, offline/disconnected status, retryable error with retry timing, and terminal
  error without leaking server or OAuth content.
- Preserve focus, accessibility labels, text scaling, reduced-motion choices, and disabled/busy
  semantics through loading, consent, retry, and error transitions. If the catalog wraps its text
  primitive, forward `NativeTextComponentProps.accessibilityState`; the host result view places
  loading's `busy` state on the accessible status text, not on its inaccessible layout container.
- Wire `McpNativeHostResultView`'s optional `onAnnounce` prop to
  `AccessibilityInfo.announceForAccessibility` (or the platform equivalent). Without it, state
  transitions update visible text but are not announced to screen reader users — the view itself
  cannot reach platform accessibility APIs, since `@mcp-native/host` and `@mcp-native/react-native`
  intentionally carry no `react-native` dependency. Note that `accessibilityLiveRegion` on Android is
  the only automatic platform signal and iOS has no equivalent, so screen reader users on iOS get no
  announcement at all unless `onAnnounce` is wired. A2UI readiness is announced after its validated
  surface mounts; MCP Apps readiness is announced only after protocol initialization and successful
  initial tool-input/result delivery.
- `McpNativeHostResultView` does not move focus itself across loading/result/error transitions.
  Hosts whose platform UX requires focus to follow the active state must do so explicitly (e.g. by
  focusing a ref keyed to the rendered state) around the view.
- Make installed tabs expose separate selectable items. Make installed modals trap focus, support
  platform escape/back dismissal, restore focus to their trigger, and tear down hidden content.
- Run every installed design-system mapping through the canonical
  `@mcp-native/react-native/testing` cases, plus application-level screenshots and interaction tests.
  In particular, verify both Divider axes and Slider wire `steps` to trusted `step` normalization.
- Wrap direct low-level surfaces in `A2uiV1NativeSurfaceBoundary` or use
  `A2uiV1NativeHostSurface`. Keep the default failure surface-wide so an incomplete actionable form
  is never left mounted; supply only host-authored fallback text.
- Make media controls honor user activation, backgrounding, external-route, interruption, teardown,
  and accessibility policy. Exercise each local extension's manifest-declared behavior and platform
  fallback.
- Never display raw transport, OAuth callback, validation, or server error text as trusted UI.

## OAuth and transport

- Use one app-owned secure-store namespace per environment and protected-resource authorization
  context. Back it with iOS Keychain or Android Keystore-grade encryption, never AsyncStorage,
  plain files, an embedded WebView, or a remote secret service.
- Use an OS authentication session with a stable registered redirect. Keep server URLs, issuer
  values, redirects, service names, and native browser options out of server control.
- Never copy access/refresh tokens, client secrets, PKCE verifiers, OAuth state, `Authorization`, or
  `Cookie` values into tool arguments, WebView messages, A2UI data, logs, metrics, traces, analytics,
  crash reports, screenshots, clipboard data, or application state.
- Supply a durable `McpNativeOAuthScopeStore` when scope upgrades must survive token invalidation or
  process restart. Partition it by the exact protected resource, validate issuer continuity, review
  every reauthorization, cap cross-request attempts, and clear scope history on logout/full
  credential invalidation.
- Implement both pending-authorization methods on `McpNativeOAuthSecureStore`. Persist the exact
  resource/issuer/requested-scope record with the state/verifier attempt, and remove it on
  `verifier` or `all` invalidation so refreshes cannot adopt scopes from an unrelated browser flow.
- Keep SDK `insufficient_scope` retry at its package maximum of one per request. Apply a stricter
  application budget and rate limit interactive authentication.

## Lifecycle and operations

- Build mixed screens only from host-created A2UI and opaque MCP Apps registrations. Keep sibling
  layout and navigation in the app shell; never translate A2UI data into WebView props, navigation,
  bridge messages, permissions, or region creation.
- Forward activity, visibility, focus, reduced motion, text scale, orientation, keyboard, back,
  crash, recovery, memory pressure, and teardown through the mixed coordinator. Preserve actual
  sibling accessibility order while testing native and WebView trees separately.
- Report both iOS content-process termination and Android renderer-process loss, show host-authored
  recovery UI, and observe reverse-order `dispose()` so every Apps bridge closes.

- Give `createMcpNativeConnectionLifecycle` a fresh SDK client/transport ownership unit per attempt.
  Its `connect(signal)` should stop promptly on abort, `close()` must release listeners and native
  resources, and optional `closed` should resolve once for unexpected transport loss.
- Classify failures into stable non-sensitive retryable or terminal codes. Tune timeout, attempt,
  and exponential-backoff bounds for the platform; do not retry authorization denial, validation
  rejection, policy denial, or incompatible protocol/catalog errors as transient network failures.
- Feed network reachability into `setOnline()`; rapid transitions are serialized in call order. On backgrounding, account/server removal, logout,
  or host teardown, cancel work and await `shutdown()`; also tear down MCP Apps bridges and browser
  sessions.
- Map fixed `McpNativeOperationalEvent` values to structured logs, metrics, and traces. Do not add
  raw URLs, request/response bodies, tool arguments/results, rendered data, account/device IDs,
  tokens, headers, callback parameters, or exception messages as labels or span attributes.
- Bound telemetry buffers, metric cardinality, retained traces, and offline queues. Verify redaction
  with seeded secrets and hostile server/user values before release.

## Release evidence

- Run `npm run check` and `npm run package:smoke` against the exact dependency lockfile.
- Run `npx mcp-native doctor` in the consuming application and resolve package-range errors. Review
  its Metro/workspace warnings against the application's actual bundler configuration.
- Exercise supported iOS and Android hosts across connect, timeout, cancellation, background/resume,
  offline/online, reconnect, consent denial/revocation/expiry, OAuth cancel/recovery/scope upgrade,
  accessibility, and graceful shutdown.
- Record exact native/Expo/component-library versions separately. Use the maintained [Expo Go todo
  app](../examples/expo-go-todolist/README.md) as a reproducible integration reference alongside the
  protocol and package release gates.
