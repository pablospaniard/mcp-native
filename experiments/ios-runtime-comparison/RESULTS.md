# Initial iOS comparison findings

Date: 2026-09-12. Baseline: integration commit `d7e4ada`, A2UI v1.0 Candidate
`8ff4651232ab0e02b0123730b502711170637a3a`. This is an experiment result, not an accepted runtime
decision, supported iOS SDK, or milestone completion.

## Evidence

| Check                                                        | JavaScriptCore semantics                    | Independent Swift semantics                 |
| ------------------------------------------------------------ | ------------------------------------------- | ------------------------------------------- |
| Shared corpus on macOS                                       | 20/20 cases; exact observations             | 20/20 cases; exact observations             |
| Shared corpus in iOS simulator app                           | Same corpus, independently compared by Node | Same corpus, independently compared by Node |
| SwiftUI input → checkbox → action → close → reset            | XCTest passes                               | XCTest passes                               |
| Local fixture tool result → input → authorized action        | Passes                                      | Passes                                      |
| Denied actions / omitted data model                          | Shared corpus passes                        | Shared corpus passes                        |
| Closed session, stale generation, fresh-session isolation    | Passes                                      | Passes                                      |
| Unknown MIME, cycle, JSON/pointer depth, required whitespace | Probes pass                                 | Probes pass                                 |
| Retained local value overrides invalid server date           | Probe passes                                | Probe passes                                |
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

The minified host bundle is approximately 335 KB, including the URL polyfill. Exact bytes are emitted
by the run command. esbuild 0.28.2 and core-js-pure 3.50.0 are pinned root development dependencies;
they do not become production npm dependencies. This byte count is an uncompressed JavaScript file,
not downloaded app size or resident memory. The comparison executable/app includes both engines,
so its size must not be used as a native-versus-JavaScript binary comparison.

**The bridge is small, but renderer-core is not an interactive session.** Swift owns the context,
JSON exchange, generation, policy and views. Additional JavaScript code owns local reconciliation,
binding writes and session lifetime. That glue currently duplicates some React Native adapter
behavior. A production shared-runtime choice would need one tested session implementation, not
another independent copy maintained inside each platform adapter.

**The small Swift interpreter already exposed semantic maintenance costs.** `required` must not trim
whitespace. Rendering must use the effective local model, including when a later component update
introduces date formatting. Swift's canonical Unicode equality also requires care for JSON keys and
component identifiers; this probe narrows those inputs to ASCII instead of silently conflating them.
Those issues arose inside a six-component subset. Passing the corpus does not establish full-schema,
formatting, graph or hostile-input parity. Native execution remains attractive, but its production
validation work is substantially larger than this prototype.

## Recommendation

Keep shared JavaScript as the leading **next experiment** because it reuses the production semantic
and validation implementation, and its Apple bridge now has concrete behavioral evidence. Do not
select it for production until the Android engine probe, interruptibility/lifecycle design, device
budgets and measurements, broader hostile cases, and platform accessibility checks are complete.
The native path remains viable; it needs an explicit parity budget and another upstream reuse review
before growing into a second production validator.

**Do not add or stabilize another public package yet.** This experiment consumes renderer-core's
code outside React Native, which supports the internal boundary. It does not prove that the boundary
must be a separately published npm package: a host bundle can consume an internal build entry point.
Both approaches use the same SwiftUI adapter, and neither requires a collection of low-level Swift
packages. Keep the experiment in one directory and preserve current published compatibility.

Next: run the minimal Android engine/bundling/Intl probe against this exact corpus, then review a
single session contract covering revisions, input events, admission cancellation, teardown and host
authorization. Leave the package decision and milestone 12/13 completion open.
