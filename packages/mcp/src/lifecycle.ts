export const MCP_NATIVE_MAX_CONNECTION_ATTEMPTS = 8;
export const MCP_NATIVE_MAX_CONNECTION_TIMEOUT_MS = 120_000;
export const MCP_NATIVE_MAX_CONNECTION_BACKOFF_MS = 30_000;

export type McpNativeConnectionErrorKind = "retryable" | "terminal";

export class McpNativeConnectionLifecycleError extends Error {
  readonly code: "cancelled" | "timeout";

  constructor(code: "cancelled" | "timeout") {
    super(
      code === "timeout" ? "MCP connection attempt timed out" : "MCP connection attempt cancelled",
    );
    this.name = "McpNativeConnectionLifecycleError";
    this.code = code;
  }
}

export interface McpNativeConnectionErrorClassification {
  readonly kind: McpNativeConnectionErrorKind;
  /** Host-authored, non-sensitive stable code. Raw error messages are never retained or emitted. */
  readonly code: string;
}

export type McpNativeHostState =
  | { readonly kind: "loading"; readonly attempt: number }
  | { readonly kind: "ready" }
  | { readonly kind: "empty" }
  | { readonly kind: "denied"; readonly code: string }
  | { readonly kind: "disconnected"; readonly reason: "initial" | "offline" | "shutdown" }
  | {
      readonly kind: "retryable-error";
      readonly code: string;
      readonly attempt: number;
      readonly retryInMs: number;
    }
  | { readonly kind: "terminal-error"; readonly code: string; readonly exhausted: boolean };

export type McpNativeOperationalEvent =
  | {
      readonly type: "connection-attempt";
      readonly attempt: number;
      readonly timeoutMs: number;
    }
  | {
      readonly type: "connection-result";
      readonly attempt: number;
      readonly outcome: "connected" | "retryable-error" | "terminal-error" | "cancelled";
      readonly durationMs: number;
      readonly code?: string;
    }
  | { readonly type: "connection-backoff"; readonly attempt: number; readonly delayMs: number }
  | {
      readonly type: "connection-close";
      readonly reason: "retry" | "offline" | "shutdown";
      readonly outcome: "completed" | "failed" | "timeout";
    }
  | {
      readonly type: "connection-lost";
      readonly outcome: "retryable-error" | "terminal-error";
      readonly code: string;
    };

/**
 * Deliberately data-free diagnostics boundary. A host may map these fixed events to structured
 * logs, counters/histograms, and traces without receiving credentials, tokens, server payloads,
 * user payloads, URLs, error messages, or arbitrary labels from this package.
 */
export interface McpNativeOperationalSink {
  emit(event: McpNativeOperationalEvent): void;
}

export interface McpNativeManagedConnection {
  /** Connect through the official SDK. Hosts should stop promptly when `signal` aborts. */
  connect(signal: AbortSignal): void | Promise<void>;
  /** Close the SDK client/transport and release native resources. */
  close(): void | Promise<void>;
  /** Optional one-shot notification for an unexpected post-connect transport close. */
  readonly closed?: Promise<unknown>;
}

export interface McpNativeConnectionLifecycleOptions {
  /** A fresh SDK client/transport ownership unit for every connection attempt. */
  readonly createConnection: () => McpNativeManagedConnection;
  /** Maps an opaque failure to a stable, non-sensitive host code and retry decision. */
  readonly classifyError: (error: unknown) => McpNativeConnectionErrorClassification;
  readonly onStateChange?: (state: McpNativeHostState) => void;
  readonly diagnostics?: McpNativeOperationalSink;
  readonly timeoutMs?: number;
  readonly closeTimeoutMs?: number;
  readonly maxAttempts?: number;
  readonly initialBackoffMs?: number;
  readonly maxBackoffMs?: number;
  readonly backoffMultiplier?: number;
  readonly now?: () => number;
  readonly wait?: (milliseconds: number, signal: AbortSignal) => void | Promise<void>;
  readonly initiallyOnline?: boolean;
}

export class McpNativeConnectionLifecycle {
  readonly #options: Required<
    Pick<
      McpNativeConnectionLifecycleOptions,
      | "timeoutMs"
      | "closeTimeoutMs"
      | "maxAttempts"
      | "initialBackoffMs"
      | "maxBackoffMs"
      | "backoffMultiplier"
      | "now"
      | "wait"
    >
  > &
    McpNativeConnectionLifecycleOptions;
  #state: McpNativeHostState;
  #online: boolean;
  #shutdown = false;
  #run: Promise<void> | undefined;
  #abort: AbortController | undefined;
  #connection: McpNativeManagedConnection | undefined;
  #generation = 0;
  #transitionTail: Promise<void> = Promise.resolve();

