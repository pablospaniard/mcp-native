import assert from "node:assert/strict";
import test from "node:test";

import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { McpServer } from "@modelcontextprotocol/server";

import {
  MCP_NATIVE_HOST_EXTENSION_CAPABILITIES,
  MCP_NATIVE_HOST_MAX_LISTENERS,
  MCP_NATIVE_HOST_MAX_PENDING_OPERATIONS,
  McpNativeHostControllerError,
  createMcpNativeHostController,
} from "../packages/host/dist/index.js";
import { McpSdkClientAdapter, createMcpNativeClientOptions } from "../packages/mcp/dist/index.js";
import { MCP_APPS_MIME_TYPE } from "../packages/webview/dist/index.js";

const retryable = () => ({ kind: "retryable", code: "network-unavailable" });

function listedTool(name = "echo") {
  return { name, inputSchema: { type: "object" } };
}

function fakeClient(overrides = {}) {
  return {
    async listTools() {
      return { tools: [listedTool()] };
    },
    async callTool(_name, arguments_) {
      return { content: [{ type: "text", text: JSON.stringify(arguments_) }] };
    },
    async readResource() {
      return { contents: [] };
    },
    getClientExtensionSettings() {
      return {};
    },
    getServerExtensionSettings() {
      return {};
    },
    ...overrides,
  };
}

function fakeConnection(client, overrides = {}) {
  return {
    client,
    async connect() {},
    async close() {},
    ...overrides,
  };
}

async function nextTurn() {
  await new Promise((resolve) => setImmediate(resolve));
}

async function waitUntil(predicate, remainingTurns = 10) {
  if (predicate()) return;
  if (remainingTurns === 0) throw new Error("Condition did not become true");
  await nextTurn();
  await waitUntil(predicate, remainingTurns - 1);
}

async function abandonCalls(controller, remaining) {
  if (remaining === 0) return;
  const pending = controller.callTool("echo");
  await nextTurn();
  assert.equal(controller.cancelCurrentCall(), true);
  await assert.rejects(() => pending, /cancelled/);
  await abandonCalls(controller, remaining - 1);
}

test("host controller connects, discovers, calls, resolves, publishes, and shuts down", async () => {
  const calls = [];
  let closes = 0;
  const controller = createMcpNativeHostController({
    createConnection: () =>
      fakeConnection(
        fakeClient({
          async callTool(name, arguments_, options) {
            calls.push({ name, arguments_, signal: options.signal });
            return { content: [{ type: "text", text: "done" }] };
          },
        }),
        {
          close() {
            closes += 1;
          },
        },
      ),
    classifyError: retryable,
  });
  const snapshots = [];
  controller.subscribe(() => snapshots.push(controller.getSnapshot()));

  await controller.start();
  const ready = controller.getSnapshot();
  assert.equal(ready.connection.kind, "ready");
  assert.equal(ready.tools.kind, "ready");
  assert.deepEqual(
    ready.tools.result.tools.map((tool) => tool.name),
    ["echo"],
  );
  assert.equal(Object.isFrozen(ready), true);
  assert.equal(Object.isFrozen(ready.tools.result.tools[0]), true);

  const resolved = await controller.callTool("echo", { value: 7 });
  assert.deepEqual(resolved, {
    kind: "ordinary",
    result: { content: [{ type: "text", text: "done" }] },
  });
  assert.equal(calls[0].name, "echo");
  assert.deepEqual(calls[0].arguments_, { value: 7 });
  assert.equal(calls[0].signal.aborted, false);
  assert.equal(controller.getSnapshot().call.kind, "resolved");
  assert.ok(snapshots.some((snapshot) => snapshot.tools.kind === "loading"));
  assert.ok(snapshots.some((snapshot) => snapshot.call.kind === "loading"));

  await controller.shutdown();
  assert.equal(closes, 1);
  assert.deepEqual(controller.getSnapshot().connection, {
    kind: "disconnected",
    reason: "shutdown",
  });
  assert.throws(
    () => controller.subscribe(() => {}),
    (error) => error instanceof McpNativeHostControllerError && error.code === "shutdown",
  );
});

