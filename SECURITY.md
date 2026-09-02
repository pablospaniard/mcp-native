# Security Policy

MCP Native processes server-controlled descriptions that can reach device UI and host-approved
capabilities. Security reports help strengthen the current release candidate and the `1.0.0`
release.

## Supported versions

The latest `0.9.x` package release is the current release-candidate line. Security fixes
are developed on `main` and released on the latest applicable `0.9.x` patch. Users should stay on
the newest patch; the long-term `1.x` compatibility guarantee begins at `1.0.0`.

## Report a vulnerability

Please do not open a public issue for a suspected vulnerability.

Use GitHub's private vulnerability reporting flow:

[`https://github.com/pablospaniard/mcp-native/security/advisories/new`](https://github.com/pablospaniard/mcp-native/security/advisories/new)

Include, where possible:

- the affected package, API, commit, or version;
- a minimal reproduction;
- the expected and observed behavior;
- the security impact and plausible attack path;
- any mitigations you have already identified;
- whether the report or reproduction has been shared elsewhere.

Do not include real credentials, personal data, private MCP endpoints, or data belonging to another party.

## What to expect

The maintainer will acknowledge a complete report as soon as practical, validate its impact, and coordinate a fix and disclosure plan. Please allow time for a safe release before publishing details. This project cannot currently promise a formal response SLA or bug bounty.

## High-interest areas

Reports are particularly useful when they involve:

- parser confusion, validation bypasses, or unsafe defaults;
- arbitrary code or component execution;
- untrusted properties reaching native components;
- action spoofing or capability escalation;
- WebView origin, navigation, bridge, storage, or permission isolation;
- sensitive data exposure across MCP servers or sessions;
- denial-of-service through malicious surface descriptions;
- dependency or package-publishing compromise.

## Security design

The foundational rule is documented in [RFC-0001](docs/RFC-0001-architecture.md): remote servers may provide declarative UI and actions, but MCP Native never downloads and executes arbitrary React Native JavaScript.

Surface-driven `dispatch()` invocations are validated and denied unless an explicit host policy resolves to `true`. Prefer argument-aware allowlists over tool-name checks; async allowlist predicates are awaited and only an explicit boolean `true` authorizes. Direct `callTool()` remains a trusted-host path with JSON validation only. Protocol-facing JSON rejects circular, non-plain, and non-finite values, and reconstructs prototype-named keys as ordinary own properties. WebView helpers deny inline and remote HTML by default, allowlist non-network inline base-URL schemes (`ui:` / `mcp:`), reject non-string URIs and embedded credentials, require exact remote origin allowlists, and never treat binary MCP blobs as documents. These protections do not authorize a tool, replace application permissions, or make the current WebView primitives a browser sandbox.

The documented protocol profiles make these security boundaries testable. New A2UI integrations use
the pinned v1 Candidate profile; the custom `0.1` parser is isolated for migration. MCP Apps hosts
use the native sandbox and bridge contract, including bounded inbound work, serialized lifecycle
sends, host error handling, and explicit platform permission integration. See [Standards and
compatibility](docs/standards-compatibility.md) for the verified coverage.
