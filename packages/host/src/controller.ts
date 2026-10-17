import {
  type JsonObject,
  type McpExtensionSettings,
  type McpListToolsResult,
  type McpReadResourceResult,
  type McpToolCallResult,
} from "@mcp-native/core";
import {
  type McpNativeConnectionLifecycleOptions,
  type McpNativeHostState,
  type McpNativeManagedConnection,
  type McpSdkListToolsOptions,
  type McpSdkRequestOptions,
} from "@mcp-native/mcp";
import type { EnvelopeParseOptions } from "@mcp-native/a2ui";

import { resolveMcpNativeHostResult, type McpNativeHostResult } from "./results.js";
import { HostControllerEngine } from "./controller-engine.js";

/** Maximum live snapshot listeners retained by one host controller. */
export const MCP_NATIVE_HOST_MAX_LISTENERS = 64;
/** Maximum unsettled SDK operations retained after cancellation or connection replacement. */
export const MCP_NATIVE_HOST_MAX_PENDING_OPERATIONS = 8;

export type McpNativeHostAbortSignal = NonNullable<McpSdkRequestOptions["signal"]>;

export interface McpNativeHostRequestOptions {
  readonly signal?: McpNativeHostAbortSignal;
}

/** Adapted client owned by one host connection unit. */
export interface McpNativeHostOperationClient {
  listTools(options?: McpSdkListToolsOptions): Promise<McpListToolsResult>;
  callTool(
    name: string,
    arguments_: JsonObject,
    options?: McpNativeHostRequestOptions,
  ): Promise<McpToolCallResult>;
  readResource(uri: string, options?: McpNativeHostRequestOptions): Promise<McpReadResourceResult>;
  getClientExtensionSettings(): McpExtensionSettings;
  getServerExtensionSettings(): McpExtensionSettings;
}

/** Fresh connection, transport, and adapted client ownership unit. */
export interface McpNativeHostConnection extends McpNativeManagedConnection {
  readonly client: McpNativeHostOperationClient;
}

export type McpNativeHostToolsState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly result: McpListToolsResult }
  | {
      readonly kind: "error";
      readonly code:
        | "cancelled"
        | "invalid-tool-list"
        | "operation-capacity-exceeded"
        | "tool-discovery-failed";
    };

export type McpNativeHostCallState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "resolved"; readonly result: McpNativeHostResult }
  | { readonly kind: "cancelled" }
  | { readonly kind: "error"; readonly code: "tool-call-failed" };

export interface McpNativeHostSnapshot {
  readonly connection: McpNativeHostState;
  readonly tools: McpNativeHostToolsState;
  readonly call: McpNativeHostCallState;
}

export type McpNativeHostControllerErrorCode =
  | "cancelled"
  | "invalid-call"
  | "invalid-connection"
  | "invalid-tool-list"
  | "not-ready"
  | "operation-capacity-exceeded"
  | "operation-in-progress"
  | "shutdown"
  | "tool-call-failed"
  | "tool-discovery-failed"
  | "tool-not-listed";

export class McpNativeHostControllerError extends Error {
  readonly code: McpNativeHostControllerErrorCode;

  constructor(code: McpNativeHostControllerErrorCode) {
    super(HOST_ERROR_MESSAGES[code]);
    this.name = "McpNativeHostControllerError";
    this.code = code;
  }
}

export type McpNativeHostControllerOptions = Omit<
  McpNativeConnectionLifecycleOptions,
  "createConnection" | "onStateChange"
> & {
  /** Creates a fresh SDK client/transport/adapter unit for every connection attempt. */
  readonly createConnection: () => McpNativeHostConnection;
  readonly a2uiParseOptions?: EnvelopeParseOptions;
};

const HOST_ERROR_MESSAGES: Readonly<Record<McpNativeHostControllerErrorCode, string>> =
  Object.freeze({
    cancelled: "MCP host operation cancelled",
    "invalid-call": "MCP host tool call is invalid",
    "invalid-connection": "MCP host connection unit is invalid",
    "invalid-tool-list": "MCP host tool list is invalid",
    "not-ready": "MCP host is not connected",
    "operation-capacity-exceeded": "MCP host pending operation capacity exceeded",
    "operation-in-progress": "MCP host operation already in progress",
    shutdown: "MCP host is shut down",
    "tool-call-failed": "MCP host tool call failed",
    "tool-discovery-failed": "MCP host tool discovery failed",
    "tool-not-listed": "MCP host tool was not discovered on the active connection",
  });

/**
 * Headless owner for one reconnecting MCP host workflow.
 *
 * It automatically discovers tools after every successful connection, calls only a tool definition
 * discovered on that same connection, and resolves the result through the connection-bound client.
 */
export class McpNativeHostController {
  readonly #engine: HostControllerEngine<McpNativeHostResult>;
  constructor(options: McpNativeHostControllerOptions) {
    this.#engine = new HostControllerEngine(options, resolveMcpNativeHostResult);
  }
  getSnapshot = (): McpNativeHostSnapshot => this.#engine.getSnapshot();
  subscribe(listener: () => void): () => void {
    return this.#engine.subscribe(listener);
  }
  async start(): Promise<void> {
    await this.#engine.start();
  }
  async retry(): Promise<void> {
    await this.#engine.retry();
  }
  async setOnline(online: boolean): Promise<void> {
    await this.#engine.setOnline(online);
  }
  refreshTools(options: McpNativeHostRequestOptions = {}): Promise<McpListToolsResult> {
    return this.#engine.refreshTools(options);
  }
  async callTool(
    name: string,
    arguments_: JsonObject = {},
    options: McpNativeHostRequestOptions = {},
  ): Promise<McpNativeHostResult> {
    return this.#engine.callTool(name, arguments_, options);
  }
  cancelCurrentCall(): boolean {
    return this.#engine.cancelCurrentCall();
  }
  async shutdown(): Promise<void> {
    await this.#engine.shutdown();
  }
}

export function createMcpNativeHostController(
  options: McpNativeHostControllerOptions,
): McpNativeHostController {
  return new McpNativeHostController(options);
}
