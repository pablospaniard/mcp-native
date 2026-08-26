import { parseJsonObject } from "@mcp-native/core";

import { A2uiParseError } from "../errors.js";
import { formatAjvErrors, getA2uiV1RendererToAgentValidator } from "./schemas.js";
import { A2UI_V1_PROTOCOL_VERSION } from "./types.js";
import type { A2uiV1ActionEnvelope, A2uiV1ActionEnvelopeInput } from "./types.js";

const ACTION_KEYS = [
  "context",
  "metadata",
  "name",
  "sourceComponentId",
  "surfaceId",
  "timestamp",
  "userMessage",
] as const;

/**
 * Constructs an owned, schema-validated A2UI renderer-to-agent action envelope.
 * Delivery remains the host transport's responsibility.
 */
export function createA2uiV1ActionEnvelope(input: A2uiV1ActionEnvelopeInput): A2uiV1ActionEnvelope {
  const source = expectPlainObject(input, "A2UI action input");
  rejectUnknownKeys(source, ACTION_KEYS, "A2UI action input");

  const name = expectNonEmptyString(source.name, "action.name");
  const surfaceId = expectNonEmptyString(source.surfaceId, "action.surfaceId");
  const sourceComponentId = expectNonEmptyString(
    source.sourceComponentId,
    "action.sourceComponentId",
  );
  const context = parseJsonObject(source.context, "action.context");
  const timestamp =
    source.timestamp === undefined
      ? new Date().toISOString()
      : expectNonEmptyString(source.timestamp, "action.timestamp");
  const userMessage = optionalString(source.userMessage, "action.userMessage");
  const metadata =
    source.metadata === undefined ? undefined : parseJsonObject(source.metadata, "action.metadata");

  const action: Record<string, unknown> = {
    name,
    surfaceId,
    sourceComponentId,
    timestamp,
    context,
  };
  if (userMessage !== undefined) {
    action.userMessage = userMessage;
  }
  if (metadata !== undefined) {
    action.metadata = metadata;
  }
  const envelope = {
    version: A2UI_V1_PROTOCOL_VERSION,
    action,
  };
  const validate = getA2uiV1RendererToAgentValidator();
  if (!validate(envelope)) {
    throw new A2uiParseError(
      `A2UI renderer-to-agent action schema validation failed: ${formatAjvErrors(validate)}`,
    );
  }
  return envelope as unknown as A2uiV1ActionEnvelope;
}

function expectPlainObject(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new A2uiParseError(`Expected an object at ${path}`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new A2uiParseError(`Expected a plain object at ${path}`);
  }
  return value as Record<string, unknown>;
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

function expectNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new A2uiParseError(`Expected a non-empty string at ${path}`);
  }
  return value;
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new A2uiParseError(`Expected a string at ${path}`);
  }
  return value;
}
