# MCP Native

Native application runtime for Model Context Protocol (MCP), focused first on React Native.

## Goal

Render MCP-powered interfaces as native UI instead of requiring an iframe/WebView, using declarative UI (such as A2UI) where possible and keeping WebView support as a compatibility fallback.

## Proposed architecture

- `@mcp-native/core` — runtime, resource resolution, action routing, capability broker
- `@mcp-native/react-native` — React Native renderer and host integration
- `@mcp-native/a2ui` — A2UI transport/binding and renderer adapter
- `@mcp-native/webview` — MCP Apps HTML/WebView fallback

## Status

Early architecture / proof-of-concept.
