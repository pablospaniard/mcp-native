import assert from "node:assert/strict";
import test from "node:test";
import { SharedSession, exchange } from "../experiments/ios-runtime-comparison/shared-runtime.mjs";
import { loadRendererConformanceSuite } from "./helpers/renderer-conformance.mjs";

const suite = loadRendererConformanceSuite();
for (const fixture of suite.cases) {
  test(`embedded session reference: ${fixture.id}`, () => {
    const session = new SharedSession(fixture.host, suite.timestamp);
    for (const { expect, ...step } of fixture.steps) {
      const { deliveries: _deliveries, deliveryResults: _results, ...expected } = expect;
      assert.deepEqual(session.step(step), expected);
    }
  });
}

test("the embedded bridge rejects unknown fields, oversized requests, stale tickets, and sequence reuse", () => {
  const request = (value) => JSON.parse(exchange(JSON.stringify(value)));
  const open = {
    op: "open",
    token: "test-session",
    sequence: 0,
    host: suite.cases[0].host,
    timestamp: suite.timestamp,
  };
  for (const invalid of [
    { op: "step", token: "wrong-session", sequence: 1, step: { op: "render" } },
    { op: "step", token: open.token, sequence: 0, step: { op: "render" } },
    { op: "step", token: open.token, sequence: 1, script: "remote code", step: { op: "render" } },
  ]) {
    assert.equal(request(open).ok, true);
    assert.equal(request(invalid).ok, false);
    assert.equal(
      request({ op: "step", token: open.token, sequence: 1, step: { op: "render" } }).ok,
      false,
    );
  }
  assert.equal(JSON.parse(exchange("{")).ok, false);
  assert.equal(JSON.parse(exchange(" ".repeat(1_048_577))).ok, false);
  assert.equal(request(open).ok, true);
  assert.equal(request({ op: "close", token: open.token, sequence: 1 }).ok, true);
  assert.equal(
    request({ op: "step", token: open.token, sequence: 2, step: { op: "render" } }).ok,
    false,
  );
});

test("the embedded session rejects additional surfaces and bounds its lifetime", () => {
  const session = new SharedSession(suite.cases[0].host, suite.timestamp);
  const message = structuredClone(suite.cases[0].steps[0].message);
  message.createSurface.surfaceId = "other";
  assert.equal(session.step({ op: "message", message }).outcome, "message-rejected");
  for (let i = 1; i < 64; i++) session.step({ op: "render" });
  assert.throws(() => session.step({ op: "render" }), /step limit/u);
});
