# A2UI v1 Candidate conformance profile

This document is the feature-scoped conformance report for MCP Native's A2UI adapter. It does not
claim complete or unqualified A2UI v1 compatibility.

## Pinned baseline

- Protocol: A2UI v1.0 Candidate
- Upstream revision: `7541f953050cd58b80f0bf5d85fe2d63192af305`
- Schemas: the checksum-verified bundle in `packages/a2ui/src/v1/vendor`
- Catalog used for schema resolution: the basic catalog from that same revision

Updating the Candidate revision, schemas, or catalog is a reviewed protocol change. Hosts must not
advertise the complete basic catalog merely because MCP Native can validate it: catalog capability
advertising is limited to a host's complete implementation.

## Envelope and lifecycle profile

| Direction         | Message                    | Support boundary                                                                     |
| ----------------- | -------------------------- | ------------------------------------------------------------------------------------ |
| Agent to renderer | `createSurface`            | Schema-validated and applied to bounded ordered state.                               |
| Agent to renderer | `updateComponents`         | Schema-validated and applied atomically.                                             |
| Agent to renderer | `updateDataModel`          | Schema-validated and applied as a bounded RFC 6901 update.                           |
| Agent to renderer | `deleteSurface`            | Schema-validated and applied to ordered state.                                       |
| Agent to renderer | `callRendererFunction`     | Rejected by the lifecycle parser; execution is not implemented.                      |
| Agent to renderer | `agentFunctionResponse`    | Rejected by the lifecycle parser; execution is not implemented.                      |
| Renderer to agent | `action`                   | Parsed, and constructed from resolved host-owned event input.                        |
| Renderer to agent | `callAgentFunction`        | Parsed as owned data against the pinned schema. No execution or delivery is implied. |
| Renderer to agent | `rendererFunctionResponse` | Parsed as owned data against the pinned schema. No transport is selected.            |
| Renderer to agent | `error`                    | Parsed as owned data against the pinned schema. It is not trusted as a host error.   |

Every accepted renderer-to-agent envelope has exactly `version: "v1.0"` and exactly one known
message field. Strings and JSON graphs are bounded. Unknown versions, kinds, functions, fields on
closed messages, non-JSON values, and malformed identifiers fail closed. Generic `error` fields
that the pinned schema explicitly leaves open are preserved as bounded inert JSON.

The project-owned [A2UI-over-MCP binding](a2ui-mcp-binding.md) defines JSONL transport only for the
ordered agent-to-renderer lifecycle. Renderer-to-agent delivery and the MCP placement of A2UI
capability objects remain host-owned.

## Native renderer subset

The React Native adapter implements these basic-catalog components:

- `Row`, `Column`, static and dynamic `List`, `Card`, `Text`, `Button`, and `TextField`;
- absolute and dynamic-list-relative string bindings with renderer-local updates;
- bounded template expansion and template-scoped `@index`;
- closed structural, style-variant, accessibility, event, and check fields documented by the
  package APIs.

The executable function subset is:

- `formatString`, `formatNumber`, `formatCurrency`, `formatDate`, and `pluralize`;
- `and`, `or`, and `not`;
- `required`, `regex`, `length`, `numeric`, and `email`;
- template-scoped `@index`;
- user-activated HTTP(S) `openUrl`, only through both a synchronous host policy and host opener.

All component, event, and function names additionally require an explicit host allowlist. Other
basic-catalog components, functions, placements, bindings, or behaviors fail closed. Inline
catalogs are disabled. The component subset is therefore not a claim that the renderer implements
the complete basic catalog.

Real-platform accessibility verification, performance budgets, fuzzing, and broader platform
quality gates belong to Milestone 4; they do not expand this protocol profile.

## Candidate interpretations

- The pinned `CheckRule` prose describes a `ValidationResult` object, while `Checkable` and the
  pinned reference implementation use a boolean. MCP Native follows the executable boolean form.
- Validation-error `path` is an RFC 6901 JSON Pointer; the empty pointer is accepted for the root.
- Additional fields on generic renderer `error` messages are preserved because the pinned schema
  explicitly permits them. They remain inert and cannot grant host behavior.
- Successful parsing is never authorization for function execution, tools, URLs, transport,
  device capabilities, or permissions.

## Interoperability evidence

- Vendored schema integrity is checked by `npm run schemas:verify`.
- Upstream agent-to-renderer examples and incremental lifecycle fixtures exercise parsing and
  ordered state.
- `tests/fixtures/a2ui-v1/renderer-to-agent-messages.json` covers every pinned renderer-to-agent
  message kind.
- Negative tests cover unknown versions and kinds, ambiguous envelopes, unsupported functions,
  malformed JSON Pointers, conflicting response/error forms, non-JSON input, and complexity limits.
- `npm run check` is the repository conformance gate; `npm run package:smoke` verifies published
  exports and declarations.

## Custom `0.1` migration

The custom `A2UI_VERSION = "0.1"` surface is not an A2UI protocol version. Its parser, resolver,
node types, limits, `McpNativeSurface`, and legacy render-plan helpers are deprecated and frozen to
security and correctness fixes.

Migrate as follows:

1. Negotiate the project-owned A2UI-over-MCP binding instead of inferring support from a MIME type.
2. Replace `resolveA2uiResourceFromToolResult` or `parseA2uiSurface` with
   `resolveA2uiV1JsonlFromToolResult`, `parseA2uiV1Jsonl`, or `parseA2uiV1Envelope`.
3. Apply lifecycle messages through `A2uiSurfaceStore` and call `getValidated` with an explicit
   host policy before rendering.
4. Replace `McpNativeSurface` with `A2uiV1NativeSurface`; deliver validated action envelopes through
   an application-owned transport.

There is no automatic conversion: the custom nested node tree and official component graph have
different wire contracts. Legacy inputs never receive failed v1 streams as fallback.
