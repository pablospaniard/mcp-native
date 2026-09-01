# Production host integration checklist

Use this checklist before shipping a host built on MCP Native. Package validation does not replace
the application policy, native permission, networking, storage, accessibility, or operations work
owned by the host.

## Protocol and catalog boundary

- Construct the official SDK client with `createMcpNativeClientOptions()` and use only a documented
  protocol mode.
- Advertise only extensions and A2UI catalog IDs the installed host fully implements. Require exact
  mutual negotiation; never infer support from MIME types, metadata, or content.
- Validate every SDK result through `McpSdkClientAdapter`, every A2UI lifecycle stream through the
  v1 parser/store, and every MCP Apps resource through the Apps loader and sandbox.
- Keep renderer/component resolution in a closed app-owned allowlist. Do not load code, component
  names, WebView options, or native module options selected by a server.

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
  semantics through loading, consent, retry, and error transitions.
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
- Keep SDK `insufficient_scope` retry at its package maximum of one per request. Apply a stricter
  application budget and rate limit interactive authentication.

## Lifecycle and operations

- Give `createMcpNativeConnectionLifecycle` a fresh SDK client/transport ownership unit per attempt.
  Its `connect(signal)` should stop promptly on abort, `close()` must release listeners and native
  resources, and optional `closed` should resolve once for unexpected transport loss.
- Classify failures into stable non-sensitive retryable or terminal codes. Tune timeout, attempt,
  and exponential-backoff bounds for the platform; do not retry authorization denial, validation
  rejection, policy denial, or incompatible protocol/catalog errors as transient network failures.
- Feed network reachability into `setOnline()`. On backgrounding, account/server removal, logout,
  or host teardown, cancel work and await `shutdown()`; also tear down MCP Apps bridges and browser
  sessions.
- Map fixed `McpNativeOperationalEvent` values to structured logs, metrics, and traces. Do not add
  raw URLs, request/response bodies, tool arguments/results, rendered data, account/device IDs,
  tokens, headers, callback parameters, or exception messages as labels or span attributes.
- Bound telemetry buffers, metric cardinality, retained traces, and offline queues. Verify redaction
  with seeded secrets and hostile server/user values before release.

## Release evidence

- Run `npm run check` and `npm run package:smoke` against the exact dependency lockfile.
- Exercise supported iOS and Android hosts across connect, timeout, cancellation, background/resume,
  offline/online, reconnect, consent denial/revocation/expiry, OAuth cancel/recovery/scope upgrade,
  accessibility, and graceful shutdown.
- Record exact native/Expo/component-library versions separately. Expo Go PoCs demonstrate
  integrations but are not protocol claims or package release gates.
