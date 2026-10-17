/* eslint-disable no-await-in-loop -- Stateful cancellation and reconnection sequences must run in order. */
import assert from "node:assert/strict";
import test from "node:test";
import {
  createContractHostController,
  isContractRegistry,
  resolveContractResult,
  ContractError,
} from "../packages/host/dist/contracts.js";
import {
  MCP_NATIVE_HOST_MAX_PENDING_OPERATIONS,
  MCP_NATIVE_HOST_MAX_LISTENERS,
  McpNativeHostControllerError,
  createMcpNativeHostController,
} from "../packages/host/dist/index.js";
import { MIME_TYPE } from "../packages/a2ui/dist/index.js";
import { McpSdkClientAdapter } from "../packages/mcp/dist/index.js";
import {
  registry,
  result,
  client,
  unit,
  deferred,
  turn,
  until,
  tool,
  classifyError,
} from "./fixtures/contract-lifecycle.mjs";

const errorCode = (expected) => (error) =>
  error instanceof McpNativeHostControllerError && error.code === expected;

test("contract controller discovers, resolves and owns only its current immutable result", async () => {
  const installed = registry();
  let factorySettings;
  const controller = createContractHostController({
    registry: installed,
    classifyError,
    createConnection(extensions) {
      factorySettings = extensions;
      return unit(client(extensions));
    },
  });
  assert.equal(controller.registry, installed);
  assert.ok(isContractRegistry(installed));
  assert.equal(isContractRegistry({ ...installed }), false);
  assert.equal(controller.clearResult(), false);
  await controller.start();
  assert.equal(factorySettings, installed.extensionSettings);
  assert.ok(Object.isFrozen(factorySettings));
  await assert.rejects(controller.callTool("unlisted"), errorCode("tool-not-listed"));
  const first = await controller.callTool("receipt");
  assert.equal(first.kind, "contract-data");
  assert.equal(controller.getSnapshot().call.result, first);
  assert.ok(controller.isCurrentResult(first));
  assert.equal(controller.isCurrentResult({ ...first }), false);
  assert.ok(Object.isFrozen(first.model));
  assert.equal(controller.clearResult(), true);
  assert.equal(controller.clearResult(), false);
  assert.equal(controller.isCurrentResult(first), false);
  assert.equal(first.model.title, "Paid"); // Clearing ownership cannot erase inert data already returned.
  const second = await controller.callTool("receipt");
  assert.notEqual(first, second);
  await controller.refreshTools();
  assert.equal(controller.isCurrentResult(second), false);
  await controller.shutdown();
});

test("SDK-backed controller preserves contract metadata through discovery and call boundaries", async () => {
  const controller = createContractHostController({
    registry: registry(),
    classifyError,
    createConnection(extensions) {
      return unit(
        new McpSdkClientAdapter(
          {
            listTools: async () => ({ tools: [tool] }),
            callTool: async () => result(),
            readResource: async () => ({ contents: [] }),
            getServerCapabilities: () => ({ extensions }),
          },
          { clientExtensions: extensions },
        ),
      );
    },
  });
  await controller.start();
  assert.equal((await controller.callTool("receipt")).kind, "contract-data");
  await controller.shutdown();
});

test("immediate cancellation and pre-aborted calls never invoke the SDK", async () => {
  let calls = 0;
  const controller = createContractHostController({
    registry: registry(),
    classifyError,
    createConnection: (extensions) =>
      unit(
        client(extensions, {
          callTool() {
            calls++;
            return Promise.resolve(result());
          },
        }),
      ),
  });
  await controller.start();
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(
    controller.callTool("receipt", {}, { signal: aborted.signal }),
    errorCode("cancelled"),
  );
  const pending = controller.callTool("receipt");
  controller.cancelCurrentCall();
  await assert.rejects(pending, errorCode("cancelled"));
  await turn();
  assert.equal(calls, 0);
  await controller.shutdown();
});

