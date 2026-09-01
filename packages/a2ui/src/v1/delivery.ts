import { parseJsonObject } from "@mcp-native/core";
import type { JsonObject } from "@mcp-native/core";

import { A2uiParseError } from "../errors.js";
import { parseA2uiV1RendererToAgentEnvelope } from "./action.js";
import { A2UI_V1_MAX_SOURCE_LENGTH } from "./types.js";
import type { A2uiV1ActionEnvelope } from "./types.js";

export type A2uiV1ActionDeliveryPolicy = (
  envelope: A2uiV1ActionEnvelope,
  dataModel?: JsonObject,
) => boolean | Promise<boolean>;

export type A2uiV1ActionDeliveryHandler = (
  envelope: A2uiV1ActionEnvelope,
  dataModel?: JsonObject,
) => Promise<"delivered" | "denied">;

export interface A2uiV1ActionDeliveryOptions {
  /** Exact host decision required before one validated action leaves the host boundary. */
  readonly authorize: A2uiV1ActionDeliveryPolicy;
  /** Host-owned transport delivery. This package never selects or constructs the transport. */
  readonly deliver: (
    envelope: A2uiV1ActionEnvelope,
    dataModel?: JsonObject,
  ) => void | Promise<void>;
  /** Optional observation of policy refusal or a concurrent action denied before review. */
  readonly onDenied?: (envelope: A2uiV1ActionEnvelope, reason: "busy" | "policy") => void;
}

/**
 * Creates a fail-closed host delivery boundary for official A2UI v1 actions.
 *
 * Parsing remains non-authorizing. Policy input and transport input are separately reconstructed so
 * an asynchronous reviewer cannot mutate the action that is eventually delivered. Only one review
 * or delivery may be active; overlapping actions are denied instead of accumulating prompts.
 */
export function createA2uiV1ActionDeliveryHandler(
  options: A2uiV1ActionDeliveryOptions,
): A2uiV1ActionDeliveryHandler {
  if (
    options === null ||
    typeof options !== "object" ||
    typeof options.authorize !== "function" ||
    typeof options.deliver !== "function" ||
    (options.onDenied !== undefined && typeof options.onDenied !== "function")
  ) {
    throw new A2uiParseError("A2UI action delivery requires valid host callbacks");
  }

  let deliveryRunning = false;
  return async (envelope, dataModel) => {
    const policyEnvelope = parseActionEnvelope(envelope);
    const deliveryEnvelope = parseActionEnvelope(envelope);
    const policyDataModel = parseOptionalDataModel(dataModel);
    const deliveryDataModel = parseOptionalDataModel(dataModel);

    if (deliveryRunning) {
      options.onDenied?.(policyEnvelope, "busy");
      return "denied";
    }
    deliveryRunning = true;
    try {
      const decision = await options.authorize(policyEnvelope, policyDataModel);
      if (decision !== true && decision !== false) {
        throw new A2uiParseError("A2UI action delivery policy must return a boolean");
      }
      if (!decision) {
        options.onDenied?.(policyEnvelope, "policy");
        return "denied";
      }
      await options.deliver(deliveryEnvelope, deliveryDataModel);
      return "delivered";
    } finally {
      deliveryRunning = false;
    }
  };
}

function parseActionEnvelope(value: unknown): A2uiV1ActionEnvelope {
  const envelope = parseA2uiV1RendererToAgentEnvelope(value);
  if (!("action" in envelope)) {
    throw new A2uiParseError("Expected an A2UI v1 action envelope for host delivery");
  }
  return envelope;
}

function parseOptionalDataModel(value: unknown): JsonObject | undefined {
  return value === undefined
    ? undefined
    : parseJsonObject(value, "A2UI action delivery data model", {
        maxTotalStringCodeUnits: A2UI_V1_MAX_SOURCE_LENGTH,
      });
}
