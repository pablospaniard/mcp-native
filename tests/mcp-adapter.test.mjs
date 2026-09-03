import assert from "node:assert/strict";
import test from "node:test";

import {
  Client,
  InMemoryResponseCacheStore,
  InMemoryTransport,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";

import {
  A2UI_MCP_EXTENSION_CAPABILITIES,
  A2UI_MCP_EXTENSION_ID,
  A2UI_MIME_TYPE,
  negotiateA2uiMcpBinding,
  resolveA2uiResourceFromToolResult,
} from "../packages/a2ui/dist/index.js";
import { McpNativeRuntime } from "../packages/core/dist/index.js";
import {
  createMcpSdkClientAdapter,
  createMcpNativeClientOptions,
  MCP_NATIVE_LEGACY_PROTOCOL_REVISION,
  MCP_NATIVE_PROTOCOL_REVISION,
  MCP_NATIVE_SUPPORTED_PROTOCOL_REVISIONS,
  MCP_SDK_MAX_RESOURCE_RESULT_STRING_CODE_UNITS,
  MCP_SDK_MAX_RESOURCE_TEXT_LENGTH,
  MCP_SDK_MAX_RESULT_ITEMS,
  McpSdkAdapterError,
  McpSdkClientAdapter,
} from "../packages/mcp/dist/index.js";

const MODERN_SERVER_INFO = { name: "mcp-native-modern-test", version: "1.0.0" };
const CACHE_SERVER_INFO = { name: "mcp-native-cache-test", version: "1.0.0" };
const CACHE_RESOURCE_URI = "ui://cache-test/profile";

function createCacheTestEndpoint(principal, cacheScope) {
  const requests = new Map();
  const handler = createMcpHandler(
    () => {
      const server = new McpServer(CACHE_SERVER_INFO, {
        cacheHints: {
          "tools/list": { ttlMs: 60_000, cacheScope },
          "resources/read": { ttlMs: 60_000, cacheScope },
        },
      });
      server.registerTool(
        `profile-${principal}`,
        { description: `Profile tool for ${principal}` },
        async () => ({ content: [{ type: "text", text: principal }] }),
      );
      server.registerResource(
        "profile",
        CACHE_RESOURCE_URI,
        { mimeType: "application/json" },
        async (uri) => ({
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({ principal }),
            },
          ],
        }),
      );
      return server;
    },
    { legacy: "reject" },
  );

  const fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.method === "POST") {
      const body = await request.clone().json();
      requests.set(body.method, (requests.get(body.method) ?? 0) + 1);
    }
    return handler.fetch(request);
  };

  return { fetch, handler, requests };
}

async function connectCacheTestClient(endpoint, store, cachePartition) {
  const transport = new StreamableHTTPClientTransport(
    new URL("https://mcp-native-cache.test/mcp"),
    { fetch: endpoint.fetch },
  );
  const client = new Client(
    { name: `cache-client-${cachePartition}`, version: "1.0.0" },
    {
      ...createMcpNativeClientOptions("modern-only"),
      responseCacheStore: store,
      cachePartition,
    },
  );
  await client.connect(transport);
  return { adapter: new McpSdkClientAdapter(client), client };
}

