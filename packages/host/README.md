# `@mcp-native/host`

High-level MCP Native orchestration for applications that want a supported tool result resolved
through one fail-closed contract.

The first host slice provides deterministic result resolution. It validates SDK-shaped tools and
results, negotiates the built-in A2UI and MCP Apps profiles, loads the selected resource, and returns
exactly one of four outcomes: `a2ui`, `mcp-app`, `ordinary`, or `invalid`.

```ts
import {
  MCP_NATIVE_HOST_EXTENSION_CAPABILITIES,
  resolveMcpNativeHostResult,
} from "@mcp-native/host";

const resolved = await resolveMcpNativeHostResult({
  tool,
  result,
  client: mcpClient,
});
```

`mcpClient` must be the connection-bound `McpSdkClientAdapter` that performed resource reads and
retains the client and server extension snapshots. Advertise
`MCP_NATIVE_HOST_EXTENSION_CAPABILITIES` when constructing the official SDK client and pass that
same map into the adapter. The resolver deliberately does not accept separate capability maps, so a
call site cannot manufacture negotiation for a connection that did not advertise a profile.

MIME type alone never grants an executable UI path. A2UI and MCP Apps require exact mutual
extension negotiation. An ambiguous result or a failure after a standard path has been selected
returns `invalid`; it is never retried through another renderer. Ordinary MCP content remains inert
fallback data for the application to present safely.

Connection ownership, tool-call state, React Native mounting, action delivery, and lifecycle
coordination are the next `1.0.0` host-package slices. Applications can continue using the focused
`@mcp-native/*` packages directly.
