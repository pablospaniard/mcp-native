<div align="center">

# @mcp-native/a2ui

### Strict parsing for declarative MCP Native surfaces

[![npm](https://img.shields.io/npm/v/@mcp-native/a2ui)](https://www.npmjs.com/package/@mcp-native/a2ui)
[![downloads](https://img.shields.io/npm/dm/@mcp-native/a2ui)](https://www.npmjs.com/package/@mcp-native/a2ui)
[![license](https://img.shields.io/npm/l/@mcp-native/a2ui)](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)

[GitHub](https://github.com/pablospaniard/mcp-native) · [Architecture](https://github.com/pablospaniard/mcp-native/blob/main/docs/RFC-0001-architecture.md) · [Security](https://github.com/pablospaniard/mcp-native/blob/main/SECURITY.md)

</div>

> **Experimental:** this package implements MCP Native's deliberately small `0.1` proof-of-concept surface. It is not a claim of complete A2UI specification compatibility.

`@mcp-native/a2ui` parses untrusted JSON or JavaScript values into a validated, typed surface before a host renders anything. Unknown versions, node types, action types, and invalid JSON values fail closed with an `A2uiParseError`.

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

## Supported surface

| Node         | Required fields         | Purpose                                                |
| ------------ | ----------------------- | ------------------------------------------------------ |
| `container`  | `id`, `children`        | Groups nested surface nodes.                           |
| `text`       | `id`, `text`            | Declares trusted text content.                         |
| `button`     | `id`, `label`, `action` | Declares a tool action for host-controlled dispatch.   |
| `text-input` | `id`, `label`           | Declares an input with optional `value` and `binding`. |

The only supported action is `{ type: "tool", name, arguments? }`. Arguments must contain JSON-safe values.

## Public API

| Export                    | Purpose                                              |
| ------------------------- | ---------------------------------------------------- |
| `parseA2uiSurface`        | Validates input and returns a typed `A2uiSurface`.   |
| `A2uiParseError`          | Error thrown for malformed or unsupported input.     |
| `A2UI_VERSION`            | Current proof-of-concept wire version, `"0.1"`.      |
| `A2uiSurface`, `A2uiNode` | Validated surface and node unions.                   |
| Node interfaces           | Typed container, text, button, and text-input nodes. |

## Security behavior

- Input is treated as untrusted at the parser boundary.
- Unknown surface versions, nodes, and actions are rejected.
- Tool arguments are recursively constrained to JSON values.
- Parsing never resolves components or executes server-provided code.
- Successful parsing does not grant device capabilities or permission to call a tool; the host still owns those decisions.

## Next layer

Use [`@mcp-native/react-native`](https://www.npmjs.com/package/@mcp-native/react-native) to convert a validated surface into a trusted native render plan, or install [`mcp-native`](https://www.npmjs.com/package/mcp-native) for the combined runtime and UI APIs.

## License

[MIT](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)