test("the adapter exports an exact, fail-closed protocol compatibility policy", () => {
  assert.deepEqual(MCP_NATIVE_SUPPORTED_PROTOCOL_REVISIONS, ["2026-07-28", "2025-11-25"]);
  assert.equal(Object.isFrozen(MCP_NATIVE_SUPPORTED_PROTOCOL_REVISIONS), true);
  assert.deepEqual(createMcpNativeClientOptions(), {
    supportedProtocolVersions: ["2026-07-28", "2025-11-25"],
    versionNegotiation: { mode: "auto" },
  });
  assert.deepEqual(createMcpNativeClientOptions("modern-only"), {
    supportedProtocolVersions: ["2026-07-28"],
    versionNegotiation: { mode: { pin: "2026-07-28" } },
  });
  assert.deepEqual(createMcpNativeClientOptions("legacy-only"), {
    supportedProtocolVersions: ["2025-11-25"],
    versionNegotiation: { mode: "legacy" },
  });
  assert.deepEqual(
    createMcpNativeClientOptions("modern-only", {
      extensions: A2UI_MCP_EXTENSION_CAPABILITIES,
    }),
    {
      supportedProtocolVersions: ["2026-07-28"],
      versionNegotiation: { mode: { pin: "2026-07-28" } },
      capabilities: { extensions: A2UI_MCP_EXTENSION_CAPABILITIES },
    },
  );
  assert.throws(
    () => createMcpNativeClientOptions("modern-only", { extensions: { a2ui: {} } }),
    /Invalid MCP extension identifier "a2ui"/,
  );
  assert.throws(
    () =>
      createMcpNativeClientOptions("modern-only", {
        extensions: { [A2UI_MCP_EXTENSION_ID]: true },
      }),
    /Expected an object at client capability extensions/,
  );
  assert.throws(
    () => createMcpNativeClientOptions("future"),
    /Unsupported MCP Native protocol mode/,
  );
});

