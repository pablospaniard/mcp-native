# Standards and compatibility

This document separates MCP Native's architectural goals from protocol-conformance claims. Security-oriented design choices can align with a specification without making an implementation wire-compatible with that specification.

## Status snapshot

- Assessed: 2026-09-01
- MCP baseline: [Model Context Protocol `2026-07-28`](https://modelcontextprotocol.io/specification/2026-07-28)
- A2UI baseline: [A2UI Protocol v1.0 Candidate at `7541f953`](https://github.com/a2ui-project/a2ui/blob/7541f953050cd58b80f0bf5d85fe2d63192af305/specification/v1_0/docs/a2ui_protocol.md)
- MCP Apps baseline: [stable MCP Apps `2026-01-26`](https://github.com/modelcontextprotocol/ext-apps/blob/92f46a574568a3ddac7600343b7d3c4c4ed7b588/specification/2026-01-26/apps.mdx)

MCP Native verifies a documented MCP `2026-07-28` client boundary, including every scored pinned
authorization client scenario, a `2025-11-25` compatibility lane, a feature-scoped A2UI v1.0
Candidate profile, and a stable MCP Apps `2026-01-26` native host-adapter profile. The package-level
protected HTTP OAuth boundary is verified; native-library integration is demonstrated separately in
non-blocking app-level PoCs. See the [MCP protocol support policy](protocol-support.md), [A2UI
conformance profile](a2ui-v1-conformance.md), and [MCP Apps compatibility
profile](mcp-apps-compatibility.md) for the exact implemented operations and behaviors.

## Official references

### Protocol and wire contracts

| Reference                                                                                                                                                      | Role in MCP Native                                                                         | Requirement level                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------- |
| [MCP `2026-07-28`](https://modelcontextprotocol.io/specification/2026-07-28) and its [schema](https://modelcontextprotocol.io/specification/2026-07-28/schema) | Authoritative host/client/server protocol                                                  | Normative                             |
| [MCP transports](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports)                                                                    | UTF-8 JSON-RPC framing, stdio, Streamable HTTP, metadata, cancellation, and compatibility  | Normative for implemented transports  |
| [MCP Extensions](https://modelcontextprotocol.io/extensions/overview)                                                                                          | Extension identifiers, opt-in capability negotiation, versioning, and graceful degradation | Normative for the extension substrate |
| [JSON-RPC 2.0](https://www.jsonrpc.org/specification)                                                                                                          | Base request, notification, response, and error format used by MCP                         | Normative                             |
| [JSON Schema 2020-12](https://json-schema.org/draft/2020-12)                                                                                                   | MCP tool schemas and A2UI protocol/catalog validation                                      | Normative where referenced            |
| [JSON Pointer, RFC 6901](https://www.rfc-editor.org/rfc/rfc6901)                                                                                               | A2UI dynamic values and data-model paths                                                   | Normative for A2UI bindings           |
| [Official TypeScript SDK v2](https://ts.sdk.modelcontextprotocol.io/v2/)                                                                                       | Preferred implementation of the current MCP wire protocol                                  | Official implementation guidance      |
| [SDK `2026-07-28` migration guidance](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28)                                                  | Correct stateless HTTP behavior and conformance-test setup                                 | Official implementation guidance      |
| [Official MCP conformance suite](https://github.com/modelcontextprotocol/conformance)                                                                          | Versioned core, metadata, authorization, extension, and compatibility scenarios            | Verification tool; pin exact version  |

### UI protocols

| Reference                                                                                                                                                                                | Role in MCP Native                                                | Requirement level                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------- |
| [A2UI v1.0 Candidate at `7541f953`](https://github.com/a2ui-project/a2ui/blob/7541f953050cd58b80f0bf5d85fe2d63192af305/specification/v1_0/docs/a2ui_protocol.md)                         | Declarative native-surface protocol baseline                      | Candidate baseline pinned for development |
| [MCP Apps `2026-01-26` at official SDK `1.7.5` source](https://github.com/modelcontextprotocol/ext-apps/blob/92f46a574568a3ddac7600343b7d3c4c4ed7b588/specification/2026-01-26/apps.mdx) | Stable HTML App discovery, resource, sandbox, and bridge baseline | Normative stable extension baseline       |

A2UI v1.0 additionally relies on [Unicode Standard Annex #31](https://www.unicode.org/reports/tr31/) for catalog identifiers and ISO 8601-compatible timestamps; MCP Native uses the Internet timestamp profile in [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339) when it needs to generate or validate interoperable action timestamps.

### Accessibility and platform behavior

| Reference                                                                                                  | Role in MCP Native                                                         | Requirement level                           |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------- |
| [WCAG 2.2](https://www.w3.org/TR/wcag/)                                                                    | Shared testable accessibility baseline; target Level AA where applicable   | Product quality and possible legal baseline |
| [WCAG 2.2 for mobile applications](https://www.w3.org/TR/wcag2mobile-22/)                                  | Informative mapping from WCAG to native and hybrid mobile apps             | Guidance, not a conformance standard        |
| [React Native accessibility guidance](https://reactnative.dev/docs/accessibility.html)                     | Cross-platform names, roles, state, actions, focus, and assistive metadata | Implementation guidance                     |
| [Android accessibility principles](https://developer.android.com/guide/topics/ui/accessibility/principles) | Android labels, actions, touch targets, semantics, and testing             | Platform guidance                           |

Jurisdiction-specific requirements such as the European Accessibility Act and EN 301 549 apply to products and distributions, not automatically to this library. A shipping host must make its own compliance determination.

### Package supply chain

Use [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) with short-lived GitHub Actions OIDC credentials and automatic provenance. Keep package repository metadata exact, publish only from a protected workflow, and avoid long-lived npm write tokens. This is a release-security requirement for this project, not MCP protocol conformance.

## Compatibility matrix

| Area                | Community contract                                                                                        | Current implementation                                                                                                                                                                                                                                                         | Status                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| MCP wire behavior   | MCP `2026-07-28` stateless requests and per-request metadata                                              | SDK v2 plus 32 pinned official client scenarios and cache-isolation tests                                                                                                                                                                                                      | Verified client boundary                |
| MCP data fidelity   | Official tools, content, resources, schemas, metadata, annotations, and cache hints                       | Preserved across the initial tools/list, tools/call, and resources/read boundary                                                                                                                                                                                               | Supported initial boundary              |
| MCP authorization   | `2026-07-28` OAuth discovery, PKCE, issuer/resource binding, least-privilege scopes, and bearer usage     | Issuer-bound secure-store/callback provider, persistent resource-bound scope history, and credential-safe transport factory passing all 25 scored pinned authorization client scenarios; native integration is demonstrated separately in app-level PoCs                       | Verified package boundary               |
| Extension protocol  | Explicit identifiers, capability negotiation, versioning, and graceful degradation                        | Validated maps, mutual negotiation, modern SDK exchange, fallback, a project-owned A2UI binding, and an exact namespaced host-extension profile with inline catalogs disabled                                                                                                  | Implemented closed profile              |
| Component ownership | A2UI catalogs constrain available components and functions                                                | Complete basic catalog, explicit host component/event/function allowlists, installed policy-ready subset advertising, typed local adapters, and closed locally compiled extension registrations                                                                                | Implemented closed profile              |
| Remote code         | Catalog functions are named, registered capabilities rather than downloaded code                          | Server-provided React Native code and arbitrary component resolution are prohibited                                                                                                                                                                                            | Architecturally aligned                 |
| Validation          | A2UI v1.0 messages and catalogs validate against its JSON Schemas                                         | Pinned Candidate schemas via Ajv for supported lifecycle and every renderer-to-agent message kind; custom `0.1` is deprecated                                                                                                                                                  | Supported profile                       |
| Wire envelopes      | `version: "v1.0"` messages use the direction-specific pinned envelope unions                              | Schema-validated lifecycle JSONL plus owned parsing for every renderer-to-agent kind                                                                                                                                                                                           | Supported profile                       |
| Component graph     | A2UI uses catalog-defined components and ID references rooted at component ID `root`                      | Validation plus native-plan adaptation for the complete basic catalog, bounded dynamic `List` template expansion, and negotiated leaf-only host extensions                                                                                                                     | Implemented declared profile            |
| Data model          | Dynamic values use JSON Pointer bindings and renderer-local state                                         | Ordered agent updates plus reactive local string, boolean, number, and string-array writes for absolute and dynamic-list-relative bindings; `@index` is scoped to template items                                                                                               | Implemented declared profile            |
| Actions             | Renderer-to-agent action envelopes include surface, source component, timestamp, and resolved context     | Mounted buttons retain renderer-only template identity, resolve current local context, and emit pinned-schema actions; all renderer-to-agent kinds parse as non-authorizing data, while HTTP(S) `openUrl` requires a press-time host policy                                    | Supported declared subset               |
| Host action consent | Product policy rather than a server-granted protocol capability                                           | Core dispatch and optional direct calls support bounded review and expiring/revocable grants; MCP Apps callbacks and A2UI action delivery require exact host policy decisions; server metadata remains non-authorizing                                                         | Implemented host boundary               |
| Host lifecycle      | Application operation rather than MCP wire behavior                                                       | Bounded coordination around fresh official SDK connection units covers timeout, cancellation, retry/backoff, offline transitions, reconnection, shutdown, actionable states, and fixed data-free operations                                                                    | Implemented host boundary               |
| Streaming lifecycle | Ordered, framed messages progressively create, update, and delete surfaces                                | JSONL batches apply create/update/delete to an ordered in-memory store                                                                                                                                                                                                         | Implemented declared profile            |
| Capabilities        | Supported catalogs and inline-catalog support are negotiated through transport metadata or initialization | Closed v1 agent/renderer metadata parsing and exact catalog-overlap negotiation with a host-owned transport placement                                                                                                                                                          | Implemented closed profile              |
| Accessibility       | Explicit accessibility data overrides inferred defaults                                                   | Mounted components map explicit metadata and derive closed semantics; modal/media/extension behavior remains an explicit installed-host responsibility recorded in local manifests and integration tests; component-library compatibility is explored in separate Expo Go PoCs | Implemented declared profile            |
| MCP Apps            | Stable `2026-01-26` capability, discovery, `ui://` HTML, metadata, sandbox, and JSON-RPC lifecycle        | Mutual stable MIME negotiation; strict tool/resource metadata; bounded text/blob HTML; closed CSP, permission, navigation, storage, cookie, download, and external-link policy; native message bridge; official `1.7.5` schema interoperability and hostile lifecycle tests    | Implemented native host-adapter profile |

## What the current packages mean

### `@mcp-native/a2ui`

The package name expresses the intended protocol integration. Its custom `0.1` proof input is deprecated and frozen for migration; it is not an alternative A2UI version. The separately implemented v1 Candidate path is reported against the exact [feature-scoped conformance profile](a2ui-v1-conformance.md).

The `application/a2ui+json` resource convention used by the prototype came from earlier A2UI-over-MCP work. A2UI v1.0 is transport-agnostic and defines a stream of protocol envelopes. Recognizing a media type does not establish v1.0 conformance.

MCP Native now defines an experimental [project-owned A2UI-over-MCP transport binding](a2ui-mcp-binding.md). It negotiates exact settings under `io.github.pablospaniard/mcp-native-a2ui` and defines ordered JSONL resource transport for the pinned Candidate revision. The package parses lifecycle envelopes into a bounded ordered store, parses every renderer-to-agent message kind as owned non-authorizing data, requires pinned-catalog plus host-policy validation for renderer-ready snapshots, validates closed agent/renderer capability objects, negotiates exact shared catalog IDs, and constructs official renderer actions. The React Native package mounts the complete basic catalog with bounded dynamic lists, typed renderer-local bindings, required image/media grants, installed-subset advertising, dispatch-time template event context, and the separately negotiated [host-extension profile](media-and-host-extensions.md); the deprecated custom `0.1` resolver stays separate.

### `@mcp-native/react-native`

The trusted render plan and host-owned renderer are internal layers. They can remain behind a conforming A2UI adapter because the wire protocol does not require a particular platform renderer. The internal model will need enough information to preserve surface IDs, component IDs, resolved accessibility attributes, state bindings, and action context.

### `@mcp-native/webview`

This package implements the [stable MCP Apps native host-adapter profile](mcp-apps-compatibility.md):
mutual capability negotiation, strict tool discovery and visibility, exact `ui://` resource
loading, bounded stable HTML plus security metadata, a closed native sandbox/React Native WebView
adapter, and the pinned JSON-RPC lifecycle. The older generic HTML helpers remain separate,
deny-by-default policy primitives and do not grant stable Apps support.

## Conformance roadmap

The implementation order is maintained in [the project roadmap](roadmap.md). Package boundaries,
validation strategy, the trusted render plan, host-owned components, CI, and release controls form
the completed foundation for the current profiles.

### MCP `2026-07-28` foundation

1. **Implemented for the initial boundary:** preserve official tools, content blocks, resources, schemas, annotations, `_meta`, and cache hints without a lossy parallel content shape.
2. **Implemented:** keep wire versioning, headers, framing, and transport behavior inside the official SDK.
3. **Implemented:** exercise `2026-07-28` through the SDK HTTP handler/fetch path while retaining in-memory coverage only for the older protocol.
4. **Implemented:** declare the complete supported-operation and backwards-compatibility policy, with exact executable SDK options.
5. **Implemented:** pin and run applicable scenarios from the official MCP conformance suite, recording the package version, source commit, exclusions, and results in the [conformance coverage report](mcp-conformance.md).
6. **Implemented:** ingest the pinned official requirements fixture, account for every scored client requirement, and test private/public cache scopes across principals sharing an official SDK cache store.

### Extension and capability substrate

1. **Implemented:** validate mandatorily prefixed extension identifiers and JSON-object settings in the protocol-independent core boundary.
2. **Implemented:** negotiate only explicit mutual client/server declarations; metadata and MIME types do not grant support.
3. **Implemented:** advertise host-approved settings and read validated `server/discover` settings through the official SDK's `2026-07-28` HTTP path.
4. **Implemented:** return explicit fallback results when either peer lacks support and require useful ordinary MCP content for the project A2UI binding.
5. **Implemented:** pin and document the project-owned A2UI identifier, exact settings, ordered JSONL resource transport, and failure behavior.

### A2UI v1.0 foundation

1. **Implemented:** pin Candidate revision `7541f953…` and vendor its official JSON Schema bundle plus basic catalog.
2. **Implemented for the declared profile:** parse official `v1.0` agent-to-renderer lifecycle envelopes, construct renderer-to-agent `action`, and parse every pinned renderer-to-agent message kind as owned data.
3. **Implemented:** ordered surface store for create, component update, data-model update, and delete messages.
4. **Implemented for the declared profile:** validate the pinned catalog, explicit host component/event/function allowlists, rooted graph references and cycles, binding syntax and template context, selected placement rules, and bounded nested expressions in literal `formatString` sources against reconstructed pinned-catalog calls; execute bounded formatting, plural, boolean, validation, HTTP(S) `openUrl`, and supported renderer checks.
5. **Implemented for the declared profile:** adapt and mount every basic-catalog component; update renderer-local state through typed absolute and template-relative bindings; evaluate supported formatting, boolean, validation, and template-scoped `@index` functions with expansion limits and a host-owned locale; require image and media grants inside cumulative budgets; expose failed checks and disable invalid buttons; derive closed accessibility semantics; preserve closed host-owned variants; resolve template-instance events against current state; and execute canonical HTTP(S) `openUrl` through a synchronous host policy. Unknown components, unnegotiated extensions, SVG icon payloads, raw styles, commands, and all other unsupported server-controlled inputs fail closed. The [Expo Go PoC policy](native-accessibility-testing.md) defines separate app-level component-library demonstrations.
6. **Implemented for the declared profile:** parse closed agent/renderer capabilities, require normative catalog lists, reject permissive-schema ambiguity, negotiate exact catalog overlap, and keep transport placement host-owned.
7. **Implemented for the declared profile:** official protocol examples, schema-derived bidirectional fixtures, malformed-message cases, lifecycle tests, exact exclusions, and Candidate interpretations are documented in the [conformance profile](a2ui-v1-conformance.md).
8. **Implemented for the declared profile:** fixed-seed generated inputs exercise both envelope directions, ordered lifecycle state, bounded dynamic-list plans, and hostile mutations; documented Node.js regression budgets cover maximum-size parsing, rapid updates, render-plan construction, and retained heap.
9. **Implemented in the `0.7.0` release:** official temporary React Native `0.87.1` and `0.86.3` hosts type-check and bundle the accessibility and complete non-media fixtures through primitive, typed-adapter, and closed-variant catalogs. The fixture intentionally uses a no-network image placeholder because the raw React Native image primitive cannot enforce the declared redirect/decode/cache grant. Platform and library-specific validation proceeds independently in non-blocking Expo Go PoCs.
10. **Implemented for the `0.8.0` candidate:** policy-gated `Video` and `AudioPlayer`, exact host-extension negotiation/manifests/registrations, hostile and amplification tests, and one generated Codegen/Fabric component backed by UIKit and Android View. The fixture intentionally does not fetch media because the installed player must enforce the complete grant.
11. **Current React Native boundary policy:** generated-host CI tests the exact declared minimum `0.86.0` and the current latest `0.87.1`. The latest pin rotates as React Native releases advance; the minimum pin changes only with an explicit peer-range compatibility decision.

The pinned Candidate is internally inconsistent about check results: `CheckRule` prose calls the
result a `ValidationResult` object, while the `Checkable` contract and pinned reference
implementation use a boolean. MCP Native follows the executable boolean interpretation and rejects
non-boolean check conditions.

### Stable MCP Apps `2026-01-26`

1. **Implemented:** advertise and negotiate `io.modelcontextprotocol/ui` only for the exact stable
   HTML MIME type; generic extension declarations remain non-authorizing until profile validation.
2. **Implemented:** parse `_meta.ui.resourceUri` and visibility, filter app-only tools from model
   lists, and reject model-only or undeclared View tool calls on the same server snapshot.
3. **Implemented:** fetch exactly one matching `ui://` resource through `resources/read`, preserve
   closed CSP/permission/domain/border metadata, and decode bounded text or canonical base64 UTF-8.
4. **Implemented:** create a restrictive CSP-first document, a closed native sandbox descriptor,
   and a React Native WebView safe-prop adapter with ephemeral storage and deny-by-default
   navigation, cookies, downloads, external links, file access, and sensitive permissions.
5. **Implemented:** run `ui/initialize` through initialized, tool data, host context, supported
   View-to-host requests and notifications, and graceful teardown over bounded JSON-RPC messages;
   overlapping View tool calls fail closed while one host authorization or delivery is pending.
6. **Implemented:** compare the stable constants and outbound lifecycle shapes with exact official
   `@modelcontextprotocol/ext-apps@1.7.5` schemas and reject hostile, unknown, premature, oversized,
   malformed, visibility-bypassing, and permission-bypassing input.
7. **Documented interpretation:** official AppBridge is not used at runtime because its v1 MCP SDK
   and browser `Window.postMessage` boundary conflicts with the repository's v2 SDK and native
   WebView boundary. A fixed local shim plus owned validators implement the same pinned shapes.
8. **Documented platform difference:** native WebViews do not reproduce a web host's cross-origin
   double-iframe sandbox. The exact origin, CSP-meta, data-store, process, permission-delegate,
   navigation, and cleanup responsibilities are recorded in the compatibility profile.

### MCP `2026-07-28` authorization

1. **Implemented foundation:** the official SDK v2 owns protected-resource and authorization-server
   discovery, PKCE, scope calculation, issuer checks, code exchange, refresh, and bearer attachment.
2. **Implemented host boundary:** `McpNativeOAuthClientProvider` validates host configuration and
   bounded stored SDK values, applies individual and cumulative structural budgets to dynamic
   registrations and discovery metadata before parsing, persistence, caching, or reuse, binds
   registrations and tokens to an exact issuer without query or fragment components, persists
   redirect state and discovery through `McpNativeOAuthSecureStore`, restricts every registered
   redirect URI to HTTPS app links, HTTP loopback, or hierarchical private-use app schemes, rejects
   duplicate redirect query names and literal fragment delimiters across
   server/redirect/authorization/callback boundaries, requires actionable authorization-server
   endpoint/URI fields to use HTTPS or HTTP loopback without fragments before caching or reuse, and
   pins the RFC 8707 resource to one MCP endpoint.
3. **Implemented callback boundary:** callback scheme/authority/path, configured query parameters,
   OAuth state, and duplicate `code`/`state`/`iss` fields fail closed before SDK code redemption;
   total, count, name, and value budgets apply to both native-session and process-recovery callback
   paths; attacker-controlled OAuth descriptions are never included in the public error. One
   provider reserves one interactive attempt before persisting state so an overlapping attempt
   cannot replace its state or verifier, retains that reservation from callback claim through
   verifier cleanup, and rejects direct cancellation while state setup, platform handoff, or
   callback completion is active.
4. **Implemented transport policy:** protected transports reject manual Authorization, Cookie, and
   Proxy-Authorization headers and surface insufficient-scope responses to the host by default. The
   opt-in step-up path requires a host callback for every reauthorization while credentials exist
   and caps SDK work to one retry per request. Access, refresh, and ID tokens are subject to both
   per-value and cumulative limits before persistence or request reuse. A token response that omits
   its optional scope inherits the pending authorization request or the previously granted scope.
5. **Implemented native integration boundary:** a bounded fixed-slot reference store maps the OAuth
   contract onto an app-owned native secret backend and serializes state operations across store
   objects using the same fixed namespace in one JS runtime. A closed session adapter accepts one
   exact `ASWebAuthenticationSession`/Android Custom Tab callback while rejecting overlap,
   substitution, malformed results, cancellation residue, and reuse. Neither adapter imports React
   Native or upgrades an insecure backend.
6. **Host responsibility:** production implementations must use OS keychain/keystore-grade storage,
   a platform authentication session, cryptographically random state, user consent, bounded
   cross-request step-up tracking, and must never forward an MCP access token to an upstream API.
7. **Verified package boundary:** all 25 scored authorization client scenarios in the exact pinned
   official `2026-07-28` requirements fixture pass with no expected failures. Native integration is
   demonstrated separately through non-blocking app-level PoCs; broader host controls remain host
   responsibilities.

## Version and claim policy

- Reference a released specification or an exact commit; do not silently track a moving `main` branch in conformance tests.
- Treat a Candidate specification update as a reviewed protocol change.
- State compatibility by exact revision, implemented feature profile, operation, and transport.
- Base compatibility statements on passing pinned conformance tests and explicitly scoped PoC results.
- Update claims alongside the executable policy, tests, compatibility matrix, and release notes.
