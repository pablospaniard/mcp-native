# MCP Native documentation

Start with the [main README](../README.md) for the product overview, package choices, and architecture
diagrams. This page routes implementation and review work to the document that owns the answer.

## Choose the package path

| Goal                                                                 | Start here                                                                                                  |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Own connection, discovery, calls, and result routing through one API | [`@mcp-native/host`](../packages/host/README.md); React Native lifecycle integration is currently on `main` |
| Compose the protocol and rendering stages yourself                   | [Host integration checklist](host-integration-checklist.md), then the focused package guides                |
| Import the low-level runtime and UI layers from one module           | [`mcp-native`](../packages/mcp-native/README.md)                                                            |
| Migrate custom A2UI `0.1` data                                       | [Migration to 1.0](migration-to-1.0.md) and the explicit `/legacy` entry points                             |

Focused package guides: [core](../packages/core/README.md), [MCP SDK adapter](../packages/mcp/README.md),
[A2UI](../packages/a2ui/README.md), [React Native](../packages/react-native/README.md), and
[WebView](../packages/webview/README.md).

## Choose the result surface

| Result                                                   | Use                                      | Read                                                                  |
| -------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------- |
| Semantic native forms, lists, cards, media, and actions  | A2UI with a host-owned component catalog | [Product guide](product-guide.md) and [capabilities](capabilities.md) |
| A locally compiled application-specific native component | A negotiated host extension              | [Media and host extensions](media-and-host-extensions.md)             |
| Rich HTML or a web-focused visualization                 | An isolated MCP App                      | [MCP Apps compatibility](mcp-apps-compatibility.md)                   |
| Native and HTML regions on one app-owned screen          | Separate sibling regions                 | [Mixed surfaces](mixed-surfaces.md)                                   |
| Text or structured data with no supported UI claim       | Bounded inert ordinary-content rendering | [High-level host](../packages/host/README.md)                         |

Unknown or ambiguous executable formats are not guessed. Application-defined input contracts are
tracked after 1.0 and are not part of the current host.

## Implement a production host

- [Host integration checklist](host-integration-checklist.md) — transport, catalogs, policy,
  lifecycle, shell layout, permissions, and errors.
- [Support matrix](support-matrix.md) — package requirements and automated integration evidence.
- [Native OAuth testing](native-oauth-testing.md) — secure storage and OS authentication-session
  responsibilities for protected HTTP.
- [Native accessibility testing](native-accessibility-testing.md) — platform scenarios and the
  runnable Expo proof.
- [WCAG 2.2 native assessment](wcag-2.2-native-assessment.md) — library and application ownership.
- [A2UI performance limits](a2ui-v1-performance.md) — bounded parsing, updates, rendering, and
  retained memory.

Runnable examples:

- [Expo Go todo app](../examples/expo-go-todolist/README.md) — focused native A2UI workflow.
- [City Canvas](../examples/expo-go-mixed-surfaces/README.md) — native A2UI and an isolated MCP App.

## Verify protocol claims

- [Standards and compatibility](standards-compatibility.md) — combined source and evidence index.
- [Protocol support](protocol-support.md) — supported MCP revisions and operations.
- [MCP conformance](mcp-conformance.md) — exact pinned suite and selected scenarios.
- [A2UI conformance](a2ui-v1-conformance.md) — exact Candidate pin, implemented features,
  exclusions, and interpretations.
- [A2UI-over-MCP binding](a2ui-mcp-binding.md) — project-owned negotiation and resource mapping.
- [MCP Apps compatibility](mcp-apps-compatibility.md) — stable native host-adapter profile and
  browser/native differences.

## Review architecture or prepare a release

- [RFC-0001](RFC-0001-architecture.md) — package boundaries, data flow, capability model, and threat
  model.
- [Compatibility policy](compatibility-policy.md) — proposed stable `1.x` API and behavior surface.
- [1.0 readiness](1.0-readiness.md) — completed automation and remaining independent reviews and
  publication actions.
- [Roadmap](roadmap.md) — completed milestones, the stable-release gate, and undated post-1.0 work.
- [Release process](releasing.md) — coordinated packages, trusted publishing, and provenance.
- [Security policy](../SECURITY.md) — supported releases and private vulnerability reporting.

## Current status

The published `0.9.3` line is the current release candidate. It includes the headless high-level host
and the independently usable low-level packages. The `main` branch adds the unreleased React Native
host provider and integration tooling recorded in the [changelog](../CHANGELOG.md). The Milestone 10
host-package gate is complete; independent reviews, final validation, stable documentation and
compatibility approval, versioning, and publication remain before `1.0.0`.
