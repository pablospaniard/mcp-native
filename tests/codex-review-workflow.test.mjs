import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parse } from "yaml";

const workflow = parse(readFileSync(".github/workflows/codex-review.yml", "utf8"));
const reviewJob = workflow.jobs["codex-review"];
const finalizeJob = workflow.jobs["finalize-review"];
const checkoutStep = reviewJob.steps.find(({ name }) => name === "Check out trusted base revision");
const fetchHeadStep = reviewJob.steps.find(
  ({ name }) => name === "Fetch pull request head for review",
);
const runCodexStep = reviewJob.steps.find(({ name }) => name === "Run Codex review");
const pendingStep = reviewJob.steps.find(
  ({ name }) => name === "Mark review pending on the pull request head",
);
const publishStep = finalizeJob.steps.find(
  ({ name }) => name === "Publish review and final status",
);
const publishScript = publishStep.with.script;
const workflowSource = readFileSync(".github/workflows/codex-review.yml", "utf8");

test("reviews run only from the trusted pull_request_target workflow", () => {
  assert.equal(workflow.on.pull_request, undefined);
  assert.ok(workflow.on.pull_request_target);
  assert.equal(reviewJob.if, "github.event.pull_request.draft == false");
  assert.match(finalizeJob.if, /needs\.codex-review\.result != 'skipped'/);
  assert.match(finalizeJob.if, /github\.event\.pull_request\.draft == false/);
  assert.doesNotMatch(workflowSource, /pull_request\.number == 47/);
  assert.doesNotMatch(workflowSource, /codex-review-bootstrap/);
  assert.equal(finalizeJob.needs, "codex-review");
});

test("the final status requires a pass verdict with no findings", () => {
  assert.match(publishScript, /const hasFindings = review\.findings\.length > 0/);
  assert.match(publishScript, /const passed = review\.verdict === 'pass' && !hasFindings/);
  assert.match(publishScript, /!Array\.isArray\(review\.findings\)/);
  assert.match(publishScript, /context: 'codex-review'/);
  assert.equal(pendingStep.env?.STATUS_CONTEXT, undefined);
  assert.equal(publishStep.env?.STATUS_CONTEXT, undefined);
});

test("Codex runs from the trusted base checkout, not the PR merge commit", () => {
  assert.equal(checkoutStep.with.ref, "${{ github.event.pull_request.base.sha }}");
  assert.equal(checkoutStep.with["persist-credentials"], false);
  assert.match(fetchHeadStep.run, /refs\/pull\/\$\{PR_NUMBER\}\/head/);
  assert.match(runCodexStep.with.prompt, /working tree is the trusted base revision/);
  assert.doesNotMatch(JSON.stringify(reviewJob.steps), /merge_commit_sha/);
});
