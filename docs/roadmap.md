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

- Represent MCP extension settings in the core boundary.
- Negotiate extensions explicitly and implement graceful text/data fallback.
- Preserve reserved and extension metadata without granting capabilities automatically.
- Define any non-official A2UI-over-MCP binding under an identifier owned by this project; never use the reserved `io.modelcontextprotocol` namespace.
- Document the exact transport mapping for ordered A2UI messages and capability exchange.

Exit criterion: UI protocols can determine mutual support without guessing from MIME types or tool results.

## Milestone 3: A2UI v1.0 Candidate adapter

- Verify a pinned official JSON Schema bundle.
- Parse official `v1.0` agent-to-renderer and renderer-to-agent envelopes.
- Implement ordered create, component update, data-model update, and delete behavior.
- Validate catalogs, component graphs, JSON Pointer bindings, dynamic values, accessibility attributes, functions, actions, and capability metadata.
- Adapt protocol state into the existing trusted native render plan.
- Add official examples, negative fixtures, lifecycle tests, and interoperability tests.

Exit criterion: conformance is reported per implemented A2UI feature against the pinned Candidate revision; the custom `0.1` input is deprecated or made explicitly internal.

## Milestone 4: production native renderer behavior

- Add renderer-local data-model updates without network calls on each keystroke.
- Resolve A2UI action context at dispatch time.
- Add richer host-owned components and styling without unchecked prop spreading.
- Implement explicit accessibility attributes and inferred fallbacks.
- Test VoiceOver and Android accessibility behavior, dynamic type, focus, reduced motion, contrast, touch targets, orientation, and screen-reader actions.
- Define the supported iOS and Android version matrix and exercise real host applications in simulator, emulator, and device CI where available.
- Establish parse, update, render-latency, and memory budgets for supported surface sizes, with large-surface and rapid-update stress tests.
- Add fuzz and property-based tests for protocol parsing, render-plan conversion, and renderer failure paths.
- Target applicable WCAG 2.2 Level AA outcomes and document exceptions.

Exit criterion: supported iOS and Android hosts render and interact with the supported A2UI subset accessibly, within documented performance budgets, and without weakening the component or capability boundary.

## Milestone 5: stable MCP Apps compatibility

- Implement `io.modelcontextprotocol/ui` capability negotiation.
- Preserve `_meta.ui.resourceUri`, visibility, CSP, permissions, and related UI metadata.
- Require `ui://` resources and `text/html;profile=mcp-app` for the stable Apps profile.
- Integrate official AppBridge where feasible, or implement the same schema-validated JSON-RPC lifecycle.
- Build a platform WebView sandbox with explicit origin, navigation, storage, external-link, download, and device-permission policy.
- Record where native WebView isolation differs from browser iframe guarantees.
- Add official example and hostile-bridge interoperability tests.

Exit criterion: `@mcp-native/webview` satisfies the stable Apps profile for documented platforms and fails closed elsewhere.

## Milestone 6: remote authorization and release readiness

- Implement the MCP `2026-07-28` authorization profile before claiming protected Streamable HTTP support.
- Use PKCE, protected-resource and authorization-server discovery, resource indicators, issuer validation, least-privilege scopes, and secure platform token storage.
- Never pass an MCP access token through to an upstream API.
- Add consent, tool-risk review, capability approval, and privacy controls in the host layer.
- Define production connection lifecycle behavior for timeouts, cancellation, bounded retry and backoff, reconnection, offline transitions, and graceful shutdown while leaving wire behavior to the official SDK.
- Add structured logs, metrics, and traces with explicit credential, token, server-data, and user-data redaction rules.
- Provide actionable loading, empty, denied, disconnected, retryable, and terminal error states for host applications.
- Publish a host-integration checklist covering component catalogs, action policies, permissions, binding state ownership, error handling, transport configuration, and lifecycle cleanup.
- Continue npm trusted publishing with OIDC, provenance, protected release environments, and exact version verification.
- Ship an end-to-end React Native example and document its supported protocol matrix.

Exit criterion: a release candidate passes protocol, security, accessibility, performance, reliability, operability, package, real-platform, and end-to-end interoperability gates.

## Out of scope until requested

Optional MCP extensions such as Tasks, Skills over MCP, OAuth Client Credentials, and Enterprise-Managed Authorization are not prerequisites for core conformance. Add one only through a focused RFC when a concrete use case requires it.
