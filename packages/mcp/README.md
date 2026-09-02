<div align="center">

# @mcp-native/mcp

### A validated bridge from the official MCP TypeScript SDK to MCP Native

[GitHub](https://github.com/pablospaniard/mcp-native) · [Architecture](https://github.com/pablospaniard/mcp-native/blob/main/docs/RFC-0001-architecture.md) · [Protocol support](https://github.com/pablospaniard/mcp-native/blob/main/docs/protocol-support.md) · [Standards status](https://github.com/pablospaniard/mcp-native/blob/main/docs/standards-compatibility.md) · [Official SDK](https://github.com/modelcontextprotocol/typescript-sdk) · [Security](https://github.com/pablospaniard/mcp-native/blob/main/SECURITY.md)

</div>

> **Release status:** `0.9.x` is the feature-complete release candidate for the documented React
> Native host scope. Its public API is frozen for `1.0.0`, so teams can integrate this adapter now.
> The stable `1.x` compatibility guarantee begins with `1.0.0` after final independent review.

> **Compatibility:** SDK v2 is the correct implementation line for MCP `2026-07-28`. The documented
> tool/resource and authorization boundary preserves official fields and passes the pinned HTTP and
> conformance coverage. The [protocol support policy](https://github.com/pablospaniard/mcp-native/blob/main/docs/protocol-support.md)
> lists the implemented operations and tested revisions.

`@mcp-native/mcp` adapts a connected [`Client`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/client.md) from `@modelcontextprotocol/client` v2 to the transport-neutral `McpClient` interface in `@mcp-native/core`. It also provides the native host boundary for interactive OAuth on protected Streamable HTTP connections.

The result adapter does not own SDK wire behavior. The host still chooses and constructs the
official client and transport. `createMcpNativeConnectionLifecycle()` optionally coordinates their
bounded timeout, cancellation, retry/backoff, offline, reconnection, state, diagnostics, and shutdown
around fresh host-owned SDK connection units. For protected HTTP, the package also creates the exact
official transport/profile while the host owns its secure credential store, browser handoff, and
user consent.

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

## Protected Streamable HTTP

`createMcpNativeOAuthProvider()` implements the security-sensitive host seams needed by the official
SDK's interactive OAuth flow:

```ts
import { Client, UnauthorizedError } from "@modelcontextprotocol/client";
import { createMcpNativeClientOptions } from "@mcp-native/mcp";
import {
  createMcpNativeOAuthAuthorizationSession,
  createMcpNativeOAuthPlatformSecureStore,
  createMcpNativeOAuthProvider,
  createMcpNativeOAuthTransport,
} from "@mcp-native/mcp/oauth";

const serverUrl = new URL("https://mcp.example.com/mcp");
const redirectUrl = "my-app://oauth/callback";
const secureOAuthStore = createMcpNativeOAuthPlatformSecureStore({
  namespace: "com.example.myapp.production",
  backend: keychainOrKeystoreBackend,
});
const authorizationSession = createMcpNativeOAuthAuthorizationSession({
  redirectUrl,
  open: openSystemAuthenticationSession,
});
const provider = createMcpNativeOAuthProvider({
  serverUrl,
  redirectUrl,
  clientMetadata: { client_name: "My app", redirect_uris: [redirectUrl] },
  storage: secureOAuthStore,
  scopeStore: durableResourceBoundScopeStore,
  createState: () => createCryptographicallyRandomState(),
  openAuthorization: authorizationSession.openAuthorization,
  approveReauthorization: (request) => consentAndCheckRetryBudget(request),
});
const client = new Client(
  { name: "my-app", version: "1.0.0" },
  createMcpNativeClientOptions("modern-only"),
);
const transport = createMcpNativeOAuthTransport(serverUrl, provider, {
  scopeEscalation: "host-approved",
});

try {
  await client.connect(transport);
} catch (error) {
  if (!(error instanceof UnauthorizedError)) throw error;
  await authorizationSession.finishAuthorization(provider, transport);
  // Reconnect on a fresh official transport after successful completion.
}
```

`McpNativeOAuthSecureStore` must be implemented with OS keychain/keystore-grade encrypted storage.
Its contract includes a pending-authorization record bound to the protected resource, the issuer
when known, and the exact requested scopes. The record lives only for the reserved state/verifier
attempt; `verifier` and `all` invalidation must remove it. This lets a process-recovery callback
retain an omitted token-response scope without letting an unrelated refresh inherit browser-requested
scopes.
`createMcpNativeOAuthPlatformSecureStore()` supplies the bounded serialization, fixed app-owned
service slots, exact issuer binding, and exclusive state reservation, claim, and release serialized
across store objects using the same namespace in one JS runtime over a narrow native secret backend;
it cannot make AsyncStorage or a plain file secure. The provider validates stored values
before returning them to the SDK, bounds complete registration, discovery, and token structures—including
token extension fields—before schema parsing, persistence, or reuse, validates every registered redirect URI,
rejects duplicate registered redirect query names, redirects without enough bounded callback
capacity, and literal fragment delimiters on server,
redirect, authorization, and callback URLs, requires every actionable discovery endpoint to use
HTTPS or an HTTP loopback address and contain no fragment before caching or reuse, refreshes
discovery after the callback so authorization-server migrations cannot reuse old credentials, pins
RFC 8707 resource indicators to one MCP endpoint, compares callback location and state before code
redemption, bounds authorization URLs before reparsing and browser handoff, accepts IPv4 loopback
addresses throughout `127.0.0.0/8`, and never exposes attacker-controlled callback error descriptions.

`createMcpNativeOAuthAuthorizationSession()` normalizes an app-owned
`ASWebAuthenticationSession`/Android Custom Tab bridge into one exact callback. It rejects overlap,
callback substitution, oversized or malformed results, and reuse. A cancellation result clears
pending state and PKCE material without deleting registrations or tokens; direct provider
cancellation is rejected while the system handoff, state setup, or callback completion is active. The
provider reserves one interactive attempt before state persistence, the store rejects a second
reservation for the same namespace, and only that provider can cancel or clear the live attempt.
The browser handoff requires that reservation and exactly one saved PKCE verifier.
After a process restart, when no live owner remains, cancellation can claim and release the stale
reservation. Callback validation claims rather than deletes the state, keeping the namespace occupied
until verifier cleanup succeeds. Full and verifier credential invalidation observe the same
active-flow and ownership checks as cancellation. The same total and per-parameter callback budgets apply to the
direct process-recovery path. See the [native OAuth host integration
guide](https://github.com/pablospaniard/mcp-native/blob/main/docs/native-oauth-testing.md) for an
Expo Go-compatible reference mapping and production-host responsibilities.

`createMcpNativeOAuthTransport()` rejects manual credential headers and configures
`insufficient_scope` to throw by default. Setting `scopeEscalation: "host-approved"` is accepted only
when the provider has an `approveReauthorization` callback. That callback receives the exact
protected resource and runs for every new authorization request while credentials or persisted scope
history exist, even when a hostile resource repeats the same scope;
the transport permits at most one SDK step-up retry per request. The host must maintain any stricter
cross-request budget. Supply `scopeStore` to retain a validated issuer/resource-bound scope record
across token invalidation and provider instances; full credential invalidation removes it. All 25
scored pinned official `2026-07-28` authorization client scenarios
pass. The runnable [Expo Go todo app](../../examples/expo-go-todolist/README.md) provides separate
application-level native evidence.

## Production connection lifecycle

Wrap fresh official SDK ownership units when the host needs a common production state machine:

```ts
import { createMcpNativeConnectionLifecycle } from "@mcp-native/mcp";

const lifecycle = createMcpNativeConnectionLifecycle({
  createConnection() {
    const client = createOfficialClient();
    const transport = createOfficialTransport();
    return {
      connect: () => client.connect(transport),
      close: () => client.close(),
      closed: observeOneUnexpectedTransportClose(transport),
    };
  },
  classifyError: (error) => classifyWithoutRetainingRawError(error),
  onStateChange: renderConnectionState,
  diagnostics: operationalSink,
});

await lifecycle.start();
await lifecycle.setOnline(false);
await lifecycle.setOnline(true);
await lifecycle.shutdown();
```

Attempts, timeouts, exponential backoff, and close waits have hard maximums. Cancellation aborts the
host callback and closes its ownership unit; the host must make `connect(signal)` respond promptly.
The optional `closed` promise triggers reconnection through a fresh unit. Fixed operational events
contain only outcome, timing, attempt, and stable host-classified code fields, so they can feed logs,
metrics, and traces without accepting raw errors, URLs, credentials, tokens, server data, or user
data. See the [production host checklist](https://github.com/pablospaniard/mcp-native/blob/main/docs/host-integration-checklist.md).

## Mapping

| Official SDK operation                 | MCP Native result                                                           |
| -------------------------------------- | --------------------------------------------------------------------------- |
| `client.listTools()`                   | `McpListToolsResult` with definitions, `_meta`, pagination, and cache hints |
| `client.callTool({ name, arguments })` | `McpToolCallResult` with official content shapes and result `_meta`         |
| `client.readResource({ uri })`         | `McpReadResourceResult` preserving content, `_meta`, and cache hints        |

SDK content blocks retain MCP's official discriminated shapes: text, image, audio, resource link, and embedded resource. Tool definitions preserve titles, icons, complete input/output schemas, annotations, and JSON-safe `_meta`. Resource reads preserve text and blob items as separate entries.

The adapter validates and reconstructs each complete SDK result before mapping it. One result may
contain at most 1,024 top-level tools, content blocks, or resource contents, with at most 64 icons
or icon sizes per value and the core cumulative JSON string/key budget across the entire result.
SDK objects may materialize omitted optional properties as `undefined`; those object properties are
discarded, while `undefined` array entries and all other non-JSON values fail closed.

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
| `McpNativeConnectionLifecycle`, `createMcpNativeConnectionLifecycle`                                             | Bounded host coordination around fresh official SDK connections.                 |
| `McpNativeHostState`, `McpNativeOperationalEvent`, `McpNativeOperationalSink`                                    | Actionable UI states and a fixed redacted observability boundary.                |
| `McpNativeConnectionLifecycleError`                                                                              | Stable timeout/cancellation category passed only to the host classifier.         |
| The protected-HTTP exports below live at the explicit `@mcp-native/mcp/oauth` subpath so importing               |
| the result adapter does not load a transport implementation:                                                     |

| Export                                                                           | Purpose                                                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `McpNativeOAuthClientProvider`, `createMcpNativeOAuthProvider`                   | Issuer-bound official SDK OAuth provider with native host seams.                |
| `McpNativeOAuthSecureStore`                                                      | Host keychain/keystore persistence contract for credentials and redirect state. |
| `McpNativeOAuthPlatformSecureStore`, `createMcpNativeOAuthPlatformSecureStore`   | Bounded adapter over an app-owned native secret backend.                        |
| `McpNativeOAuthAuthorizationSession`, `createMcpNativeOAuthAuthorizationSession` | Closed OS browser-session callback adapter.                                     |
| `McpNativeOAuthReauthorizationRequest`                                           | Frozen host decision input for bounded interactive reauthorization.             |
| `McpNativeOAuthScopeStore`, `McpNativeOAuthScopeRecord`                          | Persistent resource/issuer-bound scope-upgrade history.                         |
| `createMcpNativeOAuthTransport`                                                  | Protected HTTP transport with resource pinning and host-gated scope escalation. |
| `McpNativeOAuthError`                                                            | Fail-closed categories without attacker-controlled callback details.            |

## Scope

- Official SDK client v2 integration only.
- Integration tests pin `2026-07-28` through the official SDK HTTP handler/fetch path and verify `auto` fallback to exactly `2025-11-25` through the linked in-memory transport.
- Thirty-two applicable official client scenarios cover every scored `2026-07-28` authorization
  client scenario plus tool calls, request metadata and version retry, standard and custom HTTP
  headers, invalid header annotations, safe `$ref` handling, and JSON Schema 2020-12 preservation.
  See the [pinned coverage report](https://github.com/pablospaniard/mcp-native/blob/main/docs/mcp-conformance.md).
- The conformance gate accounts for every scored client requirement in the pinned official fixture, while shared-store tests verify that private cache entries stay principal-partitioned and public entries are reused only for the same server identity and request.
- Hosts retain SDK construction and wire behavior, consent, platform authentication-session
  presentation, and secure-storage implementation. The optional lifecycle controller coordinates
  bounded host operations around those SDK objects; the protected-HTTP helper owns only the exact
  OAuth/transport policy boundary documented above.
- Generic JSON-safe `_meta` is preserved across the adapter boundary.
- Generic extension discovery and settings are implemented and verified on the modern SDK path.
- The adapter package remains independent of React Native, A2UI, and WebView packages.

## License

[MIT](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)
