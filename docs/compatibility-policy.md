# `1.0.0` release-candidate compatibility policy

Milestone 9 froze the `0.9.x` release-candidate API described here. Teams can integrate against this
contract now. Independent review may still require a documented correction before the stable tag;
the long-term `1.x` compatibility guarantee begins with `1.0.0`.

## Stable compatibility surfaces

For `1.x`, the following are compatibility surfaces:

- package names, declared export subpaths, runtime export names, TypeScript declarations, peer
  dependency ranges, and package dependency directions;
- public class, function, callback, option, result, state, error type, error-code, constant, and
  default-policy behavior;
- MCP extension identifiers and settings, media types, protocol versions, wire names and envelopes,
  schema and catalog pins, project interpretations, bounds that callers can observe, and negotiated
  fallback behavior;
- host component names, semantic prop/event contracts, extension tuple and manifest rules, and
  policy-grant shapes;
- documented security behavior, including which input is rejected and which operation requires a
  host or user decision.

Removing, renaming, or incompatibly narrowing one of these surfaces requires a major release and an
explicit migration plan. Security fixes may reject input that should never have been accepted; the
release notes must identify the affected boundary and safe replacement.

Additive exports, optional fields, components, negotiated features, and platform adapters may ship
in minor releases when old callers retain their behavior. Patch releases contain compatible fixes
within a minor line. Post-`1.0.0` SwiftUI, Compose, and capability-provider packages will use their
own documented profiles and will not silently expand the React Native server contract.

## Package boundaries

`@mcp-native/core` stays independent of MCP SDK, A2UI, React Native, and WebView implementations.
`@mcp-native/mcp` owns the official SDK adapter. `@mcp-native/a2ui` owns protocol parsing, state,
validation, and semantic planning. `@mcp-native/react-native` owns React and React Native mounting.
`@mcp-native/webview` owns generic HTML policy and the stable MCP Apps native adapter. The
`mcp-native` convenience package may compose and re-export these layers, including the host-owned
mixed-surface coordinator.

Dependency inversion, server-selected executable code, unchecked prop spreading, generic native
commands, or a cross-boundary WebView escape is not a compatible extension.

## Freeze evidence

`npm run api:verify` builds every package and compares all declared package subpaths, runtime export
names, and the complete emitted declaration surface with `docs/public-api-baseline.json`. Package
smoke tests verify the declared exports, JavaScript and declaration source maps, README, and exact
MIT license in every tarball before installing them into a clean offline consumer and resolving
every supported subpath. Changes to the baseline require an intentional compatibility review and
changelog/migration update.

The [support matrix](support-matrix.md) records the release-candidate dependency lanes. The
[migration guide](migration-to-1.0.md) records the only planned root-export removal. The
[`1.0.0` readiness checklist](1.0-readiness.md) distinguishes automated evidence from the final
reviews and publication actions.
