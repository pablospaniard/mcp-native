# RFC-0001: MCP Native architecture

- Status: Accepted for initial proof of concept
- Protocol conformance: None claimed
- Date: 2026-08-25
- Last updated: 2026-08-28

## Summary

MCP Native turns MCP resources and actions into host-controlled native UI. The initial implementation uses a small internal surface model inspired by A2UI. The intended production architecture will parse a supported declarative protocol into an internal trusted render plan, map that plan to a local component catalog, and route declared user actions back through its protocol binding.

HTML MCP Apps use a separately policy-gated WebView path. The WebView package implements the
documented stable `2026-01-26` native host-adapter profile without weakening the declarative native
boundary.

RFC-0001 defines the proof-of-concept architecture, not A2UI v1.0 or MCP Apps conformance. See [Standards and compatibility](standards-compatibility.md) for the normative baselines and tracked gaps.

## Non-negotiable security rule

Remote MCP servers may provide declarative UI and actions, but MCP Native never downloads and executes arbitrary React Native JavaScript.

All executable application code and native components are supplied by the host application. Server-provided input is untrusted data and must be validated before it reaches a renderer.

## Data flow

```text
MCP server
    |
    | tools/list, tools/call, resources/read
    v
official @modelcontextprotocol/client
    |
    v
@mcp-native/mcp
    | validated, JSON-safe contracts
    v
@mcp-native/core
    |
    +-- tool result: application/a2ui+json resource_link
    |       |
    |       `-- resources/read --> validated text resource
    |       |
    |       v
    |   @mcp-native/a2ui
    |       |
    |       v
    |   validated surface
    |       |
    |       v
    |   @mcp-native/react-native
    |       |
    |       v
    |   host-owned native components
    |
    `-- HTML resource --> @mcp-native/webview --> policy-gated WebView
```

User actions take the reverse path. A component emits a typed action; the core runtime validates the complete action and dispatches the corresponding `tools/call` through the connected MCP client only when the host's action policy explicitly allows it.

## Package boundaries

### `@mcp-native/core`

Owns protocol-independent runtime contracts, MCP client abstraction, resource access, strict JSON/action validation, fail-closed action dispatch, and the generic extension capability substrate. It has no React Native or A2UI dependency.

Its resource contract preserves every content item returned by `resources/read`; a single URI can resolve to more than one text or blob item. Tool results preserve JSON-safe content blocks, the error flag, and structured content without exposing SDK-specific transport types.

### `@mcp-native/mcp`

Owns the integration with the official MCP TypeScript SDK. It accepts an already connected SDK `Client`, adapts `listTools`, `callTool`, and `readResource` to the contracts in `@mcp-native/core`, advertises host-approved extension settings, and exposes validated server extension settings. For protected Streamable HTTP it also supplies an issuer-bound interactive OAuth provider, exact official transport factory, bounded adapter over an app-owned native secret backend, and closed OS authentication-session result adapter while keeping native dependency selection, browser presentation, consent, and lifecycle in the host.

This package is the validation boundary between SDK results and the runtime. It rejects malformed collections, non-JSON values, non-plain objects, circular values, invalid optional fields, and resource bodies that are missing or ambiguous. The OAuth boundary additionally rejects insecure endpoints, any unsafe registered redirect URI, duplicate redirect query names, insecure or fragment-bearing endpoint/URI fields retained from discovery, literal fragment delimiters on server/redirect/authorization/callback URLs, issuer query/fragment components, callback/state substitution, cross-issuer stored credentials, malformed persistent scope or pending-authorization history, oversized individual or cumulative registration, discovery, and token data, resource-indicator mismatch, credential-bearing custom headers, overlapping authorization attempts or system sessions, cancellation races during active setup, handoff, or completion, and malformed or oversized native/recovery callbacks. Its reference store persists only through the host-supplied secret backend with fixed app-owned keys and bounded values, serializes state operations across same-namespace store objects in one JS runtime, binds a live state reservation and exact requested scopes to its provider, and retains a claimed reservation through verifier cleanup while allowing stale cleanup and callback completion after process restart; it never chooses a native module or treats general application storage as secure. An optional lifecycle coordinator manages only bounded host operations and data-free state around fresh host-created official SDK client/transport units, and serializes online/offline/shutdown transitions; SDK wire behavior remains outside it.

