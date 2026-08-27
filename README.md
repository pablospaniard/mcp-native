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
[![Sponsor](https://img.shields.io/badge/Sponsor-buy%20me%20a%20coffee-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/pablospaniard)

[Architecture](docs/RFC-0001-architecture.md) · [Protocol support](docs/protocol-support.md) · [Standards status](docs/standards-compatibility.md) · [Roadmap](docs/roadmap.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Code of Conduct](CODE_OF_CONDUCT.md)

</div>

> [!IMPORTANT]
> MCP Native is an experimental proof of concept, not a production-ready runtime. The npm packages contain working foundational APIs, but those APIs may change before the first stable release.

> [!CAUTION]
> The custom `@mcp-native/a2ui` `0.1` surface remains an internal proof-of-concept model. The packages now also implement a partial, separately negotiated A2UI v1.0 Candidate path with schema-validated lifecycle state, capability and host-policy validation, bounded dynamic lists and catalog functions, renderer-local string state, and official action envelopes returned to a host callback. It is not yet a complete A2UI renderer, and the host still owns action transport. The WebView package contains policy primitives, not a complete MCP Apps host. See [Standards and compatibility](docs/standards-compatibility.md).

## The idea

MCP servers can expose much more than text. They can describe tools, resources, actions, and interactive experiences. Today, those experiences often arrive as HTML and run inside an iframe or WebView.

MCP Native explores a complementary path:

- a server describes UI as validated, declarative data;
- the host maps that data to components already bundled with the app;
- validated user actions return to the host for explicit, policy-controlled MCP delivery;
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
                    └──── validated action ──► host callback / policy-gated tool dispatch
```

Read [RFC-0001](docs/RFC-0001-architecture.md) for the package boundaries, data flow, capability model, and initial threat model.

## Packages

| Package                                                                              | Source                                           | Responsibility                                                             |
| ------------------------------------------------------------------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------- |
| [`@mcp-native/core`](https://www.npmjs.com/package/@mcp-native/core)                 | [`packages/core`](packages/core)                 | Transport-neutral runtime contracts, resource access, and action routing   |
| [`@mcp-native/mcp`](https://www.npmjs.com/package/@mcp-native/mcp)                   | [`packages/mcp`](packages/mcp)                   | Validated adapter for the official MCP TypeScript SDK client               |
| [`@mcp-native/a2ui`](https://www.npmjs.com/package/@mcp-native/a2ui)                 | [`packages/a2ui`](packages/a2ui)                 | Strict custom `0.1` parsing plus the partial official v1 lifecycle adapter |
| [`@mcp-native/react-native`](https://www.npmjs.com/package/@mcp-native/react-native) | [`packages/react-native`](packages/react-native) | Trusted render plans, React hooks, and a host-owned component renderer     |
| [`@mcp-native/webview`](https://www.npmjs.com/package/@mcp-native/webview)           | [`packages/webview`](packages/webview)           | HTML policy primitives for the planned MCP Apps compatibility path         |
| [`mcp-native`](https://www.npmjs.com/package/mcp-native)                             | [`packages/mcp-native`](packages/mcp-native)     | Convenience entry point for the runtime and UI packages                    |

The packages are intentionally separated so the core runtime does not depend on the official SDK, React Native, or any single declarative UI protocol. Release `0.3.0` expands the standards-pinned A2UI v1 Candidate path with capability negotiation, native interactions, dynamic lists, and bounded catalog-function execution. Its package version is independent of the internal A2UI proof-of-concept surface value `"0.1"`.

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

Add the official SDK adapter when connecting an `@modelcontextprotocol/client` v2 client:

```bash
npm install @mcp-native/mcp @modelcontextprotocol/client
```

Every package is ESM-only and includes TypeScript declarations. Published packages are released from GitHub Actions with signed npm provenance.

## What works today

- A transport-independent MCP client boundary
- A validated adapter for connected clients from the official MCP TypeScript SDK v2
- MCP `2026-07-28` tool/resource field preservation and HTTP handler/fetch integration coverage
- Exact protocol options for the `2026-07-28` target and tested `2025-11-25` compatibility lane
- Seven pinned official MCP client scenarios covering the implemented modern HTTP boundary
- Frozen official requirement accounting and shared-cache isolation tests across principals
- Explicit MCP extension settings and mutual negotiation without MIME or metadata inference
- A project-owned, exact-match [A2UI-over-MCP transport binding](docs/a2ui-mcp-binding.md) with ordinary MCP fallback
- Checksum-verified A2UI v1.0 Candidate schemas pinned to an exact upstream revision
- Strict v1 agent/renderer capability metadata with exact shared-catalog negotiation and inline catalogs disabled
- Schema-validated v1 lifecycle JSONL with atomic, ordered create/update/delete surface state
- A pre-render v1 validation boundary with explicit host component, event, and function allowlists plus bounded validation of literal `formatString` sources
- A fail-closed adapter from the supported A2UI v1 subset into the trusted native render plan
- Bounded dynamic `List` template expansion with relative bindings, local edits, and `@index`
- Bounded `formatString` interpolation over validated bindings, JSON values, and nested supported functions
- Host-localized `formatNumber` and `formatCurrency` execution with bounded, validated options
- Bounded `required`, `regex`, `length`, `numeric`, and `email` validation with renderer-side field and button checks
- Host-localized CLDR plural selection and strict `and`, `or`, and `not` evaluation
- A mounted v1 native surface with renderer-local string bindings, dispatch-time event resolution, and schema-validated renderer-to-agent action envelopes
- Typed `tools/call` action routing with a fail-closed host policy
- Shared finite, acyclic JSON validation with safe handling of prototype-named keys
- Strict resolution of `application/a2ui+json` resource links from real tool results
- Strict parsing of a deliberately small declarative UI subset
- Conversion from a validated surface to a trusted native render plan
- Mounting through host-provided `View`, `Text`, `Button`, and `TextInput` components
- Typed adapters from those trusted primitives into locally bundled design-system components
- React hooks for memoized render plans and safely observed asynchronous action dispatch
- Accessibility labels and controlled text-input binding events selected at the renderer boundary
- Fail-closed behavior for unknown nodes, actions, protocol versions, and WebView MIME types
- A WebView policy that denies remote documents unless the host explicitly allows them
- TypeScript project references, package exports, tests, and GitHub Actions CI

This is a foundation, not a complete MCP or A2UI implementation. In particular, the v1 native adapter currently supports only the documented component subset, absolute and dynamic-list-relative string bindings, bounded string, number, currency, date, plural, and validation functions, renderer checks for supported text fields and buttons, pure boolean functions, `@index`, action events returned to a host callback, and press-time host-policy-gated HTTP(S) `openUrl`; action transport delivery, complete platform accessibility/capability behavior, authentication helpers, and a runnable mobile demo remain future milestones.

## A2UI v1 Candidate host flow

Given a connected MCP runtime and SDK adapter, a host negotiates the project binding, resolves the
ordered JSONL resource, applies it to the bounded store, defines its explicit policy, and mounts the
supported native subset:

```tsx
import {
  A2uiSurfaceStore,
  createA2uiV1BasicCatalogPolicy,
  negotiateA2uiMcpBinding,
  resolveA2uiV1JsonlFromToolResult,
} from "@mcp-native/a2ui";
import { A2UI_V1_NATIVE_COMPONENT_NAMES, A2uiV1NativeSurface } from "@mcp-native/react-native";
import { Button, Linking, Text, TextInput, View } from "react-native";

const binding = negotiateA2uiMcpBinding(
  adapter.getClientExtensionSettings(),
  adapter.getServerExtensionSettings(),
);
if (binding.kind !== "negotiated") {
  throw new Error("Use the tool result's ordinary MCP fallback content");
}

const toolResult = await runtime.callTool("open_profile");
const { envelopes } = await resolveA2uiV1JsonlFromToolResult(runtime, toolResult, binding);
const store = new A2uiSurfaceStore();
store.applyAll(envelopes);

const surface = store.get("profile");
if (surface === undefined) {
  throw new Error("The A2UI stream did not create the profile surface");
}

const policy = createA2uiV1BasicCatalogPolicy({
  allowedComponentNames: A2UI_V1_NATIVE_COMPONENT_NAMES,
  allowedEventNames: ["save_profile"],
  allowedFunctionNames: [
    "formatString",
    "formatNumber",
    "pluralize",
    "and",
    "or",
    "not",
    "openUrl",
  ],
});

function ProfileScreen() {
  return (
    <A2uiV1NativeSurface
      surface={surface}
      policy={policy}
      components={{ Button, Text, TextInput, View }}
      onAction={(envelope, dataModel) => {
        void deliverA2uiAction(envelope, dataModel);
      }}
      openUrlPolicy={({ url }) => new URL(url).origin === "https://docs.example.com"}
      onOpenUrl={({ url }) => {
        void Linking.openURL(url).catch(reportOpenUrlError);
      }}
    />
  );
}
```

`onAction` receives a validated official envelope and, only after surface opt-in, the renderer-local
data model. `deliverA2uiAction` is deliberately host-owned: version `0.3.0` does not choose or invoke
a renderer-to-agent transport. `openUrl` needs all three grants: the catalog function allowlist,
the synchronous `openUrlPolicy`, and `onOpenUrl`. The adapter accepts only bounded, credential-free
HTTP(S) URLs, resolves the current value during the originating Button press, and calls the host
opener only when the policy returns exactly `true`.

## Legacy `0.1` proof-model example

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

This legacy resolver requires exactly one `application/a2ui+json` resource link, reads the matching text resource, and passes it through the same strict parser. The `parseA2uiSurface` parser remains MCP Native's deliberately small `0.1` proof-of-concept model. It is separate from the JSONL v1 Candidate flow above and is not wire-compatible with that protocol.

## Standards status

MCP Native follows several important community design principles already: strict validation, host-owned catalogs, transport-independent core contracts, no downloaded native code, explicit capability boundaries, and deny-by-default HTML policy.

Those principles do not yet amount to complete protocol conformance. The partial A2UI v1.0 Candidate adapter verifies pinned schemas, requires an exact project-binding grant before resolving JSONL resources, exposes strict catalog-capability negotiation for host integration, parses lifecycle envelopes, maintains ordered surface/data-model state, validates rooted catalog graphs, mounts the supported subset with bounded dynamic lists, local bindings, supported string, number, currency, date, plural, boolean, and validation functions and checks, executes HTTP(S) `openUrl` only through a press-time host policy, and constructs official action envelopes. Transport placement and enforcement of the A2UI capability objects, inline catalogs, the remaining renderer-to-agent lifecycle, and broader interoperability remain incomplete. MCP Apps still requires `_meta.ui.resourceUri`, `ui://` resources, CSP and permission metadata, sandboxing, and the Apps JSON-RPC bridge. The tracked gaps and conformance plan live in [Standards and compatibility](docs/standards-compatibility.md).

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

| Command                  | Purpose                                                         |
| ------------------------ | --------------------------------------------------------------- |
| `npm run build`          | Build every workspace with TypeScript project references        |
| `npm run check`          | Run formatting, linting, types, schemas, tests, and conformance |
| `npm run format:check`   | Check formatting without changing files                         |
| `npm run format:fix`     | Format supported project files with Oxfmt                       |
| `npm run lint`           | Check source files with Oxlint                                  |
| `npm run lint:fix`       | Apply safe Oxlint fixes, then report any remaining diagnostics  |
| `npm run typecheck`      | Type-check all TypeScript project references                    |
| `npm test`               | Build and run the Node test suite                               |
| `npm run test:coverage`  | Run tests and enforce coverage thresholds                       |
| `npm run schemas:verify` | Verify the pinned A2UI schema bundle and runtime copies         |
| `npm run package:smoke`  | Build, pack, and install all publishable packages offline       |
| `npm run clean`          | Remove TypeScript project build outputs                         |

Maintainers should follow the tokenless [release and package-onboarding process](docs/releasing.md).

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
- [x] Pin official MCP conformance scenarios and document backwards compatibility
- [x] Add extension negotiation and metadata-preserving capability contracts
- [x] Implement the initial A2UI v1.0 foundation from pinned schemas, lifecycle envelopes, and ordered state
- [x] Add a policy-gated pre-render boundary for basic-catalog graphs, bindings, events, and functions
- [x] Adapt the supported A2UI v1 subset, including bounded dynamic lists, into the trusted native render plan
- [x] Add renderer-local string state, dispatch-time action context, and official action envelopes
- [x] Execute bounded A2UI `formatString` interpolation and `@index` offsets
- [x] Execute host-localized A2UI `formatNumber` and `formatCurrency`
- [x] Execute bounded host-localized A2UI `formatDate` with the pinned token subset
- [x] Execute host-localized A2UI `pluralize` and pure `and`, `or`, and `not`
- [x] Implement bounded policy-gated HTTP(S) `openUrl` with explicit user activation
- [x] Add typed adapters for host-owned React Native component libraries
- [x] Add closed host-owned component variants for supported A2UI structure and style hints
- [ ] Implement remaining renderer-to-agent lifecycle messages
- [ ] Complete real-platform accessibility behavior and testing
- [ ] Establish native performance budgets, parser/renderer fuzzing, and a supported iOS/Android CI matrix
- [ ] Implement stable MCP Apps `2026-01-26` discovery, sandboxing, and AppBridge compatibility
- [ ] Add MCP HTTP authorization, consent, and host permission controls
- [ ] Define production connection lifecycle, observable error states, diagnostic redaction, and host integration guidance
- [ ] Ship an end-to-end React Native example
- [ ] Expand protocol coverage through reviewed RFCs and tests

## Contributing

Contributions are welcome. All changes—including maintainer changes—go through pull requests and must pass CI before merging.

Start with [CONTRIBUTING.md](CONTRIBUTING.md). By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Sponsors

Building this in public. If mcp-native helped you, [buy me a coffee](https://github.com/sponsors/pablospaniard) — it goes a long way.

## License

MCP Native is available under the [MIT License](LICENSE).
