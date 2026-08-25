<div align="center">

# @mcp-native/mcp

### A validated bridge from the official MCP TypeScript SDK to MCP Native

[GitHub](https://github.com/pablospaniard/mcp-native) · [Architecture](https://github.com/pablospaniard/mcp-native/blob/main/docs/RFC-0001-architecture.md) · [Official SDK](https://github.com/modelcontextprotocol/typescript-sdk) · [Security](https://github.com/pablospaniard/mcp-native/blob/main/SECURITY.md)

</div>

> **Experimental:** this package is an early proof of concept. Its public API may change before `1.0.0`.

`@mcp-native/mcp` adapts a connected [`Client`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/client.md) from `@modelcontextprotocol/client` v2 to the transport-neutral `McpClient` interface in `@mcp-native/core`.

The adapter deliberately does not create a transport, manage credentials, or own the SDK client's lifecycle. The host chooses and connects the official client, then hands it to MCP Native.

## Install

The package is implemented in the monorepo and is scheduled for the next coordinated npm release. Once published:

```bash
npm install @mcp-native/mcp @mcp-native/core @modelcontextprotocol/client
```

The package is ESM-only and includes TypeScript declarations.

## Quick start

```ts
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { McpNativeRuntime } from "@mcp-native/core";
import { McpSdkClientAdapter } from "@mcp-native/mcp";

const client = new Client({ name: "my-native-host", version: "1.0.0" });
const transport = new StdioClientTransport({
  command: "node",
  args: ["./dist/server.js"],
});

await client.connect(transport);

const runtime = new McpNativeRuntime(new McpSdkClientAdapter(client));

const tools = await runtime.listTools();
const result = await runtime.callTool(tools[0]!.name, {});
const resources = await runtime.readResource("ui://example");

await client.close();
```

Use `createMcpSdkClientAdapter(client)` when a factory reads better than constructing the class directly.

## Mapping

| Official SDK operation                 | MCP Native result                                              |
| -------------------------------------- | -------------------------------------------------------------- |
| `client.listTools()`                   | `readonly McpTool[]`                                           |
| `client.callTool({ name, arguments })` | `McpToolCallResult` with JSON-safe blocks and structured data  |
| `client.readResource({ uri })`         | `McpReadResourceResult` preserving every returned content item |

SDK content blocks keep their discriminating `type`. All remaining block fields are copied into the JSON-safe `data` object used by core. Resource reads preserve text and blob items as separate entries.

Install `@mcp-native/a2ui` to resolve an `application/a2ui+json` `resource_link` from an adapted tool result into a validated declarative surface.

## Validation boundary

Although the official SDK validates protocol traffic, MCP Native validates values again before they cross into renderer-facing contracts. `McpSdkAdapterError` is thrown for:

- malformed result objects or collections;
- non-string names, content types, URIs, MIME types, or bodies;
- `undefined`, functions, symbols, bigints, or non-finite numbers inside JSON data;
- class instances, circular objects, and circular arrays;
- resource entries with neither body or with both `text` and `blob`.

This adapter never evaluates server-provided code and never resolves a server-provided component name.

## Public API

| Export                      | Purpose                                                              |
| --------------------------- | -------------------------------------------------------------------- |
| `McpSdkClientAdapter`       | Implements the core `McpClient` boundary for a connected SDK client. |
| `createMcpSdkClientAdapter` | Factory returning an adapter for a connected SDK client.             |
| `McpSdkAdapterError`        | Specific validation error for results that cannot safely map.        |

## Scope

- Official SDK client v2 integration only.
- Connection setup, transport selection, authentication, retries, and shutdown remain host responsibilities.
- Prompts, roots, subscriptions, sampling, elicitation, and task APIs are outside RFC-0001's initial client boundary.
- The adapter package remains independent of React Native, A2UI, and WebView packages.

## License

[MIT](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)