### `@mcp-native/a2ui`

Owns resource-link resolution, parsing, validation, and conversion boundaries for both the custom proof surface and the official Candidate adapter. It also owns the exact settings and negotiation helper for the project-defined A2UI-over-MCP binding. Unsupported MIME types, ambiguous links or contents, binary surfaces, versions, catalogs, components, bindings, functions, and actions fail closed at their applicable boundary.

The custom resolver recognizes the prototype's `application/a2ui+json` resource convention. Its deliberately small `0.1` input contains four nested node types, is deprecated and frozen, and remains isolated from the separately negotiated A2UI v1.0 Candidate path. The v1 adapter parses schema-validated lifecycle envelopes into bounded ordered state and requires a complete policy-gated snapshot before the React Native package adapts the supported subset, including bounded dynamic lists, into a trusted plan. It constructs pinned renderer-to-agent `action` envelopes and parses every renderer-to-agent message kind as owned data. Parsing never authorizes function execution, transport, or device access; agent-initiated renderer-function execution remains excluded from the [feature-scoped conformance profile](a2ui-v1-conformance.md).

### `@mcp-native/react-native`

Owns the native component catalog, React Native rendering, event translation, accessibility defaults, and host customization. The v1 typed render plan covers every non-media component in the pinned A2UI basic catalog; the deprecated custom `0.1` renderer remains limited to `View`, `Text`, `Button`, and `TextInput`.

The renderer accepts a catalog of locally bundled components instead of importing or resolving components named by the server. It explicitly selects every prop crossing into that catalog, derives closed accessibility semantics, and never spreads unchecked plan or server props. Hosts may use typed adapter helpers to translate those selected props into Expo UI, Gluestack, another design system, or application-owned components. The v1 catalog requires the four base primitives and provides optional slots for `Image`, `Icon`, `Divider`, `CheckBox`, `ChoicePicker`, `Slider`, `DateTimeInput`, `Tabs`, and `Modal`; capability advertising is derived from the installed slots. Closed variant catalogs may substitute host-owned structure, text, button, input, image, and choice-picker implementations. A required image grant carries exact resource budgets to an enforcing host loader. The legacy `0.1` path remains on the four base primitives when a catalog is shared. None of these mechanisms lets a server select an import, native class, SVG payload, raw style, arbitrary prop, or command.

`useNativeRenderPlan` memoizes conversion for a validated surface identity. `useMcpNativeActionDispatcher` adapts asynchronous runtime dispatch to a synchronous component event and requires an error callback so action failures are observed. For the custom `0.1` proof surface, text inputs emit `(binding, value)` only when the host provides a handler. `A2uiV1NativeSurface` instead owns a bounded local copy of the v1 data model, applies declared absolute string, boolean, number, and string-array bindings without network calls, rerenders dependent values, and resolves button context against the latest local state before emitting a validated action envelope to the host. Supported `openUrl` actions re-resolve a canonical HTTP(S) URL during that Button press and require a separate synchronous host predicate before the host-owned opener is called. The library never imports or invokes a platform URL handler. The host still owns action transport delivery, user consent, tool policy, and synchronization with the agent; the separate MCP adapter may own the validated SDK OAuth seam for protected HTTP.

### `@mcp-native/webview`

Owns the compatibility path for HTML MCP Apps. It validates stable extension negotiation, tool
discovery and visibility, exact `ui://` resources, CSP and permission metadata, a closed native
WebView sandbox descriptor, a React Native WebView safe-prop adapter, and a bounded JSON-RPC
lifecycle. The older generic HTML document policy is a separate fallback and does not grant Apps
support. See the [exact native host profile](mcp-apps-compatibility.md).

