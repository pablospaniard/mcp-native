import assert from "node:assert/strict";
import test from "node:test";

import {
  JSON_MAX_DEPTH,
  JSON_MAX_STRING_LENGTH,
  JSON_MAX_TOTAL_STRING_CODE_UNITS,
  JSON_MAX_VALUES,
  JsonValidationError,
  McpNativeActionDeniedError,
  McpNativeRuntime,
  createAllowlistActionPolicy,
  createConsentActionPolicy,
  isMcpExtensionIdentifier,
  negotiateMcpExtension,
  parseJsonValue,
  parseMcpExtensionSettings,
  parseMcpNativeAction,
} from "../packages/core/dist/index.js";

const TEST_EXTENSION_ID = "com.example/native-ui";

test("extension settings require prefixed identifiers and JSON objects", () => {
  const extensions = parseMcpExtensionSettings(
    JSON.parse('{"com.example/native-ui":{"version":"1","__proto__":{"safe":true}}}'),
  );

  assert.equal(isMcpExtensionIdentifier(TEST_EXTENSION_ID), true);
  assert.equal(isMcpExtensionIdentifier("native-ui"), false);
  assert.equal(isMcpExtensionIdentifier("com.example/native/ui"), false);
  assert.equal(Object.hasOwn(extensions[TEST_EXTENSION_ID], "__proto__"), true);
  assert.equal(extensions[TEST_EXTENSION_ID].safe, undefined);
  assert.throws(
    () => parseMcpExtensionSettings({ "native-ui": {} }),
    (error) => error instanceof JsonValidationError && /extension identifier/.test(error.message),
  );
  assert.throws(
    () => parseMcpExtensionSettings({ [TEST_EXTENSION_ID]: true }),
    (error) => error instanceof JsonValidationError && /Expected an object/.test(error.message),
  );
});

test("extensions negotiate only from mutual capability declarations", () => {
  const capabilities = { [TEST_EXTENSION_ID]: { version: "1" } };

  assert.deepEqual(negotiateMcpExtension(TEST_EXTENSION_ID, capabilities, capabilities), {
    kind: "negotiated",
    identifier: TEST_EXTENSION_ID,
    clientSettings: { version: "1" },
    serverSettings: { version: "1" },
  });
  assert.deepEqual(negotiateMcpExtension(TEST_EXTENSION_ID, {}, capabilities), {
    kind: "fallback",
    identifier: TEST_EXTENSION_ID,
    reason: "client-unsupported",
  });
  assert.deepEqual(negotiateMcpExtension(TEST_EXTENSION_ID, capabilities, {}), {
    kind: "fallback",
    identifier: TEST_EXTENSION_ID,
    reason: "server-unsupported",
  });
});

test("extension metadata never grants a capability", async () => {
  const runtime = new McpNativeRuntime({
    async listTools() {
      return { tools: [], _meta: { [TEST_EXTENSION_ID]: { version: "1" } } };
    },
    async callTool() {
      return { content: [{ type: "text", text: "core fallback" }] };
    },
    async readResource() {
      return { contents: [] };
    },
    getClientExtensionSettings() {
      return { [TEST_EXTENSION_ID]: { version: "1" } };
    },
  });

  assert.deepEqual(runtime.negotiateExtension(TEST_EXTENSION_ID), {
    kind: "fallback",
    identifier: TEST_EXTENSION_ID,
    reason: "server-unsupported",
  });
  assert.deepEqual((await runtime.listTools())["_meta"], {
    [TEST_EXTENSION_ID]: { version: "1" },
  });
});

test("runtime negotiation uses only advertised client capabilities", () => {
  const serverExtensions = { [TEST_EXTENSION_ID]: { version: "1" } };
  const withoutAdvertisement = new McpNativeRuntime({
    async listTools() {
      return { tools: [] };
    },
    async callTool() {
      return { content: [] };
    },
    async readResource() {
      return { contents: [] };
    },
    getServerExtensionSettings() {
      return serverExtensions;
    },
  });
  const withAdvertisement = new McpNativeRuntime({
    async listTools() {
      return { tools: [] };
    },
    async callTool() {
      return { content: [] };
    },
    async readResource() {
      return { contents: [] };
    },
    getClientExtensionSettings() {
      return serverExtensions;
    },
    getServerExtensionSettings() {
      return serverExtensions;
    },
  });

  assert.deepEqual(withoutAdvertisement.negotiateExtension(TEST_EXTENSION_ID), {
    kind: "fallback",
    identifier: TEST_EXTENSION_ID,
    reason: "client-unsupported",
  });
  assert.deepEqual(withAdvertisement.negotiateExtension(TEST_EXTENSION_ID), {
    kind: "negotiated",
    identifier: TEST_EXTENSION_ID,
    clientSettings: { version: "1" },
    serverSettings: { version: "1" },
  });
});

