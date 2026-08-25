# Security Policy

MCP Native processes server-controlled descriptions that may eventually reach device UI and capabilities. Security reports are especially valuable, even while the project is experimental.

## Supported versions

There is not yet a stable or supported release line. Security fixes are made on the latest `main` branch. Published `0.0.x` packages are experimental and may not contain the latest repository code.

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

Security-oriented architecture does not by itself establish protocol conformance. The current A2UI parser is an internal proof of concept, and the WebView package is not yet an MCP Apps sandbox or bridge. See [Standards and compatibility](docs/standards-compatibility.md) for the exact boundaries.
