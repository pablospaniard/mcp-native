import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parse } from "yaml";

const workflow = parse(readFileSync(".github/workflows/codex-review.yml", "utf8"));
const reviewJob = workflow.jobs["codex-review"];
const finalizeJob = workflow.jobs["finalize-review"];
const publishScript = finalizeJob.steps.find(
  ({ name }) => name === "Publish review and final status",
).with.script;

test("the finalizer does not publish a failure for a skipped review job", () => {
  assert.match(finalizeJob.if, /needs\.codex-review\.result != 'skipped'/);
  assert.match(finalizeJob.if, /github\.event_name == 'pull_request_target'/);
  assert.match(finalizeJob.if, /github\.event\.pull_request\.number == 47/);
  assert.equal(finalizeJob.needs, "codex-review");
  assert.match(reviewJob.if, /github\.event_name == 'pull_request_target'/);
  assert.match(reviewJob.if, /github\.event\.pull_request\.number == 47/);
});

test("the final status requires a pass verdict with no findings", () => {
  assert.match(publishScript, /const hasFindings = review\.findings\.length > 0/);
  assert.match(publishScript, /const passed = review\.verdict === 'pass' && !hasFindings/);
  assert.match(publishScript, /!Array\.isArray\(review\.findings\)/);
});
