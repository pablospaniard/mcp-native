import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createContractRegistry } from "@mcp-native/host/contracts";
import { createSummaryController, summaryAdapter, summarySchemaBundle } from "./summary-contract";

test("summary descriptor pins the exact input, model and event schema bundle", () => {
  assert.equal(
    summaryAdapter.descriptor.schemaRevision,
    "sha256:" + createHash("sha256").update(JSON.stringify(summarySchemaBundle)).digest("hex"),
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
