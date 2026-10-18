# Migration to `1.2.0`

`1.2.0` is a compatible coordinated minor release. Existing `1.1.x` React Native, host, A2UI, MCP,
MCP Apps, and custom-contract integrations continue to use the same public names and default
behavior. Upgrade all directly installed MCP Native npm packages together:

```bash
npm install @mcp-native/host@1.2.0 @mcp-native/mcp@1.2.0
```

Applications using the convenience package can instead install:

```bash
npm install mcp-native@1.2.0
```

Internal MCP Native dependency ranges are coordinated at `^1.2.0`. Do not mix renderer-core
`1.2.x` with older React Native, A2UI, or core packages.

## Renderer authors

`@mcp-native/renderer-core` becomes a coordinated public package in this release. It owns the
platform-neutral render plan, reconciliation, native session, and shared conformance fixtures.
Existing `@mcp-native/react-native` imports remain valid compatibility exports; applications do not
need to import renderer-core directly unless they are building another renderer.

```bash
npm install @mcp-native/renderer-core@1.2.0 @mcp-native/a2ui@1.2.0 @mcp-native/core@1.2.0
```

New renderer integrations should use the concise version-neutral exports and the revisioned native
session contract. Existing versioned aliases remain available throughout `1.x`.

## SwiftUI

Add the repository package using the coordinated release tag:

```swift
dependencies: [
  .package(url: "https://github.com/pablospaniard/mcp-native.git", from: "1.2.0")
]
```

Depend on the `MCPNativeSwiftUI` product. The application still owns action, navigation, resource,
media, and extension policy. Review the exact platform and toolchain matrix before shipping.

## Jetpack Compose

Use the coordinated Maven Central artifact after publication:

```kotlin
dependencies {
  implementation("io.github.pablospaniard:mcp-native-compose:1.2.0")
}
```

The host still supplies locally compiled extensions, navigation, resources, media, authorization,
and delivery. The server cannot select Android classes, composable functions, activities, intents,
modules, or commands.

## Native capabilities

The additive `@mcp-native/host/capabilities` entry point installs exact local provider manifests
behind negotiation, request/result/event validation, host authorization, platform permission checks,
cumulative budgets, cancellation, cleanup, and redacted audit events. No provider is enabled by
metadata alone. The included haptics provider is an app-bound reference; other capability families
are policy profiles until the application installs and audits a concrete provider.

## Protocol profiles

The MCP profile remains exact at `2026-07-28`, with its tested `2025-11-25` compatibility lane. A2UI
continues to target the feature-scoped v1.0 Candidate commit
`8ff4651232ab0e02b0123730b502711170637a3a`. MCP Apps uses the stable `2026-01-26` protocol and
`@modelcontextprotocol/ext-apps@2.0.3`. The browser double-iframe profile and optional bounded list
methods are explicit host opt-ins; no new metadata field implicitly enables executable UI or native
authority.

## Verification

Before upgrading production applications, run the repository's package smoke test and the relevant
native integration suite. The `v1.2.0` GitHub Release workflow has published the coordinated npm,
Swift Package Manager, and Maven Central artifacts.