  constructor(options: McpNativeConnectionLifecycleOptions) {
    if (
      options === null ||
      typeof options !== "object" ||
      typeof options.createConnection !== "function" ||
      typeof options.classifyError !== "function" ||
      (options.onStateChange !== undefined && typeof options.onStateChange !== "function") ||
      (options.diagnostics !== undefined &&
        (options.diagnostics === null || typeof options.diagnostics.emit !== "function")) ||
      (options.initiallyOnline !== undefined && typeof options.initiallyOnline !== "boolean")
    ) {
      throw new TypeError("Connection lifecycle requires valid host callbacks");
    }
    const timeoutMs = boundedInteger(
      options.timeoutMs ?? 15_000,
      "connection timeout",
      1,
      MCP_NATIVE_MAX_CONNECTION_TIMEOUT_MS,
    );
    const closeTimeoutMs = boundedInteger(
      options.closeTimeoutMs ?? 5_000,
      "connection close timeout",
      1,
      MCP_NATIVE_MAX_CONNECTION_TIMEOUT_MS,
    );
    const maxAttempts = boundedInteger(
      options.maxAttempts ?? 3,
      "connection attempts",
      1,
      MCP_NATIVE_MAX_CONNECTION_ATTEMPTS,
    );
    const initialBackoffMs = boundedInteger(
      options.initialBackoffMs ?? 250,
      "initial connection backoff",
      0,
      MCP_NATIVE_MAX_CONNECTION_BACKOFF_MS,
    );
    const maxBackoffMs = boundedInteger(
      options.maxBackoffMs ?? 5_000,
      "maximum connection backoff",
      initialBackoffMs,
      MCP_NATIVE_MAX_CONNECTION_BACKOFF_MS,
    );
    const backoffMultiplier = options.backoffMultiplier ?? 2;
    if (!Number.isFinite(backoffMultiplier) || backoffMultiplier < 1 || backoffMultiplier > 10) {
      throw new TypeError("Connection backoff multiplier must be between 1 and 10");
    }
    if (options.now !== undefined && typeof options.now !== "function") {
      throw new TypeError("Connection lifecycle clock must be a function");
    }
    if (options.wait !== undefined && typeof options.wait !== "function") {
      throw new TypeError("Connection lifecycle wait must be a function");
    }
    this.#options = {
      ...options,
      timeoutMs,
      closeTimeoutMs,
      maxAttempts,
      initialBackoffMs,
      maxBackoffMs,
      backoffMultiplier,
      now: options.now ?? Date.now,
      wait: options.wait ?? waitFor,
    };
    this.#online = options.initiallyOnline ?? true;
    this.#state = Object.freeze({
      kind: "disconnected",
      reason: this.#online ? "initial" : "offline",
    });
  }

  get state(): McpNativeHostState {
    return this.#state;
  }

  start(): Promise<void> {
    if (this.#shutdown) {
      throw new Error("Connection lifecycle is shut down");
    }
    if (!this.#online) {
      this.#setState({ kind: "disconnected", reason: "offline" });
      return Promise.resolve();
    }
    if (this.#run !== undefined || this.#state.kind === "ready") {
      return this.#run ?? Promise.resolve();
    }
    const generation = ++this.#generation;
    this.#abort = new AbortController();
    const run = this.#connectLoop(generation, this.#abort.signal).finally(() => {
      if (this.#run === run) {
        this.#run = undefined;
        this.#abort = undefined;
      }
    });
    this.#run = run;
    return run;
  }

  async retry(): Promise<void> {
    if (this.#state.kind !== "retryable-error" && this.#state.kind !== "terminal-error") {
      return;
    }
    await this.start();
  }

  setOnline(online: boolean): Promise<void> {
    if (typeof online !== "boolean") {
      throw new TypeError("Online state must be a boolean");
    }
    let connectionRun: Promise<void> | undefined;
    const transition = this.#serializeTransition(async () => {
      if (this.#shutdown || this.#online === online) return;
      this.#online = online;
      if (online) {
        connectionRun = this.start();
        return;
      }
      const run = this.#run;
      this.#generation += 1;
      this.#abort?.abort();
      await this.#closeCurrent("offline");
      await run;
      this.#setState({ kind: "disconnected", reason: "offline" });
    });
    return transition.then(() => connectionRun);
  }

  shutdown(): Promise<void> {
    return this.#serializeTransition(async () => {
      if (this.#shutdown) return;
      this.#shutdown = true;
      const run = this.#run;
      this.#generation += 1;
      this.#abort?.abort();
      await this.#closeCurrent("shutdown");
      await run;
      this.#setState({ kind: "disconnected", reason: "shutdown" });
    });
  }

  #serializeTransition(operation: () => void | Promise<void>): Promise<void> {
    const result = this.#transitionTail.then(operation, operation);
    this.#transitionTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async #connectLoop(generation: number, signal: AbortSignal): Promise<void> {
    for (let attempt = 1; attempt <= this.#options.maxAttempts; attempt += 1) {
      if (!this.#isCurrent(generation, signal)) return;
      this.#setState({ kind: "loading", attempt });
      this.#emit({ type: "connection-attempt", attempt, timeoutMs: this.#options.timeoutMs });
      const startedAt = readClock(this.#options.now);
      let connection: McpNativeManagedConnection;
      try {
        connection = validateConnection(this.#options.createConnection());
      } catch (error) {
        if (
          !this.#handleFailure(error, attempt, startedAt, attempt < this.#options.maxAttempts) ||
          // eslint-disable-next-line no-await-in-loop -- bounded retries are deliberately sequential
          !(await this.#waitBeforeRetry(attempt, signal))
        ) {
          return;
        }
        continue;
      }
      this.#connection = connection;
      try {
        // eslint-disable-next-line no-await-in-loop -- one owned connection attempt at a time
        await withTimeoutAndAbort(
          Promise.resolve(connection.connect(signal)),
          this.#options.timeoutMs,
          signal,
        );
        if (!this.#isCurrent(generation, signal)) {
          // eslint-disable-next-line no-await-in-loop -- close the current unit before leaving the loop
          await this.#closeCurrent(this.#online ? "retry" : "offline");
          return;
        }
        this.#setState({ kind: "ready" });
        this.#emit({
          type: "connection-result",
          attempt,
          outcome: "connected",
          durationMs: elapsed(readClock(this.#options.now), startedAt),
        });
        if (connection.closed !== undefined) {
          void Promise.resolve(connection.closed).then(
            (reason) => this.#handleUnexpectedClose(connection, reason),
            (error) => this.#handleUnexpectedClose(connection, error),
          );
        }
        return;
      } catch (error) {
        // eslint-disable-next-line no-await-in-loop -- close before a fresh retry unit is created
        await this.#closeCurrent(this.#online ? "retry" : "offline");
        if (!this.#isCurrent(generation, signal)) {
          this.#emit({
            type: "connection-result",
            attempt,
            outcome: "cancelled",
            durationMs: elapsed(readClock(this.#options.now), startedAt),
          });
          return;
        }
        const retry = this.#handleFailure(
          error,
          attempt,
          startedAt,
          attempt < this.#options.maxAttempts,
        );
        if (!retry) return;
      }
      // eslint-disable-next-line no-await-in-loop -- backoff serializes bounded retry attempts
      if (!(await this.#waitBeforeRetry(attempt, signal))) return;
    }
  }

  #handleFailure(error: unknown, attempt: number, startedAt: number, canRetry: boolean): boolean {
    const classification = validateClassification(this.#options.classifyError(error));
    const durationMs = elapsed(readClock(this.#options.now), startedAt);
    if (classification.kind === "terminal" || !canRetry) {
      this.#setState({
        kind: "terminal-error",
        code: classification.code,
        exhausted: classification.kind === "retryable",
      });
      this.#emit({
        type: "connection-result",
        attempt,
        outcome: "terminal-error",
        durationMs,
        code: classification.code,
      });
      return false;
    }
    this.#setState({
      kind: "retryable-error",
      code: classification.code,
      attempt,
      retryInMs: 0,
    });
    this.#emit({
      type: "connection-result",
      attempt,
      outcome: "retryable-error",
      durationMs,
      code: classification.code,
    });
    return true;
  }

  async #waitBeforeRetry(attempt: number, signal: AbortSignal): Promise<boolean> {
    const delayMs = Math.min(
      this.#options.maxBackoffMs,
      Math.round(this.#options.initialBackoffMs * this.#options.backoffMultiplier ** (attempt - 1)),
    );
    this.#setState({
      kind: "retryable-error",
      code: (this.#state.kind === "retryable-error" && this.#state.code) || "retryable",
      attempt,
      retryInMs: delayMs,
    });
    this.#emit({ type: "connection-backoff", attempt, delayMs });
    try {
      await this.#options.wait(delayMs, signal);
      return !signal.aborted;
    } catch {
      return false;
    }
  }

  async #handleUnexpectedClose(
    connection: McpNativeManagedConnection,
    reason: unknown,
  ): Promise<void> {
    if (this.#connection !== connection || this.#shutdown || !this.#online) return;
    this.#connection = undefined;
    const activeRun = this.#run;
    if (activeRun !== undefined) await activeRun;
    if (this.#shutdown || !this.#online) return;
    let classification: McpNativeConnectionErrorClassification;
    try {
      classification = validateClassification(this.#options.classifyError(reason));
    } catch {
      this.#setState({
        kind: "terminal-error",
        code: "lifecycle-callback-failed",
        exhausted: false,
      });
      return;
    }
    if (classification.kind === "terminal") {
      this.#setState({ kind: "terminal-error", code: classification.code, exhausted: false });
      this.#emit({
        type: "connection-lost",
        outcome: "terminal-error",
        code: classification.code,
      });
      return;
    }
    this.#setState({
      kind: "retryable-error",
      code: classification.code,
      attempt: 0,
      retryInMs: 0,
    });
    this.#emit({
      type: "connection-lost",
      outcome: "retryable-error",
      code: classification.code,
    });
    try {
      await this.start();
    } catch {
      if (!this.#shutdown && this.#online) {
        this.#setState({
          kind: "terminal-error",
          code: "lifecycle-callback-failed",
          exhausted: false,
        });
      }
    }
  }

  #isCurrent(generation: number, signal: AbortSignal): boolean {
    return generation === this.#generation && !signal.aborted && this.#online && !this.#shutdown;
  }

  async #closeCurrent(reason: "retry" | "offline" | "shutdown"): Promise<void> {
    const connection = this.#connection;
    this.#connection = undefined;
    if (connection === undefined) return;
    const outcome = await settleWithin(
      Promise.resolve().then(() => connection.close()),
      this.#options.closeTimeoutMs,
    );
    this.#emit({ type: "connection-close", reason, outcome });
  }

  #setState(state: McpNativeHostState): void {
    this.#state = Object.freeze(state);
    try {
      this.#options.onStateChange?.(this.#state);
    } catch {
      // Host observation must not change connection ownership or retry behavior.
    }
  }

  #emit(event: McpNativeOperationalEvent): void {
    try {
      this.#options.diagnostics?.emit(Object.freeze(event));
    } catch {
      // Instrumentation failures must not alter the operation being observed.
    }
  }
}

