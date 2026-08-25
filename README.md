<div align="center">

# MCP Native

### Native application surfaces for the Model Context Protocol

Render trusted, declarative MCP interfaces with host-owned native components—starting with React Native—while keeping HTML MCP Apps behind an explicit WebView policy boundary.

[![CI](https://github.com/pablospaniard/mcp-native/actions/workflows/ci.yml/badge.svg)](https://github.com/pablospaniard/mcp-native/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/mcp-native?label=mcp-native)](https://www.npmjs.com/package/mcp-native)
[![License: MIT](https://img.shields.io/github/license/pablospaniard/mcp-native)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Architecture](docs/RFC-0001-architecture.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Code of Conduct](CODE_OF_CONDUCT.md)

</div>

> [!IMPORTANT]
> MCP Native is an early proof of concept, not a production-ready runtime. The npm names are reserved, and the APIs in this repository may change before the first stable release.

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

| Package                                             | Responsibility                                                           | Current proof-of-concept surface                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| [`@mcp-native/core`](packages/core)                 | Transport-neutral runtime contracts, resource access, and action routing | `McpClient`, `McpNativeRuntime`, typed tool actions                      |
| [`@mcp-native/a2ui`](packages/a2ui)                 | Declarative surface parsing, validation, and eventually state bindings   | Strict `0.1` parser for container, text, button, and text input nodes    |
| [`@mcp-native/react-native`](packages/react-native) | React Native host integration and trusted component catalog              | Serializable render plan using `View`, `Text`, `Button`, and `TextInput` |
| [`@mcp-native/webview`](packages/webview)           | HTML MCP App compatibility boundary                                      | MIME validation and deny-by-default remote-document policy               |
| [`mcp-native`](packages/mcp-native)                 | Convenience entry point                                                  | Re-exports the public package APIs                                       |

The packages are intentionally separated so the core runtime does not depend on React Native or any single declarative UI protocol.

## What works today

- A transport-independent MCP client boundary
- Typed `tools/call` action routing
- Strict parsing of a deliberately small declarative UI subset
- Conversion from a validated surface to a trusted native render plan
- Fail-closed behavior for unknown nodes, actions, protocol versions, and WebView MIME types
- A WebView policy that denies remote documents unless the host explicitly allows them
- TypeScript project references, package exports, tests, and GitHub Actions CI

This is a foundation, not a complete MCP or A2UI implementation. In particular, the repository does not yet include an MCP SDK transport adapter, production React Native components, streaming surface updates, or a runnable mobile demo.

## Tiny example

```ts
import { parseA2uiSurface } from '@mcp-native/a2ui'
import { createNativeRenderPlan } from '@mcp-native/react-native'

const surface = parseA2uiSurface({
    version: '0.1',
    root: {
        id: 'welcome',
        type: 'container',
        children: [
            { id: 'title', type: 'text', text: 'Hello from MCP' },
            {
                id: 'continue',
                type: 'button',
                label: 'Continue',
                action: {
                    type: 'tool',
                    name: 'continue_onboarding',
                    arguments: { accepted: true },
                },
            },
        ],
    },
})

const renderPlan = createNativeRenderPlan(surface)
// The host maps the trusted component names in this plan to locally bundled
// React Native components and dispatches declared actions through the runtime.
```

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

| Command         | Purpose                                                  |
| --------------- | -------------------------------------------------------- |
| `npm run build` | Build every workspace with TypeScript project references |
| `npm run check` | Run the repository type check                            |
| `npm test`      | Build and run the Node test suite                        |
| `npm run clean` | Remove TypeScript project build outputs                  |

## Repository layout

```text
mcp-native/
├── .github/                   # CI, ownership, and collaboration templates
├── docs/                      # Architecture decisions and design notes
├── examples/
│   └── react-native-demo/     # Target home of the end-to-end mobile demo
├── packages/
│   ├── core/
│   ├── a2ui/
│   ├── react-native/
│   ├── webview/
│   └── mcp-native/
└── tests/                     # Cross-package proof-of-concept tests
```

## Roadmap

- [x] Define protocol-independent runtime and action contracts
- [x] Validate a minimal declarative UI surface
- [x] Produce a trusted native render plan
- [x] Establish a policy-gated WebView boundary
- [ ] Add an adapter for the official MCP TypeScript SDK
- [ ] Resolve declarative UI resources from real tool results
- [ ] Render production React Native components and hooks
- [ ] Support local state bindings and streaming surface updates
- [ ] Add capability negotiation, authentication, and host permissions
- [ ] Ship an end-to-end React Native example
- [ ] Expand protocol coverage through reviewed RFCs and tests

## Contributing

Contributions are welcome. All changes—including maintainer changes—go through pull requests and must pass CI before merging.

Start with [CONTRIBUTING.md](CONTRIBUTING.md). By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

MCP Native is available under the [MIT License](LICENSE).
