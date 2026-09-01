import { parseMcpNativeAction } from "@mcp-native/core";
import type {
  McpContent,
  McpReadResourceResult,
  McpToolCallResult,
  ToolAction,
} from "@mcp-native/core";

import { A2uiParseError, A2uiResourceError } from "./errors.js";
import { A2UI_MIME_TYPE, type A2uiResourceReader } from "./mime.js";
export { A2uiParseError, A2uiResourceError } from "./errors.js";
export { A2UI_MIME_TYPE, type A2uiResourceReader } from "./mime.js";
export { A2UI_MCP_SCHEMA_REVISION } from "./schema-revision.js";
export {
  A2UI_MCP_BINDING_VERSION,
  A2UI_MCP_EXTENSION_CAPABILITIES,
  A2UI_MCP_EXTENSION_ID,
  A2UI_MCP_PROTOCOL_VERSION,
  A2UI_MCP_TRANSPORT,
  isA2uiMcpBindingGrant,
  negotiateA2uiMcpBinding,
} from "./binding.js";
export type { A2uiMcpBindingGrant, A2uiMcpBindingNegotiation } from "./binding.js";
export {
  A2UI_V1_MAX_ENVELOPES,
  A2UI_V1_MAX_SOURCE_LENGTH,
  A2UI_V1_MAX_STORE_STRING_CODE_UNITS,
  A2UI_V1_MAX_STORE_VALUES,
  A2UI_V1_PROTOCOL_VERSION,
  A2UI_V1_BASIC_CATALOG_ID,
  A2UI_V1_BASIC_COMPONENT_NAMES,
  A2UI_V1_BASIC_FUNCTION_NAMES,
  A2UI_V1_SYSTEM_FUNCTION_NAMES,
  A2UI_V1_HOST_EXTENSION_MAX_EVENTS,
  A2UI_V1_HOST_EXTENSION_MAX_INSTANCES,
  A2UI_V1_HOST_EXTENSION_MAX_MANIFESTS,
  A2UI_V1_HOST_EXTENSION_MAX_NEEDS,
  A2UI_V1_HOST_EXTENSION_MAX_UPDATES,
  A2UI_V1_HOST_EXTENSION_PROFILE_ID,
  A2UI_V1_HOST_EXTENSION_PROFILE_VERSION,
  A2UI_V1_MAX_COMPONENTS,
  A2UI_V1_MAX_SURFACES,
  A2uiSurfaceStore,
  createA2uiV1ActionDeliveryHandler,
  createA2uiV1ActionEnvelope,
  createA2uiV1BasicCatalogPolicy,
  createA2uiV1HostExtensionCapabilitySettings,
  createA2uiV1HostExtensionRegistry,
  createA2uiV1RendererCapabilities,
  evaluateA2uiV1FormatString,
  negotiateA2uiV1Capabilities,
  negotiateA2uiV1HostExtensions,
  parseA2uiV1AgentCapabilities,
  parseA2uiV1Envelope,
  parseA2uiV1Jsonl,
  parseA2uiV1HostExtensionCapabilityValue,
  parseA2uiV1HostExtensionManifest,
  parseA2uiV1RendererCapabilities,
  parseA2uiV1RendererToAgentEnvelope,
  resolveA2uiV1JsonlFromToolResult,
  getA2uiV1HostExtensionManifest,
  getA2uiV1HostExtensionCatalogIds,
  getA2uiV1HostExtensionManifestFingerprint,
  isA2uiV1HostExtensionRegistry,
  validateA2uiV1HostExtensionComponent,
  validateA2uiV1HostExtensionEvent,
  validateA2uiV1SurfaceState,
} from "./v1/index.js";
export type {
  A2uiV1ActionDeliveryHandler,
  A2uiV1ActionDeliveryOptions,
  A2uiV1ActionDeliveryPolicy,
  A2uiV1Action,
  A2uiV1ActionEnvelope,
  A2uiV1ActionEnvelopeInput,
  A2uiV1AgentCapabilities,
  A2uiV1BasicCatalogPolicyOptions,
  A2uiV1CallAgentFunctionEnvelope,
  A2uiV1CapabilityNegotiation,
  A2uiV1Component,
  A2uiV1CreateSurfaceEnvelope,
  A2uiV1DeleteSurfaceEnvelope,
  A2uiV1ErrorEnvelope,
  A2uiV1Envelope,
  A2uiV1EnvelopeKind,
  A2uiV1FormatStringExpressionBudgetConsumer,
  A2uiV1FormatStringExpressionResolver,
  A2uiV1HostExtensionCapabilityEntry,
  A2uiV1HostExtensionCapabilitySettings,
  A2uiV1HostExtensionEventManifest,
  A2uiV1HostExtensionManifest,
  A2uiV1HostExtensionNegotiation,
  A2uiV1HostExtensionRegistry,
  A2uiV1HostExtensionRegistryOptions,
  A2uiV1HostPlatform,
  A2uiV1FunctionCall,
  A2uiV1GenericRendererError,
  A2uiV1RendererCapabilities,
  A2uiV1RendererCapabilitiesOptions,
  A2uiV1RendererError,
  A2uiV1RendererFunctionResponse,
  A2uiV1RendererFunctionResponseEnvelope,
  A2uiV1RendererToAgentEnvelope,
  A2uiV1RendererToAgentEnvelopeKind,
  A2uiV1SurfaceState,
  A2uiSurfaceStoreOptions,
  A2uiV1EnvelopeParseOptions,
  A2uiV1SurfaceValidationPolicy,
  A2uiV1UpdateComponentsEnvelope,
  A2uiV1UpdateDataModelEnvelope,
  A2uiV1ValidationErrorCode,
  A2uiV1ValidationRendererError,
  ResolvedA2uiV1JsonlResource,
  A2uiV1ValidatedHostExtensionComponent,
} from "./v1/index.js";

