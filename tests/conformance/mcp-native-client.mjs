#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import {
  MCP_NATIVE_PROTOCOL_REVISION,
  McpSdkClientAdapter,
  createMcpNativeClientOptions,
} from "../../packages/mcp/dist/index.js";
import {
  createMcpNativeOAuthProvider,
  createMcpNativeOAuthTransport,
} from "../../packages/mcp/dist/oauth.js";

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

const createOAuthStore = (preRegisteredClient) => {
  const clientInformation = new Map();
  const tokens = new Map();
  let latestTokenIssuer;
  let verifier;
  let pendingAuthorization;
  let state;
  let stateOwner;
  let discoveryState;

  return {
    async loadClientInformation(issuer) {
      return (
        clientInformation.get(issuer) ??
        (preRegisteredClient === undefined ? undefined : { ...preRegisteredClient, issuer })
      );
    },
    async saveClientInformation(issuer, information) {
      clientInformation.set(issuer, structuredClone(information));
    },
    async loadTokens(issuer) {
      const resolvedIssuer = issuer ?? latestTokenIssuer;
      return resolvedIssuer === undefined ? undefined : structuredClone(tokens.get(resolvedIssuer));
    },
    async saveTokens(issuer, value) {
      tokens.set(issuer, structuredClone(value));
      latestTokenIssuer = issuer;
    },
    async loadCodeVerifier() {
      return verifier;
    },
    async saveCodeVerifier(value) {
      verifier = value;
    },
    async loadPendingAuthorization() {
      return pendingAuthorization === undefined ? undefined : structuredClone(pendingAuthorization);
    },
    async savePendingAuthorization(value) {
      pendingAuthorization = structuredClone(value);
    },
    async reserveOAuthState(owner) {
      if (stateOwner !== undefined || state !== undefined) {
        throw new Error("Another OAuth authorization state is already reserved");
      }
      stateOwner = owner;
    },
    async saveOAuthState(value, owner) {
      if ((stateOwner !== undefined && stateOwner !== owner) || state !== undefined) {
        throw new Error("Another OAuth authorization state is already reserved");
      }
      state = value;
      stateOwner = owner;
    },
    async consumeOAuthState(value, owner) {
      if (state !== value) return false;
      if (stateOwner !== undefined && stateOwner !== owner) return false;
      state = "mcp-native:claimed";
      stateOwner = owner;
      return true;
    },
    async claimOAuthStateForCleanup(owner) {
      if (stateOwner !== undefined && stateOwner !== owner) {
        throw new Error("Another OAuth provider owns the authorization state reservation");
      }
      stateOwner = owner;
    },
    async clearOAuthState(owner) {
      if (stateOwner !== owner) {
        throw new Error("OAuth state reservation is not owned by this provider");
      }
      state = undefined;
      stateOwner = undefined;
    },
    async loadDiscoveryState() {
      return discoveryState === undefined ? undefined : structuredClone(discoveryState);
    },
    async saveDiscoveryState(value) {
      discoveryState = structuredClone(value);
    },
    async invalidate(scope, issuer) {
      if (scope === "all" || scope === "client") {
        if (issuer === undefined) clientInformation.clear();
        else clientInformation.delete(issuer);
      }
      if (scope === "all" || scope === "tokens") {
        if (issuer === undefined) tokens.clear();
        else tokens.delete(issuer);
        if (issuer === undefined || latestTokenIssuer === issuer) latestTokenIssuer = undefined;
      }
      if (scope === "all" || scope === "verifier") {
        verifier = undefined;
        pendingAuthorization = undefined;
      }
      if (scope === "all" || scope === "discovery") discoveryState = undefined;
      if (scope === "all") {
        state = undefined;
        stateOwner = undefined;
      }
    },
  };
};

const createOAuthConformanceSession = () => {
  const context = parseContext();
  const redirectUrl = "http://127.0.0.1/oauth/callback";
  const preRegisteredClient =
    scenario === "auth/pre-registration"
      ? {
          client_id: context.client_id,
          client_secret: context.client_secret,
          token_endpoint_auth_method: "client_secret_basic",
        }
      : undefined;
  if (preRegisteredClient !== undefined) {
    assert.equal(typeof preRegisteredClient.client_id, "string");
    assert.equal(typeof preRegisteredClient.client_secret, "string");
  }

  const storage = createOAuthStore(preRegisteredClient);
  let pendingAuthorization;
  let lastAuthorizationUrl;
  let approvedReauthorizations = 0;
  const provider = createMcpNativeOAuthProvider({
    serverUrl,
    redirectUrl,
    clientMetadata: {
      client_name: "MCP Native conformance host",
      redirect_uris: [redirectUrl],
    },
    ...(scenario === "auth/basic-cimd"
      ? { clientMetadataUrl: "https://conformance-test.local/client-metadata.json" }
      : {}),
    storage,
    createState: () => randomBytes(32).toString("base64url"),
    async openAuthorization(authorizationUrl) {
      if (authorizationUrl.href === lastAuthorizationUrl && pendingAuthorization !== undefined) {
        return;
      }
      const response = await fetch(authorizationUrl, { redirect: "manual" });
      assert.ok(response.status >= 300 && response.status < 400);
      const location = response.headers.get("location");
      assert.ok(location, "Authorization endpoint did not return a callback redirect");
      lastAuthorizationUrl = authorizationUrl.href;
      pendingAuthorization = new URL(location, authorizationUrl);
    },
    approveReauthorization() {
      if (scenario === "auth/scope-retry-limit" && approvedReauthorizations >= 2) {
        return false;
      }
      approvedReauthorizations += 1;
      return true;
    },
  });

  return {
    provider,
    takePendingAuthorization() {
      const value = pendingAuthorization;
      pendingAuthorization = undefined;
      lastAuthorizationUrl = undefined;
      return value;
    },
  };
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
if (handler !== undefined) {
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
} else {
  assert.ok(scenario.startsWith("auth/"), `Unsupported pinned conformance scenario: ${scenario}`);
  const session = createOAuthConformanceSession();
  const runOAuthScenario = async (authorizationRound = 0) => {
    assert.ok(
      authorizationRound < 5,
      "OAuth scenario exceeded the bounded authorization round limit",
    );
    const client = new Client(
      { name: "mcp-native-conformance-client", version: "0.0.0" },
      createMcpNativeClientOptions("modern-only"),
    );
    const transport = createMcpNativeOAuthTransport(serverUrl, session.provider, {
      scopeEscalation: "host-approved",
    });
    let retry = false;

    try {
      await client.connect(transport);
      assert.equal(client.getNegotiatedProtocolVersion(), MCP_NATIVE_PROTOCOL_REVISION);
      const adapter = new McpSdkClientAdapter(client);
      await adapter.listTools();
      if (scenario === "auth/scope-step-up" || scenario === "auth/scope-retry-limit") {
        await adapter.callTool("test-tool", {});
      } else if (scenario === "auth/authorization-server-migration") {
        await adapter.listTools();
      }
    } catch (error) {
      const callbackUrl = session.takePendingAuthorization();
      if (callbackUrl === undefined) throw error;
      await session.provider.finishAuthorization(transport, callbackUrl);
      retry = true;
    } finally {
      await client.close();
    }
    if (retry) return runOAuthScenario(authorizationRound + 1);
  };
  await runOAuthScenario();
}
