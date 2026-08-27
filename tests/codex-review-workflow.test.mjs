import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parse } from "yaml";

const workflow = parse(readFileSync(".github/workflows/codex-review.yml", "utf8"));
const gateJob = workflow.jobs["codex-review-gate"];
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
  ]);
  assert.ok(workflow.on.issue_comment);
  assert.ok(workflow.on.pull_request_review);
  assert.ok(workflow.on.pull_request_review_comment);
  assert.match(gateJob.if, /github\.event\.pull_request\.draft == false/);
  assert.match(gateJob.if, /codex-review-approved/);
  assert.match(gateJob.if, /chatgpt-codex-connector/);
  assert.doesNotMatch(workflowSource, /pull_request\.number == 47/);
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
  assert.equal(runGateStep.if, "steps.authorize.outcome == 'success'");
});

test("external contributions require codex-review-approved before the gate runs", () => {
  assert.match(authorizeScript, /codex-review-approved/);
  assert.match(authorizeScript, /author_association/);
  assert.match(authorizeScript, /context: 'codex-review'/);
  assert.match(authorizeScript, /Maintainer must add codex-review-approved/);
  assert.match(authorizeScript, /PR_EVENT_ACTION === 'synchronize'/);
  assert.match(authorizeScript, /removeLabel/);
  assert.match(authorizeScript, /External approval invalidated by new push/);
  assert.match(authorizeScript, /invalidated the external-contributor review approval/);
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
