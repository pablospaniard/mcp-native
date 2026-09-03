import {
  McpNativeRuntime,
  parseMcpNativeAction,
  type JsonObject,
  type McpClient,
  type McpExtensionSettings,
  type McpListToolsResult,
  type McpReadResourceResult,
  type McpTool,
  type McpToolCallResult,
} from "@mcp-native/core";
import {
  createMcpNativeConnectionLifecycle,
  parseMcpSdkListToolsResult,
  type McpNativeConnectionLifecycle,
  type McpNativeConnectionLifecycleOptions,
  type McpNativeHostState,
  type McpNativeManagedConnection,
  type McpSdkRequestOptions,
} from "@mcp-native/mcp";
import type { A2uiV1EnvelopeParseOptions } from "@mcp-native/a2ui";

import { resolveMcpNativeHostResult, type McpNativeHostResult } from "./results.js";

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
  listTools(options?: McpNativeHostRequestOptions): Promise<McpListToolsResult>;
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
  readonly a2uiParseOptions?: A2uiV1EnvelopeParseOptions;
};

interface ActiveConnection {
  readonly client: McpNativeHostOperationClient;
  readonly generation: number;
}

interface ActiveOperation {
  readonly controller: HostAbortController;
  readonly externalSignalCleanup: () => void;
  readonly generation: number;
  readonly kind: "call" | "discovery";
  readonly token: symbol;
}

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

class HostOperationCancelledError extends Error {}

/**
 * Headless owner for one reconnecting MCP host workflow.
 *
 * It automatically discovers tools after every successful connection, calls only a tool definition
 * discovered on that same connection, and resolves the result through the connection-bound client.
 */
export class McpNativeHostController {
  readonly #createConnection: () => McpNativeHostConnection;
  readonly #a2uiParseOptions: A2uiV1EnvelopeParseOptions | undefined;
  readonly #lifecycle: McpNativeConnectionLifecycle;
  readonly #listeners = new Set<() => void>();
  readonly #pendingOperations = new Set<Promise<unknown>>();
  #connectionGeneration = 0;
  #activeConnection: ActiveConnection | undefined;
  #activeOperation: ActiveOperation | undefined;
  #automaticDiscovery: Promise<void> | undefined;
  #toolsByName = new Map<string, McpTool>();
  #toolsState: McpNativeHostToolsState = Object.freeze({ kind: "idle" });
  #callState: McpNativeHostCallState = Object.freeze({ kind: "idle" });
  #snapshot: McpNativeHostSnapshot;
  #shutdown = false;

