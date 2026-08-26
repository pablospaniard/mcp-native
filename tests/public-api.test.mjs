import assert from "node:assert/strict";
import test from "node:test";

import {
  A2UI_MAX_SOURCE_LENGTH,
  A2UI_MAX_STRING_LENGTH,
  A2UI_MCP_EXTENSION_CAPABILITIES,
  A2UI_MCP_EXTENSION_ID,
  A2UI_MIME_TYPE,
  A2UI_VERSION,
  JSON_MAX_DEPTH,
  JSON_MAX_STRING_LENGTH,
  JSON_MAX_VALUES,
  JsonValidationError,
  McpNativeActionDeniedError,
  McpNativeSurface,
  McpNativeRuntime,
  createAllowlistActionPolicy,
  createNativeRenderPlan,
  createWebViewDocument,
  negotiateA2uiMcpBinding,
  negotiateMcpExtension,
  parseJsonObject,
  parseJsonValue,
  parseMcpExtensionSettings,
  parseMcpNativeAction,
  resolveA2uiResourceFromToolResult,
  useMcpNativeActionDispatcher,
  useNativeRenderPlan,
} from "../packages/mcp-native/dist/index.js";

test("the convenience package re-exports each public runtime package", () => {
  assert.equal(A2UI_VERSION, "0.1");
  assert.equal(A2UI_MIME_TYPE, "application/a2ui+json");
  assert.equal(A2UI_MCP_EXTENSION_ID, "io.github.pablospaniard/mcp-native-a2ui");
  assert.equal(Object.isFrozen(A2UI_MCP_EXTENSION_CAPABILITIES), true);
  assert.equal(A2UI_MAX_SOURCE_LENGTH, 1_048_576);
  assert.equal(A2UI_MAX_STRING_LENGTH, 65_536);
  assert.equal(JSON_MAX_DEPTH, 64);
  assert.equal(JSON_MAX_VALUES, 10_000);
  assert.equal(JSON_MAX_STRING_LENGTH, 65_536);
  assert.equal(typeof McpNativeRuntime, "function");
  assert.equal(typeof McpNativeActionDeniedError, "function");
  assert.equal(typeof JsonValidationError, "function");
  assert.equal(typeof McpNativeSurface, "function");
  assert.equal(typeof createNativeRenderPlan, "function");
  assert.equal(typeof createAllowlistActionPolicy, "function");
  assert.equal(typeof createWebViewDocument, "function");
  assert.equal(typeof negotiateA2uiMcpBinding, "function");
  assert.equal(typeof negotiateMcpExtension, "function");
  assert.equal(typeof parseJsonObject, "function");
  assert.equal(typeof parseJsonValue, "function");
  assert.equal(typeof parseMcpNativeAction, "function");
  assert.equal(typeof parseMcpExtensionSettings, "function");
  assert.equal(typeof resolveA2uiResourceFromToolResult, "function");
  assert.equal(typeof useMcpNativeActionDispatcher, "function");
  assert.equal(typeof useNativeRenderPlan, "function");
});

test("the public JSON validator rejects sparse arrays", () => {
  assert.throws(
    () => parseJsonValue(Array(1)),
    (error) => error instanceof JsonValidationError && /Sparse JSON array item/.test(error.message),
  );
});
