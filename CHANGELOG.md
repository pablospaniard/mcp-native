# Changelog

All notable changes to MCP Native are documented here. Until the project reaches `1.0.0`,
breaking public API changes increment the minor version; patch releases remain compatible within
their minor release line.

## 0.2.0 - 2026-08-26

Adds the first standards-pinned A2UI v1 Candidate path while retaining the custom `0.1` surface
model for compatibility. The v1 adapter remains intentionally partial and fail-closed for
renderer behavior that is not yet implemented.

### Added

- MCP extension capability negotiation and the project-owned A2UI-over-MCP transport binding.
- Checksum-verified A2UI v1 Candidate schemas pinned to an exact upstream revision.
- Ordered v1 lifecycle parsing and bounded surface state for create, component update, data-model
  update, and delete messages.
- Pre-render catalog, graph, binding, placement, event, function, and nested `formatString`
  validation with explicit host allowlists.
- A React Native adapter for the supported static A2UI v1 component subset.

### Security

- Reject runtime-provided `formatString` sources and validate literal-source interpolations
  against the pinned catalog before rendering.
- Bound interpolation depth, expression count, and cumulative source length.
- Make npm trusted-publishing recovery retry-safe while retaining immutable release-commit
  verification and package provenance.

## 0.1.0 - 2026-08-25

First coordinated experimental API baseline. The package release version is independent of the
custom A2UI proof-of-concept surface value `"0.1"`.

### Added

- Published `@mcp-native/mcp`, the validated official MCP TypeScript SDK v2 adapter, as part of the
  coordinated package set.

### Security

- Bounded untrusted JSON graphs, serialized A2UI surfaces, and surface string fields.
- Rejected undeclared surface, node, and action fields instead of silently discarding them.
- Rejected unsupported task execution declarations at the MCP adapter boundary.
- Corrected metadata-key validation to reject empty names.

## 0.0.3 - 2026-08-25

Documentation and package-discovery release.

### Changed

- Expanded the repository README with direct npm links and installation guidance.
- Replaced every package placeholder README with standalone installation, usage, API,
  security, and related-package documentation.
- Added npm keywords, homepage links, issue links, and normalized repository metadata to all
  public package manifests.
- Made packaged-artifact smoke testing independent of a hard-coded release version.

## 0.0.2 - 2026-08-25

First functional preview of MCP Native.

### Added

- Protocol-independent MCP client and runtime primitives in `@mcp-native/core`.
- Strict parsing for the initial A2UI surface model in `@mcp-native/a2ui`.
- A trusted React Native render plan with an explicit component allowlist in
  `@mcp-native/react-native`.
- Policy-gated inline and remote HTML document handling in `@mcp-native/webview`.
- The `mcp-native` convenience package, which re-exports the public package APIs.
- Automated validation, package smoke testing, and provenance-backed npm releases.

### Status

This release is experimental. It proves the package boundaries and security model; it is not
yet a complete MCP-to-React-Native application runtime.
