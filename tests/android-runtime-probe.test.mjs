import assert from "node:assert/strict";
import test from "node:test";
import { verifyAndroidReport } from "../experiments/android-runtime-probe/run.mjs";
import { loadRendererConformanceSuite } from "./helpers/renderer-conformance.mjs";

test("the Android comparator rejects stale, incomplete, mismatched and failed probe reports", () => {
  const suite = loadRendererConformanceSuite();
  const identity = { runId: "this-invocation", bundleSha256: "this-bundle" };
  const report = {
    ...identity,
    cases: Object.fromEntries(
      suite.cases.map(({ id, steps }) => [id, steps.map(({ expect }) => expect)]),
    ),
    checks: {
      malformedEnvelopesPreserveSession: true,
      inertUnicodeRoundTrip: true,
      unknownMimeRejected: true,
      closedAndStaleTickets: true,
      strictJsonAndDepthLimits: true,
      nestedLayoutBoundary: true,
      runningIsolateTermination: true,
      freshSessionAfterTermination: true,
      bridgeFailureClosesSession: true,
      singleInFlightAndPendingClose: true,
    },
    features: Object.fromEntries(
      [
        "MESSAGE_PORTS",
        "PROMISE_RETURN",
        "ISOLATE_TERMINATION",
        "ISOLATE_MAX_HEAP_SIZE",
        "EVALUATE_WITHOUT_TRANSACTION_LIMIT",
      ].map((name) => [`JS_FEATURE_${name}`, true]),
    ),
    probe: { number: "1.234,5", plural: "other", date: "09/12/2026" },
  };
  assert.doesNotThrow(() => verifyAndroidReport(report, identity));
  for (const mutate of [
    (value) => {
      value.runId = "previous-invocation";
    },
    (value) => {
      value.bundleSha256 = "different-bundle";
    },
    (value) => {
      delete value.cases[suite.cases[0].id];
    },
    (value) => {
      value.cases[suite.cases[0].id][0].outcome = "surface-rejected";
    },
    (value) => {
      value.checks.runningIsolateTermination = false;
    },
    (value) => {
      value.features.JS_FEATURE_MESSAGE_PORTS = false;
    },
    (value) => {
      value.probe.number = "1,234.5";
    },
  ]) {
    const invalid = structuredClone(report);
    mutate(invalid);
    assert.throws(() => verifyAndroidReport(invalid, identity), assert.AssertionError);
  }
});
