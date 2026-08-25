import assert from "node:assert/strict";
import test from "node:test";

import {
  JsonValidationError,
  McpNativeActionDeniedError,
  McpNativeRuntime,
  createAllowlistActionPolicy,
} from "../packages/core/dist/index.js";

test("the core runtime routes a declared tool action", async () => {
  const calls = [];
  const client = {
    async listTools() {
      return { tools: [] };
    },
    async callTool(name, arguments_) {
      calls.push({ name, arguments: arguments_ });
      return { content: [{ type: "text", text: "saved" }] };
    },
    async readResource(uri) {
      return { contents: [{ uri, mimeType: "application/json", text: "{}" }] };
    },
  };

  const runtime = new McpNativeRuntime(client, {
    actionPolicy: createAllowlistActionPolicy([
      { name: "save_profile", arguments: { displayName: "Ada" } },
    ]),
  });
  const result = await runtime.dispatch({
    type: "tool",
    name: "save_profile",
    arguments: { displayName: "Ada" },
  });

  assert.deepEqual(calls, [{ name: "save_profile", arguments: { displayName: "Ada" } }]);
  assert.equal(result.isError, undefined);

  await assert.rejects(
    () =>
      runtime.dispatch({
        type: "tool",
        name: "save_profile",
        arguments: { displayName: "Eve", amount: 1_000_000 },
      }),
    McpNativeActionDeniedError,
  );
  assert.equal(calls.length, 1);
});

test("the core runtime denies surface actions unless the host allows them", async () => {
  const calls = [];
  const client = {
    async listTools() {
      return { tools: [] };
    },
    async callTool(name, arguments_) {
      calls.push({ name, arguments: arguments_ });
      return { content: [] };
    },
    async readResource() {
      return { contents: [] };
    },
  };

  await assert.rejects(
    () => new McpNativeRuntime(client).dispatch({ type: "tool", name: "delete_all" }),
    (error) => error instanceof McpNativeActionDeniedError && error.toolName === "delete_all",
  );
  await assert.rejects(
    () =>
      new McpNativeRuntime(client, { actionPolicy: () => false }).dispatch({
        type: "tool",
        name: "delete_all",
      }),
    McpNativeActionDeniedError,
  );
  assert.deepEqual(calls, []);
});

test("callTool applies the action policy when one is configured", async () => {
  const calls = [];
  const client = {
    async listTools() {
      return { tools: [] };
    },
    async callTool(name, arguments_) {
      calls.push({ name, arguments: arguments_ });
      return { content: [] };
    },
    async readResource() {
      return { contents: [] };
    },
  };
  const runtime = new McpNativeRuntime(client, {
    actionPolicy: createAllowlistActionPolicy([{ name: "open_surface" }]),
  });

  await runtime.callTool("open_surface");
  await assert.rejects(() => runtime.callTool("delete_all"), McpNativeActionDeniedError);
  await assert.rejects(
    () => runtime.callTool("open_surface", { unexpected: true }),
    McpNativeActionDeniedError,
  );
  assert.deepEqual(calls, [{ name: "open_surface", arguments: {} }]);
});

test("callTool validates JSON arguments even without an action policy", async () => {
  const calls = [];
  const client = {
    async listTools() {
      return { tools: [] };
    },
    async callTool(name, arguments_) {
      calls.push({ name, arguments: arguments_ });
      return { content: [] };
    },
    async readResource() {
      return { contents: [] };
    },
  };
  const runtime = new McpNativeRuntime(client);

  await assert.rejects(() => runtime.callTool("safe", { value: NaN }), JsonValidationError);
  await assert.rejects(() => runtime.callTool(""), JsonValidationError);
  assert.deepEqual(calls, []);
});

test("createAllowlistActionPolicy supports argument predicates", async () => {
  const runtime = new McpNativeRuntime(
    {
      async listTools() {
        return { tools: [] };
      },
      async callTool() {
        return { content: [] };
      },
      async readResource() {
        return { contents: [] };
      },
    },
    {
      actionPolicy: createAllowlistActionPolicy([
        {
          name: "transfer",
          authorizeArguments: (arguments_) =>
            arguments_ !== undefined &&
            typeof arguments_.amount === "number" &&
            arguments_.amount <= 100,
        },
      ]),
    },
  );

  await runtime.dispatch({ type: "tool", name: "transfer", arguments: { amount: 50 } });
  await assert.rejects(
    () => runtime.dispatch({ type: "tool", name: "transfer", arguments: { amount: 500 } }),
    McpNativeActionDeniedError,
  );
});

