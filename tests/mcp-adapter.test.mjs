import assert from "node:assert/strict";
import test from "node:test";

import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { McpServer } from "@modelcontextprotocol/server";

import { McpNativeRuntime } from "../packages/core/dist/index.js";
import {
  createMcpSdkClientAdapter,
  McpSdkAdapterError,
  McpSdkClientAdapter,
} from "../packages/mcp/dist/index.js";

test("the SDK adapter maps the complete core client boundary", async () => {
  const calls = [];
  const sdkClient = {
    async listTools() {
      calls.push(["listTools"]);
      return {
        tools: [
          {
            name: "save",
            description: "Save data",
            inputSchema: {
              type: "object",
              properties: { value: { type: "string" } },
              required: ["value"],
            },
          },
          { name: "ping", inputSchema: { type: "object" } },
        ],
      };
    },
    async callTool(params) {
      calls.push(["callTool", params]);
      return {
        content: [
          { type: "text", text: "saved", annotations: { audience: ["user"] } },
          { type: "resource_link", uri: "ui://saved", name: "Saved UI" },
        ],
        isError: false,
        structuredContent: { saved: true, count: 1, values: [null, "ok"] },
      };
    },
    async readResource(params) {
      calls.push(["readResource", params]);
      return {
        contents: [
          { uri: params.uri, mimeType: "application/json", text: "{}" },
          { uri: `${params.uri}/image`, blob: "AA==" },
        ],
      };
    },
  };

  const adapter = createMcpSdkClientAdapter(sdkClient);
  assert.ok(adapter instanceof McpSdkClientAdapter);

  assert.deepEqual(await adapter.listTools(), [
    {
      name: "save",
      description: "Save data",
      inputSchema: {
        type: "object",
        properties: { value: { type: "string" } },
        required: ["value"],
      },
    },
    { name: "ping", inputSchema: { type: "object" } },
  ]);
  assert.deepEqual(await adapter.callTool("save", { value: "Ada" }), {
    content: [
      { type: "text", data: { text: "saved", annotations: { audience: ["user"] } } },
      { type: "resource_link", data: { uri: "ui://saved", name: "Saved UI" } },
    ],
    isError: false,
    structuredContent: { saved: true, count: 1, values: [null, "ok"] },
  });
  assert.deepEqual(await adapter.readResource("ui://saved"), {
    contents: [
      { uri: "ui://saved", mimeType: "application/json", text: "{}" },
      { uri: "ui://saved/image", blob: "AA==" },
    ],
  });
  assert.deepEqual(calls, [
    ["listTools"],
    ["callTool", { name: "save", arguments: { value: "Ada" } }],
    ["readResource", { uri: "ui://saved" }],
  ]);
});

test("the SDK adapter omits absent optional tool result fields", async () => {
  const adapter = new McpSdkClientAdapter({
    async listTools() {
      return { tools: [] };
    },
    async callTool() {
      return { content: [] };
    },
    async readResource() {
      return { contents: [] };
    },
  });

  assert.deepEqual(await adapter.callTool("ping", {}), { content: [] });
  assert.deepEqual(await adapter.readResource("ui://empty"), { contents: [] });
});

test("the SDK adapter works with a connected official SDK client", async () => {
  const server = new McpServer({ name: "mcp-native-test-server", version: "1.0.0" });
  server.registerTool("status", { description: "Return adapter status" }, async () => ({
    content: [{ type: "text", text: "connected" }],
    structuredContent: { connected: true },
  }));
  server.registerResource(
    "surface",
    "ui://adapter-test",
    { mimeType: "application/json" },
    async (uri) => ({ contents: [{ uri: uri.href, text: '{"version":"0.1"}' }] }),
  );

  const client = new Client({ name: "mcp-native-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const runtime = new McpNativeRuntime(new McpSdkClientAdapter(client));
    const tools = await runtime.listTools();
    assert.equal(tools[0]?.name, "status");
    assert.equal(tools[0]?.description, "Return adapter status");
    assert.deepEqual(await runtime.callTool("status"), {
      content: [{ type: "text", data: { text: "connected" } }],
      structuredContent: { connected: true },
    });
    assert.deepEqual(await runtime.readResource("ui://adapter-test"), {
      contents: [{ uri: "ui://adapter-test", text: '{"version":"0.1"}' }],
    });
  } finally {
    await client.close();
    await server.close();
  }
});

test("the SDK adapter rejects malformed and non-JSON tool data", async (t) => {
  const invalidCases = [
    {
      name: "non-object schema",
      operation: "listTools",
      result: { tools: [{ name: "bad", inputSchema: [] }] },
      message: /Expected an object at tools\[0\]\.inputSchema/,
    },
    {
      name: "non-string content type",
      operation: "callTool",
      result: { content: [{ type: 1, text: "bad" }] },
      message: /Expected a string at tool result\.content\[0\]\.type/,
    },
    {
      name: "non-finite content number",
      operation: "callTool",
      result: { content: [{ type: "data", value: Number.POSITIVE_INFINITY }] },
      message: /Expected a finite number at tool result\.content\[0\]\.value/,
    },
    {
      name: "non-JSON structured content",
      operation: "callTool",
      result: { content: [], structuredContent: undefined, isError: "no" },
      message: /Expected a boolean at tool result\.isError/,
    },
    {
      name: "resource with no body",
      operation: "readResource",
      result: { contents: [{ uri: "ui://missing" }] },
      message: /Expected exactly one of text or blob at resource result\.contents\[0\]/,
    },
    {
      name: "resource with conflicting bodies",
      operation: "readResource",
      result: { contents: [{ uri: "ui://both", text: "text", blob: "AA==" }] },
      message: /Expected exactly one of text or blob at resource result\.contents\[0\]/,
    },
  ];

  await Promise.all(
    invalidCases.map((invalidCase) =>
      t.test(invalidCase.name, async () => {
        const client = {
          async listTools() {
            return invalidCase.result;
          },
          async callTool() {
            return invalidCase.result;
          },
          async readResource() {
            return invalidCase.result;
          },
        };
        const adapter = new McpSdkClientAdapter(client);

        await assert.rejects(
          () =>
            invalidCase.operation === "listTools"
              ? adapter.listTools()
              : invalidCase.operation === "callTool"
                ? adapter.callTool("bad", {})
                : adapter.readResource("ui://bad"),
          (error) => error instanceof McpSdkAdapterError && invalidCase.message.test(error.message),
        );
      }),
    ),
  );
});

test("the SDK adapter rejects circular and non-plain JSON values", async () => {
  const circular = {};
  circular.self = circular;

  const circularAdapter = new McpSdkClientAdapter({
    async listTools() {
      return { tools: [{ name: "bad", inputSchema: circular }] };
    },
    async callTool() {
      return { content: [] };
    },
    async readResource() {
      return { contents: [] };
    },
  });
  await assert.rejects(() => circularAdapter.listTools(), /Circular JSON value/);

  const dateAdapter = new McpSdkClientAdapter({
    async listTools() {
      return { tools: [] };
    },
    async callTool() {
      return { content: [{ type: "data", value: new Date(0) }] };
    },
    async readResource() {
      return { contents: [] };
    },
  });
  await assert.rejects(() => dateAdapter.callTool("bad", {}), /Expected a plain object/);
});
