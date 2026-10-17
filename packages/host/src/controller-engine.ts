import {
  McpNativeRuntime,
  parseMcpNativeAction,
  type JsonObject,
  type McpClient,
  type McpListToolsResult,
  type McpTool,
} from "@mcp-native/core";
import {
  createMcpNativeConnectionLifecycle,
  parseMcpSdkListToolsResult,
  type McpNativeConnectionLifecycle,
  type McpNativeHostState,
  type McpNativeManagedConnection,
  type McpSdkListToolsOptions,
} from "@mcp-native/mcp";
import type { EnvelopeParseOptions } from "@mcp-native/a2ui";
import {
  MCP_NATIVE_HOST_MAX_LISTENERS,
  MCP_NATIVE_HOST_MAX_PENDING_OPERATIONS,
  McpNativeHostControllerError,
  type McpNativeHostAbortSignal,
  type McpNativeHostCallState,
  type McpNativeHostConnection,
  type McpNativeHostControllerOptions,
  type McpNativeHostOperationClient,
  type McpNativeHostRequestOptions,
  type McpNativeHostSnapshot,
  type McpNativeHostToolsState,
} from "./controller.js";
import type { ResolveMcpNativeHostResultOptions } from "./results.js";

export type EngineCallState<Result> =
  | Exclude<McpNativeHostCallState, { readonly kind: "resolved" }>
  | { readonly kind: "resolved"; readonly result: Result };
export type EngineSnapshot<Result> = Omit<McpNativeHostSnapshot, "call"> & {
  readonly call: EngineCallState<Result>;
};
export type EngineResolver<Result> = (
  options: ResolveMcpNativeHostResultOptions,
  signal: McpNativeHostAbortSignal,
) => Promise<Result>;

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

class HostOperationCancelledError extends Error {}

/**
 * Headless owner for one reconnecting MCP host workflow.
 *
 * It automatically discovers tools after every successful connection, calls only a tool definition
 * discovered on that same connection, and resolves the result through the connection-bound client.
 */
export class HostControllerEngine<Result> {
  readonly #resolveResult: EngineResolver<Result>;
  readonly #createConnection: () => McpNativeHostConnection;
  readonly #a2uiParseOptions: EnvelopeParseOptions | undefined;
  readonly #lifecycle: McpNativeConnectionLifecycle;
  readonly #listeners = new Set<() => void>();
  readonly #pendingOperations = new Set<Promise<unknown>>();
  #connectionGeneration = 0;
  #activeConnection: ActiveConnection | undefined;
  #activeOperation: ActiveOperation | undefined;
  #automaticDiscovery: Promise<void> | undefined;
  #toolsByName = new Map<string, McpTool>();
  #toolsState: McpNativeHostToolsState = Object.freeze({ kind: "idle" });
  #callState: EngineCallState<Result> = Object.freeze({ kind: "idle" });
  #snapshot: EngineSnapshot<Result>;
  #shutdown = false;
  #shutdownCompletion: Promise<void> | undefined;

  constructor(options: McpNativeHostControllerOptions, resolveResult: EngineResolver<Result>) {
    this.#resolveResult = resolveResult;
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

  getSnapshot = (): EngineSnapshot<Result> => this.#snapshot;

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
    return this.#discoverTools(this.#requireActiveConnection(), options.signal, "refresh");
  }

