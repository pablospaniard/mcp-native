<div align="center">

# @mcp-native/core

### Transport-neutral MCP runtime contracts and safe action routing

[![npm](https://img.shields.io/npm/v/@mcp-native/core)](https://www.npmjs.com/package/@mcp-native/core)
[![downloads](https://img.shields.io/npm/dm/@mcp-native/core)](https://www.npmjs.com/package/@mcp-native/core)
[![license](https://img.shields.io/npm/l/@mcp-native/core)](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)

[GitHub](https://github.com/pablospaniard/mcp-native) · [Architecture](https://github.com/pablospaniard/mcp-native/blob/main/docs/RFC-0001-architecture.md) · [Standards status](https://github.com/pablospaniard/mcp-native/blob/main/docs/standards-compatibility.md) · [Security](https://github.com/pablospaniard/mcp-native/blob/main/SECURITY.md)

</div>

> **Experimental:** this package is an early proof of concept. Its public API may change before `1.0.0`.

`@mcp-native/core` is the protocol- and renderer-independent foundation of MCP Native. It defines the small MCP client boundary consumed by the runtime and routes declared actions without depending on A2UI, React Native, WebViews, or a specific MCP SDK transport.

## Install

```bash
npm install @mcp-native/core
```

The package is ESM-only and includes TypeScript declarations.

## Quick start

Adapt any MCP client to the `McpClient` interface, then use `McpNativeRuntime` to coordinate operations:

```ts
import { McpNativeRuntime, createAllowlistActionPolicy, type McpClient } from "@mcp-native/core";

const client: McpClient = {
  async listTools() {
    return {
      tools: [
        {
          name: "save_profile",
          description: "Save profile details",
          inputSchema: { type: "object" },
        },
      ],
    };
  },
  async callTool(name, arguments_) {
    return {
      content: [{ type: "text", text: `Called ${name}` }],
      structuredContent: { name, arguments: arguments_ },
    };
  },
  async readResource(uri) {
    return {
      contents: [{ uri, mimeType: "text/plain", text: "Hello from MCP" }],
    };
  },
};

const runtime = new McpNativeRuntime(client, {
  actionPolicy: createAllowlistActionPolicy([
    { name: "save_profile", arguments: { displayName: "Ada" } },
  ]),
});

await runtime.dispatch({
  type: "tool",
  name: "save_profile",
  arguments: { displayName: "Ada" },
});
```

## Public API

| Export                                                                                       | Purpose                                                                                     |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `McpNativeRuntime`                                                                           | Delegates tool listing, tool calls, resource reads, and declared actions to an `McpClient`. |
| `McpClient`                                                                                  | Minimal interface implemented by an SDK- or transport-specific adapter.                     |
| `McpTool`, `McpListToolsResult`, `McpResource`, `McpReadResourceResult`, `McpToolCallResult` | Transport-neutral MCP data contracts used by the runtime.                                   |
| `McpContent` and its discriminated content interfaces                                        | Exact text, image, audio, resource-link, and embedded-resource shapes.                      |
| `McpAnnotations`, `McpToolAnnotations`, `McpIcon`, `McpCacheScope`                           | Official metadata, presentation hints, and response-cache contracts.                        |
| `ToolAction`, `McpNativeAction`                                                              | Declarative actions that can be dispatched through the runtime.                             |
| `McpNativeRuntimeOptions`, `McpNativeActionPolicy`                                           | Host policy controlling which validated surface actions `dispatch()` may execute.           |
| `createAllowlistActionPolicy`, `McpNativeToolAllowlistEntry`                                 | Fail-closed helper that authorizes tools by name and exact or predicated arguments.         |
| `McpNativeActionDeniedError`                                                                 | Fail-closed error for actions not explicitly allowed by the host.                           |
| `parseMcpNativeAction`, `parseJsonObject`, `parseJsonValue`                                  | Strict validators that return safely reconstructed untrusted data.                          |
| `JsonValidationError`                                                                        | Error for non-JSON, circular, non-plain, or non-finite input.                               |
| `JsonPrimitive`, `JsonValue`, `JsonObject`                                                   | JSON-safe value types for untrusted protocol data.                                          |

## Pre-1.0 MCP result migration

The initial `0.0.x` proof of concept returned one `McpResource` directly from `readResource`. The official SDK returns a content collection, so implementations now return `McpReadResourceResult`:

```ts
// Before
return { uri, text: "Hello" };

// Current RFC-0001 contract
return { contents: [{ uri, text: "Hello" }] };
```

Preserving the collection avoids silently discarding valid resource items.

Tool listings likewise preserve result metadata and cache hints, so `listTools()` now returns an object:

```ts
// Before
return [{ name: "save", inputSchema: { type: "object" } }];

// Current RFC-0001 contract
return { tools: [{ name: "save", inputSchema: { type: "object" } }] };
```

Content blocks now use MCP's official discriminated fields. Replace `{ type: "text", data: { text } }` with `{ type: "text", text }`; resource links similarly expose `name`, `uri`, and `mimeType` directly.

## Design boundaries

- No React Native dependency.
- No A2UI or WebView dependency.
- No transport or official MCP SDK dependency.
- No remote code loading or execution.
- Surface-driven `dispatch()` is denied unless the host's action policy explicitly allows it.
- Direct `callTool()` is a lower-level API for trusted host code. It validates JSON arguments but does not apply the surface action policy.
- Prefer `createAllowlistActionPolicy()` so surface authorization covers tool arguments, not only tool names.
- Untrusted JSON is reconstructed without prototype mutation and rejects cycles, non-plain objects, and non-finite numbers.
- Host applications remain responsible for authentication, permissions, transport security, and user approval.

## Related packages

- [`@mcp-native/a2ui`](https://www.npmjs.com/package/@mcp-native/a2ui) validates declarative surfaces and actions.
- [`@mcp-native/mcp`](https://github.com/pablospaniard/mcp-native/tree/main/packages/mcp) adapts connected official SDK clients to this package's contracts.
- [`@mcp-native/react-native`](https://www.npmjs.com/package/@mcp-native/react-native) converts validated surfaces into trusted native render plans.
- [`@mcp-native/webview`](https://www.npmjs.com/package/@mcp-native/webview) defines the HTML compatibility policy boundary.
- [`mcp-native`](https://www.npmjs.com/package/mcp-native) re-exports the runtime and UI APIs.

## License

[MIT](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)
