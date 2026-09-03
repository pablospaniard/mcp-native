import assert from "node:assert/strict";
import test from "node:test";

import * as a2uiRoot from "../packages/a2ui/dist/index.js";
import * as umbrellaRoot from "../packages/mcp-native/dist/index.js";
import * as reactNativeRoot from "../packages/react-native/dist/index.js";
import {
  A2UI_MCP_EXTENSION_CAPABILITIES,
  A2UI_MCP_EXTENSION_ID,
  A2UI_MIME_TYPE,
  A2UI_V1_BASIC_CATALOG_ID,
  A2UI_V1_BASIC_COMPONENT_NAMES,
  A2UI_V1_HOST_EXTENSION_PROFILE_ID,
  A2UI_V1_MAX_COMPONENTS,
  A2UI_V1_MAX_SURFACES,
  A2UI_V1_NATIVE_COMPONENT_NAMES,
  A2UI_V1_NATIVE_MAX_MEDIA,
  A2UI_V1_NATIVE_MAX_RENDER_NODES,
  A2uiV1NativeSurface,
  A2uiSurfaceStore,
  JSON_MAX_DEPTH,
  JSON_MAX_STRING_LENGTH,
  JSON_MAX_VALUES,
  JsonValidationError,
  MCP_APPS_EXTENSION_CAPABILITIES,
  MCP_APPS_EXTENSION_ID,
  MCP_APPS_MIME_TYPE,
  MCP_APPS_PROTOCOL_VERSION,
  MCP_NATIVE_MIXED_MAX_REGIONS,
  McpAppsBridge,
  McpAppsBridgeError,
  McpAppsError,
  McpNativeActionDeniedError,
  McpNativeMixedSurfaceCoordinator,
  McpNativeMixedSurfaceError,
  McpNativeRuntime,
  createAllowlistActionPolicy,
  createConsentActionPolicy,
  createA2uiV1BasicCatalogPolicy,
  createA2uiV1ActionDeliveryHandler,
  createA2uiV1ActionEnvelope,
  createA2uiV1RendererCapabilities,
  createA2uiV1HostExtensionRegistry,
  createA2uiV1NativeRenderPlan,
  createNativeButtonAdapter,
  createNativeAudioPlayerAdapter,
  createNativeHostExtensionRegistration,
  createNativeTextAdapter,
  createNativeTextInputAdapter,
  createNativeViewAdapter,
  createNativeVideoAdapter,
  createMcpAppsNativeSandbox,
  createMcpAppsReactNativeWebViewProps,
  createMcpNativeMixedA2uiRegion,
  createMcpNativeMixedMcpAppsRegion,
  createWebViewDocument,
  evaluateA2uiV1FormatString,
  isA2uiMcpBindingGrant,
  isMcpAppsGrant,
  isMcpAppsNativeSandboxConfiguration,
  loadMcpAppsResource,
  negotiateMcpApps,
  negotiateA2uiMcpBinding,
  negotiateA2uiV1Capabilities,
  negotiateA2uiV1HostExtensions,
  negotiateMcpExtension,
  parseA2uiV1Envelope,
  parseA2uiV1AgentCapabilities,
  parseA2uiV1Jsonl,
  parseA2uiV1RendererCapabilities,
  parseA2uiV1RendererToAgentEnvelope,
  parseA2uiV1HostExtensionManifest,
  parseJsonObject,
  parseJsonValue,
  parseMcpExtensionSettings,
  parseMcpNativeAction,
  resolveA2uiV1JsonlFromToolResult,
  resolveA2uiV1NativeEvent,
  getA2uiV1NativeSupportedHostExtensionCatalogIds,
  validateA2uiV1SurfaceState,
} from "../packages/mcp-native/dist/index.js";
import { A2UI_VERSION as LEGACY_A2UI_VERSION } from "../packages/a2ui/dist/legacy.js";
import { McpNativeSurface as LegacyMcpNativeSurface } from "../packages/react-native/dist/legacy.js";
import {
  McpNativeSurface as UmbrellaLegacyMcpNativeSurface,
  parseA2uiSurface as umbrellaLegacyParser,
} from "../packages/mcp-native/dist/legacy.js";

