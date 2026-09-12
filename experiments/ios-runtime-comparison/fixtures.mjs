import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { loadRendererConformanceSuite } from "../../tests/helpers/renderer-conformance.mjs";

export const suite = loadRendererConformanceSuite();

export function writeInputs(path) {
  writeFileSync(
    path,
    JSON.stringify({
      timestamp: suite.timestamp,
      cases: suite.cases.map(({ id, host, steps }) => ({
        id,
        host,
        steps: steps.map(({ expect: _expect, ...step }) => step),
      })),
    }),
  );
}

export function verifyReport(path) {
  const result = JSON.parse(readFileSync(path, "utf8"));
  assert.deepEqual(Object.keys(result.engines).sort(), ["javascript", "swift"]);
  for (const engine of ["javascript", "swift"]) {
    assert.deepEqual(
      Object.keys(result.engines[engine]).sort(),
      suite.cases.map(({ id }) => id).sort(),
    );
    for (const fixture of suite.cases) {
      assert.deepEqual(
        result.engines[engine][fixture.id],
        fixture.steps.map((step) => step.expect),
        `${engine}: ${fixture.id}`,
      );
    }
    assert.deepEqual(result.lifecycle[engine], {
      toolResultRoundTrip: true,
      cancelledPress: true,
      staleGeneration: true,
      freshSession: true,
      unknownMIMERejected: true,
      cycleRejected: true,
      requiredWhitespace: true,
      jsonAndPointerDepthBounded: true,
      localOverridesInvalidServerDate: true,
      asciiRestrictionsEnforced: true,
      nestedLayoutsAndDepthLimit: true,
      malformedEnvelopesPreserveSession: true,
    });
  }
  return result;
}
