import limits from "../experiments/ios-runtime-comparison/limits.json" with { type: "json" };
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

test("malformed envelopes preserve the embedded bridge session and local edits", () => {
  const request = (value) => JSON.parse(exchange(JSON.stringify(value)));
  const token = "malformed-envelope-session";
  let sequence = 0;
  assert.equal(
    request({ op: "open", token, sequence, host: suite.cases[0].host, timestamp: suite.timestamp })
      .ok,
    true,
  );
  const step = (value) => {
    const response = request({ op: "step", token, sequence: ++sequence, step: value });
    assert.equal(response.ok, true);
    return response.value;
  };
  try {
    step({ op: "message", message: suite.cases[0].steps[0].message });
    const edited = step({
      op: "input",
      target: { kind: "text-field", label: "Name" },
      value: "Retained edit",
    });
    for (const message of [null, [], "invalid", 42, true]) {
      assert.deepEqual(step({ op: "message", message }), {
        ...edited,
        outcome: "message-rejected",
      });
      assert.deepEqual(step({ op: "render" }), edited);
    }
  } finally {
    request({ op: "close", token, sequence: ++sequence });
  }
});

test("the embedded session preserves deep layouts and rejects paths beyond the experiment limit", () => {
  for (const [columns, button] of [
    [31, false],
    [limits.maxComponentDepth - 1, false],
    [limits.maxComponentDepth, false],
    [limits.maxComponentDepth - 2, true],
    [limits.maxComponentDepth - 1, true],
  ]) {
    const session = new SharedSession(suite.cases[0].host, suite.timestamp);
    const components = Array.from({ length: columns }, (_, index) => ({
      id: index === 0 ? "root" : `c${index}`,
      component: "Column",
      children: [index === columns - 1 ? "leaf" : `c${index + 1}`],
    }));
    let expected;
    if (button) {
      components.push(
        { id: "leaf", component: "Button", child: "label", action: { event: { name: "submit" } } },
        { id: "label", component: "Text", text: "Deep button" },
      );
      expected = { kind: "button", label: "Deep button", disabled: false, validationMessages: [] };
    } else {
      components.push({
        id: "leaf",
        component: "TextField",
        label: "Deep field",
        value: "Retained leaf",
      });
      expected = {
        kind: "text-field",
        label: "Deep field",
        value: "Retained leaf",
        invalid: false,
        validationMessages: [],
      };
    }
    for (let i = 0; i < columns; i++) expected = { kind: "group", children: [expected] };
    const result = session.step({
      op: "message",
      message: { version: "v1.0", createSurface: { surfaceId: "form", components, dataModel: {} } },
    });
    const rejected = columns + (button ? 2 : 1) > limits.maxComponentDepth;
    assert.equal(result.outcome, rejected ? "surface-rejected" : "accepted");
    assert.deepEqual(result.view, rejected ? [] : [expected]);
    assert.deepEqual(session.step({ op: "render" }), result);
  }
});
