# MCP protocol support policy

This document defines the exact MCP core revisions and operations MCP Native deliberately supports. The official TypeScript SDK owns wire codecs, handshakes, request envelopes, transport behavior, and era negotiation; `@mcp-native/mcp` validates and adapts results after the host connects a client.

## Revision matrix

| Revision     | SDK era | MCP Native status         | Verified path                                                                       |
| ------------ | ------- | ------------------------- | ----------------------------------------------------------------------------------- |
| `2026-07-28` | modern  | Current target, partial   | Pinned Streamable HTTP integration plus seven applicable official client scenarios  |
| `2025-11-25` | legacy  | Compatibility lane        | SDK `auto` fallback through the linked in-memory transport                          |
| Older dates  | legacy  | No support claim          | The SDK may negotiate them, but MCP Native does not test or deliberately offer them |
| Future dates | modern  | Unsupported until adopted | Never inferred from date ordering or accepted without an explicit project update    |

Neither tested lane is an unqualified whole-protocol conformance claim. The current adapter boundary covers:

- `tools/list`;
- `tools/call`;
- `resources/read`;
- the tool, schema, annotation, content, resource, `_meta`, pagination, and cache-hint fields represented by the core contracts.

Prompts, roots, subscriptions, sampling, elicitation, tasks, authorization, extension negotiation, and other optional operations remain outside the current boundary unless another document explicitly marks them supported.

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

The helper does not construct a client, choose a transport, connect, authenticate, retry, or close anything. Hosts may build their own official SDK options, but doing so moves the selected revisions outside MCP Native's tested policy unless they are identical to a mode above.

## Compatibility guarantees

- A new MCP revision is never treated as supported merely because the SDK recognizes it or its date sorts after `2026-07-28`.
- A legacy revision is never claimed merely because the SDK can negotiate it.
- Adding or removing a revision requires a reviewed policy change, pinned integration coverage, field-fidelity review, and release notes.
- Breaking wire changes are handled by the official SDK's era-specific codecs rather than conditional logic in `@mcp-native/core`.
- MCP Native documents support per operation and transport. The current client boundary passes its selected official scenarios, but operations outside that boundary remain unclaimed.
- The adapter rejects protocol results that cannot be represented faithfully and safely by its public contracts.

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
