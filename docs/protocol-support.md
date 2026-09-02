# MCP protocol support policy

This document defines the exact MCP core revisions and operations MCP Native deliberately supports. The official TypeScript SDK owns wire codecs, handshakes, request envelopes, transport behavior, and era negotiation; `@mcp-native/mcp` validates and adapts results after the host connects a client.

## Revision matrix

| Revision     | SDK era | MCP Native status           | Verified path                                                                                           |
| ------------ | ------- | --------------------------- | ------------------------------------------------------------------------------------------------------- |
| `2026-07-28` | modern  | Verified current boundary   | Pinned HTTP integration, official requirement accounting, selected scenarios, and cache-isolation tests |
| `2025-11-25` | legacy  | Verified compatibility lane | SDK `auto` fallback through the linked in-memory transport                                              |

The verified adapter boundary covers:

- `tools/list`;
- `tools/call`;
- `resources/read`;
- the tool, schema, annotation, content, resource, `_meta`, pagination, and cache-hint fields represented by the core contracts.

The generic extension capability substrate described below handles explicit mutual declarations.
Tool definitions containing `execution` settings fail closed so task semantics are never silently
removed.

## Host modes

`@mcp-native/mcp` exports `createMcpNativeClientOptions()` so the documented policy and executable SDK options cannot drift:

```ts
import { Client } from "@modelcontextprotocol/client";
import { createMcpNativeClientOptions } from "@mcp-native/mcp";

const client = new Client(
  { name: "my-native-host", version: "1.0.0" },
  createMcpNativeClientOptions("auto"),
);
```

| Mode          | Offered revisions               | Behavior                                                                  |
| ------------- | ------------------------------- | ------------------------------------------------------------------------- |
| `auto`        | `2026-07-28`, then `2025-11-25` | Probe for the modern era and fall back only to the tested legacy revision |
| `modern-only` | `2026-07-28`                    | Pin the current revision and fail if the server does not offer it         |
| `legacy-only` | `2025-11-25`                    | Skip the modern probe and use the tested legacy handshake                 |

`auto` is the helper default because MCP Native targets long-lived native hosts that normally benefit from modern negotiation. Spawn-per-invocation command-line tools should choose deliberately: the official SDK warns that probing a silent legacy stdio server can consume the full probe timeout and may spawn a disposable sibling process.

The helper returns verified SDK options. The host owns client/transport construction and wire
behavior. `createMcpNativeConnectionLifecycle()` optionally coordinates bounded timeout,
cancellation, retry/backoff, offline transitions, reconnection, safe states/operations, and shutdown
around fresh host-owned SDK units. For protected Streamable HTTP, `@mcp-native/mcp` additionally exports
an issuer-bound official SDK OAuth provider and transport factory. They pin one protected resource,
validate bounded stored registrations, tokens, discovery, every registered redirect URI, issuer
URLs, and callback state before parsing, persistence, or reuse; reject duplicate registered redirect
query names, insufficient configured callback capacity, and literal fragment delimiters on server,
redirect, authorization, and callback URLs;
require every actionable discovery endpoint to use HTTPS or an HTTP loopback address without a
fragment; reject manual credential headers; and require a host-owned secure store and
browser/authentication-session handoff. Dependency-neutral reference adapters provide bounded
fixed-slot persistence with cross-instance namespaced state serialization over a native secret
backend and a closed ASWebAuthenticationSession/Custom Tab result boundary without importing React
Native. A claimed callback keeps that namespace reserved through verifier cleanup. One provider
owns one interactive attempt, requires reserved state and exactly one saved verifier before handoff,
rejects cancellation during setup, handoff, or completion, prevents a
second provider from cancelling the live attempt, and applies callback budgets to both native-session
and process-recovery entry points. All 25 scored pinned
`2026-07-28` authorization client scenarios pass. Persistent resource/issuer-bound scope history is
available through a host `McpNativeOAuthScopeStore`, and full invalidation removes that history.
The secure-store contract binds requested scopes to the pending state/verifier attempt so a
scope-less callback survives process recovery without changing unrelated refresh scopes.
Native-library integration is tracked separately through the open application-demonstration matrix.

## Extension capability substrate

Hosts can supply an explicit, validated extension map as the second options argument, and must pass the same map into the SDK adapter so negotiation uses the advertised snapshot:

```ts
const clientExtensions = {
  "com.example/native-ui": { version: "1" },
};

const client = new Client(
  { name: "my-native-host", version: "1.0.0" },
  createMcpNativeClientOptions("modern-only", { extensions: clientExtensions }),
);
await client.connect(transport);

const adapter = new McpSdkClientAdapter(client, { clientExtensions });
```

For `2026-07-28`, the official SDK places these settings in the per-request client capability envelope and exposes the server's `server/discover` capability result. Pass the same validated map into `McpSdkClientAdapter` as `clientExtensions` so `getClientExtensionSettings()` retains the advertised snapshot. `getServerExtensionSettings()` validates the server result before it enters core. `McpNativeRuntime.negotiateExtension()` and `negotiateMcpExtension()` report support only when the same mandatorily prefixed identifier is present in those explicit maps.

The `2026-07-28` lane verifies explicit extension exchange. Metadata, MIME types, and tool results
never substitute for mutual declarations; fallback results preserve ordinary MCP text or structured
data, and invalid declarations fail closed.

The project-defined [`io.github.pablospaniard/mcp-native-a2ui`
binding](a2ui-mcp-binding.md) implements the transport for the documented [feature-scoped A2UI v1.0
Candidate profile](a2ui-v1-conformance.md), including lifecycle and renderer-message parsing,
bounded ordered state, and policy-gated surface validation. Both peers must negotiate the exact
binding settings before that path is enabled.

The official `io.modelcontextprotocol/ui` identifier is implemented separately through the [stable
MCP Apps `2026-01-26` native host-adapter profile](mcp-apps-compatibility.md). Both peers must include
the exact stable HTML MIME type in their extension settings before `_meta.ui` discovery or `ui://`
resource resolution is enabled. Apps metadata and MIME types never substitute for that mutual grant.

## Compatibility guarantees

- Supported revisions are listed explicitly in the revision matrix and executable SDK options.
- Adding or removing a revision requires a reviewed policy change, pinned integration coverage, field-fidelity review, and release notes.
- Breaking wire changes are handled by the official SDK's era-specific codecs rather than conditional logic in `@mcp-native/core`.
- MCP Native documents support per operation and transport, and the current client boundary passes its selected official scenarios.
- The adapter rejects protocol results that cannot be represented faithfully and safely by its public contracts.
- Generic extension capability maps are supported through explicit negotiation, with separately implemented and tested extension semantics.

## Adoption gate for another revision

Before adding a revision to `MCP_NATIVE_SUPPORTED_PROTOCOL_REVISIONS`:

1. pin an official SDK version that deliberately supports the revision;
2. review normative schema and behavior changes for every supported operation;
3. exercise the revision through a supported official transport entry point;
4. add positive, negative, downgrade, and field-fidelity tests;
5. run the applicable pinned official MCP conformance scenarios;
6. update this matrix, standards inventory, roadmap, package documentation, and release notes.

## Normative and implementation references

- [MCP `2026-07-28`](https://modelcontextprotocol.io/specification/2026-07-28)
- [Official TypeScript SDK protocol-version guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/protocol-versions.md)
- [Official SDK migration guidance for `2026-07-28`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/support-2026-07-28.md)
- [Pinned MCP conformance coverage](mcp-conformance.md)
- [Standards and compatibility inventory](standards-compatibility.md)
- [RFC-0001](RFC-0001-architecture.md)
