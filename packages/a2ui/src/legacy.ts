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

/** @deprecated Use the pinned A2UI v1 Candidate APIs exported from `@mcp-native/a2ui`. */
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
 * Resolves and validates the frozen custom `0.1` resource convention.
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
  if (block.type !== "resource_link") return [];
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
    const common = { uri, ...(mimeType === undefined ? {} : { mimeType }) };
    if ((text === undefined) === (blob === undefined)) {
      throw new A2uiResourceError(
        `Expected exactly one of text or blob at resource result.contents[${index}]`,
      );
    }
    return text === undefined ? { ...common, blob: blob! } : { ...common, text };
  });
}

function expectArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new A2uiParseError(`Expected an array at ${path}`);
  return value;
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== "string") throw new A2uiParseError(`Expected a string at ${path}`);
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
