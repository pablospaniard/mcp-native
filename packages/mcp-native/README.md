<div align="center">

# mcp-native

### One entry point for the MCP Native experimental runtime

[![npm](https://img.shields.io/npm/v/mcp-native)](https://www.npmjs.com/package/mcp-native)
[![downloads](https://img.shields.io/npm/dm/mcp-native)](https://www.npmjs.com/package/mcp-native)
[![license](https://img.shields.io/npm/l/mcp-native)](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)
[![CI](https://github.com/pablospaniard/mcp-native/actions/workflows/ci.yml/badge.svg)](https://github.com/pablospaniard/mcp-native/actions/workflows/ci.yml)

[GitHub](https://github.com/pablospaniard/mcp-native) · [Architecture](https://github.com/pablospaniard/mcp-native/blob/main/docs/RFC-0001-architecture.md) · [Contributing](https://github.com/pablospaniard/mcp-native/blob/main/CONTRIBUTING.md) · [Security](https://github.com/pablospaniard/mcp-native/blob/main/SECURITY.md)

</div>

> **Experimental:** MCP Native is a proof of concept, not a production-ready MCP or React Native runtime. APIs may change before `1.0.0`.

`mcp-native` is the convenience package for the runtime and UI APIs. It re-exports the runtime contracts, declarative surface parser, trusted native render-plan builder, and policy-gated WebView compatibility primitives from focused `@mcp-native/*` packages. Transport adapters are installed separately.

## Install

```bash
npm install mcp-native
```

The package is ESM-only and includes TypeScript declarations.

## End-to-end preview

```ts
import {
  McpNativeRuntime,
  createNativeRenderPlan,
  parseA2uiSurface,
  type McpClient,
} from "mcp-native";

const client: McpClient = {
  async listTools() {
    return [];
  },
  async callTool(name, arguments_) {
    return {
      content: [{ type: "json", data: { name, arguments: arguments_ } }],
    };
  },
  async readResource(uri) {
    return { contents: [{ uri, text: "" }] };
  },
};

const runtime = new McpNativeRuntime(client);

const surface = parseA2uiSurface({
  version: "0.1",
  root: {
    id: "welcome",
    type: "container",
    children: [
      { id: "title", type: "text", text: "Hello from MCP" },
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
const button = surface.root.type === "container" ? surface.root.children[1] : undefined;

if (button?.type === "button") {
  await runtime.dispatch(button.action);
}
```

The host maps the trusted names in `plan` to locally bundled native components. MCP Native never downloads and executes server-provided React Native JavaScript.

## Included packages

| Package                                                                              | What it provides                                                                 |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| [`@mcp-native/core`](https://www.npmjs.com/package/@mcp-native/core)                 | MCP client contracts, runtime delegation, JSON types, and declared tool actions. |
| [`@mcp-native/a2ui`](https://www.npmjs.com/package/@mcp-native/a2ui)                 | Strict parsing for the initial declarative surface model.                        |
| [`@mcp-native/react-native`](https://www.npmjs.com/package/@mcp-native/react-native) | Serializable render plans with a fixed native component catalog.                 |
| [`@mcp-native/webview`](https://www.npmjs.com/package/@mcp-native/webview)           | MIME validation and deny-by-default remote HTML policy.                          |

Install an individual package instead when you only need one layer.

Use the separately installable [`@mcp-native/mcp`](https://github.com/pablospaniard/mcp-native/tree/main/packages/mcp) package to connect these APIs to the official MCP TypeScript SDK without forcing that SDK dependency on every `mcp-native` consumer.

## What works today

- transport-independent MCP runtime contracts;
- strict validation for container, text, button, and text-input nodes;
- declared tool-action dispatch;
- trusted render plans for `View`, `Text`, `Button`, and `TextInput`;
- policy-gated inline and remote HTML document descriptions;
- ESM exports, TypeScript declarations, automated tests, and signed npm provenance.

The project does not yet include mounted React Native components, streaming UI updates, capability negotiation, authentication helpers, or a runnable mobile demo. Follow the [roadmap](https://github.com/pablospaniard/mcp-native#roadmap) for progress.

## Security model

Remote servers may provide declarative UI and actions, but the host owns component resolution, tool execution, permissions, and every sensitive capability. Unknown data fails closed at validation and policy boundaries.

Read the full [architecture](https://github.com/pablospaniard/mcp-native/blob/main/docs/RFC-0001-architecture.md) and [security policy](https://github.com/pablospaniard/mcp-native/blob/main/SECURITY.md) before using or extending the proof of concept.

## License

[MIT](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)