### `mcp-native`

Convenience package for the runtime and UI APIs. Transport adapters remain separately installable so applications do not acquire an SDK or transport dependency they do not use.

## Capability model

The host owns the effective component and action allowlists. A server can request only capabilities the host has declared. Unknown components, actions, MIME types, and protocol versions are rejected rather than silently interpreted. Binding strings are accepted as opaque host data and must be validated by the host before path-like writes.

`McpNativeRuntime.dispatch()` applies a host-provided action policy and denies every surface action when no policy is configured. The lower-level `callTool()` operation remains available to trusted host code after JSON argument validation and is intentionally outside the surface-action policy. Prefer `createAllowlistActionPolicy()` so surface authorization includes exact or predicated arguments rather than tool names alone. When user review is required on this core dispatch path, `createConsentActionPolicy()` matches the same closed tool/argument boundary and supplies one immutable, host-authored risk, capability, sensitive-data, and external-sharing descriptor per dispatch; every descriptor dimension must be declared explicitly. Unknown actions and overlapping reviews fail closed, approval is not retained, and server annotations never populate or grant the consent descriptor. This core helper does not automatically govern direct `callTool()`, MCP Apps host callbacks, or A2UI v1 renderer-to-agent delivery; each host boundary requires explicit policy integration.

Future capabilities that touch sensitive device APIs must be brokered by the host and may require user approval. Server declarations alone never grant device access.

MCP extension support is determined only from validated, explicit client and server capability maps. `_meta`, MIME types, and tool-result content are preserved as data but never grant an extension. The generic substrate reports negotiation or a typed fallback reason; each extension must separately validate its settings and implement its own semantics. The experimental [project-owned A2UI binding](a2ui-mcp-binding.md) requires an exact settings match and defines ordinary MCP text/data as its graceful fallback.

## Initial proof milestone

Status: complete through package and integration tests for the custom `0.1` proof path. A minimal,
tested React Native integration PoC remains a separate roadmap milestone; it will not vendor a
generated standalone mobile project into this repository.

The proof demonstrates:

1. Connect an MCP client and obtain `tools/list`.
2. Invoke a tool with `tools/call`.
3. Resolve an A2UI resource from the result.
4. Validate the surface through `@mcp-native/a2ui`.
5. Render native text, button, text input, and container components.
6. Route a button action back through `tools/call`.

## Implementation status

The official SDK adapter, declarative resource-resolution, and initial React Native rendering milestones are complete in the proof-of-concept workspace:

- `@mcp-native/mcp` targets `@modelcontextprotocol/client` v2;
- an integration test connects the official `Client` and `McpServer` through the SDK's linked in-memory transport;
- `tools/list`, `tools/call`, and `resources/read` traverse the adapter and core runtime;
- malformed or aggregate-over-budget SDK-like results fail with `McpSdkAdapterError` before reaching UI code.
- an official SDK tool result can return an `application/a2ui+json` `resource_link` that is read and parsed through `@mcp-native/a2ui`;
- resolution requires exactly one matching link and one matching text resource, preventing server-controlled ambiguity or MIME guessing;
- errored tool results, oversized result collections, malformed links and contents, binary bodies, and invalid surfaces fail before rendering.
- validated surfaces mount through a host-provided catalog containing `View`, `Text`, `Button`, and `TextInput`, with optional closed host-owned variants for supported structure and style hints;
- buttons dispatch only their validated tool actions, and text inputs emit only declared binding changes;
- action arguments are validated again at the renderer and runtime boundaries;
- surface dispatch is deny-by-default and requires an explicit host action policy;
- all protocol-facing JSON reconstruction rejects cycles, non-plain objects, and non-finite numbers while preserving prototype-named keys as own data properties;
- renderer-selected accessibility labels are supplied for interactive components, while closed
  text/button roles, button disabled state, hidden-element focus exclusion, and text scaling are
  derived at the host boundary;