test("host calls only exact tool metadata discovered on the active connection", async () => {
  const resourceUri = "ui://weather/app";
  let reads = 0;
  const client = fakeClient({
    async listTools() {
      return {
        tools: [
          {
            ...listedTool("weather"),
            _meta: { ui: { resourceUri, visibility: ["model", "app"] } },
          },
        ],
      };
    },
    async callTool() {
      return { content: [{ type: "text", text: "weather" }] };
    },
    async readResource(uri, options) {
      reads += 1;
      assert.equal(options.signal.aborted, false);
      return {
        contents: [
          {
            uri,
            mimeType: MCP_APPS_MIME_TYPE,
            text: "<!doctype html><html><head><title>Weather</title></head><body>Clear</body></html>",
          },
        ],
      };
    },
    getClientExtensionSettings() {
      return MCP_NATIVE_HOST_EXTENSION_CAPABILITIES;
    },
    getServerExtensionSettings() {
      return MCP_NATIVE_HOST_EXTENSION_CAPABILITIES;
    },
  });
  const controller = createMcpNativeHostController({
    createConnection: () => fakeConnection(client),
    classifyError: retryable,
  });

  await controller.start();
  await assert.rejects(
    () => controller.callTool("unlisted"),
    (error) => error instanceof McpNativeHostControllerError && error.code === "tool-not-listed",
  );
  const resolved = await controller.callTool("weather");
  assert.equal(resolved.kind, "mcp-app");
  assert.equal(reads, 1);
  await controller.shutdown();
});

test("host cancellation reaches the SDK boundary and rejects overlapping operations", async () => {
  let observedSignal;
  const client = fakeClient({
    callTool(_name, _arguments, options) {
      observedSignal = options.signal;
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener(
          "abort",
          () => reject(new Error("secret cancelled request")),
          { once: true },
        );
      });
    },
  });
  const controller = createMcpNativeHostController({
    createConnection: () => fakeConnection(client),
    classifyError: retryable,
  });
  await controller.start();

  const pending = controller.callTool("echo");
  await nextTurn();
  await assert.rejects(
    () => controller.callTool("echo"),
    (error) =>
      error instanceof McpNativeHostControllerError && error.code === "operation-in-progress",
  );
  assert.equal(controller.cancelCurrentCall(), true);
  assert.equal(observedSignal.aborted, true);
  await assert.rejects(
    () => pending,
    (error) => error instanceof McpNativeHostControllerError && error.code === "cancelled",
  );
  assert.equal(controller.getSnapshot().call.kind, "cancelled");
  assert.equal(controller.cancelCurrentCall(), false);
  await controller.shutdown();
});

test("host rejects pre-cancelled and invalid calls before starting SDK work", async () => {
  let calls = 0;
  const controller = createMcpNativeHostController({
    createConnection: () =>
      fakeConnection(
        fakeClient({
          async callTool() {
            calls += 1;
            return { content: [] };
          },
        }),
      ),
    classifyError: retryable,
  });
  await controller.start();

  const cancellation = new AbortController();
  cancellation.abort();
  await assert.rejects(
    () => controller.callTool("echo", {}, { signal: cancellation.signal }),
    (error) => error instanceof McpNativeHostControllerError && error.code === "cancelled",
  );
  await assert.rejects(
    () => controller.callTool(/** @type {any} */ (7)),
    (error) => error instanceof McpNativeHostControllerError && error.code === "invalid-call",
  );
  assert.equal(calls, 0);
  await controller.shutdown();
});

