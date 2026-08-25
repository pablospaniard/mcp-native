#!/usr/bin/env node

import assert from "node:assert/strict";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import {
  MCP_NATIVE_PROTOCOL_REVISION,
  McpSdkClientAdapter,
  createMcpNativeClientOptions,
} from "../../packages/mcp/dist/index.js";

const scenario = process.env.MCP_CONFORMANCE_SCENARIO;
const protocolVersion = process.env.MCP_CONFORMANCE_PROTOCOL_VERSION;
const serverUrl = process.argv[2];

assert.ok(scenario, "MCP_CONFORMANCE_SCENARIO is required");
assert.equal(
  protocolVersion,
  MCP_NATIVE_PROTOCOL_REVISION,
  `Conformance runner must select ${MCP_NATIVE_PROTOCOL_REVISION}`,
);
assert.ok(serverUrl, "Usage: mcp-native-client.mjs <server-url>");

const parseContext = () => {
  const raw = process.env.MCP_CONFORMANCE_CONTEXT ?? "{}";
  const value = JSON.parse(raw);
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value;
};

const handlers = {
  async tools_call(adapter) {
    const { tools } = await adapter.listTools();
    const tool = tools[0];
    assert.ok(tool, "tools_call did not advertise a tool");
    await adapter.callTool(tool.name, { a: 2, b: 3 });
  },

  async "request-metadata"(adapter) {
    await adapter.listTools();
  },

  async "http-standard-headers"(adapter) {
    const { tools } = await adapter.listTools();
    assert.ok(tools.some((tool) => tool.name === "test_headers"));
    await adapter.callTool("test_headers", {});
    await adapter.readResource("file:///path/to/file%20name.txt");
  },

  async "http-custom-headers"(adapter) {
    const { tools } = await adapter.listTools();
    const advertisedNames = new Set(tools.map((tool) => tool.name));
    const context = parseContext();
    assert.ok(Array.isArray(context.toolCalls), "Expected conformance toolCalls context");

    await Promise.all(
      context.toolCalls.map((toolCall) => {
        assert.ok(toolCall && typeof toolCall === "object" && !Array.isArray(toolCall));
        assert.equal(typeof toolCall.name, "string");
        assert.ok(advertisedNames.has(toolCall.name), `Tool ${toolCall.name} was not advertised`);
        assert.ok(
          toolCall.arguments &&
            typeof toolCall.arguments === "object" &&
            !Array.isArray(toolCall.arguments),
        );
        return adapter.callTool(toolCall.name, toolCall.arguments);
      }),
    );
  },

  async "http-invalid-tool-headers"(adapter) {
    const { tools } = await adapter.listTools();
    assert.deepEqual(
      tools.map((tool) => tool.name),
      ["valid_tool"],
      "The official client must exclude invalid x-mcp-header tool definitions",
    );
    await adapter.callTool("valid_tool", { region: "us-west1" });
  },

  async "json-schema-ref-no-deref"(adapter) {
    await adapter.listTools();
  },

  async "json-schema-2020-12-preservation"(adapter) {
    const { tools } = await adapter.listTools();
    const focalTool = tools.find((tool) => tool.name === "json_schema_2020_12_tool");
    assert.ok(focalTool, "JSON Schema preservation tool was not advertised");
    await adapter.callTool("json_schema_echo", { schema: focalTool.inputSchema });
  },
};

const handler = handlers[scenario];
assert.ok(handler, `Unsupported pinned conformance scenario: ${scenario}`);

const client = new Client(
  { name: "mcp-native-conformance-client", version: "0.0.0" },
  createMcpNativeClientOptions("modern-only"),
);
const transport = new StreamableHTTPClientTransport(new URL(serverUrl));

try {
  await client.connect(transport);
  assert.equal(client.getNegotiatedProtocolVersion(), MCP_NATIVE_PROTOCOL_REVISION);
  await handler(new McpSdkClientAdapter(client));
} finally {
  await client.close();
}
