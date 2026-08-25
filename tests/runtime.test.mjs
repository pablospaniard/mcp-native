import assert from "node:assert/strict";
import test from "node:test";

import { McpNativeRuntime } from "../packages/core/dist/index.js";

test("the core runtime routes a declared tool action", async () => {
  const calls = [];
  const client = {
    async listTools() {
      return [];
    },
    async callTool(name, arguments_) {
      calls.push({ name, arguments: arguments_ });
      return { content: [{ type: "text", data: { text: "saved" } }] };
    },
    async readResource(uri) {
      return { uri, mimeType: "application/json", text: "{}" };
    },
  };

  const runtime = new McpNativeRuntime(client);
  const result = await runtime.dispatch({
    type: "tool",
    name: "save_profile",
    arguments: { displayName: "Ada" },
  });

  assert.deepEqual(calls, [{ name: "save_profile", arguments: { displayName: "Ada" } }]);
  assert.equal(result.isError, undefined);
});

test("the core runtime delegates every client operation", async () => {
  const calls = [];
  const tools = [{ name: "save", inputSchema: { type: "object" } }];
  const resource = { uri: "ui://profile", mimeType: "application/json", text: "{}" };
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
