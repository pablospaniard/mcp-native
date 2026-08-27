# Changelog

All notable changes to MCP Native are documented here. Until the project reaches `1.0.0`,
breaking public API changes increment the minor version; patch releases remain compatible within
their minor release line.

## Unreleased

### Added

- Bounded, host-localized A2UI v1 `formatDate` execution for strict calendar dates, RFC 3339
  timestamps, Unix epochs, nested interpolation, and dispatch-time values.
- A2UI v1 `required`, `regex`, `length`, `numeric`, and `email` validation functions plus
  renderer-side checks for supported text fields and buttons. Failed field checks expose their
  messages to host components, while failed button checks disable dispatch.
- Policy-gated A2UI v1 `openUrl` Button actions with press-time data resolution, canonical HTTP(S)
  descriptors, host-owned platform execution, and non-dispatchable temporary invalid local edits.
- Typed React Native host adapters for mapping trusted `View`, `Text`, `Button`, and `TextInput`
  props into locally bundled third-party component APIs.
- Closed React Native component variants for host-owned `Row`, `Column`, `List`, and `Card`
  presentation plus pinned text, button, and text-field style hints, with primitive fallbacks.
- Closed React Native accessibility semantics for rendered text and buttons, explicit disabled state,
  enabled text scaling, and a real-platform verification plan that records evidence without claiming
  unexecuted device coverage.

### Security

- Reject invalid date values, ambiguous 12-hour patterns, unsupported Unicode pattern tokens,
  malformed quoted literals, out-of-range epochs, and patterns exceeding the renderer work limit.
- Bound expanded renderer checks, validation accessibility output, and agent-supplied regular
  expressions; reject potentially expensive regex constructs, invalid ranges, and non-boolean
  check results.
- Require both the catalog function allowlist and a synchronous host URL policy before `openUrl`
  execution; reject relative URLs, non-HTTP(S) schemes, credentials, whitespace, control and
  Unicode format characters, oversized URLs, and cumulative dynamic-list amplification.
- Keep host component adapters behind the existing closed primitive catalog: servers cannot select
  modules, register component names, choose prop mappers, or spread unchecked props.
- Select richer host components only through pinned A2UI variant enums; server-provided style
  objects and arbitrary native props still never cross the renderer boundary.
- Scope component-variant selection to the A2UI v1 renderer so sharing a catalog cannot change
  legacy `0.1` component selection.
- Derive native accessibility role, disabled state, focus eligibility, and text-scaling props inside
  the trusted renderer; servers cannot choose these values or inject arbitrary native semantics.

## 0.3.0 - 2026-08-26

Expands the standards-pinned A2UI v1 Candidate path from static native plans into bounded,
interactive rendering with capability negotiation, dynamic lists, and the first executable
catalog functions. The adapter remains intentionally partial and fails closed for unsupported
renderer semantics.

### Added

- Strict agent and renderer capability parsing with exact catalog overlap negotiation and inline
  catalogs disabled.
- Renderer-local data-model updates, dispatch-time action context resolution, and official
  renderer-to-agent action envelope construction.
- Bounded dynamic `List` templates with relative bindings, stable instance identity, and
  dispatch-time `@index` evaluation.
- Bounded `formatString` execution with official JSON coercion, nested supported expressions, and
  renderer-local state.
- Host-localized `formatNumber`, `formatCurrency`, and `pluralize` execution with validated dynamic
  arguments, locale options, and bounded output.
- Strict `and`, `or`, and `not` evaluation across render and dispatch-time state.

### Security

- Validate nested boolean operands against the host function allowlist before rendering or
  dispatching actions.
- Reject unsupported locales, currencies, precision settings, plural operands, and boolean values
  with controlled parse errors.
- Preserve renderer expansion and formatted-output budgets across dynamic lists and nested
  function evaluation.

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
