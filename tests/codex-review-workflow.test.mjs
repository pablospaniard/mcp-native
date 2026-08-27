import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parse } from "yaml";

import {
  APPROVAL_LABEL,
  STATUS_CONTEXT,
  decideCodexReviewAuthorization,
} from "../scripts/codex-review-authorize.mjs";

const workflow = parse(readFileSync(".github/workflows/codex-review.yml", "utf8"));
const gateJob = workflow.jobs["codex-review-gate"];
const checkoutStep = gateJob.steps.find(
  ({ name }) => name === "Check out trusted authorization helper",
);
const authorizeStep = gateJob.steps.find(
  ({ name }) => name === "Require maintainer approval for external contributions",
);
const runGateStep = gateJob.steps.find(({ name }) => name === "Run Codex connector review gate");
const authorizeScript = authorizeStep.with.script;
const workflowSource = readFileSync(".github/workflows/codex-review.yml", "utf8");

test("reviews run only from the trusted pull_request_target workflow", () => {
  assert.equal(workflow.on.pull_request, undefined);
  assert.ok(workflow.on.pull_request_target);
  assert.deepEqual(workflow.on.pull_request_target.types, [
    "opened",
    "reopened",
    "synchronize",
    "ready_for_review",
    "labeled",
    "unlabeled",
  ]);
  assert.ok(workflow.on.issue_comment);
  assert.ok(workflow.on.pull_request_review);
  assert.ok(workflow.on.pull_request_review_comment);
  assert.match(gateJob.if, /github\.event\.pull_request\.draft == false/);
  assert.match(gateJob.if, /codex-review-approved/);
  assert.match(gateJob.if, /chatgpt-codex-connector/);
  assert.match(gateJob.if, /unlabeled/);
  assert.doesNotMatch(workflowSource, /dependabot\[bot\]/);
  assert.doesNotMatch(workflowSource, /openai\/codex-action/);
  assert.doesNotMatch(workflowSource, /OPENAI_API_KEY/);
});

test("the gate coordinates ChatGPT Codex Connector output without API tokens", () => {
  assert.equal(gateJob.name, "codex-review");
  assert.equal(
    runGateStep.uses,
    "JoeyTeng/codex-review-gate-action@9e9f2377342805156afcb0724f501509ef4e444c",
  );
  assert.equal(runGateStep.with["status-context"], "codex-review");
  assert.equal(runGateStep.with["event-mode"], "full");
  assert.match(runGateStep.with["codex-bot-logins"], /chatgpt-codex-connector/);
  assert.match(runGateStep.if, /skip-gate != 'true'/);
  assert.equal(checkoutStep.with.ref, "${{ github.event.pull_request.base.sha || github.sha }}");
  assert.match(authorizeScript, /decideCodexReviewAuthorization/);
  assert.match(authorizeScript, /codex-review-authorize\.mjs/);
});

test("draft pull requests skip the connector gate", () => {
  const decision = decideCodexReviewAuthorization({
    draft: true,
    authorAssociation: "NONE",
    labelNames: [],
    eventAction: "opened",
  });
  assert.equal(decision.kind, "skip-draft");
  assert.equal(decision.skipGate, true);
  assert.equal(decision.fail, false);
  assert.equal(decision.status, undefined);
});

test("trusted authors are allowed without the approval label", () => {
  for (const authorAssociation of ["OWNER", "MEMBER", "COLLABORATOR"]) {
    const decision = decideCodexReviewAuthorization({
      draft: false,
      authorAssociation,
      labelNames: [],
      eventAction: "opened",
    });
    assert.equal(decision.kind, "allow");
    assert.equal(decision.skipGate, false);
    assert.equal(decision.fail, false);
  }
});

test("unapproved external contributions are denied with a failing required status", () => {
  const decision = decideCodexReviewAuthorization({
    draft: false,
    authorAssociation: "NONE",
    labelNames: [],
    eventAction: "opened",
  });
  assert.equal(decision.kind, "deny");
  assert.equal(decision.skipGate, true);
  assert.equal(decision.fail, true);
  assert.equal(decision.removeApprovalLabel, undefined);
  assert.deepEqual(decision.status, {
    state: "failure",
    description: "Maintainer must add codex-review-approved",
  });
  assert.match(decision.message, /codex-review-approved/);
});

test("Dependabot heads use the same denial path so the required status is written", () => {
  const decision = decideCodexReviewAuthorization({
    draft: false,
    authorAssociation: "NONE",
    labelNames: [],
    eventAction: "opened",
  });
  assert.equal(decision.kind, "deny");
  assert.equal(decision.status?.state, "failure");
  assert.equal(decision.skipGate, true);
});

test("approved external contributions may run the connector gate", () => {
  const decision = decideCodexReviewAuthorization({
    draft: false,
    authorAssociation: "CONTRIBUTOR",
    labelNames: [APPROVAL_LABEL],
    eventAction: "labeled",
  });
  assert.equal(decision.kind, "allow");
  assert.equal(decision.skipGate, false);
  assert.equal(decision.fail, false);
});

test("synchronize invalidates external approval and fails closed without running the gate", () => {
  const decision = decideCodexReviewAuthorization({
    draft: false,
    authorAssociation: "CONTRIBUTOR",
    labelNames: [APPROVAL_LABEL],
    eventAction: "synchronize",
  });
  assert.equal(decision.kind, "invalidate-push");
  assert.equal(decision.skipGate, true);
  assert.equal(decision.fail, true);
  assert.equal(decision.removeApprovalLabel, true);
  assert.deepEqual(decision.status, {
    state: "failure",
    description: "External approval invalidated by new push",
  });
});

test("removing the approval label revokes a prior external authorization", () => {
  const decision = decideCodexReviewAuthorization({
    draft: false,
    authorAssociation: "CONTRIBUTOR",
    labelNames: [],
    eventAction: "unlabeled",
    removedLabelName: APPROVAL_LABEL,
  });
  assert.equal(decision.kind, "revoke-approval");
  assert.equal(decision.skipGate, true);
  assert.equal(decision.fail, true);
  assert.deepEqual(decision.status, {
    state: "failure",
    description: "External approval label removed",
  });
});

test("removing the approval label does not fail trusted authors", () => {
  const decision = decideCodexReviewAuthorization({
    draft: false,
    authorAssociation: "MEMBER",
    labelNames: [],
    eventAction: "unlabeled",
    removedLabelName: APPROVAL_LABEL,
  });
  assert.equal(decision.kind, "allow");
  assert.equal(decision.fail, false);
  assert.equal(decision.skipGate, false);
});

test("authorization constants match the required status context", () => {
  assert.equal(APPROVAL_LABEL, "codex-review-approved");
  assert.equal(STATUS_CONTEXT, "codex-review");
});

test("the gate reacts to connector review events and scheduled retries", () => {
  assert.ok(workflow.on.schedule);
  assert.ok(workflow.on.workflow_dispatch);
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.equal(gateJob["timeout-minutes"], 15);
  assert.deepEqual(gateJob.permissions, {
    contents: "read",
    issues: "write",
    "pull-requests": "write",
    statuses: "write",
  });
});