export function createMcpNativeConnectionLifecycle(
  options: McpNativeConnectionLifecycleOptions,
): McpNativeConnectionLifecycle {
  return new McpNativeConnectionLifecycle(options);
}

function validateConnection(value: McpNativeManagedConnection): McpNativeManagedConnection {
  if (
    value === null ||
    typeof value !== "object" ||
    typeof value.connect !== "function" ||
    typeof value.close !== "function" ||
    (value.closed !== undefined &&
      (value.closed === null || typeof (value.closed as PromiseLike<unknown>).then !== "function"))
  ) {
    throw new TypeError("Connection factory must return connect and close callbacks");
  }
  return value;
}

function validateClassification(value: unknown): McpNativeConnectionErrorClassification {
  if (
    value === null ||
    typeof value !== "object" ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    throw new TypeError("Connection error classifier must return an object");
  }
  const candidate = value as Record<string, unknown>;
  if (
    !Object.hasOwn(candidate, "kind") ||
    !Object.hasOwn(candidate, "code") ||
    (candidate.kind !== "retryable" && candidate.kind !== "terminal") ||
    typeof candidate.code !== "string" ||
    !/^[a-z][a-z0-9._-]{0,63}$/.test(candidate.code) ||
    Object.keys(candidate).some((key) => key !== "kind" && key !== "code")
  ) {
    throw new TypeError("Connection error classifier returned an invalid safe classification");
  }
  return Object.freeze({ kind: candidate.kind, code: candidate.code });
}

function boundedInteger(value: number, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function elapsed(now: number, startedAt: number): number {
  return Math.max(0, Math.round(now - startedAt));
}

function readClock(now: () => number): number {
  const value = now();
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    throw new TypeError("Connection lifecycle clock must return a finite non-negative number");
  }
  return value;
}

function waitFor(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new Error("Connection wait aborted"));
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Connection wait aborted"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function withTimeoutAndAbort(
  operation: Promise<void>,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(new McpNativeConnectionLifecycleError("cancelled")));
    const timer = setTimeout(
      () => finish(() => reject(new McpNativeConnectionLifecycleError("timeout"))),
      timeoutMs,
    );
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    void operation.then(
      () => finish(resolve),
      (error) => finish(() => reject(error)),
    );
  });
}

function settleWithin(
  operation: Promise<unknown>,
  timeoutMs: number,
): Promise<"completed" | "failed" | "timeout"> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome: "completed" | "failed" | "timeout") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(outcome);
    };
    const timer = setTimeout(() => finish("timeout"), timeoutMs);
    void operation.then(
      () => finish("completed"),
      () => finish("failed"),
    );
  });
}
