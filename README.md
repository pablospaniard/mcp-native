# MCP Native

MCP Native is an experimental runtime for rendering Model Context Protocol (MCP) experiences as native application UI, focused first on React Native.

## Why

MCP Apps commonly ship HTML that runs in an iframe or WebView. MCP Native adds a native path for servers that expose declarative UI, while retaining a policy-gated WebView compatibility path.

```text
MCP server
    |
    v
@mcp-native/core
    |
    +-- A2UI resource --> @mcp-native/a2ui --> @mcp-native/react-native
    |
    `-- HTML resource ----------------------> @mcp-native/webview
```

## Packages

- `@mcp-native/core` — runtime, resource resolution, action routing, capability broker
- `@mcp-native/react-native` — React Native renderer and host integration
- `@mcp-native/a2ui` — A2UI transport/binding and renderer adapter
- `@mcp-native/webview` — MCP Apps HTML/WebView fallback
- `mcp-native` — convenience package that re-exports the public packages

## Security boundary

Remote MCP servers may provide declarative data and actions. MCP Native does not download or execute arbitrary React Native JavaScript. Native components are bundled by the host and selected from an allowlisted component catalog.

See [RFC-0001](docs/RFC-0001-architecture.md) for package boundaries, data flow, and the initial threat model.

## Development

Requires Node.js 22.12 or newer.

```bash
npm install
npm run check
```

The full check verifies formatting, lint rules, TypeScript project references, tests, and
coverage thresholds. Individual commands are also available:

```bash
npm run format
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:coverage
```

Installing dependencies configures a pre-push hook that runs the full `npm run check` quality
gate. A push is rejected if formatting, linting, type checking, tests, or coverage fail.

## Status

Early proof of concept. The current code establishes typed runtime boundaries, a deliberately small A2UI subset, a native render plan, and WebView policy primitives. It is not production-ready.
