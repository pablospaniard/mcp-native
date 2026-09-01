import type { McpContent, McpReadResourceResult, McpToolCallResult } from "@mcp-native/core";

import { isA2uiMcpBindingGrant } from "../binding.js";
import type { A2uiMcpBindingNegotiation } from "../binding.js";
import { A2uiResourceError } from "../errors.js";
import { A2UI_MIME_TYPE, type A2uiResourceReader } from "../mime.js";
import { parseA2uiV1Jsonl } from "./parse.js";
import type { A2uiV1EnvelopeParseOptions } from "./parse.js";
import type { A2uiV1Envelope } from "./types.js";

export interface ResolvedA2uiV1JsonlResource {
  readonly uri: string;
  readonly mimeType: typeof A2UI_MIME_TYPE;
  readonly envelopes: readonly A2uiV1Envelope[];
}

const A2UI_V1_MAX_MCP_RESULT_ITEMS = 1_024;

/**
 * Resolves the single A2UI resource link in a successful tool result and parses
 * its text body as an ordered v1 JSONL envelope batch. Does not invoke the
 * custom `0.1` surface parser.
 *
 * Callers must only use this after mutual binding negotiation; MIME type alone
 * does not grant the transport.
 */
export async function resolveA2uiV1JsonlFromToolResult(
  reader: A2uiResourceReader,
  toolResult: McpToolCallResult,
  negotiation: A2uiMcpBindingNegotiation,
  options: A2uiV1EnvelopeParseOptions = {},
): Promise<ResolvedA2uiV1JsonlResource> {
  if (!isA2uiMcpBindingGrant(negotiation)) {
    throw new A2uiResourceError(
      "Cannot resolve an A2UI v1 JSONL resource without the exact negotiated binding",
    );
  }
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
      `Expected exactly one ${A2UI_MIME_TYPE} resource_link, found ${links.length}`,
    );
  }
  const link = links[0]!;

  const contents = expectResourceContents(await reader.readResource(link.uri)).filter(
    (item) => item.uri === link.uri && item.mimeType === A2UI_MIME_TYPE,
  );
  if (contents.length !== 1) {
    throw new A2uiResourceError(
      `Expected exactly one ${A2UI_MIME_TYPE} resource for ${link.uri}, found ${contents.length}`,
    );
  }
  const resource = contents[0]!;
  if (resource.text === undefined || resource.blob !== undefined) {
    throw new A2uiResourceError(`Expected a text-only A2UI JSONL resource for ${link.uri}`);
  }

  return {
    uri: link.uri,
    mimeType: A2UI_MIME_TYPE,
    envelopes: parseA2uiV1Jsonl(resource.text, options),
  };
}

function expectContentArray(value: unknown): readonly McpContent[] {
  if (!Array.isArray(value)) {
    throw new A2uiResourceError("Expected an array at tool result.content");
  }
  if (value.length > A2UI_V1_MAX_MCP_RESULT_ITEMS) {
    throw new A2uiResourceError(
      `tool result.content exceeds maximum of ${A2UI_V1_MAX_MCP_RESULT_ITEMS} items`,
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
  const result = value as Record<string, unknown>;
  if (!Array.isArray(result.contents)) {
    throw new A2uiResourceError("Expected an array at resource result.contents");
  }
  if (result.contents.length > A2UI_V1_MAX_MCP_RESULT_ITEMS) {
    throw new A2uiResourceError(
      `resource result.contents exceeds maximum of ${A2UI_V1_MAX_MCP_RESULT_ITEMS} items`,
    );
  }

  return result.contents.map((item, index) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new A2uiResourceError(`Expected an object at resource result.contents[${index}]`);
    }
    const resource = item as Record<string, unknown>;
    if (typeof resource.uri !== "string") {
      throw new A2uiResourceError(`Expected a string at resource result.contents[${index}].uri`);
    }
    if (resource.mimeType !== undefined && typeof resource.mimeType !== "string") {
      throw new A2uiResourceError(
        `Expected a string at resource result.contents[${index}].mimeType`,
      );
    }
    if (resource.text !== undefined && typeof resource.text !== "string") {
      throw new A2uiResourceError(`Expected a string at resource result.contents[${index}].text`);
    }
    if (resource.blob !== undefined && typeof resource.blob !== "string") {
      throw new A2uiResourceError(`Expected a string at resource result.contents[${index}].blob`);
    }
    if ((resource.text === undefined) === (resource.blob === undefined)) {
      throw new A2uiResourceError(
        `Expected exactly one of text or blob at resource result.contents[${index}]`,
      );
    }
    if (resource.text !== undefined) {
      return {
        uri: resource.uri,
        text: resource.text,
        ...(resource.mimeType === undefined ? {} : { mimeType: resource.mimeType }),
      };
    }
    return {
      uri: resource.uri,
      blob: resource.blob as string,
      ...(resource.mimeType === undefined ? {} : { mimeType: resource.mimeType }),
    };
  });
}