/** @deprecated Use the pinned A2UI v1 Candidate APIs exported from this package. */
export const A2UI_VERSION = "0.1" as const;

/** @deprecated Applies only to the frozen custom 0.1 surface model. */
export const A2UI_MAX_DEPTH = 32;
/** @deprecated Applies only to the frozen custom 0.1 surface model. */
export const A2UI_MAX_NODES = 256;
/** @deprecated Applies only to the frozen custom 0.1 surface model. */
export const A2UI_MAX_SOURCE_LENGTH = 1_048_576;
/** @deprecated Applies only to the frozen custom 0.1 surface model. */
export const A2UI_MAX_STRING_LENGTH = 65_536;
const A2UI_MAX_MCP_RESULT_ITEMS = 1_024;

interface A2uiNodeBase {
  readonly id: string;
}

/** @deprecated Use A2UI v1 components and `A2uiV1SurfaceState`. */
export interface A2uiContainerNode extends A2uiNodeBase {
  readonly type: "container";
  readonly children: readonly A2uiNode[];
}

/** @deprecated Use A2UI v1 components and `A2uiV1SurfaceState`. */
export interface A2uiTextNode extends A2uiNodeBase {
  readonly type: "text";
  readonly text: string;
}

/** @deprecated Use A2UI v1 components and `A2uiV1SurfaceState`. */
export interface A2uiButtonNode extends A2uiNodeBase {
  readonly type: "button";
  readonly label: string;
  readonly action: ToolAction;
}

/** @deprecated Use A2UI v1 components and `A2uiV1SurfaceState`. */
export interface A2uiTextInputNode extends A2uiNodeBase {
  readonly type: "text-input";
  readonly label: string;
  readonly value?: string;
  readonly binding?: string;
}

/** @deprecated Use A2UI v1 components and `A2uiV1SurfaceState`. */
export type A2uiNode = A2uiButtonNode | A2uiContainerNode | A2uiTextInputNode | A2uiTextNode;

/** @deprecated Use `A2uiV1SurfaceState` from the pinned Candidate adapter. */
export interface A2uiSurface {
  readonly version: typeof A2UI_VERSION;
  readonly root: A2uiNode;
}

/** @deprecated Use `ResolvedA2uiV1JsonlResource`. */
export interface ResolvedA2uiResource {
  readonly uri: string;
  readonly mimeType: typeof A2UI_MIME_TYPE;
  readonly surface: A2uiSurface;
}

/**
 * Resolves the single explicitly typed A2UI resource link in a successful
 * tool result, reads it through the host client, and validates its surface.
 * @deprecated Use `resolveA2uiV1JsonlFromToolResult` with an exact negotiated binding grant.
 */
