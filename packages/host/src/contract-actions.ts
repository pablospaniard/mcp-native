import type { JsonObject } from "@mcp-native/core";
import {
  createMcpNativeHostActionAuthorization,
  type McpNativeHostActionAuthorization,
  type McpNativeHostActionAuthorizationRequest,
} from "./actions.js";
import type { ContractDescriptor } from "./contracts.js";
import type { McpNativeHostAbortSignal } from "./controller.js";
import { keys, object } from "./contracts-schema.js";

export interface ContractActionRequest {
  readonly kind: "contract";
  readonly descriptor: ContractDescriptor;
  readonly model: JsonObject;
  readonly event: JsonObject;
  readonly signal: McpNativeHostAbortSignal;
}

export type ContractActionAuthorizationRequest =
  | McpNativeHostActionAuthorizationRequest
  | ContractActionRequest;
export interface ContractActionAuthorizationOptions {
  readonly authorize?: (request: ContractActionAuthorizationRequest) => boolean | Promise<boolean>;
}
/** Factory-issued shared review gate. Its built-in policies retain their existing protocol validation. */
export interface ContractActionAuthorization extends McpNativeHostActionAuthorization {}

export const authorizationReviews = new WeakMap<
  ContractActionAuthorization,
  (request: ContractActionRequest) => Promise<boolean>
>();

/** Default denial; one outstanding review across custom, A2UI, and MCP Apps requests. */
export function createContractActionAuthorization(
  options: ContractActionAuthorizationOptions = {},
): ContractActionAuthorization {
  const value = object(options, "invalid-registration");
  keys(value, ["authorize"], "invalid-registration");
  const authorize = options.authorize;
  if (authorize !== undefined && typeof authorize !== "function")
    throw new TypeError("Expected an authorization policy");
  let busy = false;
  const review = async (request: ContractActionAuthorizationRequest): Promise<boolean> => {
    if (!authorize || busy) return false;
    busy = true;
    try {
      return (await authorize(request)) === true;
    } catch {
      return false;
    } finally {
      busy = false;
    }
  };
  const gate = createMcpNativeHostActionAuthorization({ authorize: review });
  authorizationReviews.set(gate, review);
  return gate;
}
