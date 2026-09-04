<div align="center">

# mcp-native

### One entry point for the low-level MCP Native runtime and UI layers

[![npm](https://img.shields.io/npm/v/mcp-native)](https://www.npmjs.com/package/mcp-native)
[![downloads](https://img.shields.io/npm/dm/mcp-native)](https://www.npmjs.com/package/mcp-native)
[![license](https://img.shields.io/npm/l/mcp-native)](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)
[![CI](https://github.com/pablospaniard/mcp-native/actions/workflows/ci.yml/badge.svg)](https://github.com/pablospaniard/mcp-native/actions/workflows/ci.yml)

[GitHub](https://github.com/pablospaniard/mcp-native) · [Architecture](https://github.com/pablospaniard/mcp-native/blob/main/docs/RFC-0001-architecture.md) · [Standards status](https://github.com/pablospaniard/mcp-native/blob/main/docs/standards-compatibility.md) · [Contributing](https://github.com/pablospaniard/mcp-native/blob/main/CONTRIBUTING.md) · [Security](https://github.com/pablospaniard/mcp-native/blob/main/SECURITY.md)

</div>

`mcp-native` is the convenience entry point for the core, A2UI, React Native, mixed-surface, and
WebView APIs. It does not include the official MCP SDK adapter or the high-level host. Install
[`@mcp-native/mcp`](https://www.npmjs.com/package/@mcp-native/mcp) for the adapter or
[`@mcp-native/host`](https://www.npmjs.com/package/@mcp-native/host) for the connect-call-render
workflow. Use this package when the application wants to compose the low-level layers itself.

This package contains the validated low-level React Native feature set: A2UI v1 Candidate and the
stable MCP Apps `2026-01-26` host flow. Public standard-contract registration and
application-defined custom input adapters remain post-1.0 work. Negotiated, locally compiled
semantic host extensions are already supported.

For the big picture, start with the [product guide](https://github.com/pablospaniard/mcp-native/blob/main/docs/product-guide.md).

## Install

```bash
npm install mcp-native react
```

React `>=18.1.0` is the only peer dependency. Native components and platform integrations are
supplied by the host application. The package is ESM-only and includes TypeScript declarations.

Run the bundled local diagnostics or generate safe starting points without network access:

```bash
npx mcp-native doctor
npx mcp-native scaffold-catalog src/mcp
npx mcp-native scaffold-extension com.example/data-grid DataGrid src/mcp
```

Scaffolds refuse to overwrite existing files. The extension command emits a closed, bounded
manifest and a local React Native registration skeleton; the application must still negotiate it
and supply explicit policy.

## A2UI v1 Candidate path

The package re-exports the APIs needed to negotiate the project-owned binding, resolve official
v1 JSONL lifecycle envelopes, maintain bounded ordered surface state, apply explicit host
component/event/function policies, and mount the supported native subset through
`A2uiV1NativeSurface`. The mounted surface keeps typed input edits renderer-local and returns validated
official action envelopes to a host callback; it never selects a return transport. See the
[A2UI package guide](https://github.com/pablospaniard/mcp-native/tree/main/packages/a2ui)
and the [`@mcp-native/react-native` adapter documentation](https://github.com/pablospaniard/mcp-native/tree/main/packages/react-native#a2ui-v1-render-plan-adapter).

## Included packages

| Package                                                                              | What it provides                                                                  |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| [`@mcp-native/core`](https://www.npmjs.com/package/@mcp-native/core)                 | MCP client contracts, runtime delegation, JSON types, and declared tool actions.  |
| [`@mcp-native/a2ui`](https://www.npmjs.com/package/@mcp-native/a2ui)                 | Feature-scoped v1 Candidate negotiation, parsing, and surface state.              |
| [`@mcp-native/react-native`](https://www.npmjs.com/package/@mcp-native/react-native) | Trusted plans, local v1 state/actions, hooks, and a host-owned component catalog. |
| [`@mcp-native/webview`](https://www.npmjs.com/package/@mcp-native/webview)           | Stable Apps discovery, sandbox, native adapter, and JSON-RPC bridge.              |

Install an individual package instead when you only need one layer.

Use the separately installable [`@mcp-native/mcp`](https://github.com/pablospaniard/mcp-native/tree/main/packages/mcp) package to connect these APIs to the official MCP TypeScript SDK without forcing that SDK dependency on every `mcp-native` consumer.

## Available across the package line

- transport-independent MCP runtime contracts;
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

For the release-by-release history, see the
[changelog](https://github.com/pablospaniard/mcp-native/blob/main/CHANGELOG.md). The runnable
[Expo Go todo app](https://github.com/pablospaniard/mcp-native/tree/main/examples/expo-go-todolist)
shows the main A2UI and React Native pieces working together.

## Security model

Remote servers may provide declarative UI and actions, but the host owns component resolution, tool execution, permissions, and every sensitive capability. Unknown data fails closed at validation and policy boundaries.

Read the full [architecture](https://github.com/pablospaniard/mcp-native/blob/main/docs/RFC-0001-architecture.md) and [security policy](https://github.com/pablospaniard/mcp-native/blob/main/SECURITY.md) before integrating or extending the runtime.

## License

[MIT](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)
