import assert from "node:assert/strict";
import test from "node:test";

import {
  A2UI_MAX_SOURCE_LENGTH,
  A2UI_MAX_STRING_LENGTH,
  A2UI_MCP_EXTENSION_CAPABILITIES,
  A2UI_MCP_EXTENSION_ID,
  A2UI_MIME_TYPE,
  A2UI_V1_BASIC_CATALOG_ID,
  A2UI_V1_BASIC_COMPONENT_NAMES,
  A2UI_V1_MAX_COMPONENTS,
  A2UI_V1_MAX_SURFACES,
  A2UI_V1_NATIVE_COMPONENT_NAMES,
  A2UI_V1_NATIVE_MAX_RENDER_NODES,
  A2UI_VERSION,
  A2uiV1NativeSurface,
  A2uiSurfaceStore,
  JSON_MAX_DEPTH,
  JSON_MAX_STRING_LENGTH,
  JSON_MAX_VALUES,
  JsonValidationError,
  McpNativeActionDeniedError,
  McpNativeSurface,
  McpNativeRuntime,
  createAllowlistActionPolicy,
  createA2uiV1BasicCatalogPolicy,
  createA2uiV1ActionEnvelope,
  createA2uiV1RendererCapabilities,
  createA2uiV1NativeRenderPlan,
  createNativeRenderPlan,
  createWebViewDocument,
  evaluateA2uiV1FormatString,
  isA2uiMcpBindingGrant,
  negotiateA2uiMcpBinding,
  negotiateA2uiV1Capabilities,
  negotiateMcpExtension,
  parseA2uiV1Envelope,
  parseA2uiV1AgentCapabilities,
  parseA2uiV1Jsonl,
  parseA2uiV1RendererCapabilities,
  parseJsonObject,
  parseJsonValue,
  parseMcpExtensionSettings,
  parseMcpNativeAction,
  resolveA2uiResourceFromToolResult,
  resolveA2uiV1JsonlFromToolResult,
  resolveA2uiV1NativeEvent,
  validateA2uiV1SurfaceState,
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
  assert.equal(A2UI_V1_MAX_COMPONENTS, 1_024);
  assert.equal(A2UI_V1_MAX_SURFACES, 1_024);
  assert.equal(A2UI_V1_NATIVE_MAX_RENDER_NODES, 1_024);
  assert.equal(A2UI_V1_NATIVE_COMPONENT_NAMES.includes("TextField"), true);
  assert.match(A2UI_V1_BASIC_CATALOG_ID, /catalogs\/basic\/catalog\.json$/);
  assert.equal(A2UI_V1_BASIC_COMPONENT_NAMES.includes("Text"), true);
  assert.equal(JSON_MAX_DEPTH, 64);
  assert.equal(JSON_MAX_VALUES, 10_000);
  assert.equal(JSON_MAX_STRING_LENGTH, 65_536);
  assert.equal(typeof McpNativeRuntime, "function");
  assert.equal(typeof McpNativeActionDeniedError, "function");
  assert.equal(typeof JsonValidationError, "function");
  assert.equal(typeof McpNativeSurface, "function");
  assert.equal(typeof createNativeRenderPlan, "function");
  assert.equal(typeof createAllowlistActionPolicy, "function");
  assert.equal(typeof createA2uiV1BasicCatalogPolicy, "function");
  assert.equal(typeof createA2uiV1ActionEnvelope, "function");
  assert.equal(typeof createA2uiV1RendererCapabilities, "function");
  assert.equal(typeof createA2uiV1NativeRenderPlan, "function");
  assert.equal(typeof evaluateA2uiV1FormatString, "function");
  assert.equal(typeof A2uiV1NativeSurface, "function");
  assert.equal(typeof validateA2uiV1SurfaceState, "function");
  assert.equal(typeof createWebViewDocument, "function");
  assert.equal(typeof isA2uiMcpBindingGrant, "function");
  assert.equal(typeof negotiateA2uiMcpBinding, "function");
  assert.equal(typeof negotiateA2uiV1Capabilities, "function");
  assert.equal(typeof negotiateMcpExtension, "function");
  assert.equal(typeof parseA2uiV1Envelope, "function");
  assert.equal(typeof parseA2uiV1AgentCapabilities, "function");
  assert.equal(typeof parseA2uiV1Jsonl, "function");
  assert.equal(typeof parseA2uiV1RendererCapabilities, "function");
  assert.equal(typeof A2uiSurfaceStore, "function");
  assert.equal(typeof resolveA2uiV1JsonlFromToolResult, "function");
  assert.equal(typeof resolveA2uiV1NativeEvent, "function");
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
