<div align="center">

# MCP Native

### Native application surfaces for the Model Context Protocol

Render trusted, declarative MCP interfaces with host-owned native components—starting with React Native—while keeping HTML MCP Apps behind an explicit WebView policy boundary.

[![CI](https://github.com/pablospaniard/mcp-native/actions/workflows/ci.yml/badge.svg)](https://github.com/pablospaniard/mcp-native/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/mcp-native?label=mcp-native)](https://www.npmjs.com/package/mcp-native)
[![npm downloads](https://img.shields.io/npm/dm/mcp-native?label=downloads)](https://www.npmjs.com/package/mcp-native)
[![License: MIT](https://img.shields.io/github/license/pablospaniard/mcp-native)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Architecture](docs/RFC-0001-architecture.md) · [Protocol support](docs/protocol-support.md) · [Standards status](docs/standards-compatibility.md) · [Roadmap](docs/roadmap.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Code of Conduct](CODE_OF_CONDUCT.md)

</div>

> [!IMPORTANT]
> MCP Native is an experimental proof of concept, not a production-ready runtime. The npm packages contain working foundational APIs, but those APIs may change before the first stable release.

> [!CAUTION]
> The current `@mcp-native/a2ui` `0.1` surface is an internal proof-of-concept model, not A2UI v1.0. The WebView package contains policy primitives, not a complete MCP Apps host. See [Standards and compatibility](docs/standards-compatibility.md).

## The idea

MCP servers can expose much more than text. They can describe tools, resources, actions, and interactive experiences. Today, those experiences often arrive as HTML and run inside an iframe or WebView.

MCP Native explores a complementary path:

- a server describes UI as validated, declarative data;
- the host maps that data to components already bundled with the app;
- user actions travel back through MCP;
- arbitrary remote React Native JavaScript is never downloaded or executed;
- HTML remains available as a policy-gated compatibility fallback.

The result should feel native to the device while preserving a clear trust boundary between an MCP server and its host application.

## Architecture at a glance

```text
                                  MCP server
                                      │
                  tools/list · tools/call · resources/read
                                      │
                                      ▼
                         ┌────────────────────────┐
                         │ official MCP TS client │
                         └────────────┬───────────┘
                                      │
                                      ▼
                           ┌─────────────────────┐
                           │  @mcp-native/mcp    │
                           │ validated SDK bridge│
                           └──────────┬──────────┘
                                      │
                                      ▼
                            ┌───────────────────┐
                            │ @mcp-native/core  │
                            │ runtime + actions │
                            └─────────┬─────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
          declarative A2UI resource              HTML MCP App resource
                    │                                   │
                    ▼                                   ▼
          ┌──────────────────┐               ┌─────────────────────┐
          │ @mcp-native/a2ui │               │ @mcp-native/webview │
          │ parse + validate │               │ policy + fallback   │
          └────────┬─────────┘               └─────────────────────┘
                   │
                   ▼
       ┌──────────────────────────┐
       │ @mcp-native/react-native │
       │ trusted native catalog   │
       └────────────┬─────────────┘
                    │
                    ▼
        View · Text · Button · TextInput
                    │
                    └──────── action ────────► tools/call
```

Read [RFC-0001](docs/RFC-0001-architecture.md) for the package boundaries, data flow, capability model, and initial threat model.

## Packages

| Package                                                                              | Source                                           | Responsibility                                                           |
| ------------------------------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------ |
| [`@mcp-native/core`](https://www.npmjs.com/package/@mcp-native/core)                 | [`packages/core`](packages/core)                 | Transport-neutral runtime contracts, resource access, and action routing |
| `@mcp-native/mcp`                                                                    | [`packages/mcp`](packages/mcp)                   | Validated adapter for the official MCP TypeScript SDK client             |
| [`@mcp-native/a2ui`](https://www.npmjs.com/package/@mcp-native/a2ui)                 | [`packages/a2ui`](packages/a2ui)                 | Strict parsing for the internal `0.1` proof-of-concept surface           |
| [`@mcp-native/react-native`](https://www.npmjs.com/package/@mcp-native/react-native) | [`packages/react-native`](packages/react-native) | Trusted render plans, React hooks, and a host-owned component renderer   |
| [`@mcp-native/webview`](https://www.npmjs.com/package/@mcp-native/webview)           | [`packages/webview`](packages/webview)           | HTML policy primitives for the planned MCP Apps compatibility path       |
| [`mcp-native`](https://www.npmjs.com/package/mcp-native)                             | [`packages/mcp-native`](packages/mcp-native)     | Convenience entry point for the runtime and UI packages                  |

The packages are intentionally separated so the core runtime does not depend on the official SDK, React Native, or any single declarative UI protocol. The new SDK adapter is implemented in the workspace and will be published in the next coordinated release.

## Installation

Install the runtime and UI APIs from the convenience package:

```bash
npm install mcp-native react
```

Add `react-native` when mounting native surfaces. It remains an optional peer because the host—not this package—selects the platform implementation.

Or install only the layers your host needs:

```bash
npm install @mcp-native/core @mcp-native/a2ui @mcp-native/react-native
```

Every package is ESM-only and includes TypeScript declarations. Published packages are released from GitHub Actions with signed npm provenance; the SDK adapter joins them in the next coordinated release.

## What works today

- A transport-independent MCP client boundary
- A validated adapter for connected clients from the official MCP TypeScript SDK v2
- MCP `2026-07-28` tool/resource field preservation and HTTP handler/fetch integration coverage
- Exact protocol options for the `2026-07-28` target and tested `2025-11-25` compatibility lane
- Typed `tools/call` action routing with a fail-closed host policy
- Shared finite, acyclic JSON validation with safe handling of prototype-named keys
- Strict resolution of `application/a2ui+json` resource links from real tool results
- Strict parsing of a deliberately small declarative UI subset
- Conversion from a validated surface to a trusted native render plan
- Mounting through host-provided `View`, `Text`, `Button`, and `TextInput` components
- React hooks for memoized render plans and safely observed asynchronous action dispatch
- Accessibility labels and controlled text-input binding events selected at the renderer boundary
- Fail-closed behavior for unknown nodes, actions, protocol versions, and WebView MIME types
- A WebView policy that denies remote documents unless the host explicitly allows them
- TypeScript project references, package exports, tests, and GitHub Actions CI

This is a foundation, not a complete MCP or A2UI implementation. In particular, the repository does not yet include local binding state, streaming surface updates, authentication helpers, or a runnable mobile demo.

## Tiny example

```tsx
import { parseA2uiSurface } from "@mcp-native/a2ui";
import type { McpNativeRuntime } from "@mcp-native/core";
import { McpNativeSurface, useMcpNativeActionDispatcher } from "@mcp-native/react-native";
import { Button, Text, TextInput, View } from "react-native";

const components = { Button, Text, TextInput, View };

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
        action: {
          type: "tool",
          name: "continue_onboarding",
          arguments: { accepted: true },
        },
      },
    ],
  },
});

function NativeScreen({ runtime }: { runtime: McpNativeRuntime }) {
  const onAction = useMcpNativeActionDispatcher(runtime, {
    onError: (error) => console.error("MCP action failed", error),
  });

  return <McpNativeSurface surface={surface} components={components} onAction={onAction} />;
}
```

Connected hosts can resolve the same validated surface from a tool result:

```ts
import { resolveA2uiResourceFromToolResult } from "@mcp-native/a2ui";

const toolResult = await runtime.callTool("open_surface");
const { surface } = await resolveA2uiResourceFromToolResult(runtime, toolResult);
```

The resolver requires exactly one `application/a2ui+json` resource link, reads the matching text resource, and passes it through the same strict parser. The current parser remains MCP Native's deliberately small `0.1` proof-of-concept model. It is not wire-compatible with the A2UI v1.0 Candidate protocol.

## Standards status

MCP Native follows several important community design principles already: strict validation, host-owned catalogs, transport-independent core contracts, no downloaded native code, explicit capability boundaries, and deny-by-default HTML policy.

Those principles do not yet amount to protocol conformance. A2UI v1.0 requires official message envelopes, schema-defined catalogs, surface lifecycle, data-model semantics, action envelopes, and capability negotiation. MCP Apps requires `_meta.ui.resourceUri`, `ui://` resources, CSP and permission metadata, sandboxing, and the Apps JSON-RPC bridge. The tracked gaps and conformance plan live in [Standards and compatibility](docs/standards-compatibility.md).

## Security model

The central rule is simple:

> Remote MCP servers may provide declarative UI and actions, but MCP Native never downloads and executes arbitrary React Native JavaScript.

That rule leads to a few hard requirements:

1. Treat every server-provided value as untrusted input.
2. Validate protocol versions, nodes, actions, bindings, and MIME types before rendering.
3. Let the host own the effective component and capability allowlists.
4. Fail closed when input is unknown or unsupported.
5. Broker sensitive device capabilities through the host; declarations never grant access by themselves.
6. Keep WebView navigation, origins, bridge messages, storage, and permissions behind an explicit policy.

Please read [SECURITY.md](SECURITY.md) before reporting a vulnerability or proposing a change to a trust boundary.

## Development setup

Requirements:

- Node.js 22 or newer
- npm 10 or newer
- Git

```bash
git clone git@github.com:pablospaniard/mcp-native.git
cd mcp-native
npm ci
npm test
```

Useful commands:

| Command                 | Purpose                                                        |
| ----------------------- | -------------------------------------------------------------- |
| `npm run build`         | Build every workspace with TypeScript project references       |
| `npm run check`         | Run formatting, linting, type checking, tests, and coverage    |
| `npm run format:check`  | Check formatting without changing files                        |
| `npm run format:fix`    | Format supported project files with Oxfmt                      |
| `npm run lint`          | Check source files with Oxlint                                 |
| `npm run lint:fix`      | Apply safe Oxlint fixes, then report any remaining diagnostics |
| `npm run typecheck`     | Type-check all TypeScript project references                   |
| `npm test`              | Build and run the Node test suite                              |
| `npm run test:coverage` | Run tests and enforce coverage thresholds                      |
| `npm run clean`         | Remove TypeScript project build outputs                        |

## Repository layout

```text
mcp-native/
├── .github/                   # CI, ownership, and collaboration templates
├── docs/                      # Architecture decisions and design notes
├── examples/
│   └── react-native-demo/     # Target home of the end-to-end mobile demo
├── packages/
│   ├── core/
│   ├── mcp/
│   ├── a2ui/
│   ├── react-native/
│   ├── webview/
│   └── mcp-native/
└── tests/                     # Cross-package proof-of-concept tests
```

## Roadmap

The detailed [standards-first roadmap](docs/roadmap.md) records retained architecture, milestone exit criteria, and deferred optional extensions.

- [x] Define protocol-independent runtime and action contracts
- [x] Validate a minimal declarative UI surface
- [x] Produce a trusted native render plan
- [x] Establish a policy-gated WebView boundary
- [x] Add an adapter for the official MCP TypeScript SDK
- [x] Resolve declarative UI resources from real tool results
- [x] Render host-provided React Native components through production-facing hooks
- [x] Inventory normative standards and publish explicit compatibility status
- [x] Preserve MCP `2026-07-28` tool/resource fields and test the current HTTP path
- [ ] Pin official MCP conformance scenarios and document backwards compatibility
- [ ] Add extension negotiation and metadata-preserving capability contracts
- [ ] Implement an A2UI v1.0 conformance foundation from pinned official schemas
- [ ] Support the A2UI surface lifecycle, local data model, bindings, and streaming updates
- [ ] Complete native accessibility and action-context behavior
- [ ] Implement stable MCP Apps `2026-01-26` discovery, sandboxing, and AppBridge compatibility
- [ ] Add MCP HTTP authorization, consent, and host permission controls
- [ ] Ship an end-to-end React Native example
- [ ] Expand protocol coverage through reviewed RFCs and tests

## Contributing

Contributions are welcome. All changes—including maintainer changes—go through pull requests and must pass CI before merging.

Start with [CONTRIBUTING.md](CONTRIBUTING.md). By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

MCP Native is available under the [MIT License](LICENSE).
