# Contributing to MCP Native

Thank you for helping build MCP Native. The project is early enough that careful questions, design criticism, documentation fixes, and small experiments are just as valuable as large features.

## Ground rules

- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- Never include credentials, private endpoints, personal data, or proprietary MCP payloads in issues, tests, or commits.
- Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
- Preserve the core security boundary: servers provide untrusted declarative data, never executable React Native code.
- Keep changes focused. Separate unrelated refactors from behavior changes.
- Do not push directly to `main`. Every change goes through a pull request.

## Before you start

Small documentation fixes and narrowly scoped test improvements can go directly to a pull request. For protocol changes, new components, public API changes, transport integrations, or security-policy changes, open an issue first so the design can be discussed before implementation.

When proposing a larger change, describe:

1. the use case and the user who benefits;
2. the server-to-host data flow;
3. any new trusted or untrusted boundary;
4. the smallest public API required;
5. how unsupported or malicious input fails;
6. the tests and documentation that will prove the behavior.

Architecture changes may require a new RFC in `docs/`.

## Development setup

Prerequisites:

- Node.js 22 or newer
- npm 10 or newer
- Git

```bash
git clone git@github.com:pablospaniard/mcp-native.git
cd mcp-native
npm ci
npm test
```

Create a focused branch from the latest `main`:

```bash
git switch main
git pull --ff-only
git switch -c feat/short-description
```

Recommended branch prefixes are `feat/`, `fix/`, `docs/`, `test/`, `refactor/`, and `chore/`.

## Monorepo boundaries

Keep dependencies flowing in the intended direction:

```text
@mcp-native/mcp          ──► @mcp-native/core
@mcp-native/a2ui         ──► @mcp-native/core
@mcp-native/webview      ──► @mcp-native/core
@mcp-native/react-native ──► @mcp-native/a2ui
mcp-native               ──► core + a2ui + react-native + webview
```

- `core` must remain independent of React Native, A2UI, and WebView implementations.
- `mcp` adapts the official SDK and validates values before they enter `core`; it must not own UI behavior.
- `a2ui` owns parsing and validation, not native component rendering.
- `react-native` consumes validated models and maps only to host-owned components.
- `webview` owns HTML compatibility policy and must fail closed by default.
- The `mcp-native` package is a convenience export surface, not a second runtime.

## Coding guidelines

- Use TypeScript with strict types; avoid `any`.
- Prefer small public interfaces and immutable data.
- Validate untrusted input at the boundary before transforming it.
- Make unsupported input fail with a specific, testable error.
- Avoid hidden global state and transport-specific assumptions in `core`.
- Add comments for security invariants and non-obvious protocol decisions, not for routine syntax.
- Preserve backwards compatibility for published exports unless an approved RFC explicitly permits a breaking change.

### Adding a declarative node or action

A change that expands server-controlled UI should include:

- the typed node or action model;
- strict parser validation;
- a negative test for malformed or unsupported input;
- a trusted render mapping;
- accessibility behavior;
- action and capability constraints;
- documentation of the security implications.

Do not add an escape hatch that evaluates code, resolves arbitrary component names, or spreads unchecked server properties directly onto native components.

## Tests and quality checks

Run these before opening or updating a pull request:

```bash
npm run clean
npm run check
npm test
```

Use `npm run format:fix` and `npm run lint:fix` to apply automatic formatting and safe lint
fixes before rerunning the checks.

New behavior requires tests. Bug fixes should include a regression test that fails before the fix. Documentation-only changes do not need synthetic tests, but links, examples, package names, and commands must still match the repository.

CI runs the same type and test checks on every pull request. A pull request cannot merge while the required `verify` check is failing.

## Commits

Write concise, imperative commit subjects. Conventional Commit-style prefixes are encouraged:

```text
feat(a2ui): validate text input bindings
fix(webview): reject unsupported HTML MIME types
docs: explain the capability broker
test(core): cover failed tool actions
```

Rebase or merge the latest `main` when GitHub reports that your branch is out of date. Do not force-push over another contributor's work.

## Pull requests

Every pull request should:

- explain the problem and the chosen approach;
- stay narrow enough to review confidently;
- include tests for behavior changes;
- update public documentation when APIs or behavior change;
- call out security, compatibility, and migration implications;
- complete the pull request checklist;
- pass the required `verify` check;
- resolve all review conversations before merging.

Protocol- or compatibility-affecting pull requests must also:

- identify the exact released specification version or pinned Candidate commit;
- link the relevant normative section and distinguish `MUST`, `SHOULD`, and project policy;
- include official fixtures or interoperability scenarios where available;
- update the [compatibility matrix](docs/standards-compatibility.md) and [roadmap](docs/roadmap.md) when support changes;
- avoid unqualified conformance claims when only a subset is implemented.

Draft pull requests are welcome for early feedback. They are not mergeable until marked ready for review.

The repository prefers squash merging so each pull request becomes one coherent commit on `main`. Maintainers may edit the squash commit message for clarity.

## Review priorities

Reviews focus on, in order:

1. security and trust boundaries;
2. public API and protocol compatibility;
3. correctness and failure behavior;
4. tests and observability;
5. maintainability and documentation;
6. style.

## Releases

Only maintainers publish packages. A release must use versions that have not already been published, pass CI from the exact commit being released, and keep inter-package dependency ranges aligned.

Until the release process is formalized, do not change package versions in feature pull requests unless the issue or maintainer explicitly requests it.

## Getting help

Open a GitHub issue for reproducible bugs and focused feature proposals. Use a discussion thread when the question is exploratory or needs design input before it can become actionable.