test("the public JSON validators enforce depth, value-count, and string limits", () => {
  let nested = null;
  for (let index = 0; index <= JSON_MAX_DEPTH; index += 1) {
    nested = { nested };
  }

  assert.throws(
    () => parseJsonValue(nested),
    (error) => error instanceof JsonValidationError && /maximum depth/.test(error.message),
  );
  assert.throws(
    () => parseJsonValue(Array.from({ length: JSON_MAX_VALUES }, () => null)),
    (error) => error instanceof JsonValidationError && /maximum of.*values/.test(error.message),
  );
  assert.throws(
    () => parseJsonValue("x".repeat(JSON_MAX_STRING_LENGTH + 1)),
    (error) => error instanceof JsonValidationError && /maximum length/.test(error.message),
  );
  assert.throws(
    () => parseJsonValue({ ["x".repeat(JSON_MAX_STRING_LENGTH + 1)]: true }),
    (error) =>
      error instanceof JsonValidationError && /object key.*maximum length/.test(error.message),
  );
  assert.throws(
    () =>
      parseJsonValue(
        Array.from({ length: 17 }, () => "x".repeat(JSON_MAX_STRING_LENGTH)),
        "bounded",
        { maxTotalStringCodeUnits: JSON_MAX_TOTAL_STRING_CODE_UNITS },
      ),
    (error) =>
      error instanceof JsonValidationError &&
      new RegExp(
        `maximum cumulative string/key length of ${JSON_MAX_TOTAL_STRING_CODE_UNITS}`,
      ).test(error.message),
  );
  assert.deepEqual(parseJsonValue({ a: "1234" }, "bounded", { maxTotalStringCodeUnits: 5 }), {
    a: "1234",
  });
  assert.throws(
    () =>
      parseJsonValue({ a: "1234", b: "5" }, "bounded", {
        maxTotalStringCodeUnits: 6,
      }),
    (error) =>
      error instanceof JsonValidationError &&
      /maximum cumulative string\/key length of 6/.test(error.message),
  );
  assert.throws(
    () =>
      parseJsonValue({ abcd: null, efgh: null }, "bounded", {
        maxTotalStringCodeUnits: 7,
      }),
    (error) =>
      error instanceof JsonValidationError &&
      /maximum cumulative string\/key length of 7/.test(error.message),
  );
  assert.throws(
    () => parseJsonValue({}, "bounded", { maxTotalStringCodeUnits: -1 }),
    (error) =>
      error instanceof JsonValidationError && /non-negative safe integer/.test(error.message),
  );
});

test("native actions reject undeclared fields instead of discarding their semantics", () => {
  assert.throws(
    () =>
      parseMcpNativeAction({
        type: "tool",
        name: "delete_profile",
        requiresConfirmation: true,
      }),
    (error) =>
      error instanceof JsonValidationError &&
      /Unsupported field.*requiresConfirmation/.test(error.message),
  );
});

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

test("callTool bypasses surface action policy for trusted host operations", async () => {
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

  await runtime.callTool("bootstrap_tool");
  await runtime.callTool("open_surface", { unexpected: true });
  await assert.rejects(
    () => runtime.dispatch({ type: "tool", name: "open_surface", arguments: { unexpected: true } }),
    McpNativeActionDeniedError,
  );
  assert.deepEqual(calls, [
    { name: "bootstrap_tool", arguments: {} },
    { name: "open_surface", arguments: { unexpected: true } },
  ]);
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

test("createConsentActionPolicy reviews host-owned risk, capability, and privacy descriptors", async () => {
  const calls = [];
  const reviews = [];
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
      actionPolicy: createConsentActionPolicy(
        [
          {
            name: "share_location",
            risk: "external-write",
            authorizeArguments: (arguments_) => arguments_?.precision === "city",
            capabilities: ["device.location"],
            sensitiveData: ["user.location"],
            sharesDataExternally: true,
          },
        ],
        (request) => {
          reviews.push(request);
          assert.equal(Object.isFrozen(request), true);
          assert.equal(Object.isFrozen(request.action), true);
          assert.equal(Object.isFrozen(request.action.arguments), true);
          assert.equal(Object.isFrozen(request.action.arguments.context), true);
          return true;
        },
      ),
    },
  );

  await runtime.dispatch({
    type: "tool",
    name: "share_location",
    arguments: { precision: "city", context: { purpose: "weather" } },
  });

  assert.deepEqual(reviews, [
    {
      action: {
        type: "tool",
        name: "share_location",
        arguments: { precision: "city", context: { purpose: "weather" } },
      },
      risk: "external-write",
      capabilities: ["device.location"],
      sensitiveData: ["user.location"],
      sharesDataExternally: true,
    },
  ]);
  assert.deepEqual(calls, [
    {
      name: "share_location",
      arguments: { precision: "city", context: { purpose: "weather" } },
    },
  ]);

  await assert.rejects(
    () =>
      runtime.dispatch({
        type: "tool",
        name: "share_location",
        arguments: { precision: "exact", context: { purpose: "weather" } },
      }),
    McpNativeActionDeniedError,
  );
  await assert.rejects(
    () => runtime.dispatch({ type: "tool", name: "unknown" }),
    McpNativeActionDeniedError,
  );
  assert.equal(reviews.length, 1);
  assert.equal(calls.length, 1);
});

