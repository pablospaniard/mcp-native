# Standards and compatibility

This document separates MCP Native's architectural goals from protocol-conformance claims. Security-oriented design choices can align with a specification without making an implementation wire-compatible with that specification.

## Status snapshot

- Assessed: 2026-08-26
- MCP baseline: [Model Context Protocol `2026-07-28`](https://modelcontextprotocol.io/specification/2026-07-28)
- A2UI baseline: [A2UI Protocol v1.0 Candidate at `7541f953`](https://github.com/a2ui-project/a2ui/blob/7541f953050cd58b80f0bf5d85fe2d63192af305/specification/v1_0/docs/a2ui_protocol.md)
- MCP Apps baseline: [stable MCP Apps `2026-01-26`](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)

MCP Native does **not** currently claim complete MCP `2026-07-28`, A2UI v1.0, or MCP Apps host conformance.

MCP Native targets `2026-07-28` and deliberately offers only `2025-11-25` as its tested legacy lane. See the [MCP protocol support policy](protocol-support.md) for exact modes, covered operations, exclusions, and the adoption gate for future revisions.

## Official references

### Protocol and wire contracts

| Reference                                                                                                                                                      | Role in MCP Native                                                                         | Requirement level                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------- |
| [MCP `2026-07-28`](https://modelcontextprotocol.io/specification/2026-07-28) and its [schema](https://modelcontextprotocol.io/specification/2026-07-28/schema) | Authoritative host/client/server protocol                                                  | Normative                              |
| [MCP transports](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports)                                                                    | UTF-8 JSON-RPC framing, stdio, Streamable HTTP, metadata, cancellation, and compatibility  | Normative for implemented transports   |
| [MCP Extensions](https://modelcontextprotocol.io/extensions/overview)                                                                                          | Extension identifiers, opt-in capability negotiation, versioning, and graceful degradation | Normative when implementing extensions |
| [JSON-RPC 2.0](https://www.jsonrpc.org/specification)                                                                                                          | Base request, notification, response, and error format used by MCP and MCP Apps            | Normative                              |
| [JSON Schema 2020-12](https://json-schema.org/draft/2020-12)                                                                                                   | MCP tool schemas and A2UI protocol/catalog validation                                      | Normative where referenced             |
| [JSON Pointer, RFC 6901](https://www.rfc-editor.org/rfc/rfc6901)                                                                                               | A2UI dynamic values and data-model paths                                                   | Normative for A2UI bindings            |
| [Official TypeScript SDK v2](https://ts.sdk.modelcontextprotocol.io/v2/)                                                                                       | Preferred implementation of the current MCP wire protocol                                  | Official implementation guidance       |
| [SDK `2026-07-28` migration guidance](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28)                                                  | Correct stateless HTTP behavior and conformance-test setup                                 | Official implementation guidance       |
| [Official MCP conformance suite](https://github.com/modelcontextprotocol/conformance)                                                                          | Versioned core, metadata, authorization, extension, and compatibility scenarios            | Verification tool; pin exact version   |

### UI protocols

| Reference                                                                                                                                                        | Role in MCP Native                                                                       | Requirement level                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------- |
| [A2UI v1.0 Candidate at `7541f953`](https://github.com/a2ui-project/a2ui/blob/7541f953050cd58b80f0bf5d85fe2d63192af305/specification/v1_0/docs/a2ui_protocol.md) | Declarative native-surface protocol baseline                                             | Candidate baseline pinned for development   |
| [MCP Apps `2026-01-26`](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)                                            | Stable HTML UI extension: discovery, `ui://`, MIME profile, CSP, sandbox, and bridge     | Normative for Apps compatibility            |
| [MCP AppBridge](https://apps.extensions.modelcontextprotocol.io/api/classes/app-bridge.AppBridge.html)                                                           | Official host-side initialization, proxy, lifecycle, and teardown implementation         | Preferred implementation                    |
| [HTML Living Standard](https://html.spec.whatwg.org/)                                                                                                            | Valid MCP Apps documents and Web messaging                                               | Normative where MCP Apps references HTML    |
| [Content Security Policy Level 3](https://www.w3.org/TR/CSP3/)                                                                                                   | Resource and connection restrictions for untrusted HTML                                  | Normative through the Apps security profile |
| [Permissions Policy](https://www.w3.org/TR/permissions-policy-1/)                                                                                                | Browser capability restriction model that native WebView policy must match or strengthen | Security baseline                           |

The stable Apps specification uses extension ID `io.modelcontextprotocol/ui`, `ui://` resources, MIME type `text/html;profile=mcp-app`, and tool `_meta.ui.resourceUri`. Under MCP `2026-07-28`, extension support is advertised through the current per-request capability envelope and `server/discover`; older connection-era examples must be adapted through the core compatibility rules.

### Authorization and URI handling

[MCP `2026-07-28` Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) is conditional: it applies when MCP Native supports protected HTTP servers, not when a host launches a local stdio server. Its referenced standards are part of that implementation contract:

- [OAuth 2.1 draft 13](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-13)
- [Bearer Token Usage, RFC 6750](https://www.rfc-editor.org/rfc/rfc6750)
- [Authorization Server Metadata, RFC 8414](https://www.rfc-editor.org/rfc/rfc8414)
- [Dynamic Client Registration, RFC 7591](https://www.rfc-editor.org/rfc/rfc7591), retained by MCP only for backwards compatibility
- [Resource Indicators, RFC 8707](https://www.rfc-editor.org/rfc/rfc8707)
- [Protected Resource Metadata, RFC 9728](https://www.rfc-editor.org/rfc/rfc9728)
- [Authorization Server Issuer Identification, RFC 9207](https://www.rfc-editor.org/rfc/rfc9207)
- [OAuth Client ID Metadata Documents draft 00](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-00)
- [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html)
- [OpenID Connect Dynamic Client Registration 1.0](https://openid.net/specs/openid-connect-registration-1_0.html)
- [URI Generic Syntax, RFC 3986](https://www.rfc-editor.org/rfc/rfc3986)

A2UI v1.0 additionally relies on [Unicode Standard Annex #31](https://www.unicode.org/reports/tr31/) for catalog identifiers and ISO 8601-compatible timestamps; MCP Native uses the Internet timestamp profile in [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339) when it needs to generate or validate interoperable action timestamps.

### Accessibility and platform behavior

| Reference                                                                                                  | Role in MCP Native                                                           | Requirement level                           |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------- |
| [WCAG 2.2](https://www.w3.org/TR/wcag/)                                                                    | Shared testable accessibility baseline; target Level AA where applicable     | Product quality and possible legal baseline |
| [WCAG 2.2 for mobile applications](https://www.w3.org/TR/wcag2mobile-22/)                                  | Informative mapping from WCAG to native and hybrid mobile apps               | Guidance, not a conformance standard        |
| [Apple VoiceOver guidance](https://developer.apple.com/design/human-interface-guidelines/voiceover)        | iOS names, values, traits, actions, focus, and assistive-technology behavior | Platform guidance                           |
| [Android accessibility principles](https://developer.android.com/guide/topics/ui/accessibility/principles) | Android labels, actions, touch targets, semantics, and testing               | Platform guidance                           |

Jurisdiction-specific requirements such as the European Accessibility Act and EN 301 549 apply to products and distributions, not automatically to this library. A shipping host must make its own compliance determination.

### Package supply chain

Use [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) with short-lived GitHub Actions OIDC credentials and automatic provenance. Keep package repository metadata exact, publish only from a protected workflow, and avoid long-lived npm write tokens. This is a release-security requirement for this project, not MCP protocol conformance.

## Compatibility matrix

| Area                | Community contract                                                                                                   | Current implementation                                                                              | Status                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------- |
| MCP wire behavior   | MCP `2026-07-28` stateless requests and per-request metadata                                                         | SDK v2 plus seven pinned official client scenarios; uncovered operations are excluded               | Partial, selected paths pass |
| MCP data fidelity   | Official tools, content, resources, schemas, metadata, annotations, and cache hints                                  | Preserved across the initial tools/list, tools/call, and resources/read boundary                    | Supported initial boundary   |
| Extension protocol  | Explicit identifiers, capability negotiation, versioning, and graceful degradation                                   | Validated maps, mutual negotiation, modern SDK exchange, fallback, and a project-owned A2UI binding | Supported substrate only     |
| Component ownership | A2UI catalogs constrain available components and functions                                                           | The host injects a fixed, locally bundled native catalog                                            | Architecturally aligned      |
| Remote code         | Catalog functions are named, registered capabilities rather than downloaded code                                     | Server-provided React Native code and arbitrary component resolution are prohibited                 | Architecturally aligned      |
| Validation          | A2UI v1.0 messages and catalogs validate against its JSON Schemas                                                    | Pinned Candidate schemas via Ajv for v1 lifecycle; custom `0.1` remains hand-validated              | Partial                      |
| Wire envelopes      | `version: "v1.0"` messages use `createSurface`, `updateComponents`, `updateDataModel`, and `deleteSurface` envelopes | Schema-validated lifecycle envelopes plus JSONL parse; custom `0.1` retained separately             | Partial (parse + store)      |
| Component graph     | A2UI uses catalog-defined components and ID references rooted at component ID `root`                                 | Store retains component maps; render-plan adaptation deferred                                       | Partial                      |
| Data model          | Dynamic values use JSON Pointer bindings and renderer-local state                                                    | Ordered `updateDataModel` JSON Pointer updates in the surface store                                 | Partial                      |
| Actions             | Renderer-to-agent action envelopes include surface, source component, timestamp, and resolved context                | Buttons dispatch a custom MCP tool action directly                                                  | Not implemented              |
| Streaming lifecycle | Ordered, framed messages progressively create, update, and delete surfaces                                           | JSONL batches apply create/update/delete to an ordered in-memory store                              | Partial (parse + store)      |
| Capabilities        | Supported catalogs and inline-catalog support are negotiated through transport metadata or initialization            | The catalog is fixed locally with no protocol negotiation                                           | Not implemented              |
| Accessibility       | Explicit accessibility data overrides inferred defaults                                                              | Initial button and input labels are inferred; explicit A2UI attributes are unsupported              | Partially aligned            |
| MCP Apps discovery  | Tool `_meta.ui.resourceUri` points to a `ui://` resource                                                             | Generic tool/resource `_meta` is preserved; Apps negotiation and validation are absent              | Partial foundation           |
| MCP Apps content    | `ui://` plus `text/html;profile=mcp-app`                                                                             | The WebView primitive recognizes `text/html` and legacy `text/html+skybridge`                       | Not conformant               |
| MCP Apps policy     | Resource metadata carries CSP and requested permissions                                                              | HTML documents have a minimal deny-by-default remote-document policy                                | Partial primitive only       |
| MCP Apps runtime    | A sandboxed host uses the Apps JSON-RPC bridge, including `ui/initialize` and `ui/*` messages                        | No WebView mount, sandbox, AppBridge, or postMessage bridge exists                                  | Not implemented              |

## What the current packages mean

### `@mcp-native/a2ui`

The package name expresses the intended protocol integration. Its current `0.1` format is an internal proof-of-concept input model, not an alternative A2UI version and not a compatible implementation of A2UI v1.0.

The `application/a2ui+json` resource convention used by the prototype came from earlier A2UI-over-MCP work. A2UI v1.0 is transport-agnostic and defines a stream of protocol envelopes. Recognizing a media type does not establish v1.0 conformance.

MCP Native now defines an experimental [project-owned A2UI-over-MCP transport binding](a2ui-mcp-binding.md). It negotiates exact settings under `io.github.pablospaniard/mcp-native-a2ui` and defines ordered JSONL resource transport for the pinned Candidate revision. The package now also parses agent-to-renderer lifecycle envelopes into an ordered surface store; mapping that state into the trusted native render plan remains roadmap work. The custom `0.1` resolver stays separate.

### `@mcp-native/react-native`

The trusted render plan and host-owned renderer are internal layers. They can remain behind a conforming A2UI adapter because the wire protocol does not require a particular platform renderer. The internal model will need enough information to preserve surface IDs, component IDs, resolved accessibility attributes, state bindings, and action context.

### `@mcp-native/webview`

This package currently contains HTML classification and policy primitives. It is not an MCP Apps host. Complete compatibility requires Apps discovery metadata, `ui://` resource loading, CSP and permission enforcement, sandboxed WebView configuration, AppBridge or an equivalent protocol implementation, and schema-validated bidirectional messages.

## Conformance roadmap

The implementation order is maintained in [the project roadmap](roadmap.md). The current code is not discarded wholesale: package boundaries, validation strategy, the trusted render plan, host-owned components, CI, and release controls remain useful. Protocol-facing contracts must change before further feature growth on the custom `0.1` model.

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
2. **Partial:** parse official `v1.0` agent-to-renderer lifecycle envelopes; renderer-to-agent envelopes remain deferred.
3. **Implemented:** ordered surface store for create, component update, data-model update, and delete messages.
4. Validate catalog IDs, component graphs, dynamic values, JSON Pointers, accessibility attributes, functions, actions, and capabilities beyond schema checks.
5. Adapt validated protocol state to the renderer's internal trusted plan.
6. **Partial:** official examples, schema fixtures, malformed-message cases, and lifecycle tests for parse/store; broader interoperability remains deferred.

### MCP Apps compatibility

1. Negotiate `io.modelcontextprotocol/ui` and preserve validated tool and resource `_meta.ui` fields.
2. Resolve `ui://` resources with exact `text/html;profile=mcp-app` handling and enforce their CSP, origin, navigation, and permission policies.
3. Prefer the official AppBridge implementation where it supports the React Native host boundary; otherwise implement the documented JSON-RPC protocol with equivalent validation.
4. Isolate the WebView, expose only explicit host capabilities, and validate every bridge message in both directions.
5. Add interoperability tests against official examples and record differences between browser iframe guarantees and platform WebView guarantees.

The native A2UI renderer and the HTML MCP Apps host are separate compatibility paths. Neither should silently fall back to the other when validation fails.

## Version and claim policy

- Reference a released specification or an exact commit; do not silently track a moving `main` branch in conformance tests.
- Treat a Candidate specification update as a reviewed protocol change.
- Do not label a package or release "A2UI v1.0 compatible" until its required envelopes, schemas, lifecycle, actions, and capability behavior pass documented conformance tests.
- Do not label the runtime unqualifiedly "MCP `2026-07-28` compatible" while prompts, roots, sampling, elicitation, tasks, authorization, extension-specific operations, and other operations remain outside the tested boundary.
- Do not label `@mcp-native/webview` an "MCP Apps host" until discovery, sandboxing, policy metadata, and the Apps bridge are implemented and tested.
- Document partial support by feature and version rather than using an unqualified compatibility claim.
