import { parseJsonObject } from "@mcp-native/core";

import { A2uiParseError } from "../errors.js";
import {
  formatAjvErrors,
  getA2uiV1AgentCapabilitiesValidator,
  getA2uiV1RendererCapabilitiesValidator,
} from "./schemas.js";
import { A2UI_V1_MAX_SOURCE_LENGTH } from "./types.js";
import type {
  A2uiV1AgentCapabilities,
  A2uiV1CapabilityNegotiation,
  A2uiV1RendererCapabilities,
  A2uiV1RendererCapabilitiesOptions,
} from "./types.js";

const VERSION_KEY = "v1.0";

/** Parses untrusted agent capability metadata and applies the normative v1 requirements. */
export function parseA2uiV1AgentCapabilities(input: string | unknown): A2uiV1AgentCapabilities {
  const source = reconstructCapabilities(input, "agent capabilities");
  const version = expectClosedVersionObject(source, [
    "acceptsInlineCatalogs",
    "supportedCatalogIds",
  ]);
  const validate = getA2uiV1AgentCapabilitiesValidator();
  if (!validate(source)) {
    throw new A2uiParseError(
      `A2UI v1 agent capability schema validation failed: ${formatAjvErrors(validate)}`,
    );
  }
  if (!Object.hasOwn(version, "supportedCatalogIds")) {
    throw new A2uiParseError(
      "A2UI v1 agent capabilities must declare supportedCatalogIds as required by the protocol",
    );
  }

  return freezeAgentCapabilities(
    parseCatalogIds(version.supportedCatalogIds, "agent capabilities.v1.0.supportedCatalogIds"),
    version.acceptsInlineCatalogs === true,
  );
}

/**
 * Parses renderer capability metadata without activating inline catalogs.
 * Catalog IDs are declarations only; callers must advertise only fully implemented host catalogs.
 */
export function parseA2uiV1RendererCapabilities(
  input: string | unknown,
): A2uiV1RendererCapabilities {
  const source = reconstructCapabilities(input, "renderer capabilities");
  const version = expectClosedVersionObject(source, ["inlineCatalogs", "supportedCatalogIds"]);
  if (Object.hasOwn(version, "inlineCatalogs")) {
    throw new A2uiParseError(
      "A2UI v1 inline renderer catalogs are not supported without an explicit host catalog policy",
    );
  }
  const validate = getA2uiV1RendererCapabilitiesValidator();
  if (!validate(source)) {
    throw new A2uiParseError(
      `A2UI v1 renderer capability schema validation failed: ${formatAjvErrors(validate)}`,
    );
  }

  return freezeRendererCapabilities(
    parseCatalogIds(version.supportedCatalogIds, "renderer capabilities.v1.0.supportedCatalogIds"),
  );
}

/** Constructs closed renderer metadata from host-owned catalog declarations. */
export function createA2uiV1RendererCapabilities(
  options: A2uiV1RendererCapabilitiesOptions,
): A2uiV1RendererCapabilities {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new A2uiParseError("Expected A2UI v1 renderer capability options to be an object");
  }
  const source = options as unknown as Record<string, unknown>;
  rejectUnknownKeys(source, ["supportedCatalogIds"], "renderer capability options");
  return parseA2uiV1RendererCapabilities({
    [VERSION_KEY]: { supportedCatalogIds: source.supportedCatalogIds },
  });
}

/** Finds exact catalog IDs that both peers explicitly declare. */
export function negotiateA2uiV1Capabilities(
  agentInput: string | unknown,
  rendererInput: string | unknown,
): A2uiV1CapabilityNegotiation {
  const agent = parseA2uiV1AgentCapabilities(agentInput);
  const renderer = parseA2uiV1RendererCapabilities(rendererInput);
  const agentCatalogIds = new Set(agent[VERSION_KEY].supportedCatalogIds);
  const supportedCatalogIds = renderer[VERSION_KEY].supportedCatalogIds.filter((catalogId) =>
    agentCatalogIds.has(catalogId),
  );
  if (supportedCatalogIds.length === 0) {
    return Object.freeze({
      kind: "fallback",
      protocolVersion: VERSION_KEY,
      reason: "no-shared-catalog",
    });
  }
  return Object.freeze({
    kind: "negotiated",
    protocolVersion: VERSION_KEY,
    supportedCatalogIds: Object.freeze(supportedCatalogIds),
    inlineCatalogsEnabled: false,
  });
}

function reconstructCapabilities(input: string | unknown, path: string): Record<string, unknown> {
  let value = input;
  if (typeof input === "string") {
    if (input.length > A2UI_V1_MAX_SOURCE_LENGTH) {
      throw new A2uiParseError(
        `A2UI v1 ${path} exceed maximum length of ${A2UI_V1_MAX_SOURCE_LENGTH}`,
      );
    }
    try {
      value = JSON.parse(input) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown JSON error";
      throw new A2uiParseError(`Invalid A2UI v1 ${path} JSON: ${message}`, { cause: error });
    }
  }
  try {
    return parseJsonObject(value, path);
  } catch (error) {
    const message = error instanceof Error ? error.message : `Invalid A2UI v1 ${path}`;
    throw new A2uiParseError(message, { cause: error });
  }
}

function expectClosedVersionObject(
  source: Record<string, unknown>,
  allowedVersionKeys: readonly string[],
): Record<string, unknown> {
  rejectUnknownKeys(source, [VERSION_KEY], "capabilities");
  const version = source[VERSION_KEY];
  if (version === null || typeof version !== "object" || Array.isArray(version)) {
    throw new A2uiParseError(`Expected an object at capabilities.${VERSION_KEY}`);
  }
  rejectUnknownKeys(
    version as Record<string, unknown>,
    allowedVersionKeys,
    `capabilities.${VERSION_KEY}`,
  );
  return version as Record<string, unknown>;
}

function parseCatalogIds(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new A2uiParseError(`Expected an array at ${path}`);
  }
  const ids = new Set<string>();
  for (const [index, catalogId] of value.entries()) {
    if (typeof catalogId !== "string" || catalogId.length === 0) {
      throw new A2uiParseError(`Expected a non-empty string at ${path}[${index}]`);
    }
    if (ids.has(catalogId)) {
      throw new A2uiParseError(`Duplicate A2UI catalog ID ${JSON.stringify(catalogId)} at ${path}`);
    }
    ids.add(catalogId);
  }
  return Object.freeze([...ids]);
}

function freezeAgentCapabilities(
  supportedCatalogIds: readonly string[],
  acceptsInlineCatalogs: boolean,
): A2uiV1AgentCapabilities {
  return Object.freeze({
    [VERSION_KEY]: Object.freeze({ supportedCatalogIds, acceptsInlineCatalogs }),
  });
}

function freezeRendererCapabilities(
  supportedCatalogIds: readonly string[],
): A2uiV1RendererCapabilities {
  return Object.freeze({
    [VERSION_KEY]: Object.freeze({ supportedCatalogIds }),
  });
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new A2uiParseError(`Unexpected field ${JSON.stringify(key)} at ${path}`);
    }
  }
}
