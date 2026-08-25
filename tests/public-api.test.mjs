import assert from "node:assert/strict";
import test from "node:test";

import {
  A2UI_MIME_TYPE,
  A2UI_VERSION,
  McpNativeRuntime,
  createNativeRenderPlan,
  createWebViewDocument,
  resolveA2uiResourceFromToolResult,
} from "../packages/mcp-native/dist/index.js";

test("the convenience package re-exports each public runtime package", () => {
  assert.equal(A2UI_VERSION, "0.1");
  assert.equal(A2UI_MIME_TYPE, "application/a2ui+json");
  assert.equal(typeof McpNativeRuntime, "function");
  assert.equal(typeof createNativeRenderPlan, "function");
  assert.equal(typeof createWebViewDocument, "function");
  assert.equal(typeof resolveA2uiResourceFromToolResult, "function");
});
