import assert from "node:assert/strict";
import test from "node:test";

import {
  A2UI_MCP_EXTENSION_ID,
  A2UI_MIME_TYPE,
  A2UI_V1_MAX_SOURCE_LENGTH,
} from "../packages/a2ui/dist/index.js";
import {
  MCP_NATIVE_HOST_EXTENSION_CAPABILITIES,
  resolveMcpNativeHostResult,
} from "../packages/host/dist/index.js";
import { McpSdkClientAdapter } from "../packages/mcp/dist/index.js";
import { MCP_APPS_EXTENSION_ID, MCP_APPS_MIME_TYPE } from "../packages/webview/dist/index.js";

const ordinaryTool = {
  name: "status",
  inputSchema: { type: "object" },
};

function a2uiResult(uri = "ui://surface/main") {
  return {
    content: [
      {
        type: "resource_link",
        name: "surface",
        uri,
        mimeType: A2UI_MIME_TYPE,
      },
    ],
  };
}

function appsTool() {
  return {
    name: "weather",
    inputSchema: { type: "object" },
    _meta: {
      ui: {
        resourceUri: "ui://weather/dashboard",
        visibility: ["model", "app"],
      },
    },
  };
}

function hostClient({
  readResource = async () => ({ contents: [] }),
  clientExtensions = MCP_NATIVE_HOST_EXTENSION_CAPABILITIES,
  serverExtensions = MCP_NATIVE_HOST_EXTENSION_CAPABILITIES,
} = {}) {
  return {
    readResource,
    getClientExtensionSettings() {
      return clientExtensions;
    },
    getServerExtensionSettings() {
      return serverExtensions;
    },
  };
}

function sdkBackedHostClient(readResource) {
  return new McpSdkClientAdapter(
    {
      async listTools() {
        return { tools: [] };
      },
      async callTool() {
        return { content: [] };
      },
      readResource,
      getServerCapabilities() {
        return { extensions: MCP_NATIVE_HOST_EXTENSION_CAPABILITIES };
      },
    },
    { clientExtensions: MCP_NATIVE_HOST_EXTENSION_CAPABILITIES },
  );
}

test("host extension capabilities advertise only the two built-in standard profiles", () => {
  assert.deepEqual(Object.keys(MCP_NATIVE_HOST_EXTENSION_CAPABILITIES).sort(), [
    A2UI_MCP_EXTENSION_ID,
    MCP_APPS_EXTENSION_ID,
  ]);
  assert.equal(Object.isFrozen(MCP_NATIVE_HOST_EXTENSION_CAPABILITIES), true);
});

test("ordinary MCP content stays inert and does not load a resource", async () => {
  let reads = 0;
  const resolved = await resolveMcpNativeHostResult({
    tool: ordinaryTool,
    result: { content: [{ type: "text", text: "Ready" }] },
    client: hostClient({
      async readResource() {
        reads += 1;
        return { contents: [] };
      },
      serverExtensions: {},
    }),
  });

  assert.deepEqual(resolved, {
    kind: "ordinary",
    result: { content: [{ type: "text", text: "Ready" }] },
  });
  assert.equal(reads, 0);
  assert.equal(Object.isFrozen(resolved), true);
  assert.equal(Object.isFrozen(resolved.result), true);
  assert.equal(Object.isFrozen(resolved.result.content), true);
});

test("A2UI MIME data is inert without exact mutual negotiation", async () => {
  let reads = 0;
  const resolved = await resolveMcpNativeHostResult({
    tool: ordinaryTool,
    result: a2uiResult(),
    client: hostClient({
      async readResource() {
        reads += 1;
        return { contents: [] };
      },
      serverExtensions: {},
    }),
  });

  assert.equal(resolved.kind, "ordinary");
  assert.equal(reads, 0);
});

test("host negotiation uses the extension snapshot bound to the resource client", async () => {
  let reads = 0;
  const resolved = await resolveMcpNativeHostResult({
    tool: ordinaryTool,
    result: a2uiResult(),
    client: hostClient({
      async readResource() {
        reads += 1;
        return { contents: [] };
      },
      clientExtensions: {},
      serverExtensions: MCP_NATIVE_HOST_EXTENSION_CAPABILITIES,
    }),
  });

  assert.equal(resolved.kind, "ordinary");
  assert.equal(reads, 0);
});

test("a negotiated A2UI result loads and parses exactly one JSONL resource", async () => {
  const reads = [];
  const resolved = await resolveMcpNativeHostResult({
    tool: ordinaryTool,
    result: a2uiResult(),
    client: hostClient({
      async readResource(uri) {
        reads.push(uri);
        return {
          contents: [
            {
              uri,
              mimeType: A2UI_MIME_TYPE,
              text: `${JSON.stringify({
                version: "v1.0",
                createSurface: { surfaceId: "main" },
              })}\n`,
            },
          ],
        };
      },
    }),
  });

  assert.equal(resolved.kind, "a2ui");
  assert.deepEqual(reads, ["ui://surface/main"]);
  assert.equal(resolved.resource.envelopes.length, 1);
  assert.equal(resolved.resource.envelopes[0].createSurface.surfaceId, "main");
  assert.equal(Object.isFrozen(resolved.resource), true);
  assert.equal(Object.isFrozen(resolved.resource.envelopes[0]), true);
});

