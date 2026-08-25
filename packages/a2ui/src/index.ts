import { parseMcpNativeAction } from "@mcp-native/core";
import type {
  McpContent,
  McpReadResourceResult,
  McpToolCallResult,
  ToolAction,
} from "@mcp-native/core";

export const A2UI_VERSION = "0.1" as const;
export const A2UI_MIME_TYPE = "application/a2ui+json" as const;

interface A2uiNodeBase {
  readonly id: string;
}

export interface A2uiContainerNode extends A2uiNodeBase {
  readonly type: "container";
  readonly children: readonly A2uiNode[];
}

export interface A2uiTextNode extends A2uiNodeBase {
  readonly type: "text";
  readonly text: string;
}

export interface A2uiButtonNode extends A2uiNodeBase {
  readonly type: "button";
  readonly label: string;
  readonly action: ToolAction;
}

export interface A2uiTextInputNode extends A2uiNodeBase {
  readonly type: "text-input";
  readonly label: string;
  readonly value?: string;
  readonly binding?: string;
}

export type A2uiNode = A2uiButtonNode | A2uiContainerNode | A2uiTextInputNode | A2uiTextNode;

export interface A2uiSurface {
  readonly version: typeof A2UI_VERSION;
  readonly root: A2uiNode;
}

export interface A2uiResourceReader {
  readResource(uri: string): Promise<McpReadResourceResult>;
}

export interface ResolvedA2uiResource {
  readonly uri: string;
  readonly mimeType: typeof A2UI_MIME_TYPE;
  readonly surface: A2uiSurface;
}

export class A2uiParseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "A2uiParseError";
  }
}

export class A2uiResourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "A2uiResourceError";
  }
}

/**
 * Resolves the single explicitly typed A2UI resource link in a successful
 * tool result, reads it through the host client, and validates its surface.
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

export function parseA2uiSurface(input: string | unknown): A2uiSurface {
  let value: unknown = input;

  if (typeof input === "string") {
    try {
      value = JSON.parse(input) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown JSON error";
      throw new A2uiParseError(`Invalid JSON: ${message}`);
    }
  }

  const surface = expectObject(value, "surface");
  const version = expectString(surface.version, "surface.version");
  if (version !== A2UI_VERSION) {
    throw new A2uiParseError(`Unsupported A2UI version: ${version}`);
  }

  const seenIds = new Set<string>();
  return {
    version: A2UI_VERSION,
    root: parseNode(surface.root, "surface.root", seenIds),
  };
}

function parseNode(value: unknown, path: string, seenIds: Set<string>): A2uiNode {
  const node = expectObject(value, path);
  const id = expectString(node.id, `${path}.id`);
  if (seenIds.has(id)) {
    throw new A2uiParseError(`Duplicate node id at ${path}: ${id}`);
  }
  seenIds.add(id);
  const type = expectString(node.type, `${path}.type`);

  switch (type) {
    case "container":
      return {
        id,
        type,
        children: expectArray(node.children, `${path}.children`).map((child, index) =>
          parseNode(child, `${path}.children[${index}]`, seenIds),
        ),
      };
    case "text":
      return { id, type, text: expectString(node.text, `${path}.text`) };
    case "button":
      return {
        id,
        type,
        label: expectString(node.label, `${path}.label`),
        action: parseToolAction(node.action, `${path}.action`),
      };
    case "text-input": {
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
  return value as Record<string, unknown>;
}

function expectContentArray(value: unknown): readonly McpContent[] {
  if (!Array.isArray(value)) {
    throw new A2uiResourceError("Expected an array at tool result.content");
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
  return value;
}

function optionalString(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : expectString(value, path);
}
