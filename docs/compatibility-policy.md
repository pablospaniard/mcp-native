# `1.x` compatibility policy

The v1 public API is finalized. The high-level `@mcp-native/host` workflow and every focused
low-level package are ready for production integration. This policy is the adopted contract for
the `1.x` line; no API-design or independent-review gate remains open for `1.0.0`.

The API baseline is closed for the initial v1 release. Future compatible additions follow the
minor-release rules below; incompatible changes require a major version and a migration plan.

The pre-stable A2UI schema alignment to `8ff4651232ab0e02b0123730b502711170637a3a` changes the
advertised revision and its exported literal type while preserving callable APIs. It is included
in the final v1 baseline, with a coordinated host/server upgrade documented in the
[migration guide](migration-to-1.0.md#align-the-a2ui-schema-revision-on-both-peers). It does not
establish an exception to the major-release rules for incompatible schema-pin changes in `1.x`.

## A2UI specification boundary

MCP Native supports a [pinned, feature-scoped profile of A2UI v1.0 Candidate](a2ui-v1-conformance.md).
As of 2026-09-07, [upstream A2UI versions](https://a2ui.org/#specification-versions) identify
v1.0 as Candidate and v0.9.1 as the current production release. Stable MCP Native `1.x` packages
do not imply a stable upstream A2UI v1.0 specification or support for A2UI v0.9.1. Later upstream
revisions require review, explicit pin updates, and profile verification; compatibility never
follows a moving branch automatically.

## Stable compatibility surfaces

For `1.x`, the following are compatibility surfaces:

- package names, declared export subpaths, runtime export names, TypeScript declarations, peer
  dependency ranges, and package dependency directions;
- public class, function, callback, option, result, state, error type, error-code, constant, and
  default-policy behavior;
- MCP extension identifiers and settings, media types, protocol versions, wire names and envelopes,
  schema and catalog pins, project interpretations, bounds that callers can observe, and negotiated
  fallback behavior;
- host component names, semantic prop/event contracts, extension tuple and manifest rules, and
  policy-grant shapes;
- documented security behavior, including which input is rejected and which operation requires a
  host or user decision.

Removing, renaming, or incompatibly narrowing one of these surfaces requires a major release and an
explicit migration plan. Security fixes may reject input that should never have been accepted; the
release notes must identify the affected boundary and safe replacement.

Additive exports, optional fields, components, negotiated features, and platform adapters may ship
in minor releases when old callers retain their behavior. Patch releases contain compatible fixes
within a minor line. Post-`1.0.0` SwiftUI, Compose, and capability-provider packages will use their
own documented profiles and will not silently expand the React Native server contract.

The host result surface is a closed union: `a2ui`, `mcp-app`, `ordinary`, or `invalid`.
The two executable UI outcomes require exact mutual extension negotiation. A result claimed by both
negotiated profiles is invalid, and failure after selecting either standard path never retries as
ordinary content or through another renderer. Invalid results expose a stable host-authored code,
not a server or transport error string. The resolver receives one connection-bound client whose
resource reader and client/server extension snapshots are inseparable; it does not accept
caller-supplied negotiation maps independently of that connection.

The headless host controller snapshot, lifecycle methods, stable controller error codes, automatic
rediscovery behavior, one-active-operation rule, and cancellation/stale-result semantics are also
stable `1.x` compatibility surfaces. The `/react-native` provider, hook, result renderer, stable
render-error codes, fixed host states, ordinary-text bound, and exact MCP Apps ownership rules join
that stable surface. Tool calls are eligible only after the exact definition has been discovered
on the active connection; reconnect clears both discovered tools and prior call state before
automatically discovering again. Explicit `refreshTools()` ignores a still-fresh SDK cache entry and
replaces it with a newly fetched, validated aggregate.

The unreleased [Milestone 11 inline contract API](custom-contracts.md) uses the separate
`@mcp-native/host/contracts` entry point and `ContractResult` union. Existing resolver/controller declarations,
result/action/error unions, default extension map, and root exports are unchanged. The new API
adds inert `contract-data` and `contract-error` outcomes; applications opt in explicitly. It does
not expand supported A2UI or MCP Apps profiles. The opt-in controller and
`@mcp-native/host/contracts/react-native` provider add data-result lifecycle. Optional native registry/view factories mount static custom
data and schema-validated events through `createContractActionAuthorization`; the new decision union
is separate from existing host authorization. Both controllers share cancellation guards that prevent late parsing/preparation and
immediately drop tools/results on shutdown; existing public declarations are preserved. The broader
wire/resource design in [RFC-0002](RFC-0002-contract-registry.md) remains later work; separately
packaged reviewed inline profiles are implemented through their own exact bindings.

The additive React Native host registration, mount-report fields and error codes, layout-contract
vocabulary, registered surface, reusable render boundary, and `/testing` subpath are stable
`1.x` compatibility surfaces. Layout contracts are local host metadata only: changing them may
narrow where a local adapter is mounted, but cannot alter the A2UI schema or advertise an otherwise
uninstalled component. The `mcp-native` CLI command names and non-overwriting scaffold behavior are
also public package behavior; generated application code is owned by the consumer after creation.
The high-level `McpNativeRegisteredHostResultView` is an additive convenience over the existing
separate-prop result view; both preserve the same rendering and error semantics.

## Package boundaries

`@mcp-native/core` stays independent of MCP SDK, A2UI, React Native, and WebView implementations.
`@mcp-native/mcp` owns the official SDK adapter. `@mcp-native/a2ui` owns protocol parsing, state,
validation, and semantic planning. `@mcp-native/react-native` owns React and React Native mounting.
`@mcp-native/webview` owns generic HTML policy and the stable MCP Apps native adapter.
`@mcp-native/host` is the top-level orchestration package and may depend on the official SDK adapter,
runtime, protocol, renderer, and WebView layers to provide the connect-call-render workflow. The
`mcp-native` convenience package may compose and re-export these layers, including the host-owned
mixed-surface coordinator.

Dependency inversion, server-selected executable code, unchecked prop spreading, generic native
commands, or a cross-boundary WebView escape is not a compatible extension.

## Freeze checks

`npm run api:verify` builds every existing package and compares all declared package subpaths,
runtime export names, and the complete emitted declaration surface with
`docs/public-api-baseline.json`. The host-package root and `/react-native` surface are included in
that v1 baseline. Package
smoke tests verify the declared exports, JavaScript and declaration source maps, README, and exact
MIT license in every tarball. The same gate runs every supported subpath in a migration-ready clean
consumer before and after an offline replacement of the latest coordinated published `0.9.x`
packages with local release tarballs. Changes to the baseline require an intentional
compatibility review and changelog/migration update.

The [support matrix](support-matrix.md) records the supported dependency lanes. The
[migration guide](migration-to-1.0.md) records the upgrade steps from pre-v1 packages. The
[`1.0.0` readiness checklist](1.0-readiness.md) records completed readiness gates and the coordinated
publication actions. Check results may be summarized in a pull request or release;
their raw output is not a required committed artifact.

## Unreleased contract inventory and authoring additions

The opt-in [maintained standard factories](standard-contracts.md) add immutable registry inventory and
subset selection; defaults, existing v1 declarations, protocol/schema pins, and package versions stay
unchanged. A client advertising an excluded standard fails with the new contract-only
`invalid-standard-settings` code. The separate [authoring subpath](contract-authoring.md) generates v1
canonical schema bundles and runs bounded fixtures. Existing hand-hashed adapters remain runtime-valid;
adopting the fixture runner requires updating installed and peer-advertised digests together.
[Separately packaged reviewed adapters](reviewed-standard-adapters.md) now support the closed inline
JSON interface, with their own exact bindings, review evidence, and `.reviewedStandards` inventory.
The new `invalid-standard-claim` code is confined to the opt-in API. Existing custom adapters are not
promoted; broader wire/resource interfaces remain proposed in [RFC-0002](RFC-0002-contract-registry.md).

The unreleased native contract renderer now receives `createRenderBudget()` instead of a shared
`consume` prop. Create a fresh budget per render invocation; event budgets remain cumulative per
result. This corrects React replay behavior. See the [renderer migration](custom-contracts.md#unreleased-renderer-migration-after-review).
