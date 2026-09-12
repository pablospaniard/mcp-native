# Shared renderer conformance corpus, format 1

This repository-owned JSON corpus supplies executable expectations for the small native-renderer
experiments in [RFC-0002](../../../docs/RFC-0002-native-platforms.md). A Swift, Kotlin, or embedded
JavaScript runner can read the same data without executing a TypeScript fixture factory.

`basic-form.json` is the corpus; `suite.schema.json` is its closed JSON Schema 2020-12 format.
The data format is provisional test infrastructure, not a new MCP/A2UI wire protocol, public package,
native bridge API, or declaration of full renderer conformance. Existing published catalog fixtures
under `@mcp-native/renderer-core/testing` and their React Native re-exports remain unchanged.

## Exact baseline and provenance

- Wire version: A2UI `v1.0`, Candidate commit `8ff4651232ab0e02b0123730b502711170637a3a`.
- Normative envelopes: [pinned agent-to-renderer schema](../../../packages/a2ui/src/v1/vendor/agent_to_renderer.json).
- Normative component/function shapes: [pinned basic catalog](../../../packages/a2ui/src/v1/vendor/catalog.json).
- Normative action shape: [pinned renderer-to-agent schema](../../../packages/a2ui/src/v1/vendor/renderer_to_agent.json).
- Project interpretations and limits: [conformance profile](../../../docs/a2ui-v1-conformance.md)
  and [architecture](../../../docs/RFC-0001-architecture.md).

These are newly authored project fixtures with manually specified expectations, not upstream
certification vectors or snapshots generated from current runtime output. Their `basis` identifies
the principal source of each case: `pinned-schema`, `project-semantics`, or `host-composition`.
Every case still uses the same project-owned observation format. If a runtime and an expectation
disagree, inspect the pinned schema and documented interpretation before changing either one.

No schema pin, negotiated component, function, action, or package compatibility promise is expanded.
The loader also compares the corpus pin to the implementation's exported `MCP_SCHEMA_REVISION`.

## Execution contract

Validate the whole document against `suite.schema.json` before execution. Reject unknown format
versions, pins, fields, operations, duplicate case IDs, and incomplete expectations. The reference
loader limits the UTF-8 file to 256 KiB; the schema bounds cases and sequential steps to 64 each.
Wire payloads and deliberately malformed input values remain ordinary JSON and must reach the
production validation boundary; the fixture schema does not pre-validate them as valid A2UI.
There are no imports, expressions, generators, template substitutions, or executable fixture hooks.

Start each case with a fresh surface store, renderer session, and empty callback logs. Install only
the host's declared component/event/function allowlists and its fixed `authorizeActions` decision.
The profile covers vertical groups (`Column` and `List`), `Text`, `TextField`, `CheckBox`, `Button`,
the `required` and `formatDate` functions, and the `submit` event. A case may narrow those allowlists. Set the clock to
the suite's exact timestamp for action creation. Do not give expected observations to the runner.

Execute every step in order and settle rendering, local callbacks, and action delivery before
recording a detached observation. No steps or failed cases may be silently skipped.

| Operation       | Meaning                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `message`       | Pass the literal envelope to the real surface store, then render the current surface.                                               |
| `render`        | Render another snapshot of the same store state; this must not invent a server revision or reset local edits.                       |
| `input`         | Invoke the actual installed control's change callback with the supplied JSON value.                                                 |
| `press`         | Invoke the actual Button callback, including for a disabled button, and settle the production action-delivery helper.               |
| `resolve-event` | Probe the production stateless resolver with the current server snapshot/model and the named source ID; do not dispatch its result. |

An interaction target is a semantic control kind and exact accessible label. It must match exactly
one mounted control. Missing/ambiguous targets and missing callbacks are harness failures, not
successful negative cases. A native runner must invoke the corresponding real event path rather
than implementing data binding or action serialization in its test adapter.

The host composition used here keeps the previous mounted surface after a rejected store operation.
After an accepted envelope, a missing surface unmounts its content. A production render rejection,
including one triggered by a local input, also unmounts the content through the surface boundary.
Each `render` or accepted `message` retries a failed mount against the current server snapshot;
unmounted local edits are lost. Healthy mounts preserve edits until a server model revision.
The underlying store may retain semantically invalid data until a correcting update. These are
explicit host-composition choices; an A2UI parser alone does not own view lifecycle. React's
reference adapter uses `SurfaceBoundary` and observes original render errors through
the test root's `onCaughtError` hook. It does not preflight a separate server-only render plan.

## Observations and comparisons

Every step has a complete `expect` object. Compare JSON objects by their keys and values, ignoring
key order; compare arrays in order. Compare strings exactly without Unicode normalization, coercion,
or whitespace changes. Missing fields and `null` have distinct meanings. Fixed wire/runtime budgets
retain their documented units, including UTF-16 code units where specified; the corpus file-size
limit itself uses UTF-8 bytes.

