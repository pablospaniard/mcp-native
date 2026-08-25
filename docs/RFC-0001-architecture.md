# RFC-0001: MCP Native architecture

- Status: Accepted for initial proof of concept
- Date: 2026-08-25

## Summary

MCP Native turns MCP resources and actions into host-controlled native UI. A server may describe a surface using a supported declarative protocol such as A2UI. The host parses that data, maps it to a local component catalog, renders it, and routes declared user actions back through MCP.

HTML MCP Apps remain available through a separately policy-gated WebView fallback.

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

Owns resource-link resolution, parsing, validation, state bindings, and conversion from supported A2UI messages into the internal surface model. Unsupported MIME types, ambiguous links or contents, binary surfaces, versions, nodes, and actions fail closed.

The resolver recognizes the A2UI media type `application/a2ui+json`. The proof-of-concept parser starts with its own deliberately small `0.1` subset containing four nodes: container, text, button, and text input. This is not complete coverage of the current A2UI specification. Supporting more of A2UI must not weaken validation or introduce remote code execution.

### `@mcp-native/react-native`

Owns the native component catalog, React Native rendering, event translation, accessibility defaults, and host customization. The first typed render plan uses only `View`, `Text`, `Button`, and `TextInput`.

### `@mcp-native/webview`

Owns compatibility with HTML MCP Apps. WebView rendering is an explicit fallback and has a separate policy surface for navigation, remote documents, origins, bridge messages, storage, and permissions.

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

The official SDK adapter and declarative resource-resolution milestones are complete in the proof-of-concept workspace:

- `@mcp-native/mcp` targets `@modelcontextprotocol/client` v2;
- an integration test connects the official `Client` and `McpServer` through the SDK's linked in-memory transport;
- `tools/list`, `tools/call`, and `resources/read` traverse the adapter and core runtime;
- malformed SDK-like results fail with `McpSdkAdapterError` before reaching UI code.
- an official SDK tool result can return an `application/a2ui+json` `resource_link` that is read and parsed through `@mcp-native/a2ui`;
- resolution requires exactly one matching link and one matching text resource, preventing server-controlled ambiguity or MIME guessing;
- errored tool results, malformed links and contents, binary bodies, and invalid surfaces fail before rendering.

The next milestone is mounting production React Native components and hooks on the trusted render plan while preserving the host-owned catalog boundary.

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

## Deferred work

- Full A2UI protocol coverage and streaming updates
- Authentication and production transport configuration
- Production React Native components and hooks
- Fine-grained capability negotiation and permissions
- WebView bridge compatibility and origin isolation
- SwiftUI, Jetpack Compose, or other native renderers
