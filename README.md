<div align="center">

# MCP Native

### Native application surfaces for the Model Context Protocol

Render trusted, declarative MCP interfaces with host-owned native components—starting with React
Native—while keeping HTML MCP Apps behind an explicit WebView policy boundary.

[![CI](https://github.com/pablospaniard/mcp-native/actions/workflows/ci.yml/badge.svg)](https://github.com/pablospaniard/mcp-native/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/mcp-native?label=mcp-native)](https://www.npmjs.com/package/mcp-native)
[![npm downloads](https://img.shields.io/npm/dm/mcp-native?label=downloads)](https://www.npmjs.com/package/mcp-native)
[![License: MIT](https://img.shields.io/github/license/pablospaniard/mcp-native)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

</div>

MCP Native lets an MCP server describe a form, list, media view, or action flow as data. Your app
validates that description and renders it with its own React Native components. The server never
ships React Native code or chooses a component from your bundle.

MCP Native is currently in the 0.9 release-candidate line. Its low-level React Native host layers are
ready to try. The 1.0 scope adds a high-level `@mcp-native/host` package for connect-call-render
orchestration before the final independent reviews and long-term compatibility promise. Versioned
standard-contract registration and application-defined custom input adapters remain post-1.0 work.

## The idea in one minute

An MCP server sends a semantic description:

```text
A card
  ├─ A title
  ├─ A text field bound to /profile/name
  └─ A Save button
```

The host application decides how that becomes UI:

```text
MCP server → validated A2UI data → host catalog → native components
                                             ↘ validated action → host policy → MCP
```

That split gives both sides a useful job:

- The server describes content, controls, bindings, validation, and declared actions.
- The app owns the actual components, visual design, navigation, permissions, and network transport.
- MCP Native validates the boundary and turns accepted data into typed render props.
- HTML MCP Apps can still run in an isolated WebView when HTML is the better tool.

The same server-described Button can become a React Native primitive, a component from your design system, or a locally compiled Fabric component. The mapping stays in your application.

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
          │ parse + validate │               │ sandbox + bridge    │
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
                    └──── validated action ──► host callback / policy-gated tool dispatch
```

Read [RFC-0001](docs/RFC-0001-architecture.md) for the package boundaries, data flow, capability
model, and threat model.

## Is it a good fit?

MCP Native works well for:

- forms, settings, approval flows, and structured tool results;
- native experiences that need local state, validation, accessibility, or media;
- apps that want MCP interfaces to match an existing design system;
- screens that combine native controls with an isolated MCP App.

It is not a remote component loader. If a server needs to send arbitrary JavaScript or control native APIs directly, this library intentionally does not provide that path.

## Install

For the runtime and UI packages through one entry point:

```bash
npm install mcp-native react
```

React <code>&gt;=18.1.0</code> is the only UI peer dependency. Native components and platform
integrations come from the host application; the packages do not depend on Expo or import React
Native.

You can also install only the layers you need:

```bash
npm install @mcp-native/core @mcp-native/a2ui @mcp-native/react-native
npm install @mcp-native/mcp @modelcontextprotocol/client
```

All packages are ESM-only and include TypeScript declarations.

## What ships today

- A React Native renderer for the complete pinned A2UI v1 Candidate basic catalog.
- Typed local bindings, dynamic lists, validation, formatting, actions, and accessibility semantics.
- Host-owned component adapters, design-system variants, media policies, and compiled extensions.
- A validated adapter for the official MCP TypeScript SDK v2.
- Protected Streamable HTTP OAuth helpers for native hosts.
- Stable MCP Apps 2026-01-26 discovery, resource loading, WebView policy, and bridge support.
- A headless `@mcp-native/host` controller for connection, automatic discovery, calls, cancellation,
  reconnect, teardown, and deterministic A2UI, MCP Apps, ordinary-content, or invalid resolution.
- A coordinator for native A2UI and isolated MCP Apps regions on the same host screen.
- Generated Android and iOS integration builds, plus package, conformance, performance, and
  hostile-input tests.

New integrations should use the A2UI v1 Candidate APIs. The older custom 0.1 surface remains available from the explicit <code>/legacy</code> package paths for migration.

## Packages

| Package                                           | Use it for                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [@mcp-native/core](packages/core)                 | Runtime contracts, JSON validation, resources, action policy, and lifecycle helpers |
| [@mcp-native/mcp](packages/mcp)                   | Adapting the official MCP TypeScript SDK and native OAuth flows                     |
| [@mcp-native/a2ui](packages/a2ui)                 | A2UI negotiation, parsing, state, validation, and action envelopes                  |
| [@mcp-native/react-native](packages/react-native) | Turning validated A2UI surfaces into host-owned native components                   |
| [@mcp-native/webview](packages/webview)           | Hosting MCP Apps and other explicitly allowed HTML in a controlled WebView          |
| [@mcp-native/host](packages/host)                 | Running the headless connect-discover-call-resolve host workflow                    |
| [mcp-native](packages/mcp-native)                 | Using the runtime and UI layers from one convenience package                        |

The package split is intentional: <code>@mcp-native/core</code> does not depend on React Native, A2UI, WebViews, or a particular MCP SDK.

## Expo Go examples

Start with either complete application:

- [Todo app](examples/expo-go-todolist/README.md) — a focused native A2UI workflow with local
  bindings, validation, accessible components, host-owned actions, and device persistence.
- [City Canvas](examples/expo-go-mixed-surfaces/README.md) — a polished two-screen app that composes
  a native A2UI region with an isolated MCP Apps WebView and policy-approved bridge action.

Build the workspace, enter either example directory, and start Expo:

```bash
npm ci
npm run build
cd examples/expo-go-mixed-surfaces # or examples/expo-go-todolist
npm ci
npm start
```

## Choose the right guide

Start here:

- [Documentation home](docs/README.md) — a reader-friendly map of the project.
- [What MCP Native does](docs/product-guide.md) — product model and server/host ownership.
- [Expo Go todo walkthrough](examples/expo-go-todolist/README.md) — working code and screenshots.
- [Mixed-surface Expo Go walkthrough](examples/expo-go-mixed-surfaces/README.md) — native A2UI and
  an MCP App on one host-owned screen.
- [Host integration checklist](docs/host-integration-checklist.md) — what a production app needs to own.

Go deeper when you need the exact contract:

- [Capabilities](docs/capabilities.md)
- [Host requirements and verified integrations](docs/support-matrix.md)
- [A2UI profile](docs/a2ui-v1-conformance.md)
- [MCP Apps profile](docs/mcp-apps-compatibility.md)
- [Protocol support](docs/protocol-support.md)
- [Standards and compatibility](docs/standards-compatibility.md)
- [Architecture](docs/RFC-0001-architecture.md)
- [Security](SECURITY.md)

## Current roadmap

Milestones 0–9 are complete. The project is now preparing 1.0: independent security, accessibility, public API, protocol/schema, and native WebView reviews; final release validation; the documented legacy-root migration; and coordinated publication.

After 1.0, the planned work moves to first-class SwiftUI and Jetpack Compose renderers and a typed provider model for additional native capabilities.

See the [roadmap](docs/roadmap.md) for the history and future plan, or the [1.0 readiness checklist](docs/1.0-readiness.md) for the remaining release work.

## Development

Requirements: Node.js 22.12 or newer, npm 10 or newer, and Git.

```bash
git clone git@github.com:pablospaniard/mcp-native.git
cd mcp-native
npm ci
npm run check
```

Useful commands:

| Command                            | Purpose                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| <code>npm run build</code>         | Build every workspace                                                        |
| <code>npm run check</code>         | Run formatting, linting, types, schemas, tests, performance, and conformance |
| <code>npm run package:smoke</code> | Pack and install every public package in clean consumers                     |
| <code>npm run format:fix</code>    | Format supported project files                                               |

## Repository layout

```text
mcp-native/
├── .github/                   # CI and collaboration workflows
├── docs/                      # Guides, architecture, and compatibility references
├── examples/
│   └── expo-go-todolist/      # Runnable Expo Go A2UI todo app
├── packages/
│   ├── core/
│   ├── mcp/
│   ├── a2ui/
│   ├── react-native/
│   ├── webview/
│   ├── host/
│   └── mcp-native/
└── tests/                     # Cross-package integration and boundary tests
```

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Security reports should follow [SECURITY.md](SECURITY.md).

## Support the project

If MCP Native is useful to you, you can [sponsor its development](https://github.com/sponsors/pablospaniard).

## License

MCP Native is available under the [MIT License](LICENSE).
