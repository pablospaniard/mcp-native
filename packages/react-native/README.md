<div align="center">

# @mcp-native/react-native

### Trusted native render plans for validated MCP surfaces

[![npm](https://img.shields.io/npm/v/@mcp-native/react-native)](https://www.npmjs.com/package/@mcp-native/react-native)
[![downloads](https://img.shields.io/npm/dm/@mcp-native/react-native)](https://www.npmjs.com/package/@mcp-native/react-native)
[![license](https://img.shields.io/npm/l/@mcp-native/react-native)](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)

[GitHub](https://github.com/pablospaniard/mcp-native) · [Architecture](https://github.com/pablospaniard/mcp-native/blob/main/docs/RFC-0001-architecture.md) · [Security](https://github.com/pablospaniard/mcp-native/blob/main/SECURITY.md)

</div>

> **Experimental:** this package currently produces a serializable render plan. It does not yet ship React components, hooks, or a complete React Native renderer.

`@mcp-native/react-native` converts a surface already validated by `@mcp-native/a2ui` into a tree whose component names come from a fixed host-owned catalog. Servers provide data and declared actions—not JavaScript modules or arbitrary component names.

## Install

```bash
npm install @mcp-native/react-native
```

`@mcp-native/a2ui` and `@mcp-native/core` are installed as dependencies. React and React Native are not dependencies yet because this preview returns data rather than mounting components.

## Quick start

```ts
import { parseA2uiSurface } from "@mcp-native/a2ui";
import { createNativeRenderPlan } from "@mcp-native/react-native";

const surface = parseA2uiSurface({
  version: "0.1",
  root: {
    id: "card",
    type: "container",
    children: [
      { id: "title", type: "text", text: "Ready to continue?" },
      {
        id: "continue",
        type: "button",
        label: "Continue",
        action: { type: "tool", name: "continue_flow" },
      },
    ],
  },
});

const plan = createNativeRenderPlan(surface);
```

`plan` contains only the currently allowed component names:

```ts
type NativeComponentName = "Button" | "Text" | "TextInput" | "View";
```

The application host decides how each name maps to a locally bundled component and how declared button actions reach `McpNativeRuntime`.

## Public API

| Export                   | Purpose                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| `createNativeRenderPlan` | Converts a validated `A2uiSurface` into a `NativeElement` tree.                                 |
| `NativeElement`          | Serializable render-plan node with a key, trusted component name, props, and optional children. |
| `NativeComponentName`    | Union of component names currently allowed in the plan.                                         |

## Current mappings

| Surface node | Native component | Selected props                                |
| ------------ | ---------------- | --------------------------------------------- |
| `container`  | `View`           | Nested `children`                             |
| `text`       | `Text`           | Text as `children`                            |
| `button`     | `Button`         | `title` and validated `action`                |
| `text-input` | `TextInput`      | `label`, optional `value`, optional `binding` |

## Trust boundary

- The server cannot select components outside the catalog.
- The server cannot send executable React Native code.
- Render plans should only be created from a successfully validated surface.
- The host must explicitly map component names, bind events, enforce permissions, and approve sensitive tool calls.
- Future styling and component expansion must preserve allowlists rather than spreading unchecked server props.

See [`@mcp-native/a2ui`](https://www.npmjs.com/package/@mcp-native/a2ui) for parsing and [`@mcp-native/core`](https://www.npmjs.com/package/@mcp-native/core) for action dispatch. Install [`mcp-native`](https://www.npmjs.com/package/mcp-native) for the combined runtime and UI APIs.

## License

[MIT](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)