| Field             | Meaning                                                                                                                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `outcome`         | `accepted`, `message-rejected`, `surface-rejected`, `input-rejected`, or `event-rejected`, according to the failing boundary below.                                                                              |
| `serverDataModel` | The store's current server model, or `null` when no surface exists. It deliberately excludes uncommitted local edits.                                                                                            |
| `view`            | Ordered visible semantic trees: vertical `group`, `text`, `text-field`, `checkbox`, or `button`. Input values, labels, validation messages, invalid state, and disabled state come from actual mounted controls. |
| `localChanges`    | Cumulative, owned data-model callback values in order. An empty array proves no local-change callback occurred.                                                                                                  |
| `actions`         | Cumulative actions emitted by the renderer, before host authorization. Each record contains the exact wire `envelope`, and `dataModel` only when supplied as the separate callback argument.                     |
| `deliveries`      | Cumulative records received by the host-owned delivery callback after production validation and authorization. No network transport is exercised.                                                                |
| `deliveryResults` | Cumulative `delivered`/`denied` results from the production action-delivery helper.                                                                                                                              |

`message-rejected` means the production store rejected the envelope before rendering.
`surface-rejected` means the mounted renderer rejected the surface using its effective data model,
including retained local edits. It can follow `message`, `render`, or an accepted input callback;
that callback's local-change log remains recorded even if its resulting render fails.
`input-rejected` means the production input callback rejected the value without mutation.
`event-rejected` means the stateless production resolver rejected the requested event source.
The reference adapter catches only the relevant production exception types around those calls;
assertion failures, missing controls, and render errors other than `ParseError` fail the test.
Uncaught and recoverable root errors also fail the test.
Exact JavaScript exception messages/classes are not a portable requirement.

The semantic projection omits native view classes, React keys, raw styles, and callback objects.
Groups are vertical and preserve child order. Button child labels are represented by the button's
accessible label. Text must retain text semantics/font scaling, checkboxes checked semantics,
and buttons disabled semantics. The React Native adapter additionally asserts these mapped props;
future native runners must supply equivalent semantics through their platform implementation.
This does not prove VoiceOver/TalkBack behavior on a device.

## Cases and evidence limits

The 20 cases cover:

- Local string/boolean edits, non-ASCII text, current-state action context, and surface deletion.
- Equivalent rerenders, component-only updates, changed server values, and same-value server
  revisions. Explicit server model revisions reset local edits; equivalent renders do not.
- A component update that formats a retained invalid date edit, input-triggered render rejection,
  and recovery by rerender or server update. This is a narrow `formatDate` regression, not full
  date-formatting conformance coverage.
- Allowed/denied delivery, full-model inclusion/omission, and disabled-button checks/recovery.
- Rejected callback types, unknown wire versions/components/functions/props, malformed updates,
  narrowed component/event policies, and invalid bound-model recovery.
- Dynamic-list ordering and a 1025-node expansion from just three definitions and 512 rows,
  rejected against the fixed 1024-node render limit. A small accepted list is the control case.
- A reachable source accepted by the stateless event resolver, then rejected after a graph update
  makes that same source unreachable. This does not claim to test retained React callbacks,
  asynchronous native queues, events after session teardown, or generation-token enforcement.

The existing React Native implementation and two [experimental iOS paths](../../../experiments/ios-runtime-comparison/README.md)
run this corpus. The experiment compares JavaScriptCore and independent Swift form semantics with
the same SwiftUI controls; its additional limits and simulator evidence are documented separately.
Passing the corpus does not establish supported SwiftUI/Compose SDKs, the full 18-component profile, every resource/formatting limit,
MCP transport interoperability, device accessibility, cancellation, process-death recovery, or
performance. The existing broader tests remain authoritative for their respective coverage.
Those missing dimensions need separate experiments before RFC-0002's runtime decision.

## Run and extend

From the repository root:

```bash
npm run test:renderer-conformance
```

The same tests run automatically in `npm test` and `npm run check`. The reference adapter is
[`tests/helpers/renderer-conformance.mjs`](../../helpers/renderer-conformance.mjs); the assertions
are in [`tests/renderer-conformance.test.mjs`](../../renderer-conformance.test.mjs).

Add a literal case and hand-reviewed expectations, including rejection and recovery when relevant.
Do not add an automatic snapshot-update command. Introduce new operations or observation semantics
through an explicit fixture-format review and update every consuming runner. Keep cases bounded;
future large workloads should use additional bounded corpus documents rather than executable
fixture generators. Before asserting cross-platform conformance, run the same corpus on each
implementation and report unsupported cases explicitly.
