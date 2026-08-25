# Changelog

All notable changes to MCP Native are documented here. Until the project reaches `1.0.0`,
minor and patch releases may include breaking API changes.

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
