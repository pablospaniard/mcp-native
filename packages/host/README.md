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
cached list. The official SDK aggregates `listTools()` pagination when called without a cursor; the
controller rejects any residual `nextCursor` as an incomplete tool list instead of exposing a
partial call allowlist. An `AbortSignal` or `cancelCurrentCall()` reaches the official SDK; late
results from a cancelled, timed-out, or replaced connection cannot update state. Unsettled work and
live listeners are bounded. `setOnline()`, `retry()`, and `shutdown()` expose the lifecycle controls.

MIME type alone never grants an executable UI path. A2UI and MCP Apps require exact mutual
extension negotiation. An ambiguous result or a failure after a standard path has been selected
returns `invalid`; it is never retried through another renderer. Ordinary MCP content remains inert
fallback data for the application to present safely.

`resolveMcpNativeHostResult()` remains public for applications composing the low-level path.
Applications can continue using every focused `@mcp-native/*` package directly.

## React Native provider and result renderer

The optional `@mcp-native/host/react-native` entry point owns the controller lifecycle and renders
the complete connection, discovery, call, and result state. The application still supplies its
locally compiled component catalog, A2UI policy, and any MCP Apps WebView adapter.

```tsx
import {
  McpNativeHostProvider,
  McpNativeHostResultView,
  useMcpNativeHost,
} from "@mcp-native/host/react-native";

const controller = createMcpNativeHostController({
  createConnection,
  classifyError,
});

function WeatherResult() {
  const host = useMcpNativeHost();
  return (
    <>
      <AppButton onPress={() => host.callTool("weather", { city: "Madrid" })} />
      <McpNativeHostResultView
        components={appNativeCatalog}
        a2uiPolicy={appA2uiPolicy}
        onA2uiAction={handleA2uiAction}
        onError={reportLocalError}
        mcpApps={appMcpAppsOptions}
      />
    </>
  );
}

export function App() {
  return (
    <McpNativeHostProvider controller={controller} onError={reportLocalError}>
      <WeatherResult />
    </McpNativeHostProvider>
  );
}
```

The provider calls `start()` after mount, publishes immutable snapshots with
`useSyncExternalStore`, retains the exact validated arguments for the active call, and calls
`shutdown()` on unmount. An overlapping call or a call rejected during controller preflight does not
replace the current render context. The result view supplies fixed accessible loading, empty, retry,
failure, and fallback states. Ordinary text is inert and bounded; errored tool text is not mounted.
A2UI is rendered only through the supplied catalog.

For MCP Apps, `mcpApps.View` must be a local wrapper around the application's installed WebView. It
receives only the closed safe props, binds that WebView's `postMessage`, and reports both renderer
and content-process crashes through `onCrash`. Supply host-authored `bridgeOptions`; the result view
itself creates the bridge with the exact resolved resource, deny-default sandbox, discovered tools,
and message channel, then sends tool input/result exactly once and tears the session down on unmount.
Omit `mcpApps` to show a stable unavailable state instead of mounting HTML.

React `>=18.1.0` is the only peer dependency. Neither this entry point nor the focused renderer
imports React Native or depends on Expo; application framework and WebView versions remain owned by
the host.

## Authorize surface actions once

Use one application policy for actions originating from either supported interactive result. The
returned callbacks fit the existing protocol-specific boundaries; A2UI still owns action-envelope
validation and delivery, while MCP Apps still owns tool visibility, JSON-RPC serialization, and
tool-call delivery.

```ts
import { createA2uiV1ActionDeliveryHandler } from "@mcp-native/a2ui";
import { createMcpNativeHostActionAuthorization } from "@mcp-native/host";
import { McpAppsBridge } from "@mcp-native/webview";

const actionAuthorization = createMcpNativeHostActionAuthorization({
  async authorize(request) {
    if (request.kind === "a2ui") {
      return approvedA2uiEvents.has(request.envelope.action.name);
    }
    return approveAppToolCall(request.action.name, request.action.arguments);
  },
});

const handleA2uiAction = createA2uiV1ActionDeliveryHandler({
  authorize: actionAuthorization.authorizeA2uiAction,
  deliver: deliverA2uiActionToAgent,
});

const bridge = new McpAppsBridge({
  // resource, sandbox, tools, hostInfo, and postMessage omitted here
  handlers: {
    authorizeToolCall: actionAuthorization.authorizeMcpAppsToolCall,
    callTool: deliverMcpAppsToolCall,
  },
});
```

Omitting `authorize` denies every action. Only the exact boolean `true` permits delivery, one policy
review may run at a time across both protocols, and each request is reconstructed and deeply frozen.
Application-policy failures surface as a stable host error while retaining the original exception as
its local `cause`; raw application error messages are not exposed to an MCP App.
Treat event names, tool names, arguments, context, metadata, annotations, and user-facing text as
untrusted hints: match them against host-authored policy and consent descriptions. Direct calls made
by trusted application code remain a separate boundary.
