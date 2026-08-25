# RFC-0001: MCP Native architecture

- Status: Accepted for initial proof of concept
- Protocol conformance: None claimed
- Date: 2026-08-25
- Last updated: 2026-08-25

## Summary

MCP Native turns MCP resources and actions into host-controlled native UI. The initial implementation uses a small internal surface model inspired by A2UI. The intended production architecture will parse a supported declarative protocol into an internal trusted render plan, map that plan to a local component catalog, and route declared user actions back through its protocol binding.

HTML MCP Apps are planned through a separately policy-gated WebView path. The current WebView package does not implement the MCP Apps bridge or sandbox.

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

User actions take the reverse path. A component emits a typed action; the core runtime dispatches the corresponding `tools/call` through the connected MCP client.

## Package boundaries

### `@mcp-native/core`

Owns protocol-independent runtime contracts, MCP client abstraction, resource access, action dispatch, and eventually the capability broker. It has no React Native or A2UI dependency.

Its resource contract preserves every content item returned by `resources/read`; a single URI can resolve to more than one text or blob item. Tool results preserve JSON-safe content blocks, the error flag, and structured content without exposing SDK-specific transport types.

### `@mcp-native/mcp`

Owns the integration with the official MCP TypeScript SDK. It accepts an already connected SDK `Client` and adapts `listTools`, `callTool`, and `readResource` to the contracts in `@mcp-native/core`.

This package is the validation boundary between SDK results and the runtime. It rejects malformed collections, non-JSON values, non-plain objects, circular values, invalid optional fields, and resource bodies that are missing or ambiguous. It does not choose a transport, own credentials, or silently manage connection lifecycle.

### `@mcp-native/a2ui`

Owns the current resource-link resolution, parser, validation, and conversion into the internal surface model. Unsupported MIME types, ambiguous links or contents, binary surfaces, versions, nodes, and actions fail closed.

The resolver recognizes the prototype's `application/a2ui+json` resource convention. Its deliberately small `0.1` input contains four nested node types: container, text, button, and text input. This format is not an A2UI protocol version and is not wire-compatible with A2UI v1.0, which uses `v1.0` message envelopes, catalogs, ID-referenced component graphs, data-model updates, and renderer-to-agent messages. Future support must enter through a conforming adapter rather than incrementally redefining the custom wire format.

### `@mcp-native/react-native`

Owns the native component catalog, React Native rendering, event translation, accessibility defaults, and host customization. The first typed render plan and renderer use only `View`, `Text`, `Button`, and `TextInput`.

The renderer accepts a catalog of locally bundled components instead of importing or resolving components named by the server. It explicitly selects every prop crossing into that catalog: text becomes children, button labels become titles and accessibility labels, declared actions become callbacks, and text-input labels become placeholders and accessibility labels. It never spreads unchecked plan or server props.

`useNativeRenderPlan` memoizes conversion for a validated surface identity. `useMcpNativeActionDispatcher` adapts asynchronous runtime dispatch to a synchronous component event and requires an error callback so action failures are observed. Text inputs emit `(binding, value)` changes only when the validated node declares a binding and the host provides a handler. Local binding state and synchronization remain host responsibilities in this milestone.

### `@mcp-native/webview`

Owns the planned compatibility path for HTML MCP Apps. The current implementation only validates HTML resource MIME types and applies a minimal remote-document policy. Complete support still requires tool `_meta.ui.resourceUri` discovery, `ui://` loading, CSP and permission metadata, an isolated platform WebView, and the Apps JSON-RPC/AppBridge protocol.

### `mcp-native`

Convenience package for the runtime and UI APIs. Transport adapters remain separately installable so applications do not acquire an SDK or transport dependency they do not use.

## Capability model

The host owns the effective component and action allowlists. A server can request only capabilities the host has declared. Unknown components, actions, bindings, MIME types, and protocol versions are rejected rather than silently interpreted.

Future capabilities that touch sensitive device APIs must be brokered by the host and may require user approval. Server declarations alone never grant device access.

## Initial milestone

The first end-to-end proof should demonstrate:

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
- malformed SDK-like results fail with `McpSdkAdapterError` before reaching UI code.
- an official SDK tool result can return an `application/a2ui+json` `resource_link` that is read and parsed through `@mcp-native/a2ui`;
- resolution requires exactly one matching link and one matching text resource, preventing server-controlled ambiguity or MIME guessing;
- errored tool results, malformed links and contents, binary bodies, and invalid surfaces fail before rendering.
- validated surfaces mount through a host-provided catalog containing `View`, `Text`, `Button`, and `TextInput`;
- buttons dispatch only their validated tool actions, and text inputs emit only declared binding changes;
- renderer-selected accessibility labels are supplied for interactive components;
- renderer hooks memoize plans and route asynchronous dispatch results or failures to explicit host callbacks;
- component, interaction, hook, malformed-plan, public-export, and isolated package-consumer tests cover the boundary.

The MCP `2026-07-28` foundation is in progress. The initial tool/resource boundary now preserves official metadata, schemas, annotations, discriminated content, and cache semantics, and a pinned integration test exercises the SDK's current HTTP handler/fetch path. The official SDK continues to own wire behavior; extension settings, backwards-compatibility policy, official conformance-suite scenarios, and cache-partition isolation remain before the milestone is complete.

After that foundation, extension negotiation and a pinned A2UI v1.0 Candidate adapter will introduce official envelopes and an ordered surface state engine. The existing host-owned React Native catalog remains the internal rendering boundary. See the [standards-first roadmap](roadmap.md).

MCP Apps compatibility remains a separate track. A malformed or unsupported native surface must fail closed rather than silently becoming executable HTML, and an invalid Apps resource must not be interpreted as native UI.

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

- A2UI v1.0 envelopes, schema validation, catalogs, surface lifecycle, and conformance tests
- MCP extension negotiation, backwards-compatibility policy, official conformance scenarios, and cache-partition tests
- A2UI data-model bindings, actions, functions, capabilities, and streaming updates
- Authentication and production transport configuration
- Richer React Native catalog components, styling, and platform-specific accessibility behavior
- Fine-grained capability negotiation and permissions
- MCP Apps discovery metadata, AppBridge compatibility, WebView sandboxing, and origin isolation
- SwiftUI, Jetpack Compose, or other native renderers
