# `@mcp-native/host`

High-level MCP Native orchestration for applications that want to connect, discover tools, call one,
and resolve its supported result through one fail-closed contract.

`McpNativeHostController` owns a fresh connection unit, bounded retry lifecycle, automatic tool
discovery, one active operation, cancellation, reconnect, stale-result rejection, and teardown.
Every call is bound to the exact tool definition discovered on the same connection. Its result is
validated, negotiated, and returned as exactly one of `a2ui`, `mcp-app`, `ordinary`, or `invalid`.

```ts
import { Client } from "@modelcontextprotocol/client";
import {
  MCP_NATIVE_HOST_EXTENSION_CAPABILITIES,
  createMcpNativeHostController,
} from "@mcp-native/host";
import { createMcpNativeClientOptions, McpSdkClientAdapter } from "@mcp-native/mcp";

const host = createMcpNativeHostController({
  createConnection() {
    const transport = createTransport();
    const client = new Client(
      { name: "my-native-host", version: "1.0.0" },
      createMcpNativeClientOptions("auto", {
        extensions: MCP_NATIVE_HOST_EXTENSION_CAPABILITIES,
      }),
    );
    return {
      client: new McpSdkClientAdapter(client, {
        clientExtensions: MCP_NATIVE_HOST_EXTENSION_CAPABILITIES,
      }),
      connect: (signal) => client.connect(transport, { signal }),
      close: () => client.close(),
    };
  },
  classifyError: () => ({ kind: "retryable", code: "connection-failed" }),
});

await host.start(); // connects and automatically lists tools
const resolved = await host.callTool("weather", { city: "Madrid" });
host.cancelCurrentCall();
await host.shutdown();
```

`createConnection()` must return a fresh client and transport ownership unit on every attempt.
Applications still select the server and supply secure storage and the OS authentication-session
handoff when OAuth is required. `classifyError()` must return only a stable host-authored code; raw
transport and server errors never enter the controller snapshot.

Use `getSnapshot()` and `subscribe()` to observe connection, tool-discovery, and call state. Only one
discovery or call runs at a time. `refreshTools()` forces the official SDK to replace a still-fresh
cached list. An `AbortSignal` or `cancelCurrentCall()` reaches the official SDK; late results from a
cancelled, timed-out, or replaced connection cannot update state. Unsettled work and live listeners
are bounded. `setOnline()`, `retry()`, and `shutdown()` expose the lifecycle controls.

MIME type alone never grants an executable UI path. A2UI and MCP Apps require exact mutual
extension negotiation. An ambiguous result or a failure after a standard path has been selected
returns `invalid`; it is never retried through another renderer. Ordinary MCP content remains inert
fallback data for the application to present safely.

`resolveMcpNativeHostResult()` remains public for applications composing the low-level path. React
Native mounting and unified A2UI/MCP Apps action authorization are the remaining `1.0.0`
host-package slices. Applications can continue using every focused `@mcp-native/*` package directly.
