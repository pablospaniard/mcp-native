import assert from "node:assert/strict";
import test from "node:test";

import {
  McpNativeConnectionLifecycle,
  createMcpNativeConnectionLifecycle,
} from "../packages/mcp/dist/index.js";

const retryable = () => ({ kind: "retryable", code: "network-unavailable" });

test("connection lifecycle retries with bounded backoff and emits data-free operations", async () => {
  let attempts = 0;
  const closes = [];
  const waits = [];
  const states = [];
  const events = [];
  const lifecycle = createMcpNativeConnectionLifecycle({
    createConnection() {
      const attempt = ++attempts;
      return {
        connect() {
          if (attempt < 3) throw new Error(`secret server response ${attempt}`);
        },
        close() {
          closes.push(attempt);
        },
      };
    },
    classifyError: retryable,
    initialBackoffMs: 10,
    maxBackoffMs: 20,
    wait(milliseconds) {
      waits.push(milliseconds);
    },
    onStateChange: (state) => states.push(state),
    diagnostics: { emit: (event) => events.push(event) },
  });

  await lifecycle.start();
  assert.equal(lifecycle.state.kind, "ready");
  assert.equal(attempts, 3);
  assert.deepEqual(closes, [1, 2]);
  assert.deepEqual(waits, [10, 20]);
  assert.deepEqual(
    states.filter((state) => state.kind === "loading").map((state) => state.attempt),
    [1, 2, 3],
  );
  assert.equal(
    JSON.stringify(events).includes("secret server response"),
    false,
    "raw errors must not enter diagnostics",
  );
  assert.deepEqual(
    events.filter((event) => event.type === "connection-result").map((event) => event.outcome),
    ["retryable-error", "retryable-error", "connected"],
  );

  await lifecycle.shutdown();
  assert.deepEqual(closes, [1, 2, 3]);
  assert.deepEqual(
    events.filter((event) => event.type === "connection-close").map((event) => event.outcome),
    ["completed", "completed", "completed"],
  );
  assert.deepEqual(lifecycle.state, { kind: "disconnected", reason: "shutdown" });
});

test("connection lifecycle distinguishes terminal failures and exhausted retries", async () => {
  const terminal = createMcpNativeConnectionLifecycle({
    createConnection: () => ({
      connect: () => Promise.reject(new Error("unauthorized details")),
      close() {},
    }),
    classifyError: () => ({ kind: "terminal", code: "authorization-denied" }),
  });
  await terminal.start();
  assert.deepEqual(terminal.state, {
    kind: "terminal-error",
    code: "authorization-denied",
    exhausted: false,
  });

  let attempts = 0;
  const exhausted = createMcpNativeConnectionLifecycle({
    createConnection: () => ({
      connect() {
        attempts += 1;
        throw new Error("offline");
      },
      close() {},
    }),
    classifyError: retryable,
    maxAttempts: 2,
    wait() {},
  });
  await exhausted.start();
  assert.equal(attempts, 2);
  assert.deepEqual(exhausted.state, {
    kind: "terminal-error",
    code: "network-unavailable",
    exhausted: true,
  });
});

test("connection lifecycle times out, cancels offline work, and closes ownership units", async () => {
  let closeCount = 0;
  const timedOut = createMcpNativeConnectionLifecycle({
    createConnection: () => ({
      connect: () => new Promise(() => {}),
      close() {
        closeCount += 1;
      },
    }),
    classifyError: retryable,
    timeoutMs: 5,
    closeTimeoutMs: 5,
    maxAttempts: 1,
  });
  await timedOut.start();
  assert.equal(closeCount, 1);
  assert.deepEqual(timedOut.state, {
    kind: "terminal-error",
    code: "network-unavailable",
    exhausted: true,
  });

  let observedAbort = false;
  const offline = createMcpNativeConnectionLifecycle({
    createConnection: () => ({
      connect(signal) {
        return new Promise((resolve) => {
          signal.addEventListener(
            "abort",
            () => {
              observedAbort = true;
              resolve();
            },
            { once: true },
          );
        });
      },
      close() {
        closeCount += 1;
      },
    }),
    classifyError: retryable,
  });
  const pending = offline.start();
  await new Promise((resolve) => setImmediate(resolve));
  await offline.setOnline(false);
  await pending;
  assert.equal(observedAbort, true);
  assert.deepEqual(offline.state, { kind: "disconnected", reason: "offline" });
});

