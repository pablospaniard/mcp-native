# RFC-0003: Shared native session contract

- Status: Proposed; behavioral design for review, not an implemented or frozen API
- Date: 2026-09-12
- Baseline: integration commit `7535b4b917c33b35f6d0bacdb0012dd732a35105` (PR #133)
- Tracking: [milestone 12 / #92](https://github.com/pablospaniard/mcp-native/issues/92)
- Depends on: [architecture](RFC-0001-architecture.md), [runtime/package assessment](RFC-0002-native-platforms.md)

## Decision proposed

Give platform renderers one semantic session boundary that owns server state, effective local state,
planning and action resolution. Keep transport, authorization, native controls, navigation and device
lifecycle in the application host. Implement and test this boundary as an internal module first.
The initial implementation candidate reuses the existing JavaScript semantics; this RFC does not
select the production engine, publish renderer-core, add a package, or complete milestone 12.

The central design choice is a serial semantic state machine with immutable, bounded results.
Native callbacks identify the exact rendered instance that installed them. An action result is a
proposal requiring native authorization, not permission to dispatch. Logical cancellation makes a
session unusable immediately even where physical engine interruption is not yet demonstrated.

All requirements below are **proposed project policy** for new native sessions. They do not add
requirements to MCP/A2UI or retroactively change published React Native behavior. Terms and operation
names describe responsibilities, not new exports or a bridge wire schema. A follow-up implementation
PR must provide the closed request/result schemas and executable race tests before claiming this
contract. New identifiers follow the [version-neutral naming rule](../CONTRIBUTING.md#naming).

## Exact profile and source of truth

The wire version remains A2UI `v1.0` Candidate
`8ff4651232ab0e02b0123730b502711170637a3a`. Preserve the vendored
[agent-to-renderer](../packages/a2ui/src/v1/vendor/agent_to_renderer.json),
[renderer-to-agent](../packages/a2ui/src/v1/vendor/renderer_to_agent.json) and
[catalog](../packages/a2ui/src/v1/vendor/catalog.json) schemas and the existing
[feature-scoped interpretations](a2ui-v1-conformance.md). Unknown versions, MIME types, components,
functions, actions and fields continue to reject at their applicable boundary. Generic API names
never mean automatic negotiation of a newer profile.

The first internal implementation targets the existing basic-form corpus: `Column`, `List`, `Text`,
`TextField`, `CheckBox`, `Button`, `required`, the covered `formatDate` behavior and `submit`.
Each host can narrow the allowlist. This is not full catalog/function support. Exact field/format
restrictions must remain in the selected adapter's profile; the Swift experiment's narrower schema
coverage does not redefine the production TypeScript validator. For comparison, retain the common
ASCII identifier/key restriction and Unicode string values until exact cross-language key identity
has separate tests. The Android/JavaScript implementations may support more than this intersection.

The [21-case corpus](../tests/fixtures/renderer-conformance/README.md) specifies existing observable
semantics, with each case labeled by its schema, project-semantics or host-composition basis.
If an expectation conflicts with a pinned normative rule, resolve and document that conflict rather
than treating the TypeScript implementation as the specification. The async rules introduced here
need additional project-owned scenarios; passing the current corpus alone is insufficient.

## Ownership

| Owner                 | Responsibilities                                                                                                                                                  | Data it cannot authorize                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Semantic session      | Strict input validation, ordered store updates, local binding writes, effective-model validation, planning, reachable-instance resolution and action construction | Transport calls, native capabilities, route/class selection or executable code                     |
| Native host           | Trusted profile and limits, session identity, admission, result validation, cancellation, action consent/delivery, bounded pending work and lifecycle             | Unknown server syntax, an undeclared component, or permissive defaults for missing semantic policy |
| Platform view adapter | Render a validated plan using a closed host registry; bind native callbacks to current instance tickets; own focus/accessibility/layout integration               | Raw server props, arbitrary components, or action payloads fabricated from native labels           |
| MCP adapter           | Existing negotiated input classification and transport boundary; feed owned envelopes to the session                                                              | Reinterpret a session proposal as transport authorization                                          |

The native host validates engine responses before mounting or delivering them, even when it shipped
the engine code. The session and host hold detached data; a caller cannot mutate a policy, queued
request, plan or action after validation. Native objects, functions and component references never
cross the semantic boundary. Bundled code is fixed at build time; server values are always data.

Keep A2UI semantics outside `@mcp-native/core`. The first reusable session implementation should
replace the experiment's duplicate reconciliation/binding glue using existing internal modules;
keep its entry point private until reviewed. Preserve current published exports and class/function
identities. Renderer-core remains `private: true`, and public dependencies on it keep release
preflight blocked until a separate packaging decision is implemented.

## Identity and admission

Use distinct identities; none are supplied or chosen by the server:

| Identity              | Lifetime and purpose                                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session generation    | Fresh opaque host token on open; invalidated on close/failure. Prevents results from an old engine reaching a replacement.                         |
| Surface incarnation   | Fresh host identity for each successful creation, including reuse of the same wire `surfaceId` after deletion.                                     |
| Request sequence      | Strictly increasing within a generation, echoed by exactly one result. Never wraps or resets within that generation.                               |
| Render revision       | Increases on every successful plan publication or unmount; binds controls and pending proposals to a particular displayed snapshot.                |
| Server model revision | Changes only on accepted model-changing lifecycle operations, including an equal-value `updateDataModel`; never synthesized by an ordinary render. |

A session initially owns at most one surface. Supporting more requires explicit per-surface and
aggregate budgets and isolation tests. This internal limit does not narrow existing public APIs.

Admit at most one semantic operation at a time. Reject a concurrent request as `busy` before
allocating an engine job or reserving a sequence. Do not build an implicit unbounded retry queue.
The host may retain at most one pending action separately, from authorization through delivery
settlement or acknowledged cancellation. Invalidating its identities does not free this slot while
native consent or transport work is still outstanding; the bound survives generation replacement.
It can process server updates while authorization is pending; any new render revision invalidates that proposal.
A second press while the action slot is occupied rejects as `busy`, without resolving or retaining another
action. Closing bypasses the semantic-operation slot. A busy edit is not acknowledged as committed:
the view adapter must reconcile to the last acknowledged value or explicitly retain a bounded,
uncommitted edit under a separately tested admission policy. The MCP adapter applies backpressure
using its bounded transport buffering; it must not drop or reorder envelopes. Automatic press retries
and unbounded input coalescing are excluded.

Pre-admission failures consume no sequence. Every admitted operation, including a recoverable
semantic rejection, consumes exactly one sequence. A missing, duplicate, out-of-order or wrong-identity
engine response is a fatal boundary failure. A completion belonging to an already closed generation
is discarded and cannot fail or mutate the replacement generation. Sequence/revision exhaustion
closes the session before integer precision or wraparound can make an old identity current again.

## State transitions

Store three separate pieces of semantic state: the accepted server snapshot, the effective model
used for rendering, and the last mounted plan. A surface is absent, mounted or rejected. Session
closure is terminal for that generation; recovery creates a fresh generation.

| Operation          | Required transition                                                                                                              | Failure behavior                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Open               | Install an owned host policy, supported profile and finite limits; start with no surface and no callbacks                        | Unsupported engine/profile or malformed initialization creates no usable session                                                  |
| Apply one envelope | Validate and atomically update the server store, then attempt rendering from the effective state                                 | Rejected envelope leaves server state, local edits and mounted plan unchanged                                                     |
| Render             | Recompute using retained effective state; never invent a server revision                                                         | Render rejection unmounts content and clears effective local state; preserve the accepted server snapshot                         |
| Input              | Validate the current instance ticket, control value type and writable binding; commit a local edit and render                    | Invalid callback/value leaves semantic state unchanged; a valid edit followed by render rejection unmounts and clears local state |
| Press              | Resolve the current reachable instance against the effective model and fixed catalog policy; produce at most one action proposal | Invalid/stale source rejects; disabled control produces no action; denied host policy never dispatches                            |
| Close              | Invalidate admission and publication identities, detach controls, revoke pending authorization and release owned resources       | Idempotent; never reopen or silently resume the generation                                                                        |

Accepted `updateDataModel` resets local edits even if the value compares equal. Accepted
`updateComponents` and ordinary rendering preserve edits while a healthy surface stays mounted.
Deletion removes the snapshot, effective model and plan and invalidates the surface incarnation.
A rejected render is not a rolled-back server update: a later render retries the current server
snapshot with fresh local state. Treat input acceptance and render success as separate facts so
an input-triggered render failure cannot be mistaken for an ignored edit.

Example: editing `Ada` to `Grace` followed by `render` still displays `Grace`. An accepted server
update setting the original `Ada` value creates a new model revision and displays `Ada`. A malformed
server update instead keeps `Grace`. If a component update makes the retained edit invalid for
formatting, the server component update remains accepted, the surface unmounts, and the next render
starts from the server model. These are already represented in the corpus.

Server pointer updates follow the existing store's documented project semantics: canonical numeric
array indices can append at length and create an appended object parent; gaps and noncanonical
indices reject without mutation, and null removes an existing member. This is not JSON Patch's
`-` append operation. Local inputs are narrower: they write only the validated binding installed for
a current control and cannot invent a missing path, append a list item or select an arbitrary pointer.

The initial boundary accepts one envelope per operation. Streaming/batch parsing stays in the MCP
adapter under its existing limits. This proposal introduces no all-or-nothing batch transaction and
no mechanism to replay an uncertain operation automatically.

## View callbacks and action delivery

Use an opaque native callback ticket containing generation, surface incarnation, render revision
and the semantic instance identity. Labels are presentation, not lookup keys. A repeated list template
must include its scoped instance identity; a source component ID alone cannot distinguish rows.
The native adapter removes callbacks when it replaces/unmounts a plan. Both host admission and
semantic resolution verify a callback against the current snapshot before writing or proposing an
action. A retained callback from an old list order must reject instead of targeting the replacement row.

A render revision advances on each published plan, including an equivalent render. Native controls
receive updated tickets without losing local model state. This intentionally conservative stale-event
rule is a new native-session proposal, not a claim about all existing React Native callbacks.
Rejected input/envelopes and presses that do not publish a plan leave the render revision unchanged.

```mermaid
sequenceDiagram
    participant View as Native control
    participant Host as Native host
    participant Session as Semantic session
    participant App as Application policy and transport
    View->>Host: Press with current instance ticket
    Host->>Session: One admitted request
    Session-->>Host: Owned action proposal for current effective model
    Host->>Host: Validate response, identity and action contract
    Host->>App: Authorize this exact proposal
    App-->>Host: Allow or deny
    Host->>Host: Recheck generation, incarnation and render revision
    alt Allowed and still current
        Host->>App: Claim once and dispatch the validated envelope
    else Denied, stale or closed
        Host->>Host: Discard proposal without dispatch
    end
```

Freeze the action context, optional model and host-clock timestamp when constructing the proposal.
Preserve the exact pinned envelope fields and omit the model when `sendDataModel` does not permit it.
The host independently validates the shape, declared action/source and any narrowed authorization
policy. It cannot substitute permissive defaults for unavailable synchronous JavaScript callbacks.
Policy is immutable for a generation; replacing it requires a new session, even if only widened.
A failed or throwing authorization callback denies that proposal; a malformed engine response closes
the generation. Engine schema failures are not recoverable server-input rejections.

After async authorization, recheck all captured identities and atomically claim the proposal on the
host's lifecycle executor immediately before delivery. A result cannot be claimed twice. Rejecting a
stale authorization does not reevaluate the action against newer user data or trigger a new consent
request automatically. These checks bind consent to the exact state the user activated.

The claim/dispatch handoff is the cancellation boundary. Closing before that handoff prevents
delivery. After handoff, request cancellation from the transport where supported, but never claim
that a remote side effect was undone. Report a failed/unknown delivery honestly and do not retry it
automatically. Session identity provides at-most-once local dispatch, not exactly-once remote effects.
Returned tool results enter the existing input-classification path and require a current generation;
a late result cannot directly restore or mutate a closed session.

## Failure, cancellation and resource ownership

Recoverable semantic outcomes are the corpus's `message-rejected`, `input-rejected`,
`event-rejected` and `surface-rejected`; their state effects follow the transition table. Host
admission additionally distinguishes `busy`, `stale` and `closed`. Exact cross-language diagnostic
codes still need a reviewed closed schema. Error text is bounded host-authored diagnostics, never
server-controlled executable content or an unbounded echo of the rejected payload.

Malformed/oversized engine results, impossible state transitions, duplicate replies, timeouts and
engine termination fail the generation closed. Invalidate it **before** waiting for physical engine
cleanup; discard late results and authorization completions. The host lifecycle executor must remain
able to invalidate admission while semantic evaluation runs on a worker. Serializing `close` behind
an uninterruptible evaluation would not satisfy this logical cancellation guarantee.

Physical interruption and reclamation are separate capabilities. Android has evidence that closing
an isolate rejects a running evaluation and that a fresh isolate works afterward. That does not
measure memory reclamation. The Apple experiment only demonstrates admission cancellation; moving
work off the main actor does not prove bounded interruption or reclamation of JavaScriptCore work.
No iOS preview can claim this lifecycle contract until that gap has an explicit supported policy.

Bound outstanding cleanup work as well as live sessions. Do not repeatedly create replacement VMs
while a timed-out worker remains alive; the initial host allows at most one retired worker pending
cleanup and refuses replacement while it is outstanding. The engine implementation PR must define
and test the cleanup acknowledgment, elapsed-time policy and behavior when acknowledgment never
arrives. Do not rely on garbage collection timing as a teardown acknowledgment.

## Work and output limits

Every implementation has finite per-value, per-operation, per-session and host-wide limits supplied
by trusted configuration. Unknown or inconsistent settings fail initialization. The current
experiment values are an evidence baseline, not accepted production budgets:

| Dimension        | Experiment baseline                                                                                                | Required follow-up                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Incoming JSON    | 1 MiB UTF-8; 64 container levels; 10,000 values; 65,536 UTF-16 units per string; 1,048,576 cumulative string units | Preserve strict lexical validation and detached ownership; verify the same counting rules across engines                   |
| Expanded plan    | 1,024 nodes; component-path depth 64, including a Button's folded text child                                       | Count cumulative expansion and retained bytes; derive platform constants from one trusted definition                       |
| Engine result    | 1 MiB; response depth `2 * maxComponentDepth + 4` for the current observation format                               | Version the internal result shape deliberately; recalculate depth for the real plan schema rather than copying 132 blindly |
| Lifetime         | One form, 64 experiment steps                                                                                      | Define finite preview lifetime/work budgets and explicit exhaustion behavior; never silently reopen state                  |
| Pending work     | Proposed: one semantic request, one pending action, no implicit request queue                                      | Add saturation, close-race and transport-handoff tests                                                                     |
| Engine resources | Android requests a 64 MiB isolate heap; test waits use ten-second deadlines                                        | Device/engine-specific limits and supported cleanup behavior remain undecided; no latency scores                           |

Use the existing semantic budgets for dynamic lists, interpolation, formatting, validation messages
and action resolution. Native wrappers add transport/retention bounds without relaxing those limits.
Count UTF-8 bytes separately from UTF-16 units and enforce cumulative limits before allocating or
retaining expanded output. Invalid engine output fails closed; no partial plan or action reaches
native consumers.

A production result contains a plan publication, explicit unmount or unchanged marker, revision
identities, bounded diagnostics and only that operation's local-change/action delta. It must not
resend or retain the experiment's full `localChanges`, `actions` and delivery-history arrays on every step. The host owns
bounded delivery state and optional bounded logging. The conformance runner can accumulate deltas
externally to compare existing snapshots; neither engine receives expected observations. No full
server/local model is exposed to application logging by default.

## Evidence and implementation gates

At the baseline commit, React Native, JavaScriptCore, independent Swift and Android's shared
JavaScript path pass all 21 corpus cases. The native runs used iPhone 17 Pro/iOS 26.5 and Android
37/arm64 with WebView provider `151.0.7922.202`; deployment targets are not tested support minima.
The Android bundle is 335,625 bytes, SHA-256
`2f299bea87d6c7d59068b07891963fdbfc2914115c2ab90db6ef2dd53e252ff1`.
See the immutable [Apple findings](https://github.com/pablospaniard/mcp-native/blob/7535b4b917c33b35f6d0bacdb0012dd732a35105/experiments/ios-runtime-comparison/RESULTS.md)
and [Android findings](https://github.com/pablospaniard/mcp-native/blob/7535b4b917c33b35f6d0bacdb0012dd732a35105/experiments/android-runtime-probe/RESULTS.md).
Physical-device performance remains deferred and unscored.

| Contract area                       | Existing evidence                                                                                                                 | Required before an implementation claims this contract                                                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reconciliation and rejected renders | `same-value-server-update`, `component-update-preserves-edits`, `local-edit-render-rejection-recovery`, malformed-envelope probes | Execute unchanged expectations against the extracted session and mounted React Native adapter                                                                 |
| Array updates and expanded lists    | `array-pointer-updates`, `dynamic-list-order`, `expanded-node-limit`; depth probes                                                | Keep rejection atomicity and add scoped callbacks across list reorder/delete/recreate                                                                         |
| Host authorization                  | Allow/deny and model-omission cases; generation and close probes                                                                  | Pause authorization, update/delete/close the surface, then resolve allow: zero dispatch; duplicate completion: at most one dispatch                           |
| Response integrity                  | Android strict JSON, malformed response and pending-close probes                                                                  | Both adapters reject wrong sequence/generation, duplicate replies and malformed observation/action shapes; old completions cannot affect replacement sessions |
| Cancellation                        | Android running-loop termination; Apple admission cancellation                                                                    | Close during evaluation without blocking UI/admission; late result discarded; bounded retirement and unavailable-replacement behavior on both platforms       |
| Result retention                    | Current bounded experiment logs                                                                                                   | Long sequence of valid operations emits deltas; retained host/session output stays within configured bounds and resets on close                               |
| Native controls                     | Two SwiftUI UI flows; Android engine only                                                                                         | Adapter input/focus/accessibility/lifecycle acceptance tests; Compose controls remain unimplemented                                                           |

These are required test scenarios, not additional passing fixtures. Implement them with deterministic
barriers around evaluation, authorization and dispatch rather than timing-dependent sleeps. No new
CI workflow, package or production behavior is introduced by this document.

## Delivery sequence and open decisions

1. Review this behavioral proposal and the conservative render-ticket invalidation rule. Milestone
   12 stays open; review acceptance alone does not freeze exports or establish multi-renderer support.
2. Implement an internal session using existing JavaScript validation, store and planner code.
   Replace experiment reconciliation glue and add a React Native adapter path exercised by the same
   corpus. Preserve existing published behavior and imports; demonstrate parity before adoption.
3. Add the async host scenarios above and implement independent native admission/result validation.
   Resolve Apple interruption/retirement policy and the Android provider support/failure policy.
4. Submit the RFC-0002 runtime/package decision with these results. Keep renderer-core private until
   its packaging disposition is implemented; maintain one primary integration surface per platform.
5. Build the scoped SwiftUI preview, then the equivalent Compose preview, with explicit tested
   platform matrices. Agree physical-device budgets before scoring performance or claiming a winner.

Still open: the internal request/result schema and diagnostic vocabulary, engine-specific cleanup
acknowledgment, supported provider/OS ranges, production resource budgets, app background/foreground
policy and transport-specific cancellation outcomes. Unsupported environments must fail explicitly;
no silent WebView or alternate-engine fallback is approved.

The existing experiment sunset remains mandatory before integration reaches `main`, even if the
runtime decision is deferred. Preserve durable findings and the shared corpus; remove temporary
runners, generated-code tooling, scripts, tests, dependencies and the iOS experiment workflow, and
repair their links. This document is durable design context, not a reason to retain those pipelines.
