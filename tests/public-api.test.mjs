import assert from "node:assert/strict";
import test from "node:test";

import {
  A2UI_VERSION,
  McpNativeRuntime,
  createNativeRenderPlan,
  createWebViewDocument,
} from "../packages/mcp-native/dist/index.js";

test("the convenience package re-exports each public runtime package", () => {
  assert.equal(A2UI_VERSION, "0.1");
  assert.equal(typeof McpNativeRuntime, "function");
  assert.equal(typeof createNativeRenderPlan, "function");
  assert.equal(typeof createWebViewDocument, "function");
});
