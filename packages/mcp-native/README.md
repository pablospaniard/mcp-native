<div align="center">

# mcp-native

### One entry point for the low-level MCP Native runtime and UI layers

[![npm](https://img.shields.io/npm/v/mcp-native)](https://www.npmjs.com/package/mcp-native)
[![downloads](https://img.shields.io/npm/dm/mcp-native)](https://www.npmjs.com/package/mcp-native)
[![license](https://img.shields.io/npm/l/mcp-native)](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)

[GitHub](https://github.com/pablospaniard/mcp-native) · [Architecture](https://github.com/pablospaniard/mcp-native/blob/main/docs/RFC-0001-architecture.md) · [Standards status](https://github.com/pablospaniard/mcp-native/blob/main/docs/standards-compatibility.md) · [Security](https://github.com/pablospaniard/mcp-native/blob/main/SECURITY.md)

</div>

`mcp-native` is the convenience entry point for the core, A2UI, React Native, mixed-surface, and
WebView APIs. It does not include the official MCP SDK adapter or the high-level host. Install
[`@mcp-native/mcp`](https://www.npmjs.com/package/@mcp-native/mcp) for the adapter or
[`@mcp-native/host`](https://www.npmjs.com/package/@mcp-native/host) for the connect-call-render
workflow. Use this package when the application wants to compose the low-level layers itself.

This package contains the validated low-level React Native feature set: a pinned, feature-scoped A2UI v1.0 Candidate profile and the
stable MCP Apps `2026-01-26` host flow. Public standard-contract registration and
application-defined custom input adapters remain post-1.0 work. Negotiated, locally compiled
semantic host extensions are already supported.

As of 2026-09-07, [upstream A2UI versions](https://a2ui.org/#specification-versions) identify
v1.0 as Candidate and v0.9.1 as the current production release. See the
[implemented A2UI profile](https://github.com/pablospaniard/mcp-native/blob/main/docs/a2ui-v1-conformance.md)
for exact coverage and exclusions; this package does not claim v0.9.1 compatibility or automatic
compatibility with later upstream revisions.

For the big picture, start with the [product guide](https://github.com/pablospaniard/mcp-native/blob/main/docs/product-guide.md).

The v1 public API is finalized and ready for production integration under the
[1.x compatibility policy](https://github.com/pablospaniard/mcp-native/blob/main/docs/compatibility-policy.md).

## Install

Install the v1 package:

```bash
npm install mcp-native@1 react
```

React `>=18.1.0` is the only peer dependency. Native components and platform integrations are
supplied by the host application. The package is ESM-only and includes TypeScript declarations.

## Quick start

Use the `a2ui` and `reactNative` namespaces when composing both concise package APIs from this entry
point:

```ts
import { a2ui, reactNative } from "mcp-native";

const store = new a2ui.SurfaceStore();
const Surface = reactNative.HostSurface;
```

Direct named re-exports and the previous prefixed compatibility aliases remain available.

## CLI

The bundled CLI checks local configuration and generates starter files. Running `npx mcp-native`
without a command runs `doctor` in the current directory.

```bash
npx mcp-native doctor
npx mcp-native scaffold-catalog src/mcp
npx mcp-native scaffold-extension com.example/data-grid DataGrid src/mcp
npx mcp-native help
```

### doctor

Checks a local `package.json` for common setup issues without changing files.

```text
doctor [directory] [--json]
```

| Argument or option | Required | Meaning                                                              |
| ------------------ | -------- | -------------------------------------------------------------------- |
| `directory`        | No       | Folder containing `package.json`; defaults to the current directory. |
| `--json`           | No       | Print a JSON report instead of readable text.                        |

For example, `npx mcp-native doctor examples/expo-go-todolist --json` reports the resolved
`directory`, `packageName`, and `findings`, each with a `level`, `code`, and `message`.

The checks cover missing MCP Native packages and mismatched declared version ranges. For native
consumers, they also check React and React Native declarations, a workspace's Metro configuration
file, and `tsconfig.json`. At a workspace root, missing MCP Native packages produce a warning;
run the command in the consuming workspace too. These checks inspect declarations and file
presence, so they do not prove that the application builds or runs.

Errors produce exit status `1`; warnings alone leave status `0`. A missing or unreadable
`package.json`, or invalid JSON, also fails with status `1` and an error on stderr.

### scaffold-catalog

Generates a starter local React Native host catalog.

```text
scaffold-catalog [output-directory]
```

| Argument           | Required | Meaning                                                                             |
| ------------------ | -------- | ----------------------------------------------------------------------------------- |
| `output-directory` | No       | Destination folder; defaults to the current directory. Missing folders are created. |

For example, `npx mcp-native scaffold-catalog src/mcp` creates `src/mcp/mcpNativeCatalog.tsx`
and prints its path. Existing files are never overwritten.

The file exports `mcpNativeHost`, created with `createA2uiV1NativeHost`, and registers React
Native `Button`, `Text`, `TextInput`, and `View`. It starts with empty event and function
allowlists and an intrinsic `View` layout contract. Adapt the components, allowlists, and layout
contracts to your application, then wire the exported host into your rendering flow. Keep the
registration at module scope so component identity and local state remain stable.

### scaffold-extension

`scaffold-extension` generates starter files for a custom UI component's contract and local
registration. It does not build a working data grid.

```text
scaffold-extension <extension-id> <PascalCaseName> [output-directory]
```

| Argument           | Required | Meaning                                                                                                          |
| ------------------ | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `extension-id`     | Yes      | Namespaced ID, such as `com.aily/data-grid`; see naming rules below.                                             |
| `PascalCaseName`   | Yes      | Component name, such as `DataGrid`: start with an uppercase ASCII letter, then use only ASCII letters or digits. |
| `output-directory` | No       | Destination folder; defaults to the current directory. Missing folders are created.                              |

The extension ID uses lowercase ASCII letters and digits in non-empty groups separated by `.`,
`_`, or `-`. It must have at least two groups before an optional `/` suffix; the suffix uses the
same characters and separators and must be non-empty. Spaces, uppercase letters, and extra
slashes are not allowed.

For example:

```bash
npx mcp-native scaffold-extension com.aily/data-grid DataGrid src/mcp
```

This creates:

- `src/mcp/DataGrid.manifest.json`: the component contract, initially allowing a bounded `label`
  prop and no events, with platform, accessibility, resource, permission, and limit declarations.
- `src/mcp/DataGrid.tsx`: a placeholder that displays the label with React Native `Text`, plus a
  local registration and an explicit mapper from semantic props to component props.

Existing files are never overwritten. If either target file already exists, the command refuses
to generate the pair.

Next, implement the component, define its allowed props and events in the manifest, register it
with the host, negotiate support with the MCP server, and configure host policy. Follow the
[full host-extension integration flow](https://github.com/pablospaniard/mcp-native/blob/main/docs/media-and-host-extensions.md#host-extension-flow).

### help

Prints the command syntax without changing files. No arguments are required:

```bash
npx mcp-native help
```

`npx mcp-native --help` and `npx mcp-native -h` are equivalent. Use these at the command level;
individual subcommands do not implement their own `--help` option.

## Native A2UI path

The package re-exports the APIs needed to negotiate the project-owned binding, resolve official
v1 JSONL lifecycle envelopes, maintain bounded ordered surface state, apply explicit host
component/event/function policies, and mount the supported native subset through
`Surface`. The mounted surface keeps typed input edits renderer-local and returns validated
official action envelopes to a host callback; it never selects a return transport. See the
[A2UI package guide](https://github.com/pablospaniard/mcp-native/tree/main/packages/a2ui)
and the [`@mcp-native/react-native` adapter documentation](https://github.com/pablospaniard/mcp-native/tree/main/packages/react-native#a2ui-v1-render-plan-adapter).

## Included packages

| Package                                                                              | What it provides                                                                  |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| [`@mcp-native/core`](https://www.npmjs.com/package/@mcp-native/core)                 | MCP client contracts, runtime delegation, JSON types, and declared tool actions.  |
| [`@mcp-native/a2ui`](https://www.npmjs.com/package/@mcp-native/a2ui)                 | Feature-scoped v1.0 Candidate negotiation, parsing, and surface state.            |
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

See the [contributing guide](https://github.com/pablospaniard/mcp-native/blob/main/CONTRIBUTING.md) to contribute to MCP Native.

## License

[MIT](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)
