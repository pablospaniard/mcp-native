import { parseJsonValue } from "@mcp-native/core";
import type { JsonValue } from "@mcp-native/core";

import { A2uiParseError } from "../errors.js";
import { formatAjvErrors, getA2uiV1EnvelopeValidator } from "./schemas.js";
import type { A2uiV1Envelope, A2uiV1EnvelopeKind } from "./types.js";
import {
  A2UI_V1_MAX_ENVELOPES,
  A2UI_V1_MAX_SOURCE_LENGTH,
  A2UI_V1_PROTOCOL_VERSION,
} from "./types.js";

const LIFECYCLE_KEYS = [
  "createSurface",
  "updateComponents",
  "updateDataModel",
  "deleteSurface",
] as const satisfies readonly A2uiV1EnvelopeKind[];

const UNSUPPORTED_KEYS = ["callRendererFunction", "agentFunctionResponse"] as const;

/**
 * Validates one official A2UI v1.0 agent-to-renderer lifecycle envelope.
 * Function-call envelopes are rejected in this milestone.
 */
export function parseA2uiV1Envelope(input: string | unknown): A2uiV1Envelope {
  let value: unknown = input;

  if (typeof input === "string") {
    if (input.length > A2UI_V1_MAX_SOURCE_LENGTH) {
      throw new A2uiParseError(
        `A2UI v1 envelope exceeds maximum length of ${A2UI_V1_MAX_SOURCE_LENGTH}`,
      );
    }
    try {
      value = JSON.parse(input) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown JSON error";
      throw new A2uiParseError(`Invalid JSON: ${message}`, { cause: error });
    }
  }

  let reconstructed: JsonValue;
  try {
    reconstructed = parseJsonValue(value, "envelope");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON envelope";
    throw new A2uiParseError(message, { cause: error });
  }

  if (reconstructed === null || typeof reconstructed !== "object" || Array.isArray(reconstructed)) {
    throw new A2uiParseError("Expected an object at envelope");
  }

  const envelopeObject = reconstructed as {
    readonly [key: string]: JsonValue;
    readonly version?: JsonValue;
  };
  const keys = Object.keys(envelopeObject).filter((key) => key !== "version");
  for (const key of UNSUPPORTED_KEYS) {
    if (Object.hasOwn(envelopeObject, key)) {
      throw new A2uiParseError(
        `Unsupported A2UI v1 envelope message ${JSON.stringify(key)}; only lifecycle messages are implemented`,
      );
    }
  }
  if (keys.length !== 1 || !isLifecycleKey(keys[0])) {
    throw new A2uiParseError(
      "Expected exactly one of createSurface, updateComponents, updateDataModel, or deleteSurface",
    );
  }
  if (envelopeObject.version !== A2UI_V1_PROTOCOL_VERSION) {
    throw new A2uiParseError(
      `Unsupported A2UI protocol version: ${JSON.stringify(envelopeObject.version)}`,
    );
  }

  const validate = getA2uiV1EnvelopeValidator();
  if (!validate(envelopeObject)) {
    throw new A2uiParseError(`A2UI v1 schema validation failed: ${formatAjvErrors(validate)}`);
  }

  return envelopeObject as A2uiV1Envelope;
}

/**
 * Parses a UTF-8 JSONL batch of agent-to-renderer envelopes.
 * Empty lines are skipped. Any invalid line rejects the entire batch.
 */
export function parseA2uiV1Jsonl(text: string): readonly A2uiV1Envelope[] {
  if (typeof text !== "string") {
    throw new A2uiParseError("Expected a string JSONL body");
  }
  if (text.length > A2UI_V1_MAX_SOURCE_LENGTH) {
    throw new A2uiParseError(
      `A2UI v1 JSONL source exceeds maximum length of ${A2UI_V1_MAX_SOURCE_LENGTH}`,
    );
  }

  const envelopes: A2uiV1Envelope[] = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || line.trim().length === 0) {
      continue;
    }
    if (envelopes.length >= A2UI_V1_MAX_ENVELOPES) {
      throw new A2uiParseError(
        `A2UI v1 JSONL exceeds maximum of ${A2UI_V1_MAX_ENVELOPES} envelopes`,
      );
    }
    try {
      envelopes.push(parseA2uiV1Envelope(line));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid envelope";
      throw new A2uiParseError(`Invalid A2UI v1 JSONL at line ${index + 1}: ${message}`, {
        cause: error,
      });
    }
  }

  return envelopes;
}

function isLifecycleKey(value: string | undefined): value is A2uiV1EnvelopeKind {
  return value !== undefined && (LIFECYCLE_KEYS as readonly string[]).includes(value);
}