  constructor(options: McpNativeHostControllerOptions) {
    if (options === null || typeof options !== "object" || Array.isArray(options)) {
      throw new TypeError("MCP host controller options must be an object");
    }
    const { createConnection, a2uiParseOptions, ...lifecycleOptions } = options;
    if (typeof createConnection !== "function") {
      throw new TypeError("MCP host controller requires a connection factory");
    }
    this.#createConnection = createConnection;
    this.#a2uiParseOptions = a2uiParseOptions;
    this.#snapshot = Object.freeze({
      connection: Object.freeze({
        kind: "disconnected",
        reason: lifecycleOptions.initiallyOnline === false ? "offline" : "initial",
      }),
      tools: this.#toolsState,
      call: this.#callState,
    });
    this.#lifecycle = createMcpNativeConnectionLifecycle({
      ...lifecycleOptions,
      createConnection: () => this.#createManagedConnection(),
      onStateChange: (state) => this.#handleConnectionState(state),
    });
  }

  getSnapshot = (): McpNativeHostSnapshot => this.#snapshot;

  subscribe(listener: () => void): () => void {
    if (this.#shutdown) throw new McpNativeHostControllerError("shutdown");
    if (typeof listener !== "function") {
      throw new TypeError("MCP host snapshot listener must be a function");
    }
    if (this.#listeners.size >= MCP_NATIVE_HOST_MAX_LISTENERS) {
      throw new RangeError(
        `MCP host controller exceeds ${MCP_NATIVE_HOST_MAX_LISTENERS} snapshot listeners`,
      );
    }
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async start(): Promise<void> {
    this.#assertNotShutdown();
    await this.#lifecycle.start();
    await this.#automaticDiscovery;
  }

  async retry(): Promise<void> {
    this.#assertNotShutdown();
    await this.#lifecycle.retry();
    await this.#automaticDiscovery;
  }

  async setOnline(online: boolean): Promise<void> {
    this.#assertNotShutdown();
    await this.#lifecycle.setOnline(online);
    await this.#automaticDiscovery;
  }

  refreshTools(options: McpNativeHostRequestOptions = {}): Promise<McpListToolsResult> {
    this.#assertRequestOptions(options);
    return this.#discoverTools(this.#requireActiveConnection(), options.signal);
  }

  async callTool(
    name: string,
    arguments_: JsonObject = {},
    options: McpNativeHostRequestOptions = {},
  ): Promise<McpNativeHostResult> {
    this.#assertRequestOptions(options);
    const active = this.#requireActiveConnection();
    if (this.#toolsState.kind !== "ready") {
      throw new McpNativeHostControllerError("not-ready");
    }
    let action;
    try {
      action = parseMcpNativeAction({ type: "tool", name, arguments: arguments_ });
    } catch {
      throw new McpNativeHostControllerError("invalid-call");
    }
    const tool = this.#toolsByName.get(action.name);
    if (tool === undefined) throw new McpNativeHostControllerError("tool-not-listed");

    const operation = this.#beginOperation("call", active.generation, options.signal);
    this.#callState = Object.freeze({ kind: "loading" });
    this.#publish();
    const requestClient = createRequestClient(active.client, operation.controller.signal);
    const runtime = new McpNativeRuntime(requestClient);
    const rawOperation = Promise.resolve()
      .then(() => runtime.callTool(action.name, action.arguments ?? {}))
      .then((result) =>
        resolveMcpNativeHostResult({
          tool,
          result,
          client: requestClient,
          ...(this.#a2uiParseOptions === undefined
            ? {}
            : { a2uiParseOptions: this.#a2uiParseOptions }),
        }),
      );
    this.#trackPending(rawOperation);

    try {
      const resolved = await raceWithAbort(rawOperation, operation.controller.signal);
      if (!this.#isCurrent(operation)) throw new HostOperationCancelledError();
      this.#callState = Object.freeze({ kind: "resolved", result: resolved });
      this.#publish();
      return resolved;
    } catch (error) {
      if (!this.#isCurrent(operation)) {
        throw new McpNativeHostControllerError("cancelled");
      }
      if (operation.controller.signal.aborted || error instanceof HostOperationCancelledError) {
        this.#callState = Object.freeze({ kind: "cancelled" });
        this.#publish();
        throw new McpNativeHostControllerError("cancelled");
      }
      this.#callState = Object.freeze({ kind: "error", code: "tool-call-failed" });
      this.#publish();
      throw new McpNativeHostControllerError("tool-call-failed");
    } finally {
      this.#finishOperation(operation);
    }
  }

  cancelCurrentCall(): boolean {
    if (this.#activeOperation?.kind !== "call") return false;
    this.#activeOperation.controller.abort();
    return true;
  }

  async shutdown(): Promise<void> {
    if (this.#shutdown) return;
    this.#shutdown = true;
    this.#activeOperation?.controller.abort();
    await this.#lifecycle.shutdown();
    this.#listeners.clear();
  }

  #createManagedConnection(): McpNativeManagedConnection {
    const connection = validateHostConnection(this.#createConnection());
    const generation = ++this.#connectionGeneration;
    const closed =
      connection.closed === undefined
        ? undefined
        : Promise.resolve(connection.closed).then(
            (reason) => {
              this.#clearConnection(generation);
              return reason;
            },
            (error: unknown) => {
              this.#clearConnection(generation);
              throw error;
            },
          );
    return {
      connect: async (signal) => {
        await connection.connect(signal);
        if (!signal.aborted && !this.#shutdown) {
          this.#activeConnection = { client: connection.client, generation };
        }
      },
      close: async () => {
        this.#clearConnection(generation);
        await connection.close();
      },
      ...(closed === undefined ? {} : { closed }),
    };
  }

  #handleConnectionState(state: McpNativeHostState): void {
    if (state.kind !== "ready") {
      this.#clearConnectionState();
    }
    this.#snapshot = Object.freeze({
      connection: state,
      tools: this.#toolsState,
      call: this.#callState,
    });
    this.#notify();
    if (state.kind === "ready") {
      const active = this.#activeConnection;
      if (active === undefined) {
        this.#toolsState = Object.freeze({ kind: "error", code: "tool-discovery-failed" });
        this.#publish();
        return;
      }
      const discovery = Promise.resolve()
        .then(() => this.#discoverTools(active))
        .then(
          () => undefined,
          () => undefined,
        );
      this.#automaticDiscovery = discovery;
    }
  }

  async #discoverTools(
    active: ActiveConnection,
    externalSignal?: McpNativeHostAbortSignal,
  ): Promise<McpListToolsResult> {
    const operation = this.#beginOperation("discovery", active.generation, externalSignal);
    this.#toolsByName = new Map();
    this.#toolsState = Object.freeze({ kind: "loading" });
    this.#callState = Object.freeze({ kind: "idle" });
    this.#publish();
    const requestClient = createRequestClient(active.client, operation.controller.signal);
    const rawOperation = Promise.resolve()
      .then(() => new McpNativeRuntime(requestClient).listTools())
      .then((result) => parseMcpSdkListToolsResult(result));
    this.#trackPending(rawOperation);

    try {
      const result = await raceWithAbort(rawOperation, operation.controller.signal);
      if (!this.#isCurrent(operation)) throw new HostOperationCancelledError();
      const toolsByName = new Map<string, McpTool>();
      for (const tool of result.tools) {
        if (toolsByName.has(tool.name)) {
          throw new McpNativeHostControllerError("invalid-tool-list");
        }
        toolsByName.set(tool.name, tool);
      }
      deepFreeze(result);
      this.#toolsByName = toolsByName;
      this.#toolsState = Object.freeze({ kind: "ready", result });
      this.#publish();
      return result;
    } catch (error) {
      if (!this.#isCurrent(operation)) {
        throw new McpNativeHostControllerError("cancelled");
      }
      const code = (() => {
        if (operation.controller.signal.aborted || error instanceof HostOperationCancelledError) {
          return "cancelled" as const;
        }
        if (error instanceof McpNativeHostControllerError && error.code === "invalid-tool-list") {
          return "invalid-tool-list" as const;
        }
        return "tool-discovery-failed" as const;
      })();
      this.#toolsByName = new Map();
      this.#toolsState = Object.freeze({ kind: "error", code });
      this.#publish();
      throw new McpNativeHostControllerError(code);
    } finally {
      this.#finishOperation(operation);
    }
  }

  #beginOperation(
    kind: ActiveOperation["kind"],
    generation: number,
    externalSignal?: McpNativeHostAbortSignal,
  ): ActiveOperation {
    if (this.#activeOperation !== undefined) {
      throw new McpNativeHostControllerError("operation-in-progress");
    }
    if (externalSignal?.aborted === true) {
      throw new McpNativeHostControllerError("cancelled");
    }
    if (this.#pendingOperations.size >= MCP_NATIVE_HOST_MAX_PENDING_OPERATIONS) {
      if (kind === "discovery") {
        this.#toolsState = Object.freeze({ kind: "error", code: "operation-capacity-exceeded" });
        this.#publish();
      }
      throw new McpNativeHostControllerError("operation-capacity-exceeded");
    }
    const { controller, cleanup } = createLinkedAbortController(externalSignal);
    const operation = {
      controller,
      externalSignalCleanup: cleanup,
      generation,
      kind,
      token: Symbol(kind),
    } satisfies ActiveOperation;
    this.#activeOperation = operation;
    return operation;
  }

  #finishOperation(operation: ActiveOperation): void {
    operation.externalSignalCleanup();
    if (this.#activeOperation?.token === operation.token) this.#activeOperation = undefined;
  }

  #trackPending(operation: Promise<unknown>): void {
    this.#pendingOperations.add(operation);
    void operation.then(
      () => this.#pendingOperations.delete(operation),
      () => this.#pendingOperations.delete(operation),
    );
  }

  #isCurrent(operation: ActiveOperation): boolean {
    return (
      !this.#shutdown &&
      this.#activeOperation?.token === operation.token &&
      this.#activeConnection?.generation === operation.generation &&
      this.#lifecycle.state.kind === "ready"
    );
  }

  #clearConnection(generation: number): void {
    if (this.#activeConnection?.generation !== generation) return;
    this.#activeConnection = undefined;
    this.#clearConnectionState();
    this.#publish();
  }

  #clearConnectionState(): void {
    this.#activeConnection = undefined;
    this.#activeOperation?.controller.abort();
    this.#activeOperation = undefined;
    this.#toolsByName = new Map();
    this.#toolsState = Object.freeze({ kind: "idle" });
    this.#callState = Object.freeze({ kind: "idle" });
  }

  #requireActiveConnection(): ActiveConnection {
    this.#assertNotShutdown();
    if (this.#lifecycle.state.kind !== "ready" || this.#activeConnection === undefined) {
      throw new McpNativeHostControllerError("not-ready");
    }
    return this.#activeConnection;
  }

  #assertNotShutdown(): void {
    if (this.#shutdown) throw new McpNativeHostControllerError("shutdown");
  }

  #assertRequestOptions(options: McpNativeHostRequestOptions): void {
    if (
      options === null ||
      typeof options !== "object" ||
      Array.isArray(options) ||
      Object.keys(options).some((key) => key !== "signal") ||
      (options.signal !== undefined && !isAbortSignal(options.signal))
    ) {
      throw new TypeError("MCP host request options must contain only an AbortSignal");
    }
  }

  #publish(): void {
    this.#snapshot = Object.freeze({
      connection: this.#lifecycle.state,
      tools: this.#toolsState,
      call: this.#callState,
    });
    this.#notify();
  }

  #notify(): void {
    for (const listener of this.#listeners) {
      try {
        listener();
      } catch {
        // UI observers cannot change connection or operation ownership.
      }
    }
  }
}

