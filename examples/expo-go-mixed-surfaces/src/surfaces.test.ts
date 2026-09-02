import assert from "node:assert/strict";
import test from "node:test";

import { validateA2uiV1SurfaceState } from "@mcp-native/a2ui";

import {
  EXPLORE_SURFACE_ID,
  SUMMARY_SURFACE_ID,
  citySurfacePolicy,
  createExploreSurface,
  createSummarySurface,
  readCityVibe,
} from "./surfaces";

test("both screens produce complete policy-validated native A2UI surfaces", () => {
  const explore = createExploreSurface("food");
  const summary = createSummarySurface("after-dark");

  assert.equal(explore.surfaceId, EXPLORE_SURFACE_ID);
  assert.equal(summary.surfaceId, SUMMARY_SURFACE_ID);
  assert.ok(explore.components.has("root"));
  assert.ok(summary.components.has("root"));
  assert.equal(
    validateA2uiV1SurfaceState(explore, citySurfacePolicy).surfaceId,
    EXPLORE_SURFACE_ID,
  );
  assert.equal(
    validateA2uiV1SurfaceState(summary, citySurfacePolicy).surfaceId,
    SUMMARY_SURFACE_ID,
  );
});

test("renderer-local vibe input accepts only one known option", () => {
  assert.equal(readCityVibe({ vibe: ["after-dark"] }, "culture"), "after-dark");
  assert.equal(readCityVibe({ vibe: ["unknown"] }, "culture"), "culture");
  assert.equal(readCityVibe({ vibe: ["food", "culture"] }, "culture"), "culture");
  assert.equal(readCityVibe({ vibe: "food" }, "culture"), "culture");
});