export async function resolveA2uiResourceFromToolResult(
  reader: A2uiResourceReader,
  toolResult: McpToolCallResult,
): Promise<ResolvedA2uiResource> {
  if (toolResult.isError !== undefined && typeof toolResult.isError !== "boolean") {
    throw new A2uiResourceError("Expected tool result.isError to be a boolean");
  }
  if (toolResult.isError === true) {
    throw new A2uiResourceError("Cannot resolve an A2UI resource from an errored tool result");
  }

  const links = expectContentArray(toolResult.content).flatMap((block, index) =>
    parseA2uiResourceLink(block, `tool result.content[${index}]`),
  );
  if (links.length !== 1) {
    throw new A2uiResourceError(
      `Expected exactly one ${A2UI_MIME_TYPE} resource link, received ${links.length}`,
    );
  }

  const link = links[0]!;

  const readResult = await reader.readResource(link.uri);
  const resources = expectResourceContents(readResult).filter(
    (resource) => resource.uri === link.uri && resource.mimeType === A2UI_MIME_TYPE,
  );
  if (resources.length !== 1) {
    throw new A2uiResourceError(
      `Expected exactly one ${A2UI_MIME_TYPE} text resource for ${link.uri}, received ${resources.length}`,
    );
  }

  const resource = resources[0]!;
  if (typeof resource.text !== "string" || resource.blob !== undefined) {
    throw new A2uiResourceError(`Expected a text-only A2UI resource for ${link.uri}`);
  }

  return {
    uri: link.uri,
    mimeType: A2UI_MIME_TYPE,
    surface: parseA2uiSurface(resource.text),
  };
}

/** @deprecated Use `parseA2uiV1Jsonl` or `parseA2uiV1Envelope`. */
export function parseA2uiSurface(input: string | unknown): A2uiSurface {
  let value: unknown = input;

  if (typeof input === "string") {
    if (input.length > A2UI_MAX_SOURCE_LENGTH) {
      throw new A2uiParseError(`A2UI source exceeds maximum length of ${A2UI_MAX_SOURCE_LENGTH}`);
    }
    try {
      value = JSON.parse(input) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown JSON error";
      throw new A2uiParseError(`Invalid JSON: ${message}`);
    }
  }

  const surface = expectObject(value, "surface");
  expectOnlyKeys(surface, ["root", "version"], "surface");
  const version = expectString(surface.version, "surface.version");
  if (version !== A2UI_VERSION) {
    throw new A2uiParseError(`Unsupported A2UI version: ${version}`);
  }

  const seenIds = new Set<string>();
  return {
    version: A2UI_VERSION,
    root: parseNode(surface.root, "surface.root", seenIds, 0),
  };
}

function parseNode(value: unknown, path: string, seenIds: Set<string>, depth: number): A2uiNode {
  if (depth > A2UI_MAX_DEPTH) {
    throw new A2uiParseError(`A2UI surface exceeds maximum depth of ${A2UI_MAX_DEPTH} at ${path}`);
  }
  if (seenIds.size >= A2UI_MAX_NODES) {
    throw new A2uiParseError(`A2UI surface exceeds maximum of ${A2UI_MAX_NODES} nodes`);
  }

  const node = expectObject(value, path);
  const id = expectString(node.id, `${path}.id`);
  if (seenIds.has(id)) {
    throw new A2uiParseError(`Duplicate node id at ${path}: ${id}`);
  }
  seenIds.add(id);
  const type = expectString(node.type, `${path}.type`);

  switch (type) {
    case "container":
      expectOnlyKeys(node, ["children", "id", "type"], path);
      return {
        id,
        type,
        children: expectArray(node.children, `${path}.children`).map((child, index) =>
          parseNode(child, `${path}.children[${index}]`, seenIds, depth + 1),
        ),
      };
    case "text":
      expectOnlyKeys(node, ["id", "text", "type"], path);
      return { id, type, text: expectString(node.text, `${path}.text`) };
    case "button":
      expectOnlyKeys(node, ["action", "id", "label", "type"], path);
      return {
        id,
        type,
        label: expectString(node.label, `${path}.label`),
        action: parseToolAction(node.action, `${path}.action`),
      };
    case "text-input": {
      expectOnlyKeys(node, ["binding", "id", "label", "type", "value"], path);
      const label = expectString(node.label, `${path}.label`);
      const valueField = optionalString(node.value, `${path}.value`);
      const binding = optionalString(node.binding, `${path}.binding`);

      return {
        id,
        type,
        label,
        ...(valueField === undefined ? {} : { value: valueField }),
        ...(binding === undefined ? {} : { binding }),
      };
    }
    default:
      throw new A2uiParseError(`Unsupported node type at ${path}: ${type}`);
  }
}

