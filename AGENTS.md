# Repository guidance

## Development

- Preserve package boundaries documented in `docs/RFC-0001-architecture.md`.
- Keep `@mcp-native/core` independent of React Native, A2UI, and WebView implementations.
- Treat all MCP server input as untrusted and validate it before rendering or dispatching actions.
- Do not introduce remote JavaScript evaluation, arbitrary component resolution, or unchecked prop spreading.
- Add tests for behavior changes and negative tests for rejected input.
- Do not change package versions unless the task explicitly includes a release.
- Do not apply `[codex]` to pull request titles.

## Code review

- Flag any path that lets a server choose executable code or a component outside the host allowlist.
- Flag parser changes that accept unknown versions, nodes, actions, bindings, MIME types, or non-JSON values.
- Flag sensitive device capabilities that bypass an explicit host policy or user approval boundary.
- Flag WebView changes that weaken origin, navigation, bridge-message, storage, or permission isolation.
- Treat published exports and wire-format names as compatibility surfaces; require an explicit migration plan for breaking changes.
- Require a regression test for bug fixes and failure-path tests for new validation.
- Prioritize concrete correctness, security, and compatibility findings over style preferences.
