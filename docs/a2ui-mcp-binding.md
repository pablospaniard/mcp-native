# Project-owned A2UI-over-MCP binding

This document defines MCP Native's experimental transport binding for carrying ordered A2UI v1.0 Candidate messages over MCP. It is project-owned, is not an official A2UI or MCP extension, and does not by itself establish A2UI v1.0 conformance.

## Pinned contract

| Field                 | Exact value                                |
| --------------------- | ------------------------------------------ |
| Extension identifier  | `io.github.pablospaniard/mcp-native-a2ui`  |
| Binding version       | `0.1`                                      |
| A2UI protocol version | `v1.0`                                     |
| A2UI schema revision  | `7541f953050cd58b80f0bf5d85fe2d63192af305` |
| Transport             | `resource-text-jsonl`                      |
| Resource MIME type    | `application/a2ui+json`                    |

The extension settings object is exact and closed:

```json
{
  "bindingVersion": "0.1",
  "protocolVersion": "v1.0",
  "schemaRevision": "7541f953050cd58b80f0bf5d85fe2d63192af305",
  "transport": "resource-text-jsonl",
  "mimeType": "application/a2ui+json"
}
```

An implementation enables this binding only when both peers explicitly advertise the project-owned identifier and both settings objects match every field above. Missing, malformed, additional, or different settings do not negotiate the binding.

## Capability exchange

On MCP `2026-07-28`, a client advertises the settings under `io.modelcontextprotocol/clientCapabilities.extensions` in the per-request metadata envelope. A server advertises the same settings under `capabilities.extensions` in its `server/discover` result. `createMcpNativeClientOptions()` delegates that wire behavior to the official SDK.

The tested `2025-11-25` compatibility lane makes no support claim for this extension. A host must treat it as unavailable unless both capability declarations are available and match exactly.

Neither `_meta`, a tool name, `structuredContent`, a `resource_link`, nor `application/a2ui+json` grants extension support. Those values remain untrusted data and can be preserved even when negotiation falls back.

This binding negotiation is distinct from A2UI's own `agentCapabilities` and `rendererCapabilities` objects. `@mcp-native/a2ui` can strictly parse those pinned v1 objects and compute exact shared catalog IDs, but binding version `0.1` does not assign them another MCP wire location. Hosts must advertise only catalogs they fully implement. In particular, MCP Native's partial basic-catalog renderer must not claim the complete basic catalog merely because its surface validator supports a subset. Inline renderer catalogs remain disabled.

## Ordered resource transport

After successful negotiation, a tool result may link to an A2UI message stream as follows:

1. The result contains exactly one intended `resource_link` with a URI and MIME type `application/a2ui+json`.
2. `resources/read` for that URI returns exactly one matching text resource. Binary bodies are not part of this binding.
3. The text is UTF-8 JSON Lines. Each non-empty line is one complete, official A2UI `v1.0` agent-to-renderer envelope from the pinned schema revision.
4. Receivers process envelopes strictly in line order. They do not reorder, deduplicate, merge, or infer missing messages. End of text ends the batch for that resource read.
5. Every envelope is validated before it changes surface state. An invalid line rejects the UI batch; it is never interpreted as the custom MCP Native `0.1` surface or as HTML.

The binding adds transport framing for ordered agent-to-renderer envelopes. `@mcp-native/a2ui` parses those lifecycle envelopes, applies them to an ordered surface store, and exposes a separate policy-gated validation step for complete renderer-ready snapshots. `@mcp-native/react-native` adapts and mounts the documented component subset, expands bounded dynamic `List` templates with renderer-local bindings, evaluates bounded literal `formatString`, host-localized `formatNumber` and `formatCurrency`, and template-scoped `@index`, and emits a pinned-schema renderer-to-agent `action` envelope to a host callback. This binding version does not define the return transport: the host must explicitly deliver that envelope through its application transport and attach renderer data-model metadata when required. Remaining renderer functions, checks, and renderer-to-agent messages remain later work.

## Graceful fallback

A server operation that offers this UI enhancement must also return useful ordinary MCP content, such as `text` content and/or `structuredContent`. When negotiation is absent or incompatible, the host consumes that ordinary content and ignores the A2UI enhancement.

Malformed capability declarations fail closed. If the binding was negotiated but the linked resource or message stream is invalid, the native UI path fails closed; validation failure does not activate another executable UI path.

## Implementation surface

- `@mcp-native/core` validates prefixed extension maps and computes mutual support without inspecting metadata or MIME types.
- `@mcp-native/mcp` advertises host-approved client settings and exposes validated server settings from the official SDK.
- `@mcp-native/a2ui` exports the exact identifier, settings, pinned revision, transport constants, exact-match binding negotiator, strict A2UI capability parsers and catalog-overlap negotiator, JSONL envelope parser, ordered surface store, policy-gated `getValidated`, `resolveA2uiV1JsonlFromToolResult`, and a closed builder for the official renderer `action` envelope. The resolver requires the exact negotiated binding grant as an argument and rejects fallback or forged settings before reading a resource.
- The custom `0.1` surface resolver remains a separate proof-of-concept input. It is not the JSONL protocol consumer described here.
- Callers must negotiate the binding before using the v1 JSONL resolver; MIME type alone does not grant the transport. Invalid v1 streams fail closed and never fall through to `0.1` or HTML.

See the [standards inventory](standards-compatibility.md), [protocol support policy](protocol-support.md), and [roadmap](roadmap.md) for claim boundaries and next steps.
