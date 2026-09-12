# RFC-0002: Native platform runtime and package strategy

- Status: Proposed; runtime choice and package consolidation are not accepted decisions
- Date: 2026-09-12
- Integration branch: `feature/native-platforms`
- Scope: GitHub milestones 11–16; initial experiments address milestones 12 and 13
- Baseline: [RFC-0001](RFC-0001-architecture.md) and the existing `1.x` compatibility policy

## Recommendation

Keep the existing security and dependency boundaries, simplify the application-facing integration
path, and compare two small native implementations before committing to another stable public
package. A source module does not need to be a separately published package to enforce a boundary.

Prefer native Swift and Kotlin implementations as the provisional product direction for first-class
native hosts. They fit platform ownership and avoid asking native applications to operate a second
language runtime. This preference is architectural judgment, not a measured performance result.
Shared JavaScript has a substantial counterargument: it reuses the existing validation and semantic
implementation and reduces the number of security-sensitive implementations to maintain. If native
parity proves too expensive, or the JavaScript bridge is demonstrably small and reliable, choose the
shared runtime instead. If neither experiment meets the acceptance criteria, keep shipping React
Native while narrowing the native-platform commitment.

The renderer-core extraction is an experiment supporting this comparison. Integrating it on the
feature branch does not approve a new npm release or finalize its native-consumer contract.

## Integration workflow

The feature branch starts at `cd046ed` (`v1.0.1`). Work for milestones 11–16 is delivered through
focused pull requests targeting `feature/native-platforms`. Create subsequent task branches from
the integration branch after their prerequisites land. Keep each PR independently reviewable and
link the relevant milestone issue. Routine stable-line maintenance can continue to target `main`.

Maintainers merge approved PRs; automation never merges. Mainline updates enter the integration
branch through a reviewed synchronization PR. Before integrating the feature branch into `main`,
review the resulting public API, migration requirements, supported platform matrix, and release
scope. The integration branch is not a release channel, and this RFC does not authorize publication
or package-version changes.

## What the repository already proves

- Seven published packages share one coordinated release version; the current extraction introduces
  an eighth workspace. Most applications are directed to `@mcp-native/host`.
- `core` is independent of protocol and UI implementations; `mcp` isolates official SDK adaptation;
  `a2ui` owns pinned parsing and validation; `webview` owns a separate HTML trust boundary.
- The extracted planner has no React dependency, but its A2UI dependency uses Ajv and bundled JSON
  schemas. Formatting uses JavaScript `Intl` APIs. npm ESM output alone is not an embedded-runtime
  distribution and has not been tested in a native JavaScript engine.
- React Native still owns local-state reconciliation, binding writes, several callback checks,
  mount inspection, and application lifecycle integration. The extracted planner is not a complete
  reusable interactive session runtime.
- The existing conformance fixture factory executes TypeScript/JavaScript and includes prose
  expectations. Native runners need language-neutral inputs and machine-checkable expected results.
- No SwiftUI or Compose implementation or native-engine performance comparison has been completed
  by this extraction.

These statements follow the current source and package manifests. Passing JavaScript package checks
does not establish native-runtime compatibility, accessibility, or behavioral parity.

## Approach A: Shared JavaScript semantics with native views

Bundle host-owned JavaScript implementing validation, state transitions, planning, and action
resolution. A SwiftUI or Compose adapter owns views and sends bounded input events to that runtime.
The native host continues to own transport, resource loading, navigation, permission decisions, and
user consent. Only code shipped with the application executes; servers supply declarative data.

The boundary needs owned, serializable requests/results, fixed size and work limits, session and
revision identity, cancellation, stale-result rejection, deterministic teardown, and a closed event
vocabulary. JavaScript functions, component references, and unrestricted native calls cannot cross
it. Native policy decisions must remain authoritative even when the semantic engine approves a
request. The synchronous policy callbacks in today's TypeScript API need an explicit mapping;
asynchronous bridges must not silently turn them into permissive defaults.