test("cancelled late results cannot invoke preparation or overwrite a fresh result", async () => {
  const late = deferred();
  let prepared = 0;
  let calls = 0;
  let observed;
  const controller = createContractHostController({
    registry: registry((input) => {
      prepared++;
      return input;
    }),
    classifyError,
    createConnection: (extensions) =>
      unit(
        client(extensions, {
          callTool(_name, _args, options) {
            observed = options.signal;
            return ++calls === 1 ? late.promise : Promise.resolve(result("Fresh"));
          },
        }),
      ),
  });
  await controller.start();
  const pending = controller.callTool("receipt");
  await turn();
  await assert.rejects(controller.callTool("receipt"), errorCode("operation-in-progress"));
  assert.equal(controller.cancelCurrentCall(), true);
  assert.equal(observed.aborted, true);
  await assert.rejects(pending, errorCode("cancelled"));
  const fresh = await controller.callTool("receipt");
  late.resolve(result("Stale"));
  await turn();
  assert.equal(prepared, 1);
  assert.equal(controller.getSnapshot().call.result, fresh);
  assert.equal(fresh.model.title, "Fresh");
  await controller.shutdown();
});

test("external abort and reentrant cancellation during preparation suppress publication", async () => {
  let controller;
  const installed = registry((input) => {
    controller.cancelCurrentCall();
    return input;
  });
  controller = createContractHostController({
    registry: installed,
    classifyError,
    createConnection: (extensions) => unit(client(extensions)),
  });
  await controller.start();
  const snapshots = [];
  controller.subscribe(() => snapshots.push(controller.getSnapshot().call.kind));
  await assert.rejects(controller.callTool("receipt"), errorCode("cancelled"));
  assert.equal(snapshots.includes("resolved"), false);
  assert.equal(controller.getSnapshot().call.kind, "cancelled");
  await controller.shutdown();

  const late = deferred();
  const abort = new AbortController();
  let prepared = 0;
  const external = createContractHostController({
    registry: registry((input) => {
      prepared++;
      return input;
    }),
    classifyError,
    createConnection: (extensions) => unit(client(extensions, { callTool: () => late.promise })),
  });
  await external.start();
  const pending = external.callTool("receipt", {}, { signal: abort.signal });
  await turn();
  abort.abort();
  await assert.rejects(pending, errorCode("cancelled"));
  late.resolve(result());
  await turn();
  assert.equal(prepared, 0);
  await external.shutdown();
});

test("reconnect clears tools and results and renegotiates through a fresh connection", async () => {
  const late = deferred();
  let attempts = 0;
  let prepared = 0;
  const controller = createContractHostController({
    registry: registry((input) => {
      prepared++;
      return input;
    }),
    classifyError,
    createConnection(extensions) {
      const attempt = ++attempts;
      return unit(
        client(extensions, {
          listTools: async () => ({ tools: [{ ...tool, name: `receipt-${attempt}` }] }),
          callTool: () => (attempt === 1 ? late.promise : Promise.resolve(result("New principal"))),
          getServerExtensionSettings: () => (attempt === 1 ? extensions : {}),
        }),
      );
    },
  });
  await controller.start();
  const pending = controller.callTool("receipt-1");
  await turn();
  const cancelled = assert.rejects(pending, errorCode("cancelled"));
  await controller.setOnline(false);
  await cancelled;
  assert.equal(controller.getSnapshot().call.kind, "idle");
  await controller.setOnline(true);
  await assert.rejects(controller.callTool("receipt-1"), errorCode("tool-not-listed"));
  const fresh = await controller.callTool("receipt-2");
  assert.equal(fresh.kind, "ordinary");
  late.resolve(result());
  await turn();
  assert.equal(prepared, 0);
  assert.equal(controller.getSnapshot().call.result, fresh);
  await controller.shutdown();
});

test("unexpected closure retires pending results before automatic rediscovery", async () => {
  const closed = deferred();
  const late = deferred();
  let attempts = 0;
  let prepared = 0;
  const controller = createContractHostController({
    registry: registry((input) => {
      prepared++;
      return input;
    }),
    classifyError,
    initialBackoffMs: 0,
    maxBackoffMs: 0,
    createConnection(extensions) {
      const attempt = ++attempts;
      return unit(
        client(extensions, {
          callTool: () => (attempt === 1 ? late.promise : Promise.resolve(result("Reconnected"))),
        }),
        attempt === 1 ? { closed: closed.promise } : {},
      );
    },
  });
  await controller.start();
  const pending = controller.callTool("receipt");
  await turn();
  const cancelled = assert.rejects(pending, errorCode("cancelled"));
  closed.resolve("connection lost");
  await cancelled;
  await until(() => attempts === 2 && controller.getSnapshot().tools.kind === "ready");
  const fresh = await controller.callTool("receipt");
  late.resolve(result());
  await turn();
  assert.equal(prepared, 1);
  assert.equal(controller.getSnapshot().call.result, fresh);
  await controller.shutdown();
});