test("createConsentActionPolicy validates profiles and exact reviewer decisions", async () => {
  const explicitPrivacy = {
    capabilities: [],
    sensitiveData: [],
    sharesDataExternally: false,
  };
  assert.throws(
    () =>
      createConsentActionPolicy(
        [{ name: "tool", risk: "unknown", ...explicitPrivacy }],
        () => true,
      ),
    (error) => error instanceof JsonValidationError && /Unsupported tool risk/.test(error.message),
  );
  assert.throws(
    () =>
      createConsentActionPolicy(
        [
          {
            name: "tool",
            risk: "read-only",
            arguments: {},
            authorizeArguments: () => true,
            ...explicitPrivacy,
          },
        ],
        () => true,
      ),
    (error) => error instanceof JsonValidationError && /cannot declare both/.test(error.message),
  );
  assert.throws(
    () =>
      createConsentActionPolicy(
        [
          {
            name: "tool",
            risk: "read-only",
            ...explicitPrivacy,
            capabilities: ["camera", "camera"],
          },
        ],
        () => true,
      ),
    (error) =>
      error instanceof JsonValidationError && /Duplicate consent identifier/.test(error.message),
  );
  assert.throws(
    () =>
      createConsentActionPolicy(
        [{ name: "tool", risk: "read-only", ...explicitPrivacy, unexpected: true }],
        () => true,
      ),
    (error) => error instanceof JsonValidationError && /Unsupported field/.test(error.message),
  );

  for (const requiredField of ["capabilities", "sensitiveData", "sharesDataExternally"]) {
    const incomplete = { name: "tool", risk: "read-only", ...explicitPrivacy };
    delete incomplete[requiredField];
    assert.throws(
      () => createConsentActionPolicy([incomplete], () => true),
      (error) =>
        error instanceof JsonValidationError &&
        new RegExp(`Missing required field "${requiredField}"`).test(error.message),
    );
  }

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
      actionPolicy: createConsentActionPolicy(
        [{ name: "tool", risk: "read-only", ...explicitPrivacy }],
        async () => "yes",
      ),
    },
  );
  await assert.rejects(
    () => runtime.dispatch({ type: "tool", name: "tool" }),
    (error) =>
      error instanceof JsonValidationError && /reviewer must return a boolean/.test(error.message),
  );
  assert.deepEqual(calls, []);
});

test("createConsentActionPolicy denies explicit refusal and recovers after reviewer failure", async () => {
  const calls = [];
  let reviewAttempt = 0;
  const runtime = new McpNativeRuntime(
    {
      async listTools() {
        return { tools: [] };
      },
      async callTool(name) {
        calls.push(name);
        return { content: [] };
      },
      async readResource() {
        return { contents: [] };
      },
    },
    {
      actionPolicy: createConsentActionPolicy(
        [
          {
            name: "save",
            risk: "local-write",
            capabilities: [],
            sensitiveData: [],
            sharesDataExternally: false,
          },
        ],
        () => {
          reviewAttempt += 1;
          if (reviewAttempt === 1) {
            return false;
          }
          if (reviewAttempt === 2) {
            throw new Error("review failed");
          }
          return true;
        },
      ),
    },
  );

  await assert.rejects(
    () => runtime.dispatch({ type: "tool", name: "save" }),
    McpNativeActionDeniedError,
  );
  await assert.rejects(() => runtime.dispatch({ type: "tool", name: "save" }), /review failed/);
  await runtime.dispatch({ type: "tool", name: "save" });
  assert.deepEqual(calls, ["save"]);
});

test("createConsentActionPolicy denies concurrent reviews instead of queuing prompts", async () => {
  let releaseReview;
  let markReviewStarted;
  const reviewGate = new Promise((resolve) => {
    releaseReview = resolve;
  });
  const reviewStarted = new Promise((resolve) => {
    markReviewStarted = resolve;
  });
  const calls = [];
  const runtime = new McpNativeRuntime(
    {
      async listTools() {
        return { tools: [] };
      },
      async callTool(name) {
        calls.push(name);
        return { content: [] };
      },
      async readResource() {
        return { contents: [] };
      },
    },
    {
      actionPolicy: createConsentActionPolicy(
        [
          {
            name: "delete",
            risk: "destructive",
            capabilities: [],
            sensitiveData: [],
            sharesDataExternally: false,
          },
        ],
        async () => {
          markReviewStarted();
          await reviewGate;
          return true;
        },
      ),
    },
  );

  const first = runtime.dispatch({ type: "tool", name: "delete" });
  await reviewStarted;
  await assert.rejects(
    () => runtime.dispatch({ type: "tool", name: "delete" }),
    McpNativeActionDeniedError,
  );
  releaseReview();
  await first;
  assert.deepEqual(calls, ["delete"]);
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
