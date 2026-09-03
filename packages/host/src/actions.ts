import { A2UI_V1_MAX_SOURCE_LENGTH, parseA2uiV1RendererToAgentEnvelope } from "@mcp-native/a2ui";
import type { A2uiV1ActionDeliveryPolicy, A2uiV1ActionEnvelope } from "@mcp-native/a2ui";
import { parseJsonObject, parseMcpNativeAction } from "@mcp-native/core";
import type { JsonObject, McpNativeAction, McpNativeActionPolicy } from "@mcp-native/core";

export interface McpNativeHostA2uiActionAuthorizationRequest {
  readonly kind: "a2ui";
  readonly envelope: A2uiV1ActionEnvelope;
  readonly dataModel?: JsonObject;
}

export interface McpNativeHostMcpAppsActionAuthorizationRequest {
  readonly kind: "mcp-app";
  readonly action: McpNativeAction;
}

/** Exact, protocol-validated input presented to the application's shared authorization policy. */
export type McpNativeHostActionAuthorizationRequest =
  | McpNativeHostA2uiActionAuthorizationRequest
  | McpNativeHostMcpAppsActionAuthorizationRequest;

/** Only an exact boolean `true` authorizes the action. */
export type McpNativeHostActionAuthorizationPolicy = (
  request: McpNativeHostActionAuthorizationRequest,
) => boolean | Promise<boolean>;

export interface McpNativeHostActionAuthorizationOptions {
  /** Omission denies every renderer- or app-originated action. */
  readonly authorize?: McpNativeHostActionAuthorizationPolicy;
}

export interface McpNativeHostActionAuthorization {
  /** Install as the policy in `createA2uiV1ActionDeliveryHandler`. */
  readonly authorizeA2uiAction: A2uiV1ActionDeliveryPolicy;
  /** Install as `McpAppsBridge.handlers.authorizeToolCall`. */
  readonly authorizeMcpAppsToolCall: McpNativeActionPolicy;
}

/**
 * Creates one fail-closed application authorization boundary for A2UI and MCP Apps actions.
 *
 * Protocol parsing and delivery remain in their owning packages. This boundary reconstructs the
 * exact policy input again, makes it immutable, and serializes reviews across both protocols so a
 * server cannot accumulate overlapping consent prompts. Omitted policy, overlap, and any decision
 * other than the boolean `true` deny delivery.
 */
export function createMcpNativeHostActionAuthorization(
  options: McpNativeHostActionAuthorizationOptions = {},
): McpNativeHostActionAuthorization {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Expected MCP native host action authorization options");
  }
  if (options.authorize !== undefined && typeof options.authorize !== "function") {
    throw new TypeError("MCP native host action authorization policy must be a function");
  }
  const authorize = options.authorize;

  let reviewRunning = false;

  const review = async (
    createRequest: () => McpNativeHostActionAuthorizationRequest,
  ): Promise<boolean> => {
    if (authorize === undefined || reviewRunning) return false;
    reviewRunning = true;
    try {
      const decision = await authorize(createRequest());
      if (decision !== true && decision !== false) {
        throw new TypeError("MCP native host action authorization policy must return a boolean");
      }
      return decision;
    } finally {
      reviewRunning = false;
    }
  };

  return Object.freeze({
    authorizeA2uiAction(envelope: A2uiV1ActionEnvelope, dataModel?: JsonObject) {
      return review(() => createA2uiRequest(envelope, dataModel));
    },
    authorizeMcpAppsToolCall(action: McpNativeAction) {
      return review(() => createMcpAppsRequest(action));
    },
  });
}

function createA2uiRequest(
  envelopeInput: A2uiV1ActionEnvelope,
  dataModelInput?: JsonObject,
): McpNativeHostA2uiActionAuthorizationRequest {
  const parsed = parseA2uiV1RendererToAgentEnvelope(envelopeInput);
  if (!("action" in parsed)) {
    throw new TypeError("Expected an A2UI v1 action envelope for host authorization");
  }
  freezeOwnedValue(parsed);
  const envelope = parsed;
  const dataModel =
    dataModelInput === undefined
      ? undefined
      : parseJsonObject(dataModelInput, "A2UI host authorization data model", {
          maxTotalStringCodeUnits: A2UI_V1_MAX_SOURCE_LENGTH,
        });
  if (dataModel !== undefined) freezeOwnedValue(dataModel);
  return Object.freeze({
    kind: "a2ui",
    envelope,
    ...(dataModel === undefined ? {} : { dataModel }),
  });
}

function createMcpAppsRequest(
  actionInput: McpNativeAction,
): McpNativeHostMcpAppsActionAuthorizationRequest {
  const action = parseMcpNativeAction(actionInput, "MCP Apps host authorization action");
  if (action.arguments !== undefined) freezeOwnedValue(action.arguments);
  Object.freeze(action);
  return Object.freeze({ kind: "mcp-app", action });
}

function freezeOwnedValue(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const child of value) freezeOwnedValue(child);
  } else {
    for (const child of Object.values(value)) freezeOwnedValue(child);
  }
  Object.freeze(value);
}
