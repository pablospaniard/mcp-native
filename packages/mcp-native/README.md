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

> **Compatibility:** the initial tool/resource boundary preserves MCP `2026-07-28` fields, but complete MCP conformance is still in progress. The package exposes the feature-scoped A2UI v1.0 Candidate profile and retains custom `0.1` APIs only as deprecated migration support; this is not an unqualified A2UI renderer claim. It also re-exports the documented stable MCP Apps `2026-01-26` native host-adapter profile. See the [A2UI profile](https://github.com/pablospaniard/mcp-native/blob/main/docs/a2ui-v1-conformance.md), [MCP Apps profile](https://github.com/pablospaniard/mcp-native/blob/main/docs/mcp-apps-compatibility.md), and [standards matrix](https://github.com/pablospaniard/mcp-native/blob/main/docs/standards-compatibility.md).

`mcp-native` is the convenience package for the runtime and UI APIs. It re-exports the runtime contracts, A2UI v1 lifecycle/capability/renderer-message APIs, trusted native renderer and hooks, deprecated custom surface migration APIs, and policy-gated WebView compatibility primitives from focused `@mcp-native/*` packages. Transport adapters are installed separately.

## Install

```bash
npm install mcp-native react
```

Add `react-native` when mounting native surfaces. The package is ESM-only and includes TypeScript declarations.

## A2UI v1 Candidate path

The package re-exports the APIs needed to negotiate the project-owned binding, resolve official
v1 JSONL lifecycle envelopes, maintain bounded ordered surface state, apply explicit host
component/event/function policies, and mount the supported native subset through
`A2uiV1NativeSurface`. The mounted surface keeps typed input edits renderer-local and returns validated
official action envelopes to a host callback; it never selects a return transport. See the
[complete v1 host-flow example](https://github.com/pablospaniard/mcp-native#a2ui-v1-candidate-host-flow)
and the [`@mcp-native/react-native` adapter documentation](https://github.com/pablospaniard/mcp-native/tree/main/packages/react-native#a2ui-v1-render-plan-adapter).

## Deprecated `0.1` proof-model preview

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

| Package                                                                              | What it provides                                                                  |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| [`@mcp-native/core`](https://www.npmjs.com/package/@mcp-native/core)                 | MCP client contracts, runtime delegation, JSON types, and declared tool actions.  |
| [`@mcp-native/a2ui`](https://www.npmjs.com/package/@mcp-native/a2ui)                 | Feature-scoped v1 Candidate adapter plus deprecated `0.1` migration APIs.         |
| [`@mcp-native/react-native`](https://www.npmjs.com/package/@mcp-native/react-native) | Trusted plans, local v1 state/actions, hooks, and a host-owned component catalog. |
| [`@mcp-native/webview`](https://www.npmjs.com/package/@mcp-native/webview)           | Stable Apps discovery, sandbox, native adapter, and JSON-RPC bridge.              |

Install an individual package instead when you only need one layer.

Use the separately installable [`@mcp-native/mcp`](https://github.com/pablospaniard/mcp-native/tree/main/packages/mcp) package to connect these APIs to the official MCP TypeScript SDK without forcing that SDK dependency on every `mcp-native` consumer.

## What works today

- transport-independent MCP runtime contracts;
- strict validation for container, text, button, and text-input nodes;
- declared tool-action dispatch;
- strict A2UI resource-link resolution from tool results;
- schema-validated A2UI v1 JSONL lifecycle state and explicit host policies;
- strict A2UI v1 catalog-capability parsing and overlap negotiation;
- bounded A2UI v1 dynamic lists with relative renderer-local bindings and `@index`;
- bounded A2UI v1 `formatString` execution and host-callback action envelopes;
- host-localized A2UI v1 number and currency formatting;
- bounded host-localized A2UI v1 date formatting;
- host-localized A2UI v1 plural selection and pure boolean functions;
- bounded A2UI v1 validation functions and renderer-side field and button checks;
- press-time, host-policy-gated A2UI v1 HTTP(S) `openUrl` actions;
- trusted render plans for every non-media basic-catalog component, with closed host-owned variants;
- mounting through host-provided components with action and typed-binding event translation;
- typed adapters from trusted non-media semantics into locally bundled design-system components;
- memoized render-plan and safely observed asynchronous action-dispatch hooks;
- policy-gated inline and remote HTML document descriptions;
- MCP `2026-07-28` tool/resource field preservation through the official SDK adapter;
- pinned current-protocol integration coverage through the SDK HTTP handler/fetch path;
- ESM exports, TypeScript declarations, automated tests, and signed npm provenance.

Release `0.7.0` adds every non-media A2UI basic-catalog component, typed renderer-local absolute and dynamic-list-relative bindings, bounded formatting, validation functions and checks, pure boolean functions, template-instance action resolution, `@index` with offsets, host-callback action envelopes, required image grants, policy-gated HTTP(S) `openUrl`, exact installed-subset discovery, and closed catalog-capability metadata with inline catalogs disabled. `Video` and `AudioPlayer` remain planned for `0.8.0`. Release `0.6.0` added bounded consent over explicit host-authored risk, capability, sensitive-data, and external-sharing descriptors, plus expiring and revocable host-owned grants. Direct `callTool()` operations can use a separate trusted-tool policy; MCP Apps callbacks and A2UI v1 delivery use their own explicit host gates. The separately installed `@mcp-native/mcp` adapter provides issuer-bound interactive OAuth for protected HTTP, durable scope-upgrade history, bounded lifecycle coordination, actionable states, redacted operational events, and dependency-neutral platform reference adapters. It passes every scored pinned `2026-07-28` authorization client scenario. Complete MCP and A2UI conformance remain explicitly out of scope; full streaming host integration, transport placement for A2UI capability objects, and the separate non-blocking Expo Go integration PoCs remain future work. Follow the [roadmap](https://github.com/pablospaniard/mcp-native/blob/main/docs/roadmap.md) for exact claim boundaries.

## Security model

Remote servers may provide declarative UI and actions, but the host owns component resolution, tool execution, permissions, and every sensitive capability. Unknown data fails closed at validation and policy boundaries.

Read the full [architecture](https://github.com/pablospaniard/mcp-native/blob/main/docs/RFC-0001-architecture.md) and [security policy](https://github.com/pablospaniard/mcp-native/blob/main/SECURITY.md) before using or extending the proof of concept.

## License

[MIT](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)
