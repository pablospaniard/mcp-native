<div align="center">

# @mcp-native/a2ui

### Strict parsing for declarative MCP Native surfaces

[![npm](https://img.shields.io/npm/v/@mcp-native/a2ui)](https://www.npmjs.com/package/@mcp-native/a2ui)
[![downloads](https://img.shields.io/npm/dm/@mcp-native/a2ui)](https://www.npmjs.com/package/@mcp-native/a2ui)
[![license](https://img.shields.io/npm/l/@mcp-native/a2ui)](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)

[GitHub](https://github.com/pablospaniard/mcp-native) · [Architecture](https://github.com/pablospaniard/mcp-native/blob/main/docs/RFC-0001-architecture.md) · [Standards status](https://github.com/pablospaniard/mcp-native/blob/main/docs/standards-compatibility.md) · [Security](https://github.com/pablospaniard/mcp-native/blob/main/SECURITY.md)

</div>

> **Experimental:** this package implements MCP Native's deliberately small internal `0.1` proof-of-concept surface. `0.1` is not an A2UI protocol version, and this package does not currently claim A2UI v1.0 compatibility.

`@mcp-native/a2ui` resolves explicitly typed resource links and parses untrusted JSON or JavaScript values into a validated, typed surface before a host renders anything. Unknown or ambiguous resources fail with `A2uiResourceError`; unknown versions, node types, action types, non-plain objects, oversized trees, and invalid JSON values fail with `A2uiParseError`. Surfaces are capped at `A2UI_MAX_DEPTH` (32) and `A2UI_MAX_NODES` (256).

## Install

```bash
npm install @mcp-native/a2ui
```

`@mcp-native/core` is installed as a dependency. The package is ESM-only and includes TypeScript declarations.

## Quick start

```ts
import { parseA2uiSurface } from "@mcp-native/a2ui";

const surface = parseA2uiSurface({
  version: "0.1",
  root: {
    id: "welcome",
    type: "container",
    children: [
      { id: "title", type: "text", text: "Welcome" },
      {
        id: "name",
        type: "text-input",
        label: "Display name",
        binding: "profile.displayName",
      },
      {
        id: "save",
        type: "button",
        label: "Save",
        action: {
          type: "tool",
          name: "save_profile",
          arguments: { source: "onboarding" },
        },
      },
    ],
  },
});
```

The parser also accepts a JSON string:

```ts
const surface = parseA2uiSurface(
  '{"version":"0.1","root":{"id":"title","type":"text","text":"Hello"}}',
);
```

## Resolve a tool-result resource

An MCP tool may return a `resource_link` for a declarative surface. Pass the connected runtime or any `A2uiResourceReader` to the resolver:

```ts
import { resolveA2uiResourceFromToolResult } from "@mcp-native/a2ui";

const toolResult = await runtime.callTool("open_profile");
const resolved = await resolveA2uiResourceFromToolResult(runtime, toolResult);

console.log(resolved.uri);
console.log(resolved.surface.root);
```

Resolution succeeds only when:

1. the tool result is not marked as an error;
2. it contains exactly one `resource_link` with MIME type `application/a2ui+json`;
3. `resources/read` returns exactly one item with the same URI and MIME type;
4. that item contains text, not a blob;
5. the text passes `parseA2uiSurface`.

Other tool content and non-A2UI resource links may coexist with the surface link. MCP Native never guesses a MIME type or chooses between multiple matching surfaces.

The prototype's `application/a2ui+json` resource convention comes from earlier A2UI-over-MCP work. The [A2UI v1.0 Candidate protocol](https://github.com/a2ui-project/a2ui/blob/7541f953050cd58b80f0bf5d85fe2d63192af305/specification/v1_0/docs/a2ui_protocol.md) is transport-agnostic and uses a stream of `v1.0` envelopes. Recognizing this media type does not establish v1.0 conformance.

The official v1.0 surface-store state now has a strict static adapter into the internal trusted render plan. This does not evolve the custom `0.1` object into a competing wire protocol. See the [compatibility matrix and conformance roadmap](https://github.com/pablospaniard/mcp-native/blob/main/docs/standards-compatibility.md).

## A2UI-over-MCP capability binding

The package exports an experimental project-owned binding under `io.github.pablospaniard/mcp-native-a2ui`. It is enabled only when both peers advertise the exact binding version, A2UI Candidate revision, JSONL resource transport, and MIME type:

```ts
import { A2UI_MCP_EXTENSION_CAPABILITIES, negotiateA2uiMcpBinding } from "@mcp-native/a2ui";

const result = negotiateA2uiMcpBinding(
  adapter.getClientExtensionSettings(),
  adapter.getServerExtensionSettings(),
);
```

A fallback result means the host uses ordinary MCP text or structured data. A resource link, MIME type, or `_meta` value never activates the binding by itself. The exact capability exchange, ordered `resource-text-jsonl` mapping, and failure behavior are documented in the [project binding contract](https://github.com/pablospaniard/mcp-native/blob/main/docs/a2ui-mcp-binding.md).

## Official v1.0 envelopes and surface store

After mutual negotiation, hosts can resolve a JSONL resource and apply lifecycle envelopes:

```ts
import {
  A2UI_MCP_EXTENSION_CAPABILITIES,
  A2uiSurfaceStore,
  createA2uiV1BasicCatalogPolicy,
  negotiateA2uiMcpBinding,
  resolveA2uiV1JsonlFromToolResult,
} from "@mcp-native/a2ui";

const binding = negotiateA2uiMcpBinding(
  A2UI_MCP_EXTENSION_CAPABILITIES,
  adapter.getServerExtensionSettings(),
);
const { envelopes } = await resolveA2uiV1JsonlFromToolResult(runtime, toolResult, binding);
const store = new A2uiSurfaceStore();
store.applyAll(envelopes);

const surface = store.getValidated(
  "surface-id",
  createA2uiV1BasicCatalogPolicy({
    allowedComponentNames: ["Column", "Text", "Button"],
    allowedEventNames: ["continue"],
  }),
);
```

Only `createSurface`, `updateComponents`, `updateDataModel`, and `deleteSurface` envelopes are accepted in this milestone. Raw store snapshots may be incomplete while ordered updates arrive. The store bounds retained surfaces and components; `getValidated` is the required pre-render boundary for the pinned basic catalog, explicit host component/event/function allowlists, reachable child references and cycles, template-aware binding paths, and component placement rules. The React Native package adapts the supported static subset after revalidation. Function-call envelopes, dynamic templates, mounted v1 interactions, and renderer-to-agent messages remain deferred. The custom `0.1` resolver is unchanged and never receives a failed v1 stream.

## Supported surface

| Node         | Required fields         | Purpose                                                |
| ------------ | ----------------------- | ------------------------------------------------------ |
| `container`  | `id`, `children`        | Groups nested surface nodes.                           |
| `text`       | `id`, `text`            | Declares trusted text content.                         |
| `button`     | `id`, `label`, `action` | Declares a tool action for host-controlled dispatch.   |
| `text-input` | `id`, `label`           | Declares an input with optional `value` and `binding`. |

The only supported action is `{ type: "tool", name, arguments? }`. Arguments must contain JSON-safe values.

## Public API

| Export                                                                                                    | Purpose                                                          |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `resolveA2uiResourceFromToolResult`                                                                       | Reads and parses the single explicit A2UI link in a tool result. |
| `parseA2uiSurface`                                                                                        | Validates input and returns a typed `A2uiSurface`.               |
| `A2uiResourceError`, `A2uiParseError`                                                                     | Specific resolution and parsing failures.                        |
| `A2UI_MIME_TYPE`, `A2UI_VERSION`                                                                          | Exact media type and current proof-of-concept version.           |
| `A2UI_MAX_DEPTH`, `A2UI_MAX_NODES`                                                                        | Container-tree complexity limits.                                |
| `A2UI_MAX_SOURCE_LENGTH`, `A2UI_MAX_STRING_LENGTH`                                                        | Serialized-input and string-field limits.                        |
| `A2UI_MCP_EXTENSION_ID`, `A2UI_MCP_EXTENSION_CAPABILITIES`                                                | Exact project-owned extension declaration.                       |
| `negotiateA2uiMcpBinding`, `A2uiMcpBindingNegotiation`, `A2uiMcpBindingGrant`                             | Exact-match negotiation with typed fallback reasons.             |
| `A2UI_MCP_BINDING_VERSION`, `A2UI_MCP_PROTOCOL_VERSION`, `A2UI_MCP_SCHEMA_REVISION`, `A2UI_MCP_TRANSPORT` | Pinned binding and Candidate transport values.                   |
| `parseA2uiV1Envelope`, `parseA2uiV1Jsonl`                                                                 | Schema-validate v1 lifecycle envelopes and JSONL batches.        |
| `A2uiSurfaceStore`                                                                                        | Ordered lifecycle state plus policy-gated `getValidated`.        |
| `createA2uiV1BasicCatalogPolicy`, `A2uiV1SurfaceValidationPolicy`                                         | Explicit host allowlists for components, events, and functions.  |
| `validateA2uiV1SurfaceState`                                                                              | Revalidate a complete snapshot at another public trust boundary. |
| `A2UI_V1_BASIC_CATALOG_ID`, catalog name constants                                                        | Exact pinned catalog identity and selectable host capabilities.  |
| `resolveA2uiV1JsonlFromToolResult`, `ResolvedA2uiV1JsonlResource`                                         | Resolve a JSONL A2UI resource without using the `0.1` parser.    |
| `A2UI_V1_PROTOCOL_VERSION`, `A2UI_V1_MAX_SOURCE_LENGTH`, `A2UI_V1_MAX_ENVELOPES`, store limit constants   | v1 protocol and complexity limits.                               |
| `ResolvedA2uiResource`                                                                                    | URI, MIME type, and validated surface returned by the resolver.  |
| `A2uiSurface`, `A2uiNode`                                                                                 | Validated surface and node unions.                               |
| Node interfaces                                                                                           | Typed container, text, button, and text-input nodes.             |

## Security behavior

- Input is treated as untrusted at the parser boundary.
- Resolution requires an exact MIME type, URI match, and unambiguous text content.
- Errored tool results and binary A2UI resources are rejected.
- Unknown surface versions, node types, action types, and undeclared fields are rejected.
- Serialized surfaces, string fields, and tool-argument JSON graphs have fixed complexity limits.
- Tool arguments are recursively constrained to finite, acyclic JSON values in plain objects.
- JSON keys such as `__proto__` are preserved as ordinary own data properties without changing object prototypes.
- Parsing never resolves components or executes server-provided code.
- Renderer-ready v1 snapshots require a complete acyclic root-reachable graph and explicit host allowlists.
- Relative bindings and `@index` are accepted only inside dynamic-list template context.
- Catalog functions and agent events are denied unless named by host policy.
- `formatString` is rejected even when allowlisted until its nested interpolation language has a strict parser and every embedded function and binding can be validated.
- Successful parsing does not grant device capabilities or permission to call a tool; the host still owns those decisions.

## Next layer

Use [`@mcp-native/react-native`](https://www.npmjs.com/package/@mcp-native/react-native) to adapt the supported static v1 subset or the custom `0.1` surface into a trusted native render plan. Install [`mcp-native`](https://www.npmjs.com/package/mcp-native) for the combined runtime and UI APIs.

## License

[MIT](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)