test("host maps opaque tool failures to a stable error without retaining their message", async () => {
  const controller = createMcpNativeHostController({
    createConnection: () =>
      fakeConnection(
        fakeClient({
          async callTool() {
            throw new Error("secret server failure");
          },
        }),
      ),
    classifyError: retryable,
  });
  await controller.start();

  await assert.rejects(
    () => controller.callTool("echo"),
    (error) =>
      error instanceof McpNativeHostControllerError &&
      error.code === "tool-call-failed" &&
      !error.message.includes("secret"),
  );
  assert.deepEqual(controller.getSnapshot().call, {
    kind: "error",
    code: "tool-call-failed",
  });
  await controller.shutdown();
});

test("reconnect clears stale tools and prevents a late old result from winning", async () => {
  let resolveFirstCall;
  let closeFirst;
  let attempts = 0;
  const controller = createMcpNativeHostController({
    createConnection() {
      attempts += 1;
      const attempt = attempts;
      const client = fakeClient({
        async listTools() {
          return { tools: [listedTool(`tool-${attempt}`)] };
        },
        callTool() {
          if (attempt === 1) {
            return new Promise((resolve) => {
              resolveFirstCall = resolve;
            });
          }
          return Promise.resolve({ content: [{ type: "text", text: "fresh" }] });
        },
      });
      return fakeConnection(client, {
        ...(attempt === 1
          ? {
              closed: new Promise((resolve) => {
                closeFirst = resolve;
              }),
            }
          : {}),
      });
    },
    classifyError: retryable,
  });
  await controller.start();
  const staleCall = controller.callTool("tool-1");
  await nextTurn();
  closeFirst(new Error("secret disconnect"));
  await assert.rejects(
    () => staleCall,
    (error) => error instanceof McpNativeHostControllerError && error.code === "cancelled",
  );

  await waitUntil(() => attempts === 2);
  await waitUntil(() => controller.getSnapshot().tools.kind === "ready");
  assert.equal(attempts, 2);
  assert.deepEqual(
    controller.getSnapshot().tools.result.tools.map((tool) => tool.name),
    ["tool-2"],
  );
  resolveFirstCall({ content: [{ type: "text", text: "stale" }] });
  await nextTurn();
  assert.equal(controller.getSnapshot().call.kind, "idle");

  const fresh = await controller.callTool("tool-2");
  assert.equal(fresh.kind, "ordinary");
  assert.equal(fresh.result.content[0].text, "fresh");
  await controller.shutdown();
});

test("a timed-out connection cannot replace the newer active connection when it resolves late", async () => {
  let resolveFirstConnect;
  let firstSignal;
  let attempts = 0;
  let firstCalls = 0;
  let secondCalls = 0;
  const controller = createMcpNativeHostController({
    createConnection() {
      attempts += 1;
      const attempt = attempts;
      const client = fakeClient({
        async listTools() {
          return { tools: [listedTool(`tool-${attempt}`)] };
        },
        async callTool() {
          if (attempt === 1) firstCalls += 1;
          else secondCalls += 1;
          return { content: [{ type: "text", text: `attempt-${attempt}` }] };
        },
      });
      return fakeConnection(client, {
        connect(signal) {
          if (attempt !== 1) return;
          firstSignal = signal;
          return new Promise((resolve) => {
            resolveFirstConnect = resolve;
          });
        },
      });
    },
    classifyError: retryable,
    timeoutMs: 5,
    maxAttempts: 2,
    initialBackoffMs: 0,
    maxBackoffMs: 0,
  });

  await controller.start();
  assert.equal(attempts, 2);
  assert.equal(firstSignal.aborted, false);
  assert.deepEqual(
    controller.getSnapshot().tools.result.tools.map((tool) => tool.name),
    ["tool-2"],
  );

  resolveFirstConnect();
  await nextTurn();
  const result = await controller.callTool("tool-2");
  assert.equal(result.result.content[0].text, "attempt-2");
  assert.equal(firstCalls, 0);
  assert.equal(secondCalls, 1);
  await controller.shutdown();
});

