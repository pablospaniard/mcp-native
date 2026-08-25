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

The next protocol milestone will parse official v1.0 envelopes and schemas into an internal trusted render plan. It will not evolve the custom `0.1` object into a competing wire protocol. See the [compatibility matrix and conformance roadmap](https://github.com/pablospaniard/mcp-native/blob/main/docs/standards-compatibility.md).

## Supported surface

| Node         | Required fields         | Purpose                                                |
| ------------ | ----------------------- | ------------------------------------------------------ |
| `container`  | `id`, `children`        | Groups nested surface nodes.                           |
| `text`       | `id`, `text`            | Declares trusted text content.                         |
| `button`     | `id`, `label`, `action` | Declares a tool action for host-controlled dispatch.   |
| `text-input` | `id`, `label`           | Declares an input with optional `value` and `binding`. |

The only supported action is `{ type: "tool", name, arguments? }`. Arguments must contain JSON-safe values.

## Public API

| Export                                | Purpose                                                          |
| ------------------------------------- | ---------------------------------------------------------------- |
| `resolveA2uiResourceFromToolResult`   | Reads and parses the single explicit A2UI link in a tool result. |
| `parseA2uiSurface`                    | Validates input and returns a typed `A2uiSurface`.               |
| `A2uiResourceError`, `A2uiParseError` | Specific resolution and parsing failures.                        |
| `A2UI_MIME_TYPE`, `A2UI_VERSION`      | Exact media type and current proof-of-concept version.           |
| `ResolvedA2uiResource`                | URI, MIME type, and validated surface returned by the resolver.  |
| `A2uiSurface`, `A2uiNode`             | Validated surface and node unions.                               |
| Node interfaces                       | Typed container, text, button, and text-input nodes.             |

## Security behavior

- Input is treated as untrusted at the parser boundary.
- Resolution requires an exact MIME type, URI match, and unambiguous text content.
- Errored tool results and binary A2UI resources are rejected.
- Unknown surface versions, nodes, and actions are rejected.
- Tool arguments are recursively constrained to finite, acyclic JSON values in plain objects.
- JSON keys such as `__proto__` are preserved as ordinary own data properties without changing object prototypes.
- Parsing never resolves components or executes server-provided code.
- Successful parsing does not grant device capabilities or permission to call a tool; the host still owns those decisions.

## Next layer

Use [`@mcp-native/react-native`](https://www.npmjs.com/package/@mcp-native/react-native) to convert a validated surface into a trusted native render plan, or install [`mcp-native`](https://www.npmjs.com/package/mcp-native) for the combined runtime and UI APIs.

## License

[MIT](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)
