import assert from "node:assert/strict";
import test from "node:test";

import * as a2uiRoot from "../packages/a2ui/dist/index.js";
import * as umbrellaRoot from "../packages/mcp-native/dist/index.js";
import * as reactNativeRoot from "../packages/react-native/dist/index.js";
import {
  MCP_EXTENSION_CAPABILITIES,
  MCP_EXTENSION_ID,
  MIME_TYPE,
  BASIC_CATALOG_ID,
  BASIC_COMPONENT_NAMES,
  HOST_EXTENSION_PROFILE_ID,
  MAX_COMPONENTS,
  MAX_SURFACES,
  COMPONENT_NAMES,
  MAX_MEDIA,
  MAX_RENDER_NODES,
  Surface,
  SurfaceStore,
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
  createBasicCatalogPolicy,
  createActionDeliveryHandler,
  createActionEnvelope,
  createRendererCapabilities,
  createHostExtensionRegistry,
  createRenderPlan,
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
  evaluateFormatString,
  isMcpBindingGrant,
  isMcpAppsGrant,
  isMcpAppsNativeSandboxConfiguration,
  loadMcpAppsResource,
  negotiateMcpApps,
  negotiateMcpBinding,
  negotiateCapabilities,
  negotiateHostExtensions,
  negotiateMcpExtension,
  parseEnvelope,
  parseAgentCapabilities,
  parseJsonl,
  parseRendererCapabilities,
  parseRendererToAgentEnvelope,
  parseHostExtensionManifest,
  parseJsonObject,
  parseJsonValue,
  parseMcpExtensionSettings,
  parseMcpNativeAction,
  resolveJsonlFromToolResult,
  resolveEvent,
  getSupportedHostExtensionCatalogIds,
  validateSurfaceState,
} from "../packages/mcp-native/dist/index.js";
import { A2UI_VERSION as LEGACY_A2UI_VERSION } from "../packages/a2ui/dist/legacy.js";
import { McpNativeSurface as LegacyMcpNativeSurface } from "../packages/react-native/dist/legacy.js";
import {
  McpNativeSurface as UmbrellaLegacyMcpNativeSurface,
  parseA2uiSurface as umbrellaLegacyParser,
} from "../packages/mcp-native/dist/legacy.js";

test("the convenience package re-exports each public runtime package", () => {
  assert.equal(MIME_TYPE, "application/a2ui+json");
  assert.equal(MCP_EXTENSION_ID, "io.github.pablospaniard/mcp-native-a2ui");
  assert.equal(Object.isFrozen(MCP_EXTENSION_CAPABILITIES), true);
  assert.equal(MAX_COMPONENTS, 1_024);
  assert.equal(MAX_SURFACES, 1_024);
  assert.equal(MAX_RENDER_NODES, 1_024);
  assert.equal(MAX_MEDIA, 16);
  assert.equal(COMPONENT_NAMES.includes("TextField"), true);
  assert.equal(COMPONENT_NAMES.includes("Video"), true);
  assert.equal(HOST_EXTENSION_PROFILE_ID, "io.mcp-native/a2ui-host-extensions");
  assert.match(BASIC_CATALOG_ID, /catalogs\/basic\/catalog\.json$/);
  assert.equal(BASIC_COMPONENT_NAMES.includes("Text"), true);
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
  assert.equal(typeof createBasicCatalogPolicy, "function");
  assert.equal(typeof createActionDeliveryHandler, "function");
  assert.equal(typeof createActionEnvelope, "function");
  assert.equal(typeof createRendererCapabilities, "function");
  assert.equal(typeof createHostExtensionRegistry, "function");
  assert.equal(typeof createRenderPlan, "function");
  assert.equal(typeof evaluateFormatString, "function");
  assert.equal(typeof negotiateHostExtensions, "function");
  assert.equal(typeof parseHostExtensionManifest, "function");
  assert.equal(typeof getSupportedHostExtensionCatalogIds, "function");
  assert.equal(typeof Surface, "function");
  assert.equal(typeof validateSurfaceState, "function");
  assert.equal(typeof createWebViewDocument, "function");
  assert.equal(typeof isMcpBindingGrant, "function");
  assert.equal(typeof isMcpAppsGrant, "function");
  assert.equal(typeof isMcpAppsNativeSandboxConfiguration, "function");
  assert.equal(typeof loadMcpAppsResource, "function");
  assert.equal(typeof negotiateMcpApps, "function");
  assert.equal(typeof negotiateMcpBinding, "function");
  assert.equal(typeof negotiateCapabilities, "function");
  assert.equal(typeof negotiateMcpExtension, "function");
  assert.equal(typeof parseEnvelope, "function");
  assert.equal(typeof parseAgentCapabilities, "function");
  assert.equal(typeof parseJsonl, "function");
  assert.equal(typeof parseRendererCapabilities, "function");
  assert.equal(typeof parseRendererToAgentEnvelope, "function");
  assert.equal(typeof SurfaceStore, "function");
  assert.equal(typeof resolveJsonlFromToolResult, "function");
  assert.equal(typeof resolveEvent, "function");
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
