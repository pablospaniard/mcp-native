# iOS runtime comparison

Experiment for RFC-0002 and milestones 12–13. These sources are repository experiments, not new
published packages or a supported iOS SDK. Both engines consume the same basic-form corpus and
drive the same host-owned SwiftUI controls. Exact A2UI baseline:
`v1.0`, Candidate `8ff4651232ab0e02b0123730b502711170637a3a`.

## Temporary lifecycle

This directory exists on `feature/native-platforms` to support the RFC-0002 runtime decision. The
decision PR must include its disposition; the PR promoting the integration branch to `main` must
complete cleanup even if the runtime decision is deferred. The milestone 12/13 maintainers own
that review. There is no standing commitment to maintain both prototypes.

Before promotion to `main`:

- Preserve the findings under `docs/` with the exact tested source revision and reproduction
  instructions, and retain the language-neutral fixtures under `tests/fixtures/renderer-conformance`.
- Move any selected implementation into the reviewed platform code, with its required production
  validation and tests. Selection does not automatically make prototype code production-ready.
- Remove both experiment implementations and their Xcode project, fixture adapter, temporary
  workflow, `tests/ios-runtime-comparison.test.mjs`, and `experiment:ios:*` scripts. Remove esbuild
  and core-js-pure if the selected implementation does not need them; regenerate the lockfile.
- Update documentation links and verify that routine checks no longer depend on this directory.
  Git history retains the discarded implementation and original comparison evidence.

## Run

From the repository root on macOS with Xcode and an iOS 18+ simulator installed:

```sh
npm ci
npm run experiment:ios:check
npm run experiment:ios:simulator
# Optionally select one installed simulator:
npm run experiment:ios:simulator -- SIMULATOR_UDID
```

The first command builds the host-owned bundle, compiles the Swift command-line runner, and compares
both engines' observations against all 20 shared cases. The simulator command also builds the Xcode
app, runs both XCTest UI flows, and independently compares the simulator's saved observations with
the original corpus. Generated `dist/inputs.json` has no expected snapshots; neither engine receives
the expectations. The Node comparator rejects missing cases and any observation mismatch.
The runner boots the selected simulator before testing and disables parallel test worker clones so
the report is collected from that same device, including when starting from a shut-down simulator.

Build outputs and reports stay in the ignored `dist/` directory. After generation, open
`RuntimeComparison.xcodeproj` in Xcode to interact with the same app. The separate
[`iOS runtime experiment` workflow](../../.github/workflows/ios-runtime-experiment.yml) runs on PRs
targeting `feature/native-platforms` when experiment code, fixtures, runtime dependencies or build
configuration change. Documentation-only changes are excluded. New runs cancel superseded runs;
there is no automatic push or mainline trigger. Keep this optional experiment check out of required
branch checks so a path-filtered run does not block unrelated PRs.

Run `npm run experiment:ios:simulator` manually from a checkout whenever needed. The workflow also
declares `workflow_dispatch`, but [GitHub requires default-branch registration](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)
for that UI/API entry point. While the workflow exists only on the integration branch, use the local
command or rerun an existing relevant PR run. Do not promote experiment code just to enable dispatch.
The lightweight JavaScript session and bridge tests remain in normal `npm test` until cleanup.

## Architecture and trust boundary

| Layer                 | Shared JavaScript path                                                           | Native Swift path                                                           |
| --------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Wire validation/state | Existing `A2uiSurfaceStore`, Ajv, exact bundled schemas                          | Independent closed form-envelope interpreter                                |
| Semantics             | Existing planner and action builder, with experiment-local session/binding glue  | `NativeSession.swift`, with explicit binding, check, graph and action logic |
| Engine                | Apple JavaScriptCore; one context per session                                    | Swift values; this execution path never calls JavaScript                    |
| Boundary              | One JSON request/result function, token and sequence checks                      | Direct calls through the same native host                                   |
| Host/UI               | Same `ExperimentHost`, resource fixture, authorization gate and SwiftUI controls | Same                                                                        |

The app evaluates only `dist/runtime.js`, built from local pinned dependencies and shipped in its
bundle. Server strings are passed as JSON arguments to a fixed function; they are never executable
source. No arbitrary JavaScript/native function names, native callbacks, network access, WebViews,
device permissions, dynamic component lookup, or remote modules are exposed by the adapter.
Ajv may generate validators from the fixed host-bundled schemas; server-provided schemas are absent.

Both paths accept the same local MCP tool-result fixture: exactly one embedded resource with the
host-pinned URI `a2ui://experiment/form`, MIME `application/a2ui+json`, and one v1 envelope. The host
then exercises local input, an emitted action and native authorization/delivery. This is a
tool-result-to-interaction proof, **not** a transport, streaming, resource-fetch or negotiation test.
The JSON host policies use only the corpus component/function/event allowlists; unsupported server
components still fail when supplied despite the declared subset.

