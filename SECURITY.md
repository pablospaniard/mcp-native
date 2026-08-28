# Security Policy

MCP Native processes server-controlled descriptions that may eventually reach device UI and capabilities. Security reports are especially valuable, even while the project is experimental.

## Supported versions

There is not yet a stable or supported release line. Security fixes are made on the latest `main` branch. Published pre-`1.0.0` packages are experimental and may not contain the latest repository code.

## Report a vulnerability

Please do not open a public issue for a suspected vulnerability.

Use GitHub's private vulnerability reporting flow:

[`https://github.com/pablospaniard/mcp-native/security/advisories/new`](https://github.com/pablospaniard/mcp-native/security/advisories/new)

Include, where possible:

- the affected package, API, commit, or version;
- a minimal reproduction or proof of concept;
- the expected and observed behavior;
- the security impact and plausible attack path;
- any mitigations you have already identified;
- whether the report or proof of concept has been shared elsewhere.

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

Security-oriented architecture does not by itself establish unqualified protocol conformance. The
custom A2UI `0.1` parser remains a deprecated proof shape, while the WebView package implements only
the documented stable MCP Apps native host-adapter profile. Native WebView isolation differs from a
browser's cross-origin double iframe, and sensitive permission grants require an audited platform
adapter. See [Standards and compatibility](docs/standards-compatibility.md) for the exact boundaries.
