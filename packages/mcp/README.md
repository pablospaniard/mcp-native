<div align="center">

# @mcp-native/mcp

### A validated bridge from the official MCP TypeScript SDK to MCP Native

[GitHub](https://github.com/pablospaniard/mcp-native) · [Architecture](https://github.com/pablospaniard/mcp-native/blob/main/docs/RFC-0001-architecture.md) · [Protocol support](https://github.com/pablospaniard/mcp-native/blob/main/docs/protocol-support.md) · [Standards status](https://github.com/pablospaniard/mcp-native/blob/main/docs/standards-compatibility.md) · [Official SDK](https://github.com/modelcontextprotocol/typescript-sdk) · [Security](https://github.com/pablospaniard/mcp-native/blob/main/SECURITY.md)

</div>

> **Experimental:** this package is an early proof of concept. Its public API may change before `1.0.0`.

> **Compatibility:** SDK v2 is the correct implementation line for MCP `2026-07-28`. The initial tool/resource boundary preserves official fields and is covered through the SDK's current HTTP handler/fetch path, but the package does not yet claim complete MCP conformance.

`@mcp-native/mcp` adapts a connected [`Client`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/client.md) from `@modelcontextprotocol/client` v2 to the transport-neutral `McpClient` interface in `@mcp-native/core`.

The adapter deliberately does not create a transport, manage credentials, or own the SDK client's lifecycle. The host chooses and connects the official client, then hands it to MCP Native.

## Install

```bash
npm install @mcp-native/mcp @mcp-native/core @modelcontextprotocol/client
```

The package is ESM-only and includes TypeScript declarations.

## Quick start

```ts
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { McpNativeRuntime } from "@mcp-native/core";
import { createMcpNativeClientOptions, McpSdkClientAdapter } from "@mcp-native/mcp";

const client = new Client(
  { name: "my-native-host", version: "1.0.0" },
  createMcpNativeClientOptions("auto"),
);
const transport = new StdioClientTransport({
  command: "node",
  args: ["./dist/server.js"],
});

await client.connect(transport);

const runtime = new McpNativeRuntime(new McpSdkClientAdapter(client));

const { tools } = await runtime.listTools();
const result = await runtime.callTool(tools[0]!.name, {});
const resources = await runtime.readResource("ui://example");

await client.close();
```

Use `createMcpSdkClientAdapter(client)` when a factory reads better than constructing the class directly.

The options helper deliberately offers only the current `2026-07-28` target and tested `2025-11-25` fallback. Use `"modern-only"` to pin the current revision without fallback or `"legacy-only"` for a server known to implement the tested legacy revision.

To advertise an explicitly approved extension on the modern lane, pass its settings as the second argument:

```ts
const clientExtensions = {
  "com.example/native-ui": { version: "1" },
};

const options = createMcpNativeClientOptions("modern-only", {
  extensions: clientExtensions,
});
const client = new Client({ name: "my-native-host", version: "1.0.0" }, options);
await client.connect(transport);

const adapter = new McpSdkClientAdapter(client, { clientExtensions });
```

The official SDK places these settings in the `2026-07-28` per-request capability envelope. After connection, `McpSdkClientAdapter.getClientExtensionSettings()` returns the advertised snapshot passed into the adapter, and `getServerExtensionSettings()` returns the validated server declaration from `server/discover`. Pass those two maps to a core or extension-specific negotiator, or call `runtime.negotiateExtension(id)` so negotiation stays tied to what was actually advertised. The `2025-11-25` lane has no extension support claim.

## Mapping

| Official SDK operation                 | MCP Native result                                                           |
| -------------------------------------- | --------------------------------------------------------------------------- |
| `client.listTools()`                   | `McpListToolsResult` with definitions, `_meta`, pagination, and cache hints |
| `client.callTool({ name, arguments })` | `McpToolCallResult` with official content shapes and result `_meta`         |
| `client.readResource({ uri })`         | `McpReadResourceResult` preserving content, `_meta`, and cache hints        |

SDK content blocks retain MCP's official discriminated shapes: text, image, audio, resource link, and embedded resource. Tool definitions preserve titles, icons, complete input/output schemas, annotations, and JSON-safe `_meta`. Resource reads preserve text and blob items as separate entries.

Install `@mcp-native/a2ui` to resolve an `application/a2ui+json` `resource_link` from an adapted tool result into a validated declarative surface.

## Validation boundary

Although the official SDK validates protocol traffic, MCP Native validates values again before they cross into renderer-facing contracts. `McpSdkAdapterError` is thrown for:

- malformed result objects or collections;
- unknown content types and non-string names, URIs, MIME types, or bodies;
- malformed icons, annotations, schemas, cache hints, or result metadata;
- task execution declarations, because task-augmented calls are outside the current adapter boundary;
- `undefined`, functions, symbols, bigints, or non-finite numbers inside JSON data;
- class instances, circular objects, circular arrays, and sparse arrays;
- prototype-named JSON keys are preserved as ordinary own data properties without changing object prototypes;
- resource entries with neither body or with both `text` and `blob`.

This adapter never evaluates server-provided code and never resolves a server-provided component name.

## Public API

| Export                                                                                                           | Purpose                                                                          |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `McpSdkClientAdapter`                                                                                            | Implements the core `McpClient` boundary for a connected SDK client.             |
| `McpSdkClientAdapterOptions`                                                                                     | Optional advertised `clientExtensions` snapshot retained for negotiation.        |
| `createMcpSdkClientAdapter`                                                                                      | Factory returning an adapter for a connected SDK client.                         |
| `McpSdkAdapterError`                                                                                             | Specific validation error for results that cannot safely map.                    |
| `createMcpNativeClientOptions`, `McpNativeProtocolMode`                                                          | Exact official SDK options for automatic, modern-only, or legacy-only operation. |
| `McpNativeClientCapabilityOptions`                                                                               | Explicit host-approved extension settings accepted by the options helper.        |
| `MCP_NATIVE_PROTOCOL_REVISION`, `MCP_NATIVE_LEGACY_PROTOCOL_REVISION`, `MCP_NATIVE_SUPPORTED_PROTOCOL_REVISIONS` | The current target and deliberately tested revision list.                        |

## Scope

- Official SDK client v2 integration only.
- Integration tests pin `2026-07-28` through the official SDK HTTP handler/fetch path and verify `auto` fallback to exactly `2025-11-25` through the linked in-memory transport.
- Seven applicable official client scenarios cover tool calls, request metadata and version retry, standard and custom HTTP headers, invalid header annotations, safe `$ref` handling, and JSON Schema 2020-12 preservation. See the [pinned coverage report](https://github.com/pablospaniard/mcp-native/blob/main/docs/mcp-conformance.md).
- The conformance gate accounts for every scored client requirement in the pinned official fixture, while shared-store tests verify that private cache entries stay principal-partitioned and public entries are reused only for the same server identity and request.
- Hosts retain connection setup, transport selection, authentication, retries, and shutdown.
- Generic JSON-safe `_meta` is preserved across the adapter boundary.
- Generic extension discovery and settings are implemented and verified on the modern SDK path.
- The adapter package remains independent of React Native, A2UI, and WebView packages.

## License

[MIT](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)