Apple's [JavaScriptCore](https://developer.apple.com/documentation/javascriptcore/jsvirtualmachine)
provides execution contexts with VM-level serialization. Android's
[JavaScriptEngine](https://developer.android.com/jetpack/androidx/releases/javascriptengine) exposes
a support check and isolate lifecycle. These are candidates, not selected dependencies. Verify the
chosen engine on the declared device/OS matrix; do not assume matching availability or behavior.

Advantages: reuse of existing hostile-input validation, one semantic implementation to patch,
and a concrete second consumer for a React-free planner package.

Costs: engine packaging/support, bundling Ajv and schemas, verifying `Intl` and other runtime APIs,
bridge copies and queues, cross-runtime debugging, interruption, and memory ownership. A single
semantic implementation still requires independent native adapters and device-level testing.

## Approach B: Native semantics with shared conformance assets

Implement the selected semantic profile in Swift and Kotlin, with native views and native session
ownership. Share exact schema pins, executable test vectors, semantic definitions, and expected
actions/errors across all renderers. Retain TypeScript as the React Native implementation and one
reference against which to compare; it is not an unquestionable oracle when it disagrees with the
pinned specification.

The shared corpus must cover ordered updates, data bindings, local/server reconciliation, dynamic
lists, validation, resource and action policy, lifecycle, and every cumulative limit in the selected
profile. Compare observable behavior and failure categories. Declare allowed platform differences
in formatting and accessibility explicitly, preserving the existing React Native compatibility
promise. Count strings, nodes, and work consistently across language/runtime representations.

Advantages: familiar platform distribution and debugging, direct ownership of lifecycle and state,
and no JavaScript engine requirement for native applications.

Costs: duplicate security-sensitive logic, cross-language number/date/regex/Unicode differences,
multiple schema-validation implementations, and continuing parity work for protocol revisions.
Generated schema types alone do not implement runtime validation or cumulative work limits.

Native consumers need a shared contract and corpus; they do not directly consume an npm planner.
This approach therefore gives less justification for publishing renderer-core separately.

## Comparison and decision criteria

| Dimension                       | Shared JavaScript                                | Native Swift/Kotlin                                  |
| ------------------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| Initial semantic reuse          | High, once bundling and the bridge work          | Lower; implement or audit reusable native logic      |
| Security maintenance            | One semantic implementation plus bridge/adapters | Multiple validators and state machines plus adapters |
| Native application integration  | Engine and native library integration            | Native library integration                           |
| State/lifecycle complexity      | Coordination across runtime boundaries           | Coordination within each platform implementation     |
| Startup, memory, responsiveness | Unknown until measured on devices                | Unknown until measured on devices                    |
| Shared deliverable              | Runtime implementation and conformance corpus    | Semantic specification and conformance corpus        |
| Reason to retain renderer-core  | Actual runtime reuse by another host             | Optional TypeScript reference or headless consumer   |

Security and declared-profile correctness are mandatory gates. After both pass, choose using
measured integration effort, failure recovery, package/binary size, cold startup, retained memory,
and input-to-render latency. Agree device-specific budgets before measurement. Record devices,
build configuration, workload, repetitions, and distributions; do not infer a winner from Node
benchmarks or a static screen. No numeric performance claims are made in this RFC.

## Package assessment

The current public surface asks applications to understand more layers than the primary workflow
requires. Coordinated releases also mean these packages do not currently buy independent release
cadences. However, combining their source indiscriminately would lose valuable dependency and trust
separation. Reduce integration choices first; change physical packaging only when evidence supports it.

| Current package             | Assessment                                                                                                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@mcp-native/host`          | Keep as the preferred current React Native integration path; audit which lower-level types applications still must assemble.                                                              |
| `mcp-native`                | Its convenience exports overlap the lower-level packages but do not provide the preferred high-level host. Evaluate an additive high-level entry point and a single getting-started path. |
| `@mcp-native/core`          | Preserve the dependency-free boundary; keep existing imports compatible. Internal architectural importance alone should not require ordinary apps to import it.                           |
| `@mcp-native/mcp`           | A separate SDK dependency boundary has a concrete purpose for manual and transport-specific integrations.                                                                                 |
| `@mcp-native/a2ui`          | Standalone parsing, validation, and protocol reuse justify an independently usable boundary.                                                                                              |
| `@mcp-native/webview`       | HTML isolation and platform dependencies justify a distinct boundary; assess optional loading separately from the default native flow.                                                    |
| `@mcp-native/react-native`  | A platform renderer is a natural distribution boundary.                                                                                                                                   |
| `@mcp-native/renderer-core` | Provisional. Retain publicly only if a real independent JavaScript consumer needs it; otherwise keep the implementation internal when preparing a mainline release.                       |

Aim for one primary integration product per platform, with advanced entry points for genuine
composition needs. Do not create new published packages for each validator, state machine, fixture
set, bridge, or capability. Share fixtures as repository data until external distribution is needed.
No existing package or export is removed by this RFC. Any eventual removal needs a major-version
migration; an additive facade must also preserve optional dependency behavior and class identity.

## Experiments and milestone sequence

The initial [shared renderer corpus](../tests/fixtures/renderer-conformance/README.md) implements
the JSON fixture portion of step 1 with 20 cases executed by the current React Native renderer.
It does not complete the engine probes, native prototypes, or runtime decision described below.

Milestone 12 supplies a draft contract and corpus to a scoped milestone 13 prototype, then incorporates
the prototype's findings. Its final exit gate must not block the experiment needed to satisfy it.

1. **Shared corpus and runtime probes (12).** Define language-neutral cases for a text/layout/input/
   checkbox/button flow, local edit followed by server update, an authorized action, rejected input,
   and surface deletion. Include amplification and stale-event cases. Run the corpus against React
   Native first. Probe bundling/schema validation/formatting in candidate Apple and Android engines.
2. **Comparable iOS prototypes (12 + 13).** Implement that same declared subset with bundled JavaScript
   and with native Swift semantics. Use the same host-owned MCP server fixture, catalog, and action
   policy. Validate one full tool-result-to-interaction round trip, teardown, accessibility, and
   cancellation. Unsupported components must be rejected, including when the agent ignores the
   advertised subset. Neither prototype claims full catalog or function parity.
3. **Decision PR (12).** Compare the measurements and parity gaps. Accept or replace this RFC's
   provisional recommendation; decide whether renderer-core is a public package. Document a scoped
   iOS preview and the integration surface. A minimal Android probe must expose platform-specific
   blockers before choosing a runtime for both platforms.
4. **iOS preview, then Android preview (13, 14).** Ship the same bounded semantic profile with explicit
   platform matrices. Expand media, extensions, broader Apple platforms, and full catalog/function
   parity through separate reviewed PRs. Preview completion does not close the full-parity milestones.
5. **Demand-led expansion (11, 15).** Prove one application-requested input adapter and one narrowly
   scoped capability provider before generalizing their frameworks. These can proceed independently
   when there is a concrete consumer and owner; they are not prerequisites for the renderer probes.
6. **Ongoing compatibility (16).** Handle upstream revisions as exact, separately reviewed profiles
   throughout the program. Do not couple every maintenance update to completion of all native work.

Before implementing either native path, assess existing renderers for reuse. The upstream
[ecosystem list](https://github.com/a2ui-project/a2ui/blob/main/docs/public/ecosystem/renderers.md)
includes Swift and Compose projects, but that listing does not prove compatibility with our exact
pinned v1 profile, hostile-input requirements, licenses, or supported platform matrix. A reuse
assessment must name an exact revision and identify the remaining gaps.