test("shutdown immediately drops retained results and shares exactly-once bounded close completion", async () => {
  const close = deferred();
  let closes = 0;
  let notifications = 0;
  const controller = createContractHostController({
    registry: registry(),
    classifyError,
    createConnection: (extensions) =>
      unit(client(extensions), {
        close() {
          closes++;
          return close.promise;
        },
      }),
  });
  await controller.start();
  const resolved = await controller.callTool("receipt");
  controller.subscribe(() => {
    notifications++;
  });
  const first = controller.shutdown();
  const second = controller.shutdown();
  assert.equal(first, second);
  assert.equal(controller.isCurrentResult(resolved), false);
  assert.equal(controller.getSnapshot().call.kind, "idle");
  assert.deepEqual(controller.getSnapshot().connection, {
    kind: "disconnected",
    reason: "shutdown",
  });
  assert.throws(() => controller.clearResult(), errorCode("shutdown"));
  await assert.rejects(controller.callTool("receipt"), errorCode("shutdown"));
  let finished = false;
  void second.then(() => {
    finished = true;
  });
  await turn();
  assert.equal(finished, false);
  const afterShutdown = notifications;
  close.resolve();
  await Promise.all([first, second]);
  assert.equal(closes, 1);
  assert.equal(notifications, afterShutdown);
});

test("slow or rejected transport cleanup cannot keep result ownership alive", async () => {
  for (const close of [
    () => new Promise(() => {}),
    () => Promise.reject(new Error("secret close")),
  ]) {
    const controller = createContractHostController({
      registry: registry(),
      classifyError,
      closeTimeoutMs: 5,
      createConnection: (extensions) => unit(client(extensions), { close }),
    });
    await controller.start();
    const resolved = await controller.callTool("receipt");
    await controller.shutdown();
    assert.equal(controller.isCurrentResult(resolved), false);
  }
});

test("cancelled operations remain counted until settlement and released slots can be reused", async () => {
  const pendingResults = [];
  let prepared = 0;
  let fresh = false;
  const controller = createContractHostController({
    registry: registry((input) => {
      prepared++;
      return input;
    }),
    classifyError,
    createConnection: (extensions) =>
      unit(
        client(extensions, {
          callTool() {
            if (fresh) return Promise.resolve(result());
            const pending = deferred();
            pendingResults.push(pending);
            return pending.promise;
          },
        }),
      ),
  });
  await controller.start();
  for (let i = 0; i < MCP_NATIVE_HOST_MAX_PENDING_OPERATIONS; i++) {
    const call = controller.callTool("receipt");
    await turn();
    controller.cancelCurrentCall();
    await assert.rejects(call, errorCode("cancelled"));
  }
  await assert.rejects(controller.callTool("receipt"), errorCode("operation-capacity-exceeded"));
  pendingResults[0].resolve(result());
  await turn();
  fresh = true;
  assert.equal((await controller.callTool("receipt")).kind, "contract-data");
  for (const pending of pendingResults) pending.resolve(result());
  await turn();
  assert.equal(prepared, 1);
  const unsubscribers = Array.from({ length: MCP_NATIVE_HOST_MAX_LISTENERS }, () =>
    controller.subscribe(() => {}),
  );
  assert.throws(() => controller.subscribe(() => {}), /snapshot listeners/);
  for (const unsubscribe of unsubscribers) unsubscribe();
  await controller.shutdown();
});

test("late standard resources are rejected before processing in both controller APIs", async () => {
  for (const contract of [false, true]) {
    const late = deferred();
    let processed = 0;
    const installed = registry();
    const options = {
      classifyError,
      createConnection: () =>
        unit(
          client(installed.extensionSettings, {
            callTool: async () => ({
              content: [
                {
                  type: "resource_link",
                  uri: "ui://surface",
                  name: "surface",
                  mimeType: MIME_TYPE,
                },
              ],
            }),
            readResource: () => late.promise,
          }),
        ),
    };
    const controller = contract
      ? createContractHostController({ ...options, registry: installed })
      : createMcpNativeHostController(options);
    await controller.start();
    const pending = controller.callTool("receipt");
    await turn();
    controller.cancelCurrentCall();
    await assert.rejects(pending, errorCode("cancelled"));
    late.resolve({
      get contents() {
        processed++;
        return [];
      },
    });
    await turn();
    assert.equal(processed, 0);
    assert.equal(controller.getSnapshot().call.kind, "cancelled");
    await controller.shutdown();
  }
});

