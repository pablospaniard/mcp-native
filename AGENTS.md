# Repository guidance

## Development

- Deliver milestone 11–16 work through pull requests targeting `feature/native-platforms`.
  Start follow-up task branches from that integration branch once their prerequisites land.
  See `docs/RFC-0002-native-platforms.md` for the proposed runtime comparison and package strategy.
  Mainline synchronization and eventual promotion also require reviewed PRs; automation never merges.

- Preserve package boundaries documented in `docs/RFC-0001-architecture.md`.
- Keep `@mcp-native/core` independent of React Native, A2UI, and WebView implementations.
- Use concise, version-neutral names for new functions, variables, constants, types and classes,
  and consume the concise package exports. Do not add `v1`, `V1` or `_V1_` to new identifiers.
  Keep exact versions in wire values, schema pins and compatibility documentation. Preserve existing
  versioned exports as compatibility aliases; references to them belong in compatibility bridges/tests
  or pre-existing implementations, not new usage examples. See [naming guidance](CONTRIBUTING.md#naming).
- Treat all MCP server input as untrusted and validate it before rendering or dispatching actions.
- Do not introduce remote JavaScript evaluation, arbitrary component resolution, or unchecked prop spreading.
- Bound both per-value and cumulative work and output for server-controlled expansion, including component graphs, dynamic lists, interpolation, formatting, regular expressions, and validation messages.
- Add tests for behavior changes and negative tests for rejected input.
- For protocol-facing changes, preserve exact specification and schema pins, document ambiguities and project interpretations, and update compatibility, roadmap, and changelog documentation.
- Run `npm run check` for code changes. Run `npm run package:smoke` when package exports, dependencies, declarations, or build output may change.
- Do not change package versions unless the task explicitly includes a release.
- Do not apply `[codex]` to pull request titles.
- Automation may open pull requests but must never merge them.

## Code review

- Flag any path that lets a server choose executable code or a component outside the host allowlist.
- Flag parser changes that accept unknown versions, nodes, actions, bindings, MIME types, or non-JSON values.
- Flag amplification paths where individually valid server values can cause excessive repeated work, allocation, retained output, or dispatch-time recomputation.
- Flag sensitive device capabilities that bypass an explicit host policy or user approval boundary.
- Flag WebView changes that weaken origin, navigation, bridge-message, storage, or permission isolation.
- Treat published exports and wire-format names as compatibility surfaces; require an explicit migration plan for breaking changes.
- Flag new versioned identifiers or compatibility-alias usage in new code/examples; generic naming
  must not relax exact protocol validation or remove existing published aliases.
- Require a regression test for bug fixes and failure-path tests for new validation.
- Prioritize concrete correctness, security, and compatibility findings over style preferences.