test("refreshTools forces the official SDK adapter to replace a fresh cached tool list", async () => {
  let advertisedName = "old-tool";
  let cached;
  let requests = 0;
  const adapter = new McpSdkClientAdapter({
    async listTools(_params, options) {
      if (options?.cacheMode !== "refresh" && cached !== undefined) return cached;
      requests += 1;
      cached = { tools: [listedTool(advertisedName)], ttlMs: 60_000 };
      return cached;
    },
    async callTool() {
      return { content: [] };
    },
    async readResource() {
      return { contents: [] };
    },
  });
  const controller = createMcpNativeHostController({
    createConnection: () => fakeConnection(adapter),
    classifyError: retryable,
  });

  await controller.start();
  assert.equal(requests, 1);
  advertisedName = "new-tool";
  const refreshed = await controller.refreshTools();
  assert.equal(requests, 2);
  assert.deepEqual(
    refreshed.tools.map((tool) => tool.name),
    ["new-tool"],
  );
  await controller.shutdown();
});

test("host rejects ambiguous or incomplete tool discovery", async () => {
  const duplicate = createMcpNativeHostController({
    createConnection: () =>
      fakeConnection(
        fakeClient({
          async listTools() {
            return { tools: [listedTool(), listedTool()] };
          },
        }),
      ),
    classifyError: retryable,
  });
  await duplicate.start();
  assert.deepEqual(duplicate.getSnapshot().tools, { kind: "error", code: "invalid-tool-list" });
  await duplicate.shutdown();

  const incomplete = createMcpNativeHostController({
    createConnection: () =>
      fakeConnection(
        fakeClient({
          async listTools() {
            return { tools: [listedTool("partial")], nextCursor: "next-page" };
          },
        }),
      ),
    classifyError: retryable,
  });
  await incomplete.start();
  assert.deepEqual(incomplete.getSnapshot().tools, {
    kind: "error",
    code: "invalid-tool-list",
  });
  await assert.rejects(
    () => incomplete.callTool("partial"),
    (error) => error instanceof McpNativeHostControllerError && error.code === "not-ready",
  );
  await incomplete.shutdown();
});

test("host bounds abandoned operations and listeners", async () => {
  const abandoned = createMcpNativeHostController({
    createConnection: () =>
      fakeConnection(
        fakeClient({
          callTool() {
            return new Promise(() => {});
          },
        }),
      ),
    classifyError: retryable,
  });
  await abandoned.start();
  await abandonCalls(abandoned, MCP_NATIVE_HOST_MAX_PENDING_OPERATIONS);
  await assert.rejects(
    () => abandoned.callTool("echo"),
    (error) =>
      error instanceof McpNativeHostControllerError && error.code === "operation-capacity-exceeded",
  );

  const unsubscribers = Array.from({ length: MCP_NATIVE_HOST_MAX_LISTENERS }, () =>
    abandoned.subscribe(() => {}),
  );
  assert.throws(() => abandoned.subscribe(() => {}), /snapshot listeners/);
  for (const unsubscribe of unsubscribers) unsubscribe();
  await abandoned.shutdown();
});

test("host controller completes a real official SDK connection and tool call", async () => {
  const controller = createMcpNativeHostController({
    createConnection() {
      const server = new McpServer({ name: "host-controller-server", version: "1.0.0" });
      server.registerTool("hello", { description: "Say hello" }, async () => ({
        content: [{ type: "text", text: "Hello from MCP" }],
      }));
      const client = new Client(
        { name: "host-controller-client", version: "1.0.0" },
        createMcpNativeClientOptions("auto"),
      );
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      return {
        client: new McpSdkClientAdapter(client),
        async connect(signal) {
          await server.connect(serverTransport);
          await client.connect(clientTransport, { signal });
        },
        async close() {
          await client.close();
          await server.close();
        },
      };
    },
    classifyError: retryable,
  });

  await controller.start();
  assert.deepEqual(
    controller.getSnapshot().tools.result.tools.map((tool) => tool.name),
    ["hello"],
  );
  const result = await controller.callTool("hello");
  assert.deepEqual(result, {
    kind: "ordinary",
    result: { content: [{ type: "text", text: "Hello from MCP" }] },
  });
  await controller.shutdown();
});
