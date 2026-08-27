import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parse } from "yaml";

const workflow = parse(readFileSync(".github/workflows/codex-review.yml", "utf8"));
const reviewJob = workflow.jobs["codex-review"];
const propagateJob = workflow.jobs["propagate-status"];
const finalizeJob = workflow.jobs["finalize-review"];
const gateStep = reviewJob.steps.find(
  ({ name }) => name === "Skip if this pull request was already reviewed",
);
const checkoutStep = reviewJob.steps.find(({ name }) => name === "Check out trusted base revision");
const fetchHeadStep = reviewJob.steps.find(
  ({ name }) => name === "Fetch pull request head for review",
);
const preparePromptStep = reviewJob.steps.find(({ name }) => name === "Prepare review prompt");
const runCodexStep = reviewJob.steps.find(({ name }) => name === "Run Codex review");
const pendingStep = reviewJob.steps.find(
  ({ name }) => name === "Mark review pending on the pull request head",
);
const propagateStep = propagateJob.steps.find(
  ({ name }) => name === "Mirror prior Codex review status on the new head",
);
const publishStep = finalizeJob.steps.find(
  ({ name }) => name === "Publish review and final status",
);
const publishScript = publishStep.with.script;
const propagateScript = propagateStep.with.script;
const workflowSource = readFileSync(".github/workflows/codex-review.yml", "utf8");

test("reviews run only from the trusted pull_request_target workflow", () => {
  assert.equal(workflow.on.pull_request, undefined);
  assert.ok(workflow.on.pull_request_target);
  assert.deepEqual(workflow.on.pull_request_target.types, [
    "opened",
    "ready_for_review",
    "synchronize",
    "labeled",
  ]);
  assert.match(reviewJob.if, /github\.event\.action != 'synchronize'/);
  assert.match(reviewJob.if, /codex-review-approved/);
  assert.match(propagateJob.if, /github\.event\.action == 'synchronize'/);
  assert.match(finalizeJob.if, /github\.event\.action != 'synchronize'/);
  assert.match(reviewJob.if, /github\.event\.pull_request\.draft == false/);
  assert.doesNotMatch(workflowSource, /pull_request\.number == 47/);
  assert.doesNotMatch(workflowSource, /codex-review-bootstrap/);
  assert.equal(finalizeJob.needs, "codex-review");
});

test("Codex runs once per pull request with a bounded diff prompt", () => {
  assert.ok(gateStep);
  assert.match(gateStep.with.script, /codex-review-gate/);
  assert.ok(preparePromptStep);
  assert.match(preparePromptStep.run, /git diff --unified=3/);
  assert.match(preparePromptStep.run, /MAX_DIFF_BYTES/);
  assert.equal(runCodexStep.with["prompt-file"], ".codex-review/prompt.md");
  assert.equal(runCodexStep.with.model, "gpt-5.6-sol");
  assert.equal(runCodexStep.with.effort, "low");
  assert.match(preparePromptStep.run, /Review ONLY the change evidence below/);
  assert.equal(runCodexStep.with.prompt, undefined);
});

test("later pushes mirror the initial review without calling Codex", () => {
  assert.ok(propagateStep);
  assert.match(propagateScript, /codex-review-verdict:/);
  assert.match(propagateScript, /Codex review required before merge/);
  assert.match(propagateScript, /mirrored from initial review/);
  assert.doesNotMatch(JSON.stringify(propagateJob.steps), /openai\/codex-action/);
});

test("the final status requires a pass verdict with no findings", () => {
  assert.match(publishScript, /const hasFindings = review\.findings\.length > 0/);
  assert.match(publishScript, /const passed = review\.verdict === 'pass' && !hasFindings/);
  assert.match(publishScript, /codex-review-verdict:/);
  assert.match(publishScript, /!Array\.isArray\(review\.findings\)/);
  assert.match(publishScript, /context: 'codex-review'/);
  assert.match(publishScript, /REVIEW_SKIPPED/);
  assert.equal(pendingStep.env?.STATUS_CONTEXT, undefined);
  assert.equal(publishStep.env?.STATUS_CONTEXT, undefined);
});

test("Codex runs from the trusted base checkout, not the PR merge commit", () => {
  assert.equal(checkoutStep.with.ref, "${{ github.event.pull_request.base.sha }}");
  assert.equal(checkoutStep.with["fetch-depth"], 1);
  assert.equal(checkoutStep.with["persist-credentials"], false);
  assert.match(fetchHeadStep.run, /refs\/pull\/\$\{PR_NUMBER\}\/head/);
  assert.match(preparePromptStep.run, /trusted base revision/);
  assert.doesNotMatch(JSON.stringify(reviewJob.steps), /merge_commit_sha/);
});
