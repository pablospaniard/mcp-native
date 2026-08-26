<div align="center">

# mcp-native

### One entry point for the MCP Native experimental runtime

[![npm](https://img.shields.io/npm/v/mcp-native)](https://www.npmjs.com/package/mcp-native)
[![downloads](https://img.shields.io/npm/dm/mcp-native)](https://www.npmjs.com/package/mcp-native)
[![license](https://img.shields.io/npm/l/mcp-native)](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)
[![CI](https://github.com/pablospaniard/mcp-native/actions/workflows/ci.yml/badge.svg)](https://github.com/pablospaniard/mcp-native/actions/workflows/ci.yml)

[GitHub](https://github.com/pablospaniard/mcp-native) · [Architecture](https://github.com/pablospaniard/mcp-native/blob/main/docs/RFC-0001-architecture.md) · [Standards status](https://github.com/pablospaniard/mcp-native/blob/main/docs/standards-compatibility.md) · [Contributing](https://github.com/pablospaniard/mcp-native/blob/main/CONTRIBUTING.md) · [Security](https://github.com/pablospaniard/mcp-native/blob/main/SECURITY.md)

</div>

> **Experimental:** MCP Native is a proof of concept, not a production-ready MCP or React Native runtime. APIs may change before `1.0.0`.

> **Compatibility:** the initial tool/resource boundary preserves MCP `2026-07-28` fields, but complete MCP conformance is still in progress. The current declarative `0.1` surface is not A2UI v1.0, and the WebView primitives are not a complete MCP Apps host. See the [standards compatibility matrix](https://github.com/pablospaniard/mcp-native/blob/main/docs/standards-compatibility.md).

`mcp-native` is the convenience package for the runtime and UI APIs. It re-exports the runtime contracts, declarative surface parser, trusted native renderer and hooks, and policy-gated WebView compatibility primitives from focused `@mcp-native/*` packages. Transport adapters are installed separately.

## Install

```bash
npm install mcp-native react
```

Add `react-native` when mounting native surfaces. The package is ESM-only and includes TypeScript declarations.

## End-to-end preview

```tsx
import {
  McpNativeSurface,
  McpNativeRuntime,
  createAllowlistActionPolicy,
  parseA2uiSurface,
  useMcpNativeActionDispatcher,
  type McpClient,
} from "mcp-native";
import { Button, Text, TextInput, View } from "react-native";

const components = { Button, Text, TextInput, View };

const client: McpClient = {
  async listTools() {
    return { tools: [] };
  },
  async callTool(name, arguments_) {
    return {
      content: [{ type: "text", text: `Called ${name}` }],
      structuredContent: { name, arguments: arguments_ },
    };
  },
  async readResource(uri) {
    return { contents: [{ uri, text: "" }] };
  },
};

const runtime = new McpNativeRuntime(client, {
  actionPolicy: createAllowlistActionPolicy([{ name: "continue_flow" }]),
});

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

function NativeScreen() {
  const onAction = useMcpNativeActionDispatcher(runtime, {
    onError: (error) => console.error("MCP action failed", error),
  });

  return <McpNativeSurface surface={surface} components={components} onAction={onAction} />;
}
```

The host supplies the locally bundled native components and explicitly allows the tools a surface may dispatch, including their arguments. Without an `actionPolicy`, surface action dispatch is denied; trusted host code can still call `callTool()` directly after JSON validation. MCP Native never downloads and executes server-provided React Native JavaScript.

## Included packages

| Package                                                                              | What it provides                                                                 |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| [`@mcp-native/core`](https://www.npmjs.com/package/@mcp-native/core)                 | MCP client contracts, runtime delegation, JSON types, and declared tool actions. |
| [`@mcp-native/a2ui`](https://www.npmjs.com/package/@mcp-native/a2ui)                 | Strict parsing for the internal `0.1` proof-of-concept surface.                  |
| [`@mcp-native/react-native`](https://www.npmjs.com/package/@mcp-native/react-native) | Trusted render plans, React hooks, and a fixed host-owned component catalog.     |
| [`@mcp-native/webview`](https://www.npmjs.com/package/@mcp-native/webview)           | HTML policy primitives for the planned MCP Apps compatibility path.              |

Install an individual package instead when you only need one layer.

Use the separately installable [`@mcp-native/mcp`](https://github.com/pablospaniard/mcp-native/tree/main/packages/mcp) package to connect these APIs to the official MCP TypeScript SDK without forcing that SDK dependency on every `mcp-native` consumer.

## What works today

- transport-independent MCP runtime contracts;
- strict validation for container, text, button, and text-input nodes;
- declared tool-action dispatch;
- strict A2UI resource-link resolution from tool results;
- strict A2UI v1 catalog-capability parsing and overlap negotiation;
- trusted render plans for `View`, `Text`, `Button`, and `TextInput`;
- mounting through host-provided components with action and text-binding event translation;
- memoized render-plan and safely observed asynchronous action-dispatch hooks;
- policy-gated inline and remote HTML document descriptions;
- MCP `2026-07-28` tool/resource field preservation through the official SDK adapter;
- pinned current-protocol integration coverage through the SDK HTTP handler/fetch path;
- ESM exports, TypeScript declarations, automated tests, and signed npm provenance.

The supported A2UI v1 native subset now includes renderer-local absolute string bindings, host-callback action envelopes, and closed catalog-capability metadata with inline catalogs disabled. Dynamic templates, renderer functions, full streaming host integration, transport placement for A2UI capability objects, authentication helpers, and a runnable mobile demo remain incomplete. Follow the [roadmap](https://github.com/pablospaniard/mcp-native#roadmap) for progress.

## Security model

Remote servers may provide declarative UI and actions, but the host owns component resolution, tool execution, permissions, and every sensitive capability. Unknown data fails closed at validation and policy boundaries.

Read the full [architecture](https://github.com/pablospaniard/mcp-native/blob/main/docs/RFC-0001-architecture.md) and [security policy](https://github.com/pablospaniard/mcp-native/blob/main/SECURITY.md) before using or extending the proof of concept.

## License

[MIT](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)