export function createMcpNativeHostController(
  options: McpNativeHostControllerOptions,
): McpNativeHostController {
  return new McpNativeHostController(options);
}

function validateHostConnection(value: McpNativeHostConnection): McpNativeHostConnection {
  const client = value?.client;
  if (
    value === null ||
    typeof value !== "object" ||
    typeof value.connect !== "function" ||
    typeof value.close !== "function" ||
    (value.closed !== undefined &&
      (value.closed === null ||
        typeof (value.closed as PromiseLike<unknown>).then !== "function")) ||
    client === null ||
    typeof client !== "object" ||
    typeof client.listTools !== "function" ||
    typeof client.callTool !== "function" ||
    typeof client.readResource !== "function" ||
    typeof client.getClientExtensionSettings !== "function" ||
    typeof client.getServerExtensionSettings !== "function"
  ) {
    throw new McpNativeHostControllerError("invalid-connection");
  }
  return value;
}

function createRequestClient(
  client: McpNativeHostOperationClient,
  signal: McpNativeHostAbortSignal,
): McpClient & McpNativeHostOperationClient {
  return {
    listTools: () => client.listTools({ signal }),
    callTool: (name, arguments_) => client.callTool(name, arguments_, { signal }),
    readResource: (uri) => client.readResource(uri, { signal }),
    getClientExtensionSettings: () => client.getClientExtensionSettings(),
    getServerExtensionSettings: () => client.getServerExtensionSettings(),
  };
}