test("a negotiated MCP Apps tool loads its predeclared isolated HTML resource", async () => {
  const reads = [];
  const resolved = await resolveMcpNativeHostResult({
    tool: appsTool(),
    result: { content: [{ type: "text", text: "Forecast loaded" }] },
    client: hostClient({
      async readResource(uri) {
        reads.push(uri);
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
    }),
  });

  assert.equal(resolved.kind, "mcp-app");
  assert.deepEqual(reads, ["ui://weather/dashboard"]);
  assert.match(resolved.resource.html, /Clear/);
  assert.equal(Object.isFrozen(resolved.resource), true);
});

test("simultaneous negotiated standard claims fail before resource loading", async () => {
  let reads = 0;
  const resolved = await resolveMcpNativeHostResult({
    tool: appsTool(),
    result: a2uiResult(),
    client: hostClient({
      async readResource() {
        reads += 1;
        return { contents: [] };
      },
    }),
  });

  assert.deepEqual(resolved, { kind: "invalid", code: "ambiguous-standard-result" });
  assert.equal(reads, 0);
});

test("a selected standard path never falls back after resource validation fails", async () => {
  const resolved = await resolveMcpNativeHostResult({
    tool: ordinaryTool,
    result: a2uiResult(),
    client: hostClient({
      async readResource(uri) {
        return {
          contents: [
            {
              uri,
              mimeType: A2UI_MIME_TYPE,
              text: JSON.stringify({ version: "0.1", executable: true }),
            },
          ],
        };
      },
    }),
  });

  assert.deepEqual(resolved, { kind: "invalid", code: "a2ui-resolution-failed" });
});

test("real SDK adapter resolves supported A2UI resource text above the generic JSON string limit", async () => {
  const envelopes = [
    { version: "v1.0", createSurface: { surfaceId: "large" } },
    ...Array.from({ length: 500 }, (_, index) => ({
      version: "v1.0",
      updateDataModel: {
        surfaceId: "large",
        path: `/value-${index}`,
        value: "x".repeat(100),
      },
    })),
  ];
  const jsonl = envelopes.map((envelope) => JSON.stringify(envelope)).join("\n");
  assert.ok(jsonl.length > 65_536);
  assert.ok(jsonl.length <= A2UI_V1_MAX_SOURCE_LENGTH);

  const resolved = await resolveMcpNativeHostResult({
    tool: ordinaryTool,
    result: a2uiResult(),
    client: sdkBackedHostClient(async ({ uri }) => ({
      contents: [{ uri, mimeType: A2UI_MIME_TYPE, text: jsonl }],
    })),
  });

  assert.equal(resolved.kind, "a2ui");
  assert.equal(resolved.resource.envelopes.length, envelopes.length);
});

test("real SDK adapter resolves supported MCP Apps HTML above the generic JSON string limit", async () => {
  const html = `<!doctype html><html><head><title>Large</title></head><body>${"x".repeat(
    70_000,
  )}</body></html>`;
  assert.ok(html.length > 65_536);

  const resolved = await resolveMcpNativeHostResult({
    tool: appsTool(),
    result: { content: [{ type: "text", text: "Large app" }] },
    client: sdkBackedHostClient(async ({ uri }) => ({
      contents: [{ uri, mimeType: MCP_APPS_MIME_TYPE, text: html }],
    })),
  });

  assert.equal(resolved.kind, "mcp-app");
  assert.equal(resolved.resource.html, html);
});

test("malformed inputs, extension settings, and Apps metadata fail with stable codes", async (t) => {
  const readResource = async () => {
    throw new Error("secret server diagnostic");
  };
  const client = hostClient({
    async readResource() {
      throw new Error("secret server diagnostic");
    },
  });
  const cases = [
    {
      name: "client without connection-bound extension snapshots",
      options: {
        tool: ordinaryTool,
        result: { content: [] },
        client: { readResource },
      },
      expected: "invalid-input",
    },
    {
      name: "non-JSON result",
      options: {
        tool: ordinaryTool,
        result: { content: [{ type: "text", text: Number.NaN }] },
        client,
      },
      expected: "invalid-input",
    },
    {
      name: "oversized content collection",
      options: {
        tool: ordinaryTool,
        result: { content: Array(1_025).fill({ type: "text", text: "x" }) },
        client,
      },
      expected: "invalid-input",
    },
    {
      name: "invalid extension settings",
      options: {
        tool: ordinaryTool,
        result: { content: [] },
        client: hostClient({ readResource, serverExtensions: [] }),
      },
      expected: "invalid-extension-settings",
    },
    {
      name: "malformed Apps metadata",
      options: {
        tool: {
          ...ordinaryTool,
          _meta: { ui: { resourceUri: "https://not-ui.example/app" } },
        },
        result: { content: [] },
        client,
      },
      expected: "mcp-app-resolution-failed",
    },
    {
      name: "redacted Apps resource failure",
      options: {
        tool: appsTool(),
        result: { content: [] },
        client,
      },
      expected: "mcp-app-resolution-failed",
    },
  ];

  await Promise.all(
    cases.map((fixture) =>
      t.test(fixture.name, async () => {
        const resolved = await resolveMcpNativeHostResult(fixture.options);
        assert.deepEqual(resolved, { kind: "invalid", code: fixture.expected });
        assert.doesNotMatch(JSON.stringify(resolved), /secret server diagnostic/);
        assert.equal(Object.isFrozen(resolved), true);
      }),
    ),
  );
});