test("the convenience package re-exports each public runtime package", () => {
  assert.equal(A2UI_MIME_TYPE, "application/a2ui+json");
  assert.equal(A2UI_MCP_EXTENSION_ID, "io.github.pablospaniard/mcp-native-a2ui");
  assert.equal(Object.isFrozen(A2UI_MCP_EXTENSION_CAPABILITIES), true);
  assert.equal(A2UI_V1_MAX_COMPONENTS, 1_024);
  assert.equal(A2UI_V1_MAX_SURFACES, 1_024);
  assert.equal(A2UI_V1_NATIVE_MAX_RENDER_NODES, 1_024);
  assert.equal(A2UI_V1_NATIVE_MAX_MEDIA, 16);
  assert.equal(A2UI_V1_NATIVE_COMPONENT_NAMES.includes("TextField"), true);
  assert.equal(A2UI_V1_NATIVE_COMPONENT_NAMES.includes("Video"), true);
  assert.equal(A2UI_V1_HOST_EXTENSION_PROFILE_ID, "io.mcp-native/a2ui-host-extensions");
  assert.match(A2UI_V1_BASIC_CATALOG_ID, /catalogs\/basic\/catalog\.json$/);
  assert.equal(A2UI_V1_BASIC_COMPONENT_NAMES.includes("Text"), true);
  assert.equal(JSON_MAX_DEPTH, 64);
  assert.equal(JSON_MAX_VALUES, 10_000);
  assert.equal(JSON_MAX_STRING_LENGTH, 65_536);
  assert.equal(MCP_APPS_EXTENSION_ID, "io.modelcontextprotocol/ui");
  assert.equal(MCP_APPS_PROTOCOL_VERSION, "2026-01-26");
  assert.equal(MCP_APPS_MIME_TYPE, "text/html;profile=mcp-app");
  assert.equal(Object.isFrozen(MCP_APPS_EXTENSION_CAPABILITIES), true);
  assert.equal(MCP_NATIVE_MIXED_MAX_REGIONS, 32);
  assert.equal(typeof McpNativeRuntime, "function");
  assert.equal(typeof McpNativeActionDeniedError, "function");
  assert.equal(typeof McpNativeMixedSurfaceCoordinator, "function");
  assert.equal(typeof McpNativeMixedSurfaceError, "function");
  assert.equal(typeof JsonValidationError, "function");
  assert.equal(typeof McpAppsBridge, "function");
  assert.equal(typeof McpAppsBridgeError, "function");
  assert.equal(typeof McpAppsError, "function");
  assert.equal(typeof createNativeButtonAdapter, "function");
  assert.equal(typeof createNativeAudioPlayerAdapter, "function");
  assert.equal(typeof createNativeHostExtensionRegistration, "function");
  assert.equal(typeof createNativeTextAdapter, "function");
  assert.equal(typeof createNativeTextInputAdapter, "function");
  assert.equal(typeof createNativeViewAdapter, "function");
  assert.equal(typeof createNativeVideoAdapter, "function");
  assert.equal(typeof createMcpAppsNativeSandbox, "function");
  assert.equal(typeof createMcpAppsReactNativeWebViewProps, "function");
  assert.equal(typeof createMcpNativeMixedA2uiRegion, "function");
  assert.equal(typeof createMcpNativeMixedMcpAppsRegion, "function");
  assert.equal(typeof createAllowlistActionPolicy, "function");
  assert.equal(typeof createConsentActionPolicy, "function");
  assert.equal(typeof createA2uiV1BasicCatalogPolicy, "function");
  assert.equal(typeof createA2uiV1ActionDeliveryHandler, "function");
  assert.equal(typeof createA2uiV1ActionEnvelope, "function");
  assert.equal(typeof createA2uiV1RendererCapabilities, "function");
  assert.equal(typeof createA2uiV1HostExtensionRegistry, "function");
  assert.equal(typeof createA2uiV1NativeRenderPlan, "function");
  assert.equal(typeof evaluateA2uiV1FormatString, "function");
  assert.equal(typeof negotiateA2uiV1HostExtensions, "function");
  assert.equal(typeof parseA2uiV1HostExtensionManifest, "function");
  assert.equal(typeof getA2uiV1NativeSupportedHostExtensionCatalogIds, "function");
  assert.equal(typeof A2uiV1NativeSurface, "function");
  assert.equal(typeof validateA2uiV1SurfaceState, "function");
  assert.equal(typeof createWebViewDocument, "function");
  assert.equal(typeof isA2uiMcpBindingGrant, "function");
  assert.equal(typeof isMcpAppsGrant, "function");
  assert.equal(typeof isMcpAppsNativeSandboxConfiguration, "function");
  assert.equal(typeof loadMcpAppsResource, "function");
  assert.equal(typeof negotiateMcpApps, "function");
  assert.equal(typeof negotiateA2uiMcpBinding, "function");
  assert.equal(typeof negotiateA2uiV1Capabilities, "function");
  assert.equal(typeof negotiateMcpExtension, "function");
  assert.equal(typeof parseA2uiV1Envelope, "function");
  assert.equal(typeof parseA2uiV1AgentCapabilities, "function");
  assert.equal(typeof parseA2uiV1Jsonl, "function");
  assert.equal(typeof parseA2uiV1RendererCapabilities, "function");
  assert.equal(typeof parseA2uiV1RendererToAgentEnvelope, "function");
  assert.equal(typeof A2uiSurfaceStore, "function");
  assert.equal(typeof resolveA2uiV1JsonlFromToolResult, "function");
  assert.equal(typeof resolveA2uiV1NativeEvent, "function");
  assert.equal(typeof parseJsonObject, "function");
  assert.equal(typeof parseJsonValue, "function");
  assert.equal(typeof parseMcpNativeAction, "function");
  assert.equal(typeof parseMcpExtensionSettings, "function");
});

