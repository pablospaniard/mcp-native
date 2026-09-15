# Milestone 11 implementation acceptance review

Initial review: 2026-09-14. Corrective validation completed: 2026-09-15. Scope: the bounded inline implementation in [PR #137](https://github.com/pablospaniard/mcp-native/pull/137),
including the acceptance fixes following implementation commit `ec6cc67`.

The original author acceptance review was rejected by the user after identifying three missed
lifecycle issues. Its earlier readiness conclusion is withdrawn. The implementation now addresses
slow delivery after timeout, replay-safe render accounting, and generation-gated provider cancellation.
The regression evidence and API correction are recorded below. This remains an author-maintained
implementation record, not independent certification or a substitute for maintainer review.
PR #137 was merged on 2026-09-15 after the corrections. The implementation is included in the
`1.1.0` release, [published on 2026-09-15](releasing.md#110-release-preparation).
Issue #91 remains the milestone tracking record. The historical evidence below describes the
implementation review, before the separate release version and dependency-range updates.

## Scope checked against issue #91

| Requirement                                         | Implementation and evidence                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Namespaced, versioned, bounded adapter interface    | Closed local schemas, exact descriptors, finite registry and per-call budgets in `packages/host/src/contracts.ts` and `contracts-schema.ts`; [host contract tests](../tests/host-contracts.test.mjs) reject invalid identities, schemas, non-JSON input, unknown fields, and aggregate expansion                                                                |
| Maintained standard inventory                       | Ordinary MCP, A2UI, and Apps factories expose pinned manifests and deterministic selection; [standard tests](../tests/contract-standards.test.mjs) verify all subsets, disabled advertisements, parser outcomes, and resource callback counts                                                                                                                   |
| Additional profiles install without host changes    | The [separate fixture package](../tests/fixtures/reviewed-standard-package/index.mjs) imports public APIs and is installed as its own tarball by [package smoke](../scripts/smoke-packages.mjs); [reviewed-profile tests](../tests/reviewed-standard.test.mjs) cover factory identity, exact binding, evidence bounds, native registration, and schema fixtures |
| Strict local rendering and action policy            | Compiled components receive owned models and host-created callbacks; [native tests](../tests/contract-native.test.mjs) cover unavailable/foreign registrations, explicit authorization, invalid events, shared review, timeouts, render failures, and pending-delivery bounds                                                                                   |
| Connection and result lifecycle                     | [Controller tests](../tests/contract-controller.test.mjs) cover discovery, cancellation before preparation, stale resources, fresh reconnect negotiation, bounded pending work, immediate state clearing, and reentrant shutdown; native tests cover replacement, unmount, remount, duplicate views, and Strict Mode                                            |
| Standard/custom isolation and deterministic failure | Reserved markers exclude custom routing even without negotiation; reviewed adapters cannot enter the custom binding; ambiguous claims fail before reads or preparation; selected failures never retry another adapter or become ordinary success                                                                                                                |
| Authoring and migration                             | [Authoring tests](../tests/contract-authoring.test.mjs) verify canonical digest bytes, assertion snapshots, invalid fixtures, bounded comparison, and crypto failures; [authoring guide](contract-authoring.md) documents coordinated digest migration                                                                                                          |
| Existing compatibility boundaries                   | Existing root/React Native exports and v1 controller declarations remain unchanged; reviewed public API baseline, exhaustive packed v1 consumer, React 18.1, and the 0.9.3 upgrade path pass; no package versions, dependencies, or protocol/schema pins change in this review                                                                                  |

The package fixture is synthetic. It demonstrates installation and enforcement of the closed
interface; it does not assert that any additional real upstream profile has passed conformance.
Host-supplied review evidence is an attestation, and local preparation/rendering/delivery callbacks
remain trusted code with cooperative work accounting.

## Initial findings and regression evidence (superseded render design)

1. **Stale render charges could affect a remount.** After hiding a native result view while retaining
   its current controller result, a saved `consume()` callback could still spend or exhaust that
   result's budget. Cleanup now revokes consumption as well as events. A new mount gets its own live
   lease; Strict Mode may reactivate the same lease without resetting the cumulative budget. The
   regression first failed with `contract-limit-exceeded` where `cancelled` was required, then passed
   with a fresh remount still able to consume its allowance.
2. **Caught invalid charges could leave the operation valid.** Zero, negative, non-integer, or
   non-finite preparation charges threw but did not prevent a callback from catching the error and
   returning a successful model. Invalid render charges similarly left events eligible. Preparation
   now records the failure through return validation; render failures exhaust that result's shared
   allowance. Regression tests first observed `contract-data` and delivered events after invalid
   charges, then passed with `adapter-failed` and `limit-exceeded`. A fresh result gets a fresh budget.

The preparation-charge fix still applies to both custom and reviewed adapters. The initial shared
render/event budget design above was incorrect under React replay and is superseded by the following
review fixes. Existing error codes and wire formats remain unchanged; the unreleased renderer API changes.

## User review and corrective changes

1. **Timeout released a live delivery gate.** The original timeout race cleared the lease gate while
   `onEvent` could still be running. A new regression reproduced a second delivered event instead of
   `busy`. The result now retains its single-flight gate until the underlying review/delivery settles,
   including across view remounts. Resolve and reject paths are tested, along with resumed delivery
   after settlement. Earlier slow-delivery capacity tests covered replacements but missed this retry.
2. **Rendering mutated lifetime state.** The unconditional renderer `consume()` charge made Strict
   Mode and discarded/replayed renders spend a shared budget. Renderers now call `createRenderBudget()`
   once per invocation and share that local budget across their traversal. Its charges do not change
   event state or another render's allowance. A Suspense regression exercises discarded attempts,
   Strict Mode replay, and state rerenders at the exact work limit. Local cumulative exhaustion,
   boundary containment, and saved-budget revocation remain tested. Renderers must not memoize the
   budget or allocate a new budget for every traversal element.
3. **Replay requested cancellation.** Provider cleanup called `cancelCurrentCall()` before checking
   its generation. A regression observed one cancellation during Strict Mode replay where zero was
   required. Cancellation now shares shutdown's generation guard; a real unmount still cancels and
   closes once. Existing pending-call unmount tests verify actual cancellation.

The renderer migration is explicit: replace the unreleased `consume` prop with
`createRenderBudget(): ContractRenderBudget`. `ContractPreparationContext.consume()` is unchanged.
The maintained example and packed typed consumer use the new API. The API baseline changes only the
host declarations for this opt-in renderer surface; published v1 exports and controller declarations
remain identical. Timeout is not an exactly-once I/O guarantee; the host cannot undo an effect or
force a non-cooperative handler to finish. No automatic retry occurs.

## Validation record

- `npm run clean`, `npm run check`, and `npm test`: format, lint, types, reviewed API baseline,
  pinned schemas, coverage, performance, conformance, and 612 passing tests.
- `npm run package:smoke`: seven library tarballs plus the independent profile fixture, public
  runtime/type consumers, React 18.1, and the 0.9.3 upgrade path.
- Todo example: type checking, 12 tests, and both iOS/Android bundles.
- The earlier native slice's Expo Go 57 / iOS 27 interaction and screenshot evidence remains in the
  [example](../examples/expo-go-todolist/README.md). This review changes no UI layout; lifecycle
  regressions run in the React renderer harness, and mobile bundles are rebuilt.
- All six CI jobs on implementation commit `ec6cc67` passed, including pinned iOS and Android host
  builds. Subsequent commit status is reported by the PR checks; this record does not predeclare it.

## Merged scope and remaining work

The merged bounded implementation supports custom and
separately packaged reviewed **inline JSON** adapters with exact own-extension/result-marker
bindings and compiled native rendering. Existing maintained A2UI and Apps implementations retain
their separate rendering and resource authority.

Broader standard wire grammars, non-vendor MIME identities, linked custom resources, streaming or
editable models, a combined standard/custom result view, and transferable surface handles remain
outside this interface. Supporting them requires separate design and acceptance evidence. The
recorded PR merge does not establish milestone/issue closure, package publication, or additional
upstream compatibility.