function parseToolAction(value: unknown, path: string): ToolAction {
  try {
    return parseMcpNativeAction(value, path);
  } catch (error) {
    const message = error instanceof Error ? error.message : `Invalid tool action at ${path}`;
    throw new A2uiParseError(message, { cause: error });
  }
}

function expectObject(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new A2uiParseError(`Expected an object at ${path}`);
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new A2uiParseError(`Expected a plain object at ${path}`);
  }

  const ownProperties: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(value as object)) {
    ownProperties[key] = (value as Record<string, unknown>)[key];
  }
  return ownProperties;
}

function expectContentArray(value: unknown): readonly McpContent[] {
  if (!Array.isArray(value)) {
    throw new A2uiResourceError("Expected an array at tool result.content");
  }
  if (value.length > A2UI_MAX_MCP_RESULT_ITEMS) {
    throw new A2uiResourceError(
      `tool result.content exceeds maximum of ${A2UI_MAX_MCP_RESULT_ITEMS} items`,
    );
  }
  return value as readonly McpContent[];
}

function parseA2uiResourceLink(value: unknown, path: string): readonly { readonly uri: string }[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new A2uiResourceError(`Expected a content object at ${path}`);
  }
  const block = value as Record<string, unknown>;
  if (typeof block.type !== "string") {
    throw new A2uiResourceError(`Expected a content type at ${path}.type`);
  }
  if (block.type !== "resource_link") {
    return [];
  }
  if (typeof block.name !== "string") {
    throw new A2uiResourceError(`Expected a string at ${path}.name`);
  }
  if (typeof block.uri !== "string") {
    throw new A2uiResourceError(`Expected a string at ${path}.uri`);
  }
  if (block.mimeType !== undefined && typeof block.mimeType !== "string") {
    throw new A2uiResourceError(`Expected a string at ${path}.mimeType`);
  }
  return block.mimeType === A2UI_MIME_TYPE ? [{ uri: block.uri }] : [];
}

function expectResourceContents(value: unknown): McpReadResourceResult["contents"] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new A2uiResourceError("Expected an object from resources/read");
  }
  const contents = (value as Record<string, unknown>).contents;
  if (!Array.isArray(contents)) {
    throw new A2uiResourceError("Expected an array at resource result.contents");
  }
  if (contents.length > A2UI_MAX_MCP_RESULT_ITEMS) {
    throw new A2uiResourceError(
      `resource result.contents exceeds maximum of ${A2UI_MAX_MCP_RESULT_ITEMS} items`,
    );
  }

  return contents.map((content, index) => {
    if (content === null || typeof content !== "object" || Array.isArray(content)) {
      throw new A2uiResourceError(`Expected an object at resource result.contents[${index}]`);
    }
    const resource = content as Record<string, unknown>;
    const uri = resource.uri;
    if (typeof uri !== "string") {
      throw new A2uiResourceError(`Expected a string at resource result.contents[${index}].uri`);
    }
    const mimeType = resource.mimeType;
    if (mimeType !== undefined && typeof mimeType !== "string") {
      throw new A2uiResourceError(
        `Expected a string at resource result.contents[${index}].mimeType`,
      );
    }
    const text = resource.text;
    if (text !== undefined && typeof text !== "string") {
      throw new A2uiResourceError(`Expected a string at resource result.contents[${index}].text`);
    }
    const blob = resource.blob;
    if (blob !== undefined && typeof blob !== "string") {
      throw new A2uiResourceError(`Expected a string at resource result.contents[${index}].blob`);
    }
    const common = {
      uri,
      ...(mimeType === undefined ? {} : { mimeType }),
    };
    if ((text === undefined) === (blob === undefined)) {
      throw new A2uiResourceError(
        `Expected exactly one of text or blob at resource result.contents[${index}]`,
      );
    }
    return text === undefined ? { ...common, blob: blob! } : { ...common, text };
  });
}

function expectArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new A2uiParseError(`Expected an array at ${path}`);
  }
  return value;
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new A2uiParseError(`Expected a string at ${path}`);
  }
  if (value.length > A2UI_MAX_STRING_LENGTH) {
    throw new A2uiParseError(
      `String at ${path} exceeds maximum length of ${A2UI_MAX_STRING_LENGTH}`,
    );
  }
  return value;
}

function optionalString(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : expectString(value, path);
}

function expectOnlyKeys(
  object: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string,
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) {
      throw new A2uiParseError(`Unsupported field ${JSON.stringify(key)} at ${path}`);
    }
  }
}
