# `1.0.0` release-candidate compatibility policy

Milestone 9 froze the existing low-level `0.9.x` release-candidate API described here. Teams can
integrate against that contract now. Milestone 10 adds and reviews the high-level
`@mcp-native/host` API without removing the low-level path. Independent review may still require a
documented correction before the stable tag; the long-term `1.x` compatibility guarantee begins
with `1.0.0`.

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

The proposed host result surface is a closed union: `a2ui`, `mcp-app`, `ordinary`, or `invalid`.
The two executable UI outcomes require exact mutual extension negotiation. A result claimed by both
negotiated profiles is invalid, and failure after selecting either standard path never retries as
ordinary content or through another renderer. Invalid results expose a stable host-authored code,
not a server or transport error string. The resolver receives one connection-bound client whose
resource reader and client/server extension snapshots are inseparable; it does not accept
caller-supplied negotiation maps independently of that connection.

## Package boundaries

`@mcp-native/core` stays independent of MCP SDK, A2UI, React Native, and WebView implementations.
`@mcp-native/mcp` owns the official SDK adapter. `@mcp-native/a2ui` owns protocol parsing, state,
validation, and semantic planning. `@mcp-native/react-native` owns React and React Native mounting.
`@mcp-native/webview` owns generic HTML policy and the stable MCP Apps native adapter.
`@mcp-native/host` is the top-level orchestration package and may depend on the official SDK adapter,
runtime, protocol, renderer, and WebView layers to provide the connect-call-render workflow. The
`mcp-native` convenience package may compose and re-export these layers, including the host-owned
mixed-surface coordinator.

Dependency inversion, server-selected executable code, unchecked prop spreading, generic native
commands, or a cross-boundary WebView escape is not a compatible extension.

## Freeze checks

`npm run api:verify` builds every existing package and compares all declared package subpaths,
runtime export names, and the complete emitted declaration surface with
`docs/public-api-baseline.json`. Milestone 10 must add the reviewed host-package surface to that
baseline before the stable tag. Package
smoke tests verify the declared exports, JavaScript and declaration source maps, README, and exact
MIT license in every tarball. The same gate runs every supported subpath in a migration-ready clean
consumer before and after an offline replacement of the latest coordinated published `0.9.x`
packages with local candidate tarballs. Changes to the baseline require an intentional
compatibility review and changelog/migration update.

The [support matrix](support-matrix.md) records the release-candidate dependency lanes. The
[migration guide](migration-to-1.0.md) records the only planned root-export removal. The
[`1.0.0` readiness checklist](1.0-readiness.md) distinguishes automated checks from the final
reviews and publication actions. Check results may be summarized in a pull request or release;
their raw output is not a required committed artifact.
