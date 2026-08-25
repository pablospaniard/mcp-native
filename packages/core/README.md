<div align="center">

# @mcp-native/core

### Transport-neutral MCP runtime contracts and safe action routing

[![npm](https://img.shields.io/npm/v/@mcp-native/core)](https://www.npmjs.com/package/@mcp-native/core)
[![downloads](https://img.shields.io/npm/dm/@mcp-native/core)](https://www.npmjs.com/package/@mcp-native/core)
[![license](https://img.shields.io/npm/l/@mcp-native/core)](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)

[GitHub](https://github.com/pablospaniard/mcp-native) · [Architecture](https://github.com/pablospaniard/mcp-native/blob/main/docs/RFC-0001-architecture.md) · [Security](https://github.com/pablospaniard/mcp-native/blob/main/SECURITY.md)

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
import { McpNativeRuntime, type McpClient } from "@mcp-native/core";

const client: McpClient = {
  async listTools() {
    return [
      {
        name: "save_profile",
        description: "Save profile details",
        inputSchema: { type: "object" },
      },
    ];
  },
  async callTool(name, arguments_) {
    return {
      content: [{ type: "json", data: { name, arguments: arguments_ } }],
    };
  },
  async readResource(uri) {
    return {
      contents: [{ uri, mimeType: "text/plain", text: "Hello from MCP" }],
    };
  },
};

const runtime = new McpNativeRuntime(client);

await runtime.dispatch({
  type: "tool",
  name: "save_profile",
  arguments: { displayName: "Ada" },
});
```

## Public API

| Export                                                                 | Purpose                                                                                     |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `McpNativeRuntime`                                                     | Delegates tool listing, tool calls, resource reads, and declared actions to an `McpClient`. |
| `McpClient`                                                            | Minimal interface implemented by an SDK- or transport-specific adapter.                     |
| `McpTool`, `McpResource`, `McpReadResourceResult`, `McpToolCallResult` | Transport-neutral MCP data contracts used by the runtime.                                   |
| `ToolAction`, `McpNativeAction`                                        | Declarative actions that can be dispatched through the runtime.                             |
| `JsonPrimitive`, `JsonValue`, `JsonObject`                             | JSON-safe value types for untrusted protocol data.                                          |

## Resource result migration

The initial `0.0.x` proof of concept returned one `McpResource` directly from `readResource`. The official SDK returns a content collection, so implementations now return `McpReadResourceResult`:

```ts
// Before
return { uri, text: "Hello" };

// Current RFC-0001 contract
return { contents: [{ uri, text: "Hello" }] };
```

Preserving the collection avoids silently discarding valid resource items.

## Design boundaries

- No React Native dependency.
- No A2UI or WebView dependency.
- No transport or official MCP SDK dependency.
- No remote code loading or execution.
- Host applications remain responsible for authentication, permissions, transport security, and user approval.

## Related packages

- [`@mcp-native/a2ui`](https://www.npmjs.com/package/@mcp-native/a2ui) validates declarative surfaces and actions.
- [`@mcp-native/mcp`](https://github.com/pablospaniard/mcp-native/tree/main/packages/mcp) adapts connected official SDK clients to this package's contracts.
- [`@mcp-native/react-native`](https://www.npmjs.com/package/@mcp-native/react-native) converts validated surfaces into trusted native render plans.
- [`@mcp-native/webview`](https://www.npmjs.com/package/@mcp-native/webview) defines the HTML compatibility policy boundary.
- [`mcp-native`](https://www.npmjs.com/package/mcp-native) re-exports the runtime and UI APIs.

## License

[MIT](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)