test("connection lifecycle reconnects from an unexpected close with a fresh unit", async () => {
  let resolveClosed;
  let attempts = 0;
  const lifecycle = createMcpNativeConnectionLifecycle({
    createConnection() {
      attempts += 1;
      return {
        connect() {},
        close() {},
        ...(attempts === 1
          ? {
              closed: new Promise((resolve) => {
                resolveClosed = resolve;
              }),
            }
          : {}),
      };
    },
    classifyError: retryable,
  });
  await lifecycle.start();
  resolveClosed(new Error("transport secret"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(attempts, 2);
  assert.equal(lifecycle.state.kind, "ready");
  await lifecycle.shutdown();
});

test("connection lifecycle preserves rapid offline then online transitions", async () => {
  let attempts = 0;
  let releaseClose;
  let markCloseStarted;
  const closeStarted = new Promise((resolve) => {
    markCloseStarted = resolve;
  });
  const closeGate = new Promise((resolve) => {
    releaseClose = resolve;
  });
  const lifecycle = createMcpNativeConnectionLifecycle({
    createConnection() {
      const attempt = ++attempts;
      return {
        connect() {},
        async close() {
          if (attempt === 1) {
            markCloseStarted();
            await closeGate;
          }
        },
      };
    },
    classifyError: retryable,
  });

  await lifecycle.start();
  const offline = lifecycle.setOnline(false);
  const online = lifecycle.setOnline(true);
  await closeStarted;
  releaseClose();
  await Promise.all([offline, online]);

  assert.equal(attempts, 2);
  assert.deepEqual(lifecycle.state, { kind: "ready" });
  await lifecycle.shutdown();
});

test("connection shutdown preempts a pending online transition", async () => {
  let observedAbort = false;
  const lifecycle = createMcpNativeConnectionLifecycle({
    initiallyOnline: false,
    createConnection: () => ({
      connect(signal) {
        return new Promise((resolve) => {
          signal.addEventListener(
            "abort",
            () => {
              observedAbort = true;
              resolve();
            },
            { once: true },
          );
        });
      },
      close() {},
    }),
    classifyError: retryable,
    timeoutMs: 100,
    maxAttempts: 1,
  });

  const online = lifecycle.setOnline(true);
  await new Promise((resolve) => setImmediate(resolve));
  await lifecycle.shutdown();
  await online;

  assert.equal(observedAbort, true);
  assert.deepEqual(lifecycle.state, { kind: "disconnected", reason: "shutdown" });
});

test("connection lifecycle handles an already-closed first unit and contains observer failures", async () => {
  let attempts = 0;
  const lifecycle = createMcpNativeConnectionLifecycle({
    createConnection() {
      attempts += 1;
      return {
        connect() {},
        close() {},
        ...(attempts === 1 ? { closed: Promise.resolve(new Error("closed")) } : {}),
      };
    },
    classifyError: retryable,
    onStateChange() {
      throw new Error("UI observer failed");
    },
    diagnostics: {
      emit() {
        throw new Error("telemetry failed");
      },
    },
  });
  await lifecycle.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(attempts, 2);
  assert.equal(lifecycle.state.kind, "ready");
  await lifecycle.shutdown();
});

test("connection lifecycle validates bounds and safe classifier output", async () => {
  assert.throws(
    () =>
      new McpNativeConnectionLifecycle({
        createConnection: () => ({ connect() {}, close() {} }),
        classifyError: retryable,
        maxAttempts: 9,
      }),
    /connection attempts/,
  );
  assert.throws(
    () =>
      new McpNativeConnectionLifecycle({
        createConnection: () => ({ connect() {}, close() {} }),
        classifyError: retryable,
        initiallyOnline: /** @type {any} */ ("yes"),
      }),
    /valid host callbacks/,
  );
  const lifecycle = createMcpNativeConnectionLifecycle({
    createConnection: () => ({
      connect() {
        throw new Error("failure");
      },
      close() {},
    }),
    classifyError: () => ({ kind: "retryable", code: "unsafe code with spaces" }),
  });
  await assert.rejects(() => lifecycle.start(), /invalid safe classification/);

  const inheritedClassification = createMcpNativeConnectionLifecycle({
    createConnection: () => ({
      connect() {
        throw new Error("failure");
      },
      close() {},
    }),
    classifyError: () => Object.create({ kind: "retryable", code: "inherited" }),
  });
  await assert.rejects(() => inheritedClassification.start(), /classifier must return an object/);
});