- renderer hooks memoize plans and route asynchronous dispatch results or failures to explicit host callbacks;
- component, interaction, hook, malformed-plan, public-export, and isolated package-consumer tests cover the boundary.

The MCP `2026-07-28` foundation is complete for RFC-0001's initial client boundary. The tool/resource boundary preserves official metadata, schemas, annotations, discriminated content, and cache semantics; a pinned integration test exercises the SDK's current HTTP handler/fetch path; and the selected official client conformance scenarios pass without expected failures. The conformance gate ingests the frozen official requirements fixture and requires every scored client requirement to be selected or explicitly excluded. Shared-store integration tests also prove that private cache entries remain isolated by host-provided principal partitions while public entries may be reused only for the same server identity and request. The exact target, tested `2025-11-25` compatibility lane, and [pinned conformance coverage](mcp-conformance.md) are documented explicitly. The official SDK continues to own wire behavior, and excluded operations remain unclaimed.

The extension and capability substrate is also complete. Core validates prefixed extension maps and requires mutual declarations; the SDK adapter exchanges settings on the modern HTTP path; metadata alone never grants support; and the project-owned A2UI binding pins an exact Candidate revision and ordered resource transport with text/data fallback. The A2UI package parses lifecycle envelopes, retains bounded ordered state, validates complete snapshots against the pinned basic catalog plus explicit host allowlists, including nested expressions in literal `formatString` sources reconstructed as catalog calls, and constructs the supported official renderer action envelope. The React Native package adapts and mounts every non-media basic-catalog component with bounded dynamic lists, renderer-local typed bindings, bounded string/number/currency/date/plural formatting, pure boolean and validation evaluation, supported checks, dispatch-time template event resolution, required image grants, and press-time policy-gated HTTP(S) `openUrl` while rejecting unsupported components and functions. See the [standards-first roadmap](roadmap.md).

MCP Apps compatibility remains a separate track. A malformed or unsupported native surface fails
closed rather than silently becoming executable HTML, and an invalid Apps resource is never
interpreted as native UI. The stable Apps grant, resource resolver, sandbox, and bridge are all
explicit boundaries.

## Compatibility note

The original proof-of-concept `McpClient.readResource(uri)` returned one `McpResource`. The official SDK and MCP response model return a `contents` collection, so RFC-0001 now defines `Promise<McpReadResourceResult>` with `contents: readonly McpResource[]`.

Early adopters implementing `McpClient` must wrap their resource in `contents`:

```ts
// Before
return { uri, text: "..." };

// RFC-0001 adapter milestone
return { contents: [{ uri, text: "..." }] };
```

This intentional pre-1.0 correction prevents silent data loss when a server returns multiple resource content items.

The same fidelity rule now applies to tool listings and content. `listTools()` returns `McpListToolsResult` rather than discarding result `_meta`, pagination, and cache hints, and MCP content uses official discriminated fields rather than a generic `{ type, data }` wrapper:

```ts
// Before
return [{ name: "save", inputSchema: { type: "object" } }];
return { content: [{ type: "text", data: { text: "Saved" } }] };

// Current RFC-0001 contract
return { tools: [{ name: "save", inputSchema: { type: "object" } }] };
return { content: [{ type: "text", text: "Saved" }] };
```

## Deferred work

- A2UI agent-initiated renderer-function execution and interoperability beyond the declared profile
- Extension-specific operations and additional official extension conformance scenarios
- Platform accessibility testing and renderer capability transport integration
- Expo Go integration PoCs and platform-specific production lifecycle validation
- Richer React Native catalog components, styling, and platform-specific accessibility behavior
- Sensitive-device capability policies, consent, and permissions
- MCP Apps browser-host double-iframe support and optional stable methods outside the documented
  native host-adapter profile
- SwiftUI, Jetpack Compose, or other native renderers