interface HostAbortController {
  readonly signal: McpNativeHostAbortSignal;
  abort(): void;
}

function createLinkedAbortController(externalSignal?: McpNativeHostAbortSignal): {
  readonly controller: HostAbortController;
  readonly cleanup: () => void;
} {
  const controller = createHostAbortController();
  if (externalSignal === undefined) return { controller, cleanup() {} };
  if (externalSignal.aborted) {
    controller.abort();
    return { controller, cleanup() {} };
  }
  const abort = () => controller.abort();
  externalSignal.addEventListener("abort", abort, { once: true });
  return {
    controller,
    cleanup: () => externalSignal.removeEventListener("abort", abort),
  };
}

function raceWithAbort<T>(operation: Promise<T>, signal: McpNativeHostAbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new HostOperationCancelledError());
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new HostOperationCancelledError());
    signal.addEventListener("abort", abort, { once: true });
    void operation.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

function isAbortSignal(value: unknown): value is McpNativeHostAbortSignal {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as McpNativeHostAbortSignal).aborted === "boolean" &&
    typeof (value as McpNativeHostAbortSignal).addEventListener === "function" &&
    typeof (value as McpNativeHostAbortSignal).removeEventListener === "function"
  );
}

function createHostAbortController(): HostAbortController {
  const implementation = (
    globalThis as unknown as {
      readonly AbortController?: new () => HostAbortController;
    }
  ).AbortController;
  if (implementation === undefined) {
    throw new TypeError("MCP host operations require AbortController support");
  }
  return new implementation();
}

function deepFreeze(value: unknown): void {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return;
  for (const child of Object.values(value)) deepFreeze(child);
  Object.freeze(value);
}