test("invalid registries, limits, reused clients, and discovery failures cannot enable custom calls", async () => {
  assert.throws(
    () => createContractHostController({ registry: {}, classifyError, createConnection() {} }),
    (error) => error instanceof ContractError && error.code === "invalid-registry",
  );
  assert.throws(
    () =>
      createContractHostController({
        registry: registry(),
        classifyError,
        limits: { maxWork: 0 },
        createConnection() {},
      }),
    ContractError,
  );
  const installed = registry();
  const reused = unit(client(installed.extensionSettings));
  const failures = [];
  const controller = createContractHostController({
    registry: installed,
    maxAttempts: 1,
    createConnection: () => reused,
    classifyError(error) {
      failures.push(error);
      return { kind: "terminal", code: "invalid-unit" };
    },
  });
  await controller.start();
  await controller.setOnline(false);
  await controller.setOnline(true);
  assert.equal(controller.getSnapshot().connection.kind, "terminal-error");
  assert.ok(failures.some(errorCode("invalid-connection")));
  await controller.shutdown();
  const invalid = createContractHostController({
    registry: registry(),
    classifyError,
    createConnection: (extensions) =>
      unit(
        client(extensions, { listTools: async () => ({ tools: [tool], nextCursor: "partial" }) }),
      ),
  });
  await invalid.start();
  assert.equal(invalid.getSnapshot().tools.code, "invalid-tool-list");
  await assert.rejects(invalid.callTool("receipt"), errorCode("not-ready"));
  await invalid.shutdown();
});

test("standalone resolver observes cancellation before and during synchronous preparation", async () => {
  const installed = registry();
  const abort = new AbortController();
  abort.abort();
  assert.deepEqual(
    await resolveContractResult({
      registry: installed,
      client: client(installed.extensionSettings),
      tool,
      result: result(),
      signal: abort.signal,
    }),
    { kind: "contract-error", code: "cancelled" },
  );
  const during = new AbortController();
  const local = registry((input, budget) => {
    during.abort();
    budget.consume(1);
    return input;
  });
  assert.deepEqual(
    await resolveContractResult({
      registry: local,
      client: client(local.extensionSettings),
      tool,
      result: result(),
      signal: during.signal,
    }),
    { kind: "contract-error", code: "cancelled" },
  );
  assert.equal(
    (
      await resolveContractResult({
        registry: local,
        client: client(local.extensionSettings),
        tool,
        result: result(),
        signal: {},
      })
    ).code,
    "invalid-input",
  );
});

test("shutdown reserves one completion before abort handlers reenter it", async () => {
  const close = deferred();
  const late = deferred();
  let reentrant;
  let controller;
  let closes = 0;
  controller = createContractHostController({
    registry: registry(),
    classifyError,
    createConnection: (extensions) =>
      unit(
        client(extensions, {
          callTool(_name, _args, options) {
            options.signal.addEventListener(
              "abort",
              () => {
                reentrant = controller.shutdown();
              },
              { once: true },
            );
            return late.promise;
          },
        }),
        {
          close() {
            closes++;
            return close.promise;
          },
        },
      ),
  });
  await controller.start();
  const pending = controller.callTool("receipt");
  await turn();
  const cancelled = assert.rejects(pending, errorCode("cancelled"));
  const shutdown = controller.shutdown();
  assert.equal(reentrant, shutdown);
  await cancelled;
  close.resolve();
  late.resolve(result());
  await shutdown;
  assert.equal(closes, 1);
});

test("a ready observer can shut down before queued discovery without reviving state", async () => {
  let lists = 0;
  let shutdown;
  const controller = createContractHostController({
    registry: registry(),
    classifyError,
    createConnection: (extensions) =>
      unit(
        client(extensions, {
          listTools: async () => {
            lists++;
            return { tools: [tool] };
          },
        }),
      ),
  });
  controller.subscribe(() => {
    if (controller.getSnapshot().connection.kind === "ready") shutdown = controller.shutdown();
  });
  await controller.start();
  await shutdown;
  await turn();
  assert.equal(lists, 0);
  assert.equal(controller.getSnapshot().tools.kind, "idle");
  assert.deepEqual(controller.getSnapshot().connection, {
    kind: "disconnected",
    reason: "shutdown",
  });
});
