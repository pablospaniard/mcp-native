import assert from "node:assert/strict";
import {
  createContractSchemaBundle,
  runContractAdapterFixtures,
} from "@mcp-native/host/contracts/authoring";
import test from "node:test";
import { createContractRegistry } from "@mcp-native/host/contracts";
import { createSummaryController, summaryAdapter, summarySchemaBundle } from "./summary-contract";

test("summary descriptor pins the exact input, model and event schema bundle", async () => {
  assert.equal(
    summaryAdapter.descriptor.schemaRevision,
    (await createContractSchemaBundle(summarySchemaBundle)).schemaRevision,
  );
});
test("summary controller resolves a bounded owned snapshot and rejects inconsistent counts", async () => {
  const registry = createContractRegistry([summaryAdapter]);
  const counts = { active: 2, completed: 1, total: 3 };
  const controller = createSummaryController(registry, counts);
  counts.active = 99;
  await controller.start();
  const result = await controller.callTool("task_summary");
  assert.equal(result.kind, "contract-data");
  if (result.kind === "contract-data")
    assert.deepEqual(result.model, { active: 2, completed: 1, total: 3 });
  await controller.shutdown();
  const invalid = createSummaryController(registry, { active: 2, completed: 1, total: 200 });
  await invalid.start();
  assert.deepEqual(await invalid.callTool("task_summary"), {
    kind: "contract-error",
    code: "adapter-failed",
  });
  await invalid.shutdown();
});

test("public authoring fixtures verify summary input, preparation, and event schemas", async () => {
  const report = await runContractAdapterFixtures({
    adapter: summaryAdapter,
    fixtures: [
      {
        name: "counts",
        input: { active: 2, completed: 1, total: 3 },
        expected: { kind: "contract-data", model: { active: 2, completed: 1, total: 3 } },
      },
      {
        name: "inconsistent counts",
        input: { active: 2, completed: 1, total: 4 },
        expected: { kind: "contract-error", code: "adapter-failed" },
      },
      {
        name: "out of bounds",
        input: { active: 201, completed: 0, total: 201 },
        expected: { kind: "contract-error", code: "invalid-contract-input" },
      },
    ],
    events: [
      { name: "acknowledgment", event: { name: "acknowledge" }, valid: true },
      { name: "undeclared event", event: { name: "delete" }, valid: false },
    ],
  });
  assert.equal(report.passed, true);
});
