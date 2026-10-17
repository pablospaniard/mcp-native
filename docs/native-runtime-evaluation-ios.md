# Initial iOS comparison findings

Date: 2026-09-12. Baseline: integration commit `d7e4ada`, A2UI v1.0 Candidate
`8ff4651232ab0e02b0123730b502711170637a3a`. This preserves experiment evidence used by the accepted
shared-JavaScript renderer-core decision; it is not a supported iOS SDK or device-support claim.

## Evidence

| Check                                                        | JavaScriptCore semantics                    | Independent Swift semantics                 |
| ------------------------------------------------------------ | ------------------------------------------- | ------------------------------------------- |
| Shared corpus on macOS                                       | 21/21 cases; exact observations             | 21/21 cases; exact observations             |
| Shared corpus in iOS simulator app                           | Same corpus, independently compared by Node | Same corpus, independently compared by Node |
| SwiftUI input → checkbox → action → close → reset            | XCTest passes                               | XCTest passes                               |
| Local fixture tool result → input → authorized action        | Passes                                      | Passes                                      |
| Denied actions / omitted data model                          | Shared corpus passes                        | Shared corpus passes                        |
| Closed session, stale generation, fresh-session isolation    | Passes                                      | Passes                                      |
| Unknown MIME, cycle, JSON/pointer depth, required whitespace | Probes pass                                 | Probes pass                                 |
| Retained local value overrides invalid server date           | Probe passes                                | Probe passes                                |
| Nested layouts through the graph limit / excessive depth     | Probes pass                                 | Probes pass                                 |
| Non-object envelopes preserve local edits and session        | Probes pass                                 | Probes pass                                 |
| Device latency, startup, retained memory                     | Deferred                                    | Deferred                                    |

Tested on macOS 26.6.2 (25G83), arm64, Xcode 26.6 (17F113), Swift 6.3.3; iPhone 17 Pro simulator,
iOS 26.5 (23F77). The command-line runner is compiled with `-O`; XCTest uses the Debug simulator
configuration. Deployment target iOS 18 is a build setting, not a verified minimum-runtime claim.
The CI job also exercises the installed iOS 18+ simulator on its macOS runner; its results are
separate from this local environment. Physical-device performance is intentionally unscored, as
agreed for this experiment. No simulator timing is presented as a performance comparison.

`dist/report.json` and `dist/simulator-report.json` contain reproducible observations, engine probes,
and host-check results. They are regenerated rather than checked-in snapshots. The comparator
reads the unchanged shared expectations separately. XCTest's success alone is not sufficient:
the simulator report must also pass the independent JSON comparison.

## What changed the assessment

**Shared JavaScript is feasible in Apple's engine for this subset.** The existing Ajv validator,
schema payload, store, planner and action builder work in JavaScriptCore once WHATWG URL is supplied.
The unmodified engine probe reports `Intl.DateTimeFormat`, `Intl.NumberFormat`, `Intl.PluralRules`,
Promise and Map; URL, TextEncoder and structuredClone are absent. The last two are not needed by
this selected path. An engine probe is still required before expanding the runtime profile.

The minified experiment host bundle was approximately 335 KB, including the URL polyfill. The
temporary esbuild and core-js-pure dependencies were removed with the prototype. This byte count is an uncompressed JavaScript file,
not downloaded app size or resident memory. The comparison executable/app includes both engines,
so its size must not be used as a native-versus-JavaScript binary comparison.

**The bridge is small, but renderer-core is not an interactive session.** Swift owns the context,
JSON exchange, generation, policy and views. Additional JavaScript code owns local reconciliation,
binding writes and session lifetime. That glue currently duplicates some React Native adapter
behavior. A production shared-runtime choice would need one tested session implementation, not
another independent copy maintained inside each platform adapter.

Review probes also found two bridge defects outside the original corpus: nested view serialization
exceeded the server JSON depth budget, and a `null` envelope closed the JavaScript session. Separate
bounded response decoding and object validation fix those cases. Both engines now exercise complete
nested layouts through the common 64-component graph limit, excessive-depth rejection, and malformed
envelopes followed by rendering with retained edits. This reinforces the need to test adapter
boundaries even when the semantic implementation is shared.

**The small Swift interpreter already exposed semantic maintenance costs.** `required` must not trim
whitespace. Rendering must use the effective local model, including when a later component update
introduces date formatting. Swift's canonical Unicode equality also requires care for JSON keys and
component identifiers; this probe narrows those inputs to ASCII instead of silently conflating them.
Those issues arose inside a six-component subset. Passing the corpus does not establish full-schema,
formatting, graph or hostile-input parity. Native execution remains attractive, but its production
validation work is substantially larger than this prototype.

## Recommendation

Use shared JavaScript for the platform-neutral semantic session because it reuses the production
validation implementation and has Apple and Android feasibility evidence. Renderer-specific support
still requires interruptibility policy, device budgets, hostile cases, and accessibility checks.
The native path remains viable; it needs an explicit parity budget and another upstream reuse review
before growing into a second production validator.

The implementation promotes renderer-core as the shared package boundary while preserving all
React Native export identities. Native adapters consume the same session and fixture contract; no
second protocol validator or generic native invocation boundary is introduced.

The discarded prototype, temporary workflow, runner tests, and experiment-only dependencies were
removed after preserving this record and the shared fixtures. Git history retains reproducibility.

Follow-up: the [Android probe](native-runtime-evaluation-android.md) passed the exact bundle and
corpus on one emulator/provider, including termination of an already-running isolate. Next, review
a single session contract covering revisions, input events, admission cancellation, teardown and
host authorization. Remaining iOS lifecycle and Android provider-policy gaps belong to their
renderer-specific milestones.