The native host remains authoritative for action delivery. It verifies the closed action shape,
surface and event allowlist, requires an explicit press, and applies its own authorization decision.
The JavaScript bundle cannot invoke the delivery callback. All work runs synchronously on one serial
caller; the app uses the main actor. A host generation ticket prevents a queued operation from being
admitted after close or into a replacement session. Closing releases the context and managed values.
This proves admission cancellation and teardown; it does not interrupt an in-flight synchronous
JavaScriptCore evaluation, prove asynchronous transport cancellation, or establish memory reclamation.

## Declared limits and gaps

This is a form experiment, not the complete production profile. The common corpus exercises Column,
List, Text, TextField, CheckBox, Button, `required`, one `formatDate` pattern and the `submit` event.
Both paths match every corpus observation, including server/local reconciliation, render rejection,
recovery, authorization denial and the 1025-node expansion rejection.

The Swift interpreter accepts only the fields used by that form profile (plus Divider's wire shape
to exercise host rejection). It rejects other fields instead of claiming general catalog support.
Its `formatDate` accepts only valid `yyyy-MM-dd` calendar dates and that exact literal output pattern.
The JavaScript implementation retains broader production validation and formatting, but this probe
does not establish parity for those additional inputs. The Swift interpreter is not a generated
implementation of the full normative JSON Schema.

JSON requests are capped at 1 MiB, nesting and pointer traversal at 64 levels, decoded values at
10,000, individual strings at 65,536 UTF-16 units, and cumulative strings at 1,048,576 units. The
native host requires ASCII JSON keys and bounded ASCII interaction labels. Swift identifiers are
also ASCII: Swift's canonical Unicode key equality otherwise needs explicit treatment to preserve
distinct JSON identifiers. Text and input **values** retain Unicode, including the corpus emoji.
This restriction is narrower than the production TypeScript profile and is a production blocker,
not an assertion that non-ASCII JSON keys are invalid A2UI.

Malformed non-object envelopes, including embedded resource text `null`, yield `message-rejected`
without changing the mounted view, local edits or session. Both engines exercise these failures.

One host owns one `form` surface, at most 64 operations, and at most one emitted action per press.
Both experiment engines cap graph paths at 64 components, counting the root and Button text child.
Bridge responses allow 132 JSON container levels to accommodate nested view objects and children
arrays plus observation wrappers; server JSON retains its 64-level limit. Response byte, value and
string budgets remain unchanged. Boundary probes compare complete nested views, repeat rendering,
and reject excessive graph and response depth.
Native planning also caps expanded nodes at 1024, checks per component at 32,
cumulative policy/evaluation work at 10,000, and rendered strings at 1,048,576 UTF-16 units. Response
decoding and retained observation output are bounded by the host's 1 MiB boundary; exceeding it closes
the session. The shared planner also retains its production resource/expansion limits. These tighter
experiment bounds are not new package-level guarantees. Full hostile-input/schema differential
testing, all graph/binding edge cases, and resource/action policy parity remain prerequisites for a
production native renderer.

The UI uses native TextField, Toggle, Button and Text controls with accessible labels and scalable
fonts. XCTest exercises labels, checked state, enabled state, edits, delivery, close and reset. This
does not replace manual VoiceOver, large accessibility text, focus/RTL, hardware or assistive-device
testing. SwiftUI maps only the closed semantic view kinds supplied by the host.

See [the findings](RESULTS.md) for the tested environment, evidence and package recommendation.

## Reuse assessment before implementation

Reviewed `BBC6BAE9/a2ui-swift` at
[`4de8e7f84d716be922866113204fd769162dbcbf`](https://github.com/BBC6BAE9/a2ui-swift/tree/4de8e7f84d716be922866113204fd769162dbcbf).
Its [wire decoder](https://github.com/BBC6BAE9/a2ui-swift/blob/4de8e7f84d716be922866113204fd769162dbcbf/Sources/A2UISwiftCore/Schema/ServerToClient.swift)
accepts only `v0.9`/`v0.9.1` and encodes `v0.9`; its create-surface shape also predates the pinned
v1.0 initial components/model shape. Its README lists v1.0 tracking as future work. The manifest
targets iOS 17/macOS 14 and depends on swift-json-schema. The repository advertises MIT, while
the inspected wire/manifest files carry Apache-2.0 headers; reuse requires per-file attribution
review. No upstream code is copied or vendored here.

This revision cannot directly execute our exact pinned corpus. Adapting it would mix a protocol
port with the runtime experiment. The independent Swift probe below therefore implements only
the declared subset; this is not a claim that maintaining a separate full renderer is preferable.
Reassess upstream reuse before building a production Swift SDK.
