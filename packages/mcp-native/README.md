<div align="center">

# mcp-native

### One entry point for the MCP Native React Native host runtime

[![npm](https://img.shields.io/npm/v/mcp-native)](https://www.npmjs.com/package/mcp-native)
[![downloads](https://img.shields.io/npm/dm/mcp-native)](https://www.npmjs.com/package/mcp-native)
[![license](https://img.shields.io/npm/l/mcp-native)](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)
[![CI](https://github.com/pablospaniard/mcp-native/actions/workflows/ci.yml/badge.svg)](https://github.com/pablospaniard/mcp-native/actions/workflows/ci.yml)

[GitHub](https://github.com/pablospaniard/mcp-native) · [Architecture](https://github.com/pablospaniard/mcp-native/blob/main/docs/RFC-0001-architecture.md) · [Standards status](https://github.com/pablospaniard/mcp-native/blob/main/docs/standards-compatibility.md) · [Contributing](https://github.com/pablospaniard/mcp-native/blob/main/CONTRIBUTING.md) · [Security](https://github.com/pablospaniard/mcp-native/blob/main/SECURITY.md)

</div>

> **Release status:** MCP Native `0.9.x` is the feature-complete release candidate for the
> documented React Native host scope. The public API is frozen for `1.0.0`, so teams can integrate
> and evaluate it now. The stable `1.x` compatibility guarantee begins with `1.0.0` after final
> independent review.

> **Compatibility:** the documented tool/resource and authorization boundary preserves MCP
> `2026-07-28` fields and passes its pinned conformance coverage. The package exposes the
> feature-scoped A2UI v1.0 Candidate profile, keeps custom `0.1` APIs under `/legacy` for migration,
> and re-exports the stable MCP Apps `2026-01-26` native host-adapter profile. See the [A2UI profile](https://github.com/pablospaniard/mcp-native/blob/main/docs/a2ui-v1-conformance.md), [MCP Apps profile](https://github.com/pablospaniard/mcp-native/blob/main/docs/mcp-apps-compatibility.md), and [standards matrix](https://github.com/pablospaniard/mcp-native/blob/main/docs/standards-compatibility.md).

`mcp-native` is the convenience package for the runtime and UI APIs. It re-exports the runtime contracts, A2UI v1 lifecycle/capability/renderer-message APIs, trusted native renderer and hooks, host-owned mixed-surface coordinator, deprecated custom surface migration APIs, and policy-gated WebView compatibility primitives from focused `@mcp-native/*` packages. Transport adapters are installed separately.

Read the human-oriented [product guide](https://github.com/pablospaniard/mcp-native/blob/main/docs/product-guide.md)
and [mixed-surface guide](https://github.com/pablospaniard/mcp-native/blob/main/docs/mixed-surfaces.md)
before the API examples.

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

## Legacy custom `0.1` migration

For `0.9.x`, migrate these imports to `mcp-native/legacy`. Root aliases are removed at `1.0.0`;
the explicit legacy subpath stays frozen for migration and security fixes.

```tsx
import { McpNativeRuntime, createAllowlistActionPolicy, type McpClient } from "mcp-native";
import {
  McpNativeSurface,
  parseA2uiSurface,
  useMcpNativeActionDispatcher,
} from "mcp-native/legacy";
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

## Implemented in `0.9.0`

- transport-independent MCP runtime contracts;
- isolated migration support for the deprecated custom `0.1` surface;
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
- trusted render plans for every basic-catalog component, with closed host-owned variants and
  deny-by-default image/media grants;
- mounting through host-provided components with action and typed-binding event translation;
- typed adapters from trusted semantics into locally bundled design-system components;
- exact namespaced host-extension manifests, negotiation, opaque registries, local Fabric
  registration, policy grants, and schema-valid events with inline catalogs disabled;
- host-owned native A2UI and isolated MCP Apps sibling lifecycle coordination;
- memoized render-plan and safely observed asynchronous action-dispatch hooks;
- policy-gated inline and remote HTML document descriptions;
- MCP `2026-07-28` tool/resource field preservation through the official SDK adapter;
- pinned current-protocol integration coverage through the SDK HTTP handler/fetch path;
- ESM exports, TypeScript declarations, automated tests, and signed npm provenance.

Release `0.9.0` adds host-owned mixed native/MCP Apps composition, a production-shaped reference
host, and the frozen `1.0.0` release-candidate API. Release `0.8.0` added policy-gated `Video` and
`AudioPlayer`, completed the pinned A2UI basic catalog, and added exact namespaced manifests and
local registration for compiled host extensions. Release `0.7.0` added the
non-media catalog, typed renderer-local bindings, bounded formatting and validation, host-callback
actions, required image grants, policy-gated HTTP(S) `openUrl`, and exact installed-subset
discovery. Release `0.6.0` added bounded consent, expiring/revocable host-owned grants, interactive
OAuth, scope history, lifecycle coordination, actionable states, and redacted operations. The
[roadmap](https://github.com/pablospaniard/mcp-native/blob/main/docs/roadmap.md) tracks profile
extensions such as full streaming host integration and transport placement for A2UI capability
objects. The open Expo Go integration track can add platform and component-library evidence
alongside the automated release gates.

## Security model

Remote servers may provide declarative UI and actions, but the host owns component resolution, tool execution, permissions, and every sensitive capability. Unknown data fails closed at validation and policy boundaries.

Read the full [architecture](https://github.com/pablospaniard/mcp-native/blob/main/docs/RFC-0001-architecture.md) and [security policy](https://github.com/pablospaniard/mcp-native/blob/main/SECURITY.md) before integrating or extending the runtime.

## License

[MIT](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)