test("createAllowlistActionPolicy awaits async predicates and only treats true as allow", async () => {
  const calls = [];
  const runtime = new McpNativeRuntime(
    {
      async listTools() {
        return { tools: [] };
      },
      async callTool(name, arguments_) {
        calls.push({ name, arguments: arguments_ });
        return { content: [] };
      },
      async readResource() {
        return { contents: [] };
      },
    },
    {
      actionPolicy: createAllowlistActionPolicy([
        {
          name: "denied_async",
          authorizeArguments: async () => false,
        },
        {
          name: "allowed_async",
          authorizeArguments: async () => true,
        },
        {
          name: "truthy_non_boolean",
          authorizeArguments: async () => /** @type {any} */ ("yes"),
        },
      ]),
    },
  );

  await assert.rejects(
    () => runtime.dispatch({ type: "tool", name: "denied_async" }),
    McpNativeActionDeniedError,
  );
  await runtime.dispatch({ type: "tool", name: "allowed_async" });
  await assert.rejects(
    () => runtime.dispatch({ type: "tool", name: "truthy_non_boolean" }),
    JsonValidationError,
  );
  assert.deepEqual(calls, [{ name: "allowed_async", arguments: {} }]);
});

test("action policies authorize only when they resolve to true", async () => {
  const calls = [];
  const runtime = new McpNativeRuntime(
    {
      async listTools() {
        return { tools: [] };
      },
      async callTool(name, arguments_) {
        calls.push({ name, arguments: arguments_ });
        return { content: [] };
      },
      async readResource() {
        return { contents: [] };
      },
    },
    {
      actionPolicy: async () => /** @type {any} */ ({}),
    },
  );

  await assert.rejects(
    () => runtime.dispatch({ type: "tool", name: "looks_truthy" }),
    McpNativeActionDeniedError,
  );
  assert.deepEqual(calls, []);
});

test("the core runtime validates and safely reconstructs actions before policy evaluation", async () => {
  const calls = [];
  const policyActions = [];
  const client = {
    async listTools() {
      return { tools: [] };
    },
    async callTool(name, arguments_) {
      calls.push({ name, arguments: arguments_ });
      return { content: [] };
    },
    async readResource() {
      return { contents: [] };
    },
  };
  const runtime = new McpNativeRuntime(client, {
    actionPolicy(action) {
      policyActions.push(action);
      return action.name === "safe";
    },
  });
  const action = JSON.parse(
    '{"type":"tool","name":"safe","arguments":{"__proto__":{"polluted":true}}}',
  );

  await runtime.dispatch(action);

  const arguments_ = calls[0].arguments;
  assert.equal(Object.getPrototypeOf(arguments_), Object.prototype);
  assert.equal(Object.hasOwn(arguments_, "__proto__"), true);
  assert.equal(arguments_.polluted, undefined);
  assert.deepEqual(arguments_["__proto__"], { polluted: true });
  assert.equal(policyActions[0].arguments, arguments_);

  const circular = {};
  circular.self = circular;
  await assert.rejects(
    () => runtime.dispatch({ type: "tool", name: "safe", arguments: circular }),
    JsonValidationError,
  );
  await assert.rejects(
    () => runtime.dispatch({ type: "tool", name: "safe", arguments: { value: NaN } }),
    JsonValidationError,
  );
  await assert.rejects(
    () => runtime.dispatch({ type: "tool", name: "safe", arguments: [] }),
    JsonValidationError,
  );
  await assert.rejects(
    () =>
      runtime.dispatch({
        type: "tool",
        name: "safe",
        arguments: { values: Array(1) },
      }),
    (error) => error instanceof JsonValidationError && /Sparse JSON array item/.test(error.message),
  );
  assert.equal(policyActions.length, 1);
  assert.equal(calls.length, 1);
});

test("the core runtime delegates every client operation", async () => {
  const calls = [];
  const tools = { tools: [{ name: "save", inputSchema: { type: "object" } }] };
  const resource = {
    contents: [{ uri: "ui://profile", mimeType: "application/json", text: "{}" }],
  };
  const client = {
    async listTools() {
      calls.push(["listTools"]);
      return tools;
    },
    async callTool(name, arguments_) {
      calls.push(["callTool", name, arguments_]);
      return { content: [], isError: false };
    },
    async readResource(uri) {
      calls.push(["readResource", uri]);
      return resource;
    },
  };

  const runtime = new McpNativeRuntime(client);

  assert.equal(await runtime.listTools(), tools);
  assert.deepEqual(await runtime.callTool("save"), { content: [], isError: false });
  assert.equal(await runtime.readResource("ui://profile"), resource);
  assert.deepEqual(calls, [
    ["listTools"],
    ["callTool", "save", {}],
    ["readResource", "ui://profile"],
  ]);
});