test("the custom 0.1 proof surface has explicit legacy entry points", () => {
  assert.equal(LEGACY_A2UI_VERSION, "0.1");
  assert.equal(typeof LegacyMcpNativeSurface, "function");
  assert.equal(UmbrellaLegacyMcpNativeSurface, LegacyMcpNativeSurface);
  assert.equal(typeof umbrellaLegacyParser, "function");
});

test("the custom 0.1 proof surface is absent from package roots", () => {
  for (const name of [
    "A2UI_MAX_DEPTH",
    "A2UI_MAX_NODES",
    "A2UI_MAX_SOURCE_LENGTH",
    "A2UI_MAX_STRING_LENGTH",
    "A2UI_VERSION",
    "parseA2uiSurface",
    "resolveA2uiResourceFromToolResult",
  ]) {
    assert.equal(Object.hasOwn(a2uiRoot, name), false, `@mcp-native/a2ui exports ${name}`);
    assert.equal(Object.hasOwn(umbrellaRoot, name), false, `mcp-native exports ${name}`);
  }
  for (const name of [
    "McpNativeSurface",
    "createNativeRenderPlan",
    "useMcpNativeActionDispatcher",
    "useNativeRenderPlan",
  ]) {
    assert.equal(
      Object.hasOwn(reactNativeRoot, name),
      false,
      `@mcp-native/react-native exports ${name}`,
    );
    assert.equal(Object.hasOwn(umbrellaRoot, name), false, `mcp-native exports ${name}`);
  }
});

test("the public JSON validator rejects sparse arrays", () => {
  assert.throws(
    () => parseJsonValue(Array(1)),
    (error) => error instanceof JsonValidationError && /Sparse JSON array item/.test(error.message),
  );
});