  async callTool(
    name: string,
    arguments_: JsonObject = {},
    options: McpNativeHostRequestOptions = {},
  ): Promise<Result> {
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
    const requestClient = createRequestClient(
      active.client,
      operation.controller.signal,
      "use",
      () => this.#assertCurrent(operation),
    );
    const runtime = new McpNativeRuntime(requestClient);
    const rawOperation = Promise.resolve()
      .then(() => runtime.callTool(action.name, action.arguments ?? {}))
      .then((result) => {
        this.#assertCurrent(operation);
        return this.#resolveResult(
          {
            tool,
            result,
            client: requestClient,
            ...(this.#a2uiParseOptions === undefined
              ? {}
              : { a2uiParseOptions: this.#a2uiParseOptions }),
          },
          operation.controller.signal,
        );
      });
    this.#trackPending(rawOperation);

    try {
      const resolved = await raceWithAbort(rawOperation, operation.controller.signal);
      this.#assertCurrent(operation);
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

  clearResult(): boolean {
    this.#assertNotShutdown();
    if (this.#callState.kind !== "resolved") return false;
    this.#callState = Object.freeze({ kind: "idle" });
    this.#publish();
    return true;
  }

  isCurrentResult(result: Result): boolean {
    return (
      !this.#shutdown &&
      this.#activeConnection !== undefined &&
      this.#lifecycle.state.kind === "ready" &&
      this.#callState.kind === "resolved" &&
      this.#callState.result === result
    );
  }

  shutdown(): Promise<void> {
    if (this.#shutdownCompletion) return this.#shutdownCompletion;
    this.#shutdown = true;
    // Reserve completion before abort listeners or observers can reenter shutdown.
    this.#shutdownCompletion = Promise.resolve().then(() => this.#lifecycle.shutdown());
    this.#clearConnectionState();
    this.#snapshot = Object.freeze({
      connection: Object.freeze({ kind: "disconnected", reason: "shutdown" }),
      tools: this.#toolsState,
      call: this.#callState,
    });
    this.#notify();
    this.#listeners.clear();
    return this.#shutdownCompletion;
  }

  #createManagedConnection(): McpNativeManagedConnection {
    const connection = validateHostConnection(this.#createConnection());
    const generation = ++this.#connectionGeneration;
    let retired = false;
    const retire = () => {
      retired = true;
      this.#clearConnection(generation);
    };
    const closed =
      connection.closed === undefined
        ? undefined
        : Promise.resolve(connection.closed).then(
            (reason) => {
              retire();
              return reason;
            },
            (error: unknown) => {
              retire();
              throw error;
            },
          );
    return {
      connect: async (signal) => {
        await connection.connect(signal);
        if (
          !retired &&
          generation === this.#connectionGeneration &&
          !signal.aborted &&
          !this.#shutdown
        ) {
          this.#activeConnection = { client: connection.client, generation };
        }
      },
      close: async () => {
        retire();
        await connection.close();
      },
      ...(closed === undefined ? {} : { closed }),
    };
  }

  #handleConnectionState(state: McpNativeHostState): void {
    if (this.#shutdown) return;
    if (state.kind !== "ready") {
      this.#clearConnectionState();
    }
    this.#snapshot = Object.freeze({
      connection: state,
      tools: this.#toolsState,
      call: this.#callState,
    });
    this.#notify();
    if (this.#shutdown) return;
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
    cacheMode: NonNullable<McpSdkListToolsOptions["cacheMode"]> = "use",
  ): Promise<McpListToolsResult> {
    const operation = this.#beginOperation("discovery", active.generation, externalSignal);
    this.#toolsByName = new Map();
    this.#toolsState = Object.freeze({ kind: "loading" });
    this.#callState = Object.freeze({ kind: "idle" });
    this.#publish();
    const requestClient = createRequestClient(
      active.client,
      operation.controller.signal,
      cacheMode,
      () => this.#assertCurrent(operation),
    );
    const rawOperation = Promise.resolve()
      .then(() => new McpNativeRuntime(requestClient).listTools())
      .then((result) => {
        this.#assertCurrent(operation);
        return parseMcpSdkListToolsResult(result);
      });
    this.#trackPending(rawOperation);

    try {
      const result = await raceWithAbort(rawOperation, operation.controller.signal);
      this.#assertCurrent(operation);
      // The official SDK aggregates every page when listTools() is called without a cursor.
      // A residual cursor therefore means this client returned only a partial discovery result;
      // never expose a partial allowlist to calls or renderers.
      if (result.nextCursor !== undefined) {
        throw new McpNativeHostControllerError("invalid-tool-list");
      }
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
    this.#assertNotShutdown();
    if (
      this.#activeConnection?.generation !== generation ||
      this.#lifecycle.state.kind !== "ready"
    ) {
      throw new McpNativeHostControllerError("cancelled");
    }
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

  #assertCurrent(operation: ActiveOperation): void {
    if (!this.#isCurrent(operation) || operation.controller.signal.aborted)
      throw new HostOperationCancelledError();
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
  listToolsCacheMode: NonNullable<McpSdkListToolsOptions["cacheMode"]> = "use",
  assertCurrent: () => void,
): McpClient & McpNativeHostOperationClient {
  return {
    listTools: () => {
      assertCurrent();
      return client.listTools({ signal, cacheMode: listToolsCacheMode });
    },
    callTool: (name, arguments_) => {
      assertCurrent();
      return client.callTool(name, arguments_, { signal });
    },
    readResource: async (uri) => {
      assertCurrent();
      const result = await client.readResource(uri, { signal });
      assertCurrent();
      return result;
    },
    getClientExtensionSettings: () => {
      assertCurrent();
      return client.getClientExtensionSettings();
    },
    getServerExtensionSettings: () => {
      assertCurrent();
      return client.getServerExtensionSettings();
    },
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
