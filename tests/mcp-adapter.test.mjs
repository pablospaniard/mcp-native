import assert from "node:assert/strict";
import test from "node:test";

import {
  Client,
  InMemoryTransport,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";

import { A2UI_MIME_TYPE, resolveA2uiResourceFromToolResult } from "../packages/a2ui/dist/index.js";
import { McpNativeRuntime } from "../packages/core/dist/index.js";
import {
  createMcpSdkClientAdapter,
  McpSdkAdapterError,
  McpSdkClientAdapter,
} from "../packages/mcp/dist/index.js";

const MCP_CURRENT_PROTOCOL_VERSION = "2026-07-28";
const MODERN_SERVER_INFO = { name: "mcp-native-modern-test", version: "1.0.0" };

test("the SDK adapter maps the complete core client boundary", async () => {
  const calls = [];
  const sdkClient = {
    async listTools() {
      calls.push(["listTools"]);
      return {
        tools: [
          {
            name: "save",
            title: "Save profile",
            description: "Save data",
            icons: [{ src: "https://example.com/save-dark.png", sizes: ["48x48"], theme: "dark" }],
            inputSchema: {
              type: "object",
              properties: { value: { type: "string" } },
              required: ["value"],
            },
            outputSchema: {
              type: "object",
              properties: { saved: { type: "boolean" } },
            },
            annotations: {
              title: "Save profile",
              readOnlyHint: false,
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: false,
            },
            _meta: { ui: { resourceUri: "ui://saved" } },
          },
          { name: "ping", inputSchema: { type: "object" } },
        ],
        nextCursor: "next-tools-page",
        ttlMs: 60_000,
        cacheScope: "private",
        _meta: { "com.example/source": "live" },
      };
    },
    async callTool(params) {
      calls.push(["callTool", params]);
      return {
        content: [
          {
            type: "text",
            text: "saved",
            annotations: {
              audience: ["user"],
              priority: 0.9,
              lastModified: "2026-08-25T00:00:00Z",
            },
            _meta: { "com.example/content": "text" },
          },
          {
            type: "resource_link",
            uri: "ui://saved",
            name: "Saved UI",
            title: "Saved profile UI",
            description: "The saved profile",
            mimeType: A2UI_MIME_TYPE,
            size: 128,
            icons: [{ src: "data:image/png;base64,AA==", mimeType: "image/png", theme: "light" }],
            annotations: { audience: ["assistant"] },
            _meta: { "com.example/link": true },
          },
        ],
        isError: false,
        structuredContent: { saved: true, count: 1, values: [null, "ok"] },
        _meta: { "com.example/result": "saved" },
      };
    },
    async readResource(params) {
      calls.push(["readResource", params]);
      return {
        contents: [
          {
            uri: params.uri,
            mimeType: "application/json",
            text: "{}",
            _meta: { ui: { csp: { connectDomains: [] } } },
          },
          { uri: `${params.uri}/image`, blob: "AA==", _meta: { "com.example/binary": true } },
        ],
        ttlMs: 5_000,
        cacheScope: "public",
        _meta: { "com.example/read": "fresh" },
      };
    },
  };

  const adapter = createMcpSdkClientAdapter(sdkClient);
  assert.ok(adapter instanceof McpSdkClientAdapter);

  assert.deepEqual(await adapter.listTools(), {
    tools: [
      {
        name: "save",
        title: "Save profile",
        description: "Save data",
        icons: [{ src: "https://example.com/save-dark.png", sizes: ["48x48"], theme: "dark" }],
        inputSchema: {
          type: "object",
          properties: { value: { type: "string" } },
          required: ["value"],
        },
        outputSchema: {
          type: "object",
          properties: { saved: { type: "boolean" } },
        },
        annotations: {
          title: "Save profile",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        _meta: { ui: { resourceUri: "ui://saved" } },
      },
      { name: "ping", inputSchema: { type: "object" } },
    ],
    nextCursor: "next-tools-page",
    ttlMs: 60_000,
    cacheScope: "private",
    _meta: { "com.example/source": "live" },
  });
  assert.deepEqual(await adapter.callTool("save", { value: "Ada" }), {
    content: [
      {
        type: "text",
        text: "saved",
        annotations: { audience: ["user"], priority: 0.9, lastModified: "2026-08-25T00:00:00Z" },
        _meta: { "com.example/content": "text" },
      },
      {
        type: "resource_link",
        uri: "ui://saved",
        name: "Saved UI",
        title: "Saved profile UI",
        description: "The saved profile",
        mimeType: A2UI_MIME_TYPE,
        size: 128,
        icons: [{ src: "data:image/png;base64,AA==", mimeType: "image/png", theme: "light" }],
        annotations: { audience: ["assistant"] },
        _meta: { "com.example/link": true },
      },
    ],
    isError: false,
    structuredContent: { saved: true, count: 1, values: [null, "ok"] },
    _meta: { "com.example/result": "saved" },
  });
  assert.deepEqual(await adapter.readResource("ui://saved"), {
    contents: [
      {
        uri: "ui://saved",
        mimeType: "application/json",
        text: "{}",
        _meta: { ui: { csp: { connectDomains: [] } } },
      },
      { uri: "ui://saved/image", blob: "AA==", _meta: { "com.example/binary": true } },
    ],
    ttlMs: 5_000,
    cacheScope: "public",
    _meta: { "com.example/read": "fresh" },
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

test("the SDK adapter preserves prototype-named JSON keys as own data properties", async () => {
  const structuredContent = JSON.parse('{"__proto__":{"polluted":true}}');
  const adapter = new McpSdkClientAdapter({
    async listTools() {
      return { tools: [] };
    },
    async callTool() {
      return { content: [], structuredContent };
    },
    async readResource() {
      return { contents: [] };
    },
  });

  const result = await adapter.callTool("safe", {});
  assert.equal(Object.getPrototypeOf(result.structuredContent), Object.prototype);
  assert.equal(Object.hasOwn(result.structuredContent, "__proto__"), true);
  assert.equal(result.structuredContent.polluted, undefined);
  assert.deepEqual(result.structuredContent["__proto__"], { polluted: true });
});

test("the SDK adapter preserves every official MCP content block shape", async () => {
  const content = [
    {
      type: "image",
      data: "AA==",
      mimeType: "image/png",
      annotations: { audience: ["user"] },
      _meta: { "com.example/image": true },
    },
    {
      type: "audio",
      data: "AA==",
      mimeType: "audio/wav",
      annotations: { priority: 0.5 },
    },
    {
      type: "resource",
      resource: {
        uri: "file:///profile.json",
        mimeType: "application/json",
        text: "{}",
        _meta: { "com.example/embedded": true },
      },
      annotations: { lastModified: "2026-08-25T00:00:00Z" },
      _meta: { "com.example/block": "resource" },
    },
  ];
  const adapter = new McpSdkClientAdapter({
    async listTools() {
      return { tools: [] };
    },
    async callTool() {
      return { content };
    },
    async readResource() {
      return { contents: [] };
    },
  });

  assert.deepEqual(await adapter.callTool("media", {}), { content });
});

test("a real SDK tool result resolves an A2UI resource through the runtime", async () => {
  const server = new McpServer({ name: "mcp-native-test-server", version: "1.0.0" });
  server.registerTool("open-surface", { description: "Return a native surface" }, async () => ({
    content: [
      {
        type: "resource_link",
        name: "Adapter surface",
        uri: "ui://adapter-test",
        mimeType: A2UI_MIME_TYPE,
      },
    ],
  }));
  server.registerResource(
    "surface",
    "ui://adapter-test",
    { mimeType: A2UI_MIME_TYPE },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: A2UI_MIME_TYPE,
          text: JSON.stringify({
            version: "0.1",
            root: { id: "sdk-result", type: "text", text: "Connected" },
          }),
        },
      ],
    }),
  );

  const client = new Client({ name: "mcp-native-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const runtime = new McpNativeRuntime(new McpSdkClientAdapter(client));
    const { tools } = await runtime.listTools();
    assert.equal(tools[0]?.name, "open-surface");
    assert.equal(tools[0]?.description, "Return a native surface");

    const toolResult = await runtime.callTool("open-surface");
    assert.deepEqual(await resolveA2uiResourceFromToolResult(runtime, toolResult), {
      uri: "ui://adapter-test",
      mimeType: A2UI_MIME_TYPE,
      surface: {
        version: "0.1",
        root: { id: "sdk-result", type: "text", text: "Connected" },
      },
    });
  } finally {
    await client.close();
    await server.close();
  }
});

test("the adapter preserves MCP 2026-07-28 results through the official HTTP handler", async () => {
  const requests = [];
  const handler = createMcpHandler(
    () => {
      const server = new McpServer(MODERN_SERVER_INFO, {
        cacheHints: {
          "tools/list": { ttlMs: 30_000, cacheScope: "private" },
          "resources/read": { ttlMs: 5_000, cacheScope: "public" },
        },
      });
      server.registerTool(
        "open-modern-surface",
        {
          title: "Open modern surface",
          description: "Returns a current-protocol resource link",
          annotations: { readOnlyHint: true, destructiveHint: false },
          _meta: { ui: { resourceUri: "ui://modern" } },
        },
        async () => ({
          content: [
            {
              type: "resource_link",
              name: "Modern surface",
              uri: "ui://modern",
              mimeType: A2UI_MIME_TYPE,
              _meta: { "com.example/link": "modern" },
            },
          ],
          structuredContent: { protocol: MCP_CURRENT_PROTOCOL_VERSION },
          _meta: { "com.example/result": "modern" },
        }),
      );
      server.registerResource(
        "modern-surface",
        "ui://modern",
        { mimeType: A2UI_MIME_TYPE },
        async (uri) => ({
          contents: [
            {
              uri: uri.href,
              mimeType: A2UI_MIME_TYPE,
              text: JSON.stringify({
                version: "0.1",
                root: { id: "modern", type: "text", text: "Modern HTTP" },
              }),
              _meta: { "com.example/resource": "modern" },
            },
          ],
          _meta: { "com.example/read": "modern" },
        }),
      );
      return server;
    },
    { legacy: "reject" },
  );
  const localFetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.method === "POST") {
      requests.push({
        protocolVersion: request.headers.get("mcp-protocol-version"),
        method: request.headers.get("mcp-method"),
        body: await request.clone().json(),
      });
    }
    return handler.fetch(request);
  };
  const transport = new StreamableHTTPClientTransport(new URL("https://mcp-native.test/mcp"), {
    fetch: localFetch,
  });
  const client = new Client(
    { name: "mcp-native-modern-client", version: "1.0.0" },
    { versionNegotiation: { mode: { pin: MCP_CURRENT_PROTOCOL_VERSION } } },
  );

  try {
    await client.connect(transport);
    const runtime = new McpNativeRuntime(new McpSdkClientAdapter(client));
    const toolsResult = await runtime.listTools();
    const callResult = await runtime.callTool("open-modern-surface");
    const readResult = await runtime.readResource("ui://modern");

    assert.equal(toolsResult.tools[0]?.name, "open-modern-surface");
    assert.deepEqual(toolsResult.tools[0]?.["_meta"], {
      ui: { resourceUri: "ui://modern" },
    });
    assert.equal(toolsResult.ttlMs, 30_000);
    assert.equal(toolsResult.cacheScope, "private");
    assert.deepEqual(callResult["_meta"], {
      "io.modelcontextprotocol/serverInfo": MODERN_SERVER_INFO,
      "com.example/result": "modern",
    });
    assert.deepEqual(callResult.content[0]?.["_meta"], { "com.example/link": "modern" });
    assert.deepEqual(readResult.contents[0]?.["_meta"], {
      "com.example/resource": "modern",
    });
    assert.deepEqual(readResult["_meta"], {
      "io.modelcontextprotocol/serverInfo": MODERN_SERVER_INFO,
      "com.example/read": "modern",
    });
    assert.equal(readResult.ttlMs, 5_000);
    assert.equal(readResult.cacheScope, "public");

    assert.deepEqual(
      requests.map(({ body }) => body.method),
      ["server/discover", "tools/list", "tools/call", "resources/read"],
    );
    assert.equal(
      requests.some(({ body }) => body.method === "initialize"),
      false,
    );
    for (const request of requests) {
      assert.equal(request.protocolVersion, MCP_CURRENT_PROTOCOL_VERSION);
      assert.equal(request.method, request.body.method);
      assert.equal(
        request.body.params["_meta"]["io.modelcontextprotocol/protocolVersion"],
        MCP_CURRENT_PROTOCOL_VERSION,
      );
      assert.deepEqual(
        request.body.params["_meta"]["io.modelcontextprotocol/clientCapabilities"],
        {},
      );
    }
  } finally {
    await client.close();
    await handler.close();
  }
});

test("the SDK adapter rejects malformed and non-JSON tool data", async (t) => {
  const invalidCases = [
    {
      name: "non-object schema",
      operation: "listTools",
      result: { tools: [{ name: "bad", inputSchema: [] }] },
      message: /Expected an object at tools result\.tools\[0\]\.inputSchema/,
    },
    {
      name: "non-object input schema type",
      operation: "listTools",
      result: { tools: [{ name: "bad", inputSchema: { type: "string" } }] },
      message: /Expected the string "object" at tools result\.tools\[0\]\.inputSchema\.type/,
    },
    {
      name: "non-string content type",
      operation: "callTool",
      result: { content: [{ type: 1, text: "bad" }] },
      message: /Expected a string at tool result\.content\[0\]\.type/,
    },
    {
      name: "unsupported content type",
      operation: "callTool",
      result: { content: [{ type: "data", value: Number.POSITIVE_INFINITY }] },
      message: /Unsupported MCP content type "data"/,
    },
    {
      name: "non-JSON result metadata",
      operation: "callTool",
      result: { content: [], _meta: { value: Number.POSITIVE_INFINITY } },
      message: /Expected a finite number at tool result\._meta\.value/,
    },
    {
      name: "invalid result metadata key",
      operation: "callTool",
      result: { content: [], _meta: { "com.example/invalid/key": true } },
      message: /Invalid MCP metadata key "com\.example\/invalid\/key" at tool result\._meta/,
    },
    {
      name: "invalid annotation audience",
      operation: "callTool",
      result: { content: [{ type: "text", text: "bad", annotations: { audience: ["system"] } }] },
      message:
        /Expected "assistant" or "user" at tool result\.content\[0\]\.annotations\.audience\[0\]/,
    },
    {
      name: "invalid cache scope",
      operation: "listTools",
      result: { tools: [], cacheScope: "shared" },
      message: /Expected "private" or "public" at tools result\.cacheScope/,
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
      return { content: [{ type: "text", text: "bad", _meta: { value: new Date(0) } }] };
    },
    async readResource() {
      return { contents: [] };
    },
  });
  await assert.rejects(() => dateAdapter.callTool("bad", {}), /Expected a plain object/);
});
