import assert from "node:assert/strict";
import test from "node:test";

import {
  CITY_CANVAS_APP_REGION_ID,
  advanceMixedPlanSession,
  handleMixedPlanBack,
  recoverMixedPlanApp,
} from "./lifecycle";

test("both back controls defer to the focused mixed region before host navigation", async () => {
  let hostBackCount = 0;
  await handleMixedPlanBack({ handleBack: async () => true }, () => {
    hostBackCount += 1;
  });
  assert.equal(hostBackCount, 0);

  await handleMixedPlanBack({ handleBack: async () => false }, () => {
    hostBackCount += 1;
  });
  assert.equal(hostBackCount, 1);
});

test("recovery targets the MCP App region and advances to a fresh host session", async () => {
  const recovered: string[] = [];
  await recoverMixedPlanApp({
    recover: async (regionId) => {
      recovered.push(regionId);
    },
  });

  assert.deepEqual(recovered, [CITY_CANVAS_APP_REGION_ID]);
  assert.equal(advanceMixedPlanSession(4), 5);
  assert.equal(advanceMixedPlanSession(Number.MAX_SAFE_INTEGER), 0);
});
