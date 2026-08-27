import { parseJsonObject, parseJsonValue } from "@mcp-native/core";
import type { JsonObject, JsonValue } from "@mcp-native/core";

import { A2uiParseError } from "../errors.js";
import { formatAjvErrors, getA2uiV1RendererToAgentValidator } from "./schemas.js";
import { A2UI_V1_MAX_SOURCE_LENGTH, A2UI_V1_PROTOCOL_VERSION } from "./types.js";
import type {
  A2uiV1ActionEnvelope,
  A2uiV1ActionEnvelopeInput,
  A2uiV1RendererToAgentEnvelope,
  A2uiV1RendererToAgentEnvelopeKind,
} from "./types.js";

const ACTION_KEYS = [
  "context",
  "metadata",
  "name",
  "sourceComponentId",
  "surfaceId",
  "timestamp",
  "userMessage",
] as const;

const RENDERER_TO_AGENT_KEYS = [
  "action",
  "callAgentFunction",
  "error",
  "rendererFunctionResponse",
] as const satisfies readonly A2uiV1RendererToAgentEnvelopeKind[];

const VALIDATION_ERROR_CODES = new Set([
  "VALIDATION_FAILED",
  "UNALLOWED_CHILD",
  "UNALLOWED_PARENT",
]);

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
  return parseA2uiV1RendererToAgentEnvelope(envelope) as A2uiV1ActionEnvelope;
}

/**
 * Parses and owns one message from the complete pinned renderer-to-agent schema.
 * Successful parsing is data validation only; it does not authorize function execution,
 * transport delivery, device access, or trust in a renderer-reported error.
 */
export function parseA2uiV1RendererToAgentEnvelope(
  input: string | unknown,
): A2uiV1RendererToAgentEnvelope {
  const value = parseRendererInput(input);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new A2uiParseError("Expected an object at renderer-to-agent envelope");
  }

  const envelope = value as JsonObject;
  if (envelope.version !== A2UI_V1_PROTOCOL_VERSION) {
    throw new A2uiParseError(
      `Unsupported A2UI renderer-to-agent protocol version: ${JSON.stringify(envelope.version)}`,
    );
  }
  const keys = Object.keys(envelope).filter((key) => key !== "version");
  if (keys.length !== 1 || !isRendererToAgentKey(keys[0])) {
    throw new A2uiParseError(
      "Expected exactly one of action, callAgentFunction, rendererFunctionResponse, or error",
    );
  }

  const validate = getA2uiV1RendererToAgentValidator();
  if (!validate(envelope)) {
    throw new A2uiParseError(
      `A2UI renderer-to-agent schema validation failed: ${formatAjvErrors(validate)}`,
    );
  }
  validateRendererMessageSemantics(envelope, keys[0]);
  return envelope as unknown as A2uiV1RendererToAgentEnvelope;
}

function parseRendererInput(input: string | unknown): JsonValue {
  let value: unknown = input;
  if (typeof input === "string") {
    if (input.length > A2UI_V1_MAX_SOURCE_LENGTH) {
      throw new A2uiParseError(
        `A2UI renderer-to-agent envelope exceeds maximum length of ${A2UI_V1_MAX_SOURCE_LENGTH}`,
      );
    }
    try {
      value = JSON.parse(input) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown JSON error";
      throw new A2uiParseError(`Invalid renderer-to-agent JSON: ${message}`, { cause: error });
    }
  }
  try {
    return parseJsonValue(value, "renderer-to-agent envelope");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid renderer-to-agent envelope";
    throw new A2uiParseError(message, { cause: error });
  }
}

function validateRendererMessageSemantics(
  envelope: JsonObject,
  kind: A2uiV1RendererToAgentEnvelopeKind,
): void {
  const message = expectPlainObject(envelope[kind], `renderer-to-agent.${kind}`);
  switch (kind) {
    case "action":
      rejectUnknownKeys(message, ACTION_KEYS, "renderer-to-agent.action");
      expectNonEmptyString(message.name, "renderer-to-agent.action.name");
      expectNonEmptyString(message.surfaceId, "renderer-to-agent.action.surfaceId");
      expectNonEmptyString(message.sourceComponentId, "renderer-to-agent.action.sourceComponentId");
      return;
    case "callAgentFunction": {
      expectNonEmptyString(
        message.functionCallId,
        "renderer-to-agent.callAgentFunction.functionCallId",
      );
      expectNonEmptyString(message.surfaceId, "renderer-to-agent.callAgentFunction.surfaceId");
      const call = expectPlainObject(
        message.callFunction,
        "renderer-to-agent.callAgentFunction.callFunction",
      );
      expectNonEmptyString(call.call, "renderer-to-agent.callAgentFunction.callFunction.call");
      return;
    }
    case "rendererFunctionResponse":
      expectNonEmptyString(
        message.functionCallId,
        "renderer-to-agent.rendererFunctionResponse.functionCallId",
      );
      if (message.error !== undefined) {
        const error = expectPlainObject(
          message.error,
          "renderer-to-agent.rendererFunctionResponse.error",
        );
        expectNonEmptyString(error.code, "renderer-to-agent.rendererFunctionResponse.error.code");
        expectNonEmptyString(
          error.message,
          "renderer-to-agent.rendererFunctionResponse.error.message",
        );
      }
      return;
    case "error": {
      const code = expectNonEmptyString(message.code, "renderer-to-agent.error.code");
      expectNonEmptyString(message.message, "renderer-to-agent.error.message");
      if (VALIDATION_ERROR_CODES.has(code)) {
        expectNonEmptyString(message.surfaceId, "renderer-to-agent.error.surfaceId");
        expectJsonPointer(message.path, "renderer-to-agent.error.path");
      } else if (message.surfaceId !== undefined) {
        expectNonEmptyString(message.surfaceId, "renderer-to-agent.error.surfaceId");
      } else {
        expectNonEmptyString(message.functionCallId, "renderer-to-agent.error.functionCallId");
      }
    }
  }
}

function isRendererToAgentKey(
  value: string | undefined,
): value is A2uiV1RendererToAgentEnvelopeKind {
  return value !== undefined && (RENDERER_TO_AGENT_KEYS as readonly string[]).includes(value);
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

function expectJsonPointer(value: unknown, path: string): string {
  if (typeof value !== "string" || (value.length > 0 && !value.startsWith("/"))) {
    throw new A2uiParseError(`Expected a JSON Pointer at ${path}`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "~") {
      continue;
    }
    const escape = value[index + 1];
    if (escape !== "0" && escape !== "1") {
      throw new A2uiParseError(`Invalid JSON Pointer escape at ${path}`);
    }
    index += 1;
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
