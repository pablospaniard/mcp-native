import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";

import {
  loadRendererConformanceSuite,
  parseRendererConformanceSuite,
  runReactNativeConformanceCase,
} from "./helpers/renderer-conformance.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const suite = loadRendererConformanceSuite();

for (const fixture of suite.cases) {
  test(`shared renderer corpus: ${fixture.id}`, async () => {
    const inputs = {
      ...fixture,
      steps: fixture.steps.map(({ expect: _expect, ...input }) => input),
    };
    const observations = await runReactNativeConformanceCase(inputs, suite.timestamp);
    assert.equal(observations.length, fixture.steps.length);
    for (const [index, observation] of observations.entries()) {
      assert.deepEqual(
        observation,
        fixture.steps[index].expect,
        `${fixture.id}: step ${index + 1}`,
      );
    }
  });
}

test("the corpus loader rejects unknown contracts, operations, and incomplete expectations", () => {
  const mutations = [
    (value) => {
      value.formatVersion = 2;
    },
    (value) => {
      value.schemaRevision = "latest";
    },
    (value) => {
      value.cases[0].steps[0].op = "eval";
    },
    (value) => {
      value.cases[0].steps[0].script = "arbitrary code";
    },
    (value) => {
      delete value.cases[0].steps[0].expect.deliveries;
    },
    (value) => {
      value.cases[0].host.componentNames.push("RemoteCode");
    },
    (value) => {
      value.cases[0].host.functionNames.push("execute");
    },
    (value) => {
      value.cases[1].id = value.cases[0].id;
    },
    (value) => {
      value.cases[0].steps = [];
    },
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(suite);
    mutate(invalid);
    assert.throws(() => parseRendererConformanceSuite(JSON.stringify(invalid)));
  }
  assert.throws(() => parseRendererConformanceSuite("{"));
  assert.throws(() => parseRendererConformanceSuite(" ".repeat(262_145)), /256 KiB/);
});

test("a missing interaction target fails the harness instead of passing a rejection case", async () => {
  const fixture = structuredClone(suite.cases.find(({ id }) => id === "invalid-input-types"));
  fixture.steps[1].target.label = "No such input";
  await assert.rejects(
    () => runReactNativeConformanceCase(fixture, suite.timestamp),
    /Interaction target must identify exactly one mounted control/,
  );
});

for (const error of [new Error("Host render failed"), new TypeError("Host render type error")]) {
  for (const trigger of ["mount", "input"]) {
    test(`unexpected render errors fail the harness: ${error.name} after ${trigger}`, async () => {
      const fixture = {
        ...suite.cases[0],
        steps: [suite.cases[0].steps[0]],
      };
      if (trigger === "input") {
        fixture.steps.push({
          op: "input",
          target: { kind: "text-field", label: "Name" },
          value: "Trigger host error",
        });
      }
      await assert.rejects(
        () =>
          runReactNativeConformanceCase(fixture, suite.timestamp, {
            components: {
              View: "View",
              Text: "Text",
              TextInput(props) {
                if (trigger === "mount" || props.value === "Trigger host error") throw error;
                return createElement("TextInput", props);
              },
              CheckBox: "CheckBox",
              Button: "Button",
            },
          }),
        (actual) => actual === error,
      );
    });
  }
}