test("the SDK adapter maps the complete core client boundary", async () => {
  const calls = [];
  const sdkClient = {
    getServerCapabilities() {
      return { extensions: A2UI_MCP_EXTENSION_CAPABILITIES };
    },
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

  const adapter = createMcpSdkClientAdapter(sdkClient, {
    clientExtensions: A2UI_MCP_EXTENSION_CAPABILITIES,
  });
  assert.ok(adapter instanceof McpSdkClientAdapter);
  assert.deepEqual(adapter.getClientExtensionSettings(), A2UI_MCP_EXTENSION_CAPABILITIES);
  assert.deepEqual(adapter.getServerExtensionSettings(), A2UI_MCP_EXTENSION_CAPABILITIES);

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
  assert.deepEqual(adapter.getClientExtensionSettings(), {});
  assert.deepEqual(adapter.getServerExtensionSettings(), {});
});

test("the SDK adapter retains only the advertised client extension snapshot", () => {
  const adapter = new McpSdkClientAdapter(
    {
      getServerCapabilities() {
        return { extensions: A2UI_MCP_EXTENSION_CAPABILITIES };
      },
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
    { clientExtensions: A2UI_MCP_EXTENSION_CAPABILITIES },
  );
  const withoutAdvertisement = new McpSdkClientAdapter({
    getServerCapabilities() {
      return { extensions: A2UI_MCP_EXTENSION_CAPABILITIES };
    },
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
  const runtime = new McpNativeRuntime(adapter);
  const unadvertisedRuntime = new McpNativeRuntime(withoutAdvertisement);

  assert.deepEqual(adapter.getClientExtensionSettings(), A2UI_MCP_EXTENSION_CAPABILITIES);
  assert.deepEqual(runtime.negotiateExtension(A2UI_MCP_EXTENSION_ID), {
    kind: "negotiated",
    identifier: A2UI_MCP_EXTENSION_ID,
    clientSettings: A2UI_MCP_EXTENSION_CAPABILITIES[A2UI_MCP_EXTENSION_ID],
    serverSettings: A2UI_MCP_EXTENSION_CAPABILITIES[A2UI_MCP_EXTENSION_ID],
  });
  assert.deepEqual(unadvertisedRuntime.negotiateExtension(A2UI_MCP_EXTENSION_ID), {
    kind: "fallback",
    identifier: A2UI_MCP_EXTENSION_ID,
    reason: "client-unsupported",
  });
  assert.throws(
    () =>
      new McpSdkClientAdapter(
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
        { clientExtensions: { a2ui: {} } },
      ),
    /extension identifier/,
  );
});

test("the SDK adapter rejects malformed server extension declarations", () => {
  const adapter = new McpSdkClientAdapter({
    getServerCapabilities() {
      return { extensions: { a2ui: {} } };
    },
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

  assert.throws(
    () => adapter.getServerExtensionSettings(),
    (error) =>
      error instanceof McpSdkAdapterError &&
      /Invalid MCP extension identifier "a2ui"/.test(error.message),
  );
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

  const client = new Client(
    { name: "mcp-native-test-client", version: "1.0.0" },
    createMcpNativeClientOptions("auto"),
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    assert.equal(client.getProtocolEra(), "legacy");
    assert.equal(client.getNegotiatedProtocolVersion(), MCP_NATIVE_LEGACY_PROTOCOL_REVISION);

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
        capabilities: { extensions: A2UI_MCP_EXTENSION_CAPABILITIES },
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
          structuredContent: { protocol: MCP_NATIVE_PROTOCOL_REVISION },
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
    createMcpNativeClientOptions("modern-only", {
      extensions: A2UI_MCP_EXTENSION_CAPABILITIES,
    }),
  );

  try {
    await client.connect(transport);
    assert.equal(client.getProtocolEra(), "modern");
    assert.equal(client.getNegotiatedProtocolVersion(), MCP_NATIVE_PROTOCOL_REVISION);
    const adapter = new McpSdkClientAdapter(client, {
      clientExtensions: A2UI_MCP_EXTENSION_CAPABILITIES,
    });
    const runtime = new McpNativeRuntime(adapter);
    assert.deepEqual(adapter.getClientExtensionSettings(), A2UI_MCP_EXTENSION_CAPABILITIES);
    assert.deepEqual(adapter.getServerExtensionSettings(), A2UI_MCP_EXTENSION_CAPABILITIES);
    assert.deepEqual(runtime.negotiateExtension(A2UI_MCP_EXTENSION_ID), {
      kind: "negotiated",
      identifier: A2UI_MCP_EXTENSION_ID,
      clientSettings: A2UI_MCP_EXTENSION_CAPABILITIES[A2UI_MCP_EXTENSION_ID],
      serverSettings: A2UI_MCP_EXTENSION_CAPABILITIES[A2UI_MCP_EXTENSION_ID],
    });
    assert.deepEqual(
      negotiateA2uiMcpBinding(
        adapter.getClientExtensionSettings(),
        adapter.getServerExtensionSettings(),
      ),
      {
        kind: "negotiated",
        identifier: A2UI_MCP_EXTENSION_ID,
        bindingVersion: "0.1",
        protocolVersion: "v1.0",
        schemaRevision: "7541f953050cd58b80f0bf5d85fe2d63192af305",
        transport: "resource-text-jsonl",
        mimeType: A2UI_MIME_TYPE,
      },
    );
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
      assert.equal(request.protocolVersion, MCP_NATIVE_PROTOCOL_REVISION);
      assert.equal(request.method, request.body.method);
      assert.equal(
        request.body.params["_meta"]["io.modelcontextprotocol/protocolVersion"],
        MCP_NATIVE_PROTOCOL_REVISION,
      );
      assert.deepEqual(request.body.params["_meta"]["io.modelcontextprotocol/clientCapabilities"], {
        extensions: A2UI_MCP_EXTENSION_CAPABILITIES,
      });
    }
  } finally {
    await client.close();
    await handler.close();
  }
});

test("private MCP cache entries stay isolated across principals sharing one store", async () => {
  const store = new InMemoryResponseCacheStore();
  const aliceEndpoint = createCacheTestEndpoint("alice", "private");
  const bobEndpoint = createCacheTestEndpoint("bob", "private");
  const alice = await connectCacheTestClient(aliceEndpoint, store, "subject:alice");
  const bob = await connectCacheTestClient(bobEndpoint, store, "subject:bob");

  try {
    const aliceTools = await alice.adapter.listTools();
    const bobTools = await bob.adapter.listTools();
    const aliceResource = await alice.adapter.readResource(CACHE_RESOURCE_URI);
    const bobResource = await bob.adapter.readResource(CACHE_RESOURCE_URI);

    assert.equal(aliceTools.tools[0]?.name, "profile-alice");
    assert.equal(bobTools.tools[0]?.name, "profile-bob");
    assert.equal(aliceResource.contents[0]?.text, JSON.stringify({ principal: "alice" }));
    assert.equal(bobResource.contents[0]?.text, JSON.stringify({ principal: "bob" }));
    assert.equal(aliceTools.cacheScope, "private");
    assert.equal(bobTools.cacheScope, "private");

    assert.equal((await alice.adapter.listTools()).tools[0]?.name, "profile-alice");
    assert.equal((await bob.adapter.listTools()).tools[0]?.name, "profile-bob");
    assert.equal(
      (await alice.adapter.readResource(CACHE_RESOURCE_URI)).contents[0]?.text,
      JSON.stringify({ principal: "alice" }),
    );
    assert.equal(
      (await bob.adapter.readResource(CACHE_RESOURCE_URI)).contents[0]?.text,
      JSON.stringify({ principal: "bob" }),
    );

    assert.equal(aliceEndpoint.requests.get("tools/list"), 1);
    assert.equal(bobEndpoint.requests.get("tools/list"), 1);
    assert.equal(aliceEndpoint.requests.get("resources/read"), 1);
    assert.equal(bobEndpoint.requests.get("resources/read"), 1);
  } finally {
    await Promise.all([
      alice.client.close(),
      bob.client.close(),
      aliceEndpoint.handler.close(),
      bobEndpoint.handler.close(),
    ]);
  }
});

test("public MCP cache entries may be reused across principals for the same server", async () => {
  const store = new InMemoryResponseCacheStore();
  const primaryEndpoint = createCacheTestEndpoint("shared", "public");
  const secondaryEndpoint = createCacheTestEndpoint("should-not-be-fetched", "public");
  const primary = await connectCacheTestClient(primaryEndpoint, store, "subject:alice");
  const secondary = await connectCacheTestClient(secondaryEndpoint, store, "subject:bob");

  try {
    const primaryTools = await primary.adapter.listTools();
    const primaryResource = await primary.adapter.readResource(CACHE_RESOURCE_URI);
    const secondaryTools = await secondary.adapter.listTools();
    const secondaryResource = await secondary.adapter.readResource(CACHE_RESOURCE_URI);

    assert.equal(primaryTools.tools[0]?.name, "profile-shared");
    assert.equal(secondaryTools.tools[0]?.name, "profile-shared");
    assert.equal(primaryResource.contents[0]?.text, JSON.stringify({ principal: "shared" }));
    assert.equal(secondaryResource.contents[0]?.text, JSON.stringify({ principal: "shared" }));
    assert.equal(primaryTools.cacheScope, "public");
    assert.equal(secondaryTools.cacheScope, "public");

    assert.equal(primaryEndpoint.requests.get("tools/list"), 1);
    assert.equal(primaryEndpoint.requests.get("resources/read"), 1);
    assert.equal(secondaryEndpoint.requests.get("tools/list") ?? 0, 0);
    assert.equal(secondaryEndpoint.requests.get("resources/read") ?? 0, 0);
  } finally {
    await Promise.all([
      primary.client.close(),
      secondary.client.close(),
      primaryEndpoint.handler.close(),
      secondaryEndpoint.handler.close(),
    ]);
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
      name: "unsupported task execution settings",
      operation: "listTools",
      result: {
        tools: [
          {
            name: "queued",
            inputSchema: { type: "object" },
            execution: { taskSupport: "required" },
          },
        ],
      },
      message: /Unsupported tool execution settings.*task execution is outside/,
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
      result: { content: [{ type: "data", value: 1 }] },
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
      name: "empty result metadata key",
      operation: "callTool",
      result: { content: [], _meta: { "": true } },
      message: /Invalid MCP metadata key "" at tool result\._meta/,
    },
    {
      name: "empty prefixed result metadata name",
      operation: "callTool",
      result: { content: [], _meta: { "com.example/": true } },
      message: /Invalid MCP metadata key "com\.example\/" at tool result\._meta/,
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

test("the SDK adapter bounds aggregate result collections and strings", async () => {
  const oversizedTools = new McpSdkClientAdapter({
    async listTools() {
      return {
        tools: Array.from({ length: MCP_SDK_MAX_RESULT_ITEMS + 1 }, (_, index) => ({
          name: `tool-${index}`,
          inputSchema: { type: "object" },
        })),
      };
    },
    async callTool() {
      return { content: [] };
    },
    async readResource() {
      return { contents: [] };
    },
  });
  await assert.rejects(() => oversizedTools.listTools(), /exceeds maximum of 1024 items/);

  const oversizedStrings = new McpSdkClientAdapter({
    async listTools() {
      return { tools: [] };
    },
    async callTool() {
      return {
        content: Array.from({ length: 17 }, () => ({
          type: "text",
          text: "x".repeat(65_536),
        })),
      };
    },
    async readResource() {
      return { contents: [] };
    },
  });
  await assert.rejects(
    () => oversizedStrings.callTool("large", {}),
    /maximum cumulative string\/key length/,
  );
});

test("the SDK adapter expands limits only for bounded resource bodies", async () => {
  const oversizedUri = new McpSdkClientAdapter({
    async listTools() {
      return { tools: [] };
    },
    async callTool() {
      return { content: [] };
    },
    async readResource() {
      return {
        contents: [{ uri: "u".repeat(65_537), text: "body" }],
      };
    },
  });
  await assert.rejects(
    () => oversizedUri.readResource("ui://large-uri"),
    /resource result\.contents\[0\]\.uri exceeds maximum length of 65536/,
  );

  const cumulativeBodies = new McpSdkClientAdapter({
    async listTools() {
      return { tools: [] };
    },
    async callTool() {
      return { content: [] };
    },
    async readResource() {
      const text = "x".repeat(MCP_SDK_MAX_RESOURCE_TEXT_LENGTH - 2);
      return {
        contents: [
          { uri: "ui://one", text },
          { uri: "ui://two", text },
        ],
      };
    },
  });
  await assert.rejects(
    () => cumulativeBodies.readResource("ui://cumulative"),
    new RegExp(
      `maximum cumulative string/key length of ${MCP_SDK_MAX_RESOURCE_RESULT_STRING_CODE_UNITS}`,
    ),
  );
});

test("the SDK adapter forwards strict host request options", async () => {
  const observed = [];
  const adapter = new McpSdkClientAdapter({
    async listTools(_params, options) {
      observed.push(options);
      return { tools: [] };
    },
    async callTool(_params, options) {
      observed.push(options);
      return { content: [] };
    },
    async readResource(_params, options) {
      observed.push(options);
      return { contents: [] };
    },
  });
  const cancellation = new AbortController();

  await adapter.listTools({ signal: cancellation.signal, cacheMode: "refresh" });
  await adapter.callTool("noop", {}, { signal: cancellation.signal });
  await adapter.readResource("ui://noop", { signal: cancellation.signal });
  assert.deepEqual(
    observed.map((options) => options.signal),
    [cancellation.signal, cancellation.signal, cancellation.signal],
  );
  assert.equal(observed[0].cacheMode, "refresh");

  await assert.rejects(
    () => adapter.listTools({ signal: /** @type {any} */ ({ aborted: false }) }),
    /AbortSignal/,
  );
  await assert.rejects(
    () => adapter.callTool("noop", {}, /** @type {any} */ ({ timeout: 1 })),
    /only signal/,
  );
  await assert.rejects(
    () => adapter.listTools(/** @type {any} */ ({ cacheMode: "stale" })),
    /cache mode is unsupported/,
  );
});
