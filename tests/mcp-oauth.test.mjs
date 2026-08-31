import assert from "node:assert/strict";
import test from "node:test";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import {
  McpNativeOAuthError,
  createMcpNativeOAuthProvider,
  createMcpNativeOAuthTransport,
} from "../packages/mcp/dist/oauth.js";

const SERVER_URL = "https://mcp.example.com/mcp";
const REDIRECT_URL = "mcp-native://oauth/callback";
const ISSUER = "https://auth.example.com";
const VALID_STATE = "state_abcdefghijklmnopqrstuvwxyz-0123456789";
const VALID_VERIFIER = "v".repeat(64);

function createStorage(initial = {}) {
  const values = {
    clientInformation: new Map(),
    tokens: undefined,
    verifier: undefined,
    state: undefined,
    discovery: undefined,
    invalidations: [],
    ...initial,
  };
  return {
    values,
    async loadClientInformation(issuer) {
      return values.clientInformation.get(issuer);
    },
    async saveClientInformation(issuer, information) {
      values.clientInformation.set(issuer, information);
    },
    async loadTokens(issuer) {
      if (issuer !== undefined && values.tokens?.issuer !== issuer) return undefined;
      return values.tokens;
    },
    async saveTokens(_issuer, tokens) {
      values.tokens = tokens;
    },
    async loadCodeVerifier() {
      return values.verifier;
    },
    async saveCodeVerifier(verifier) {
      values.verifier = verifier;
    },
    async saveOAuthState(state) {
      values.state = state;
    },
    async consumeOAuthState(state) {
      if (values.state !== state) return false;
      values.state = undefined;
      return true;
    },
    async loadDiscoveryState() {
      return values.discovery;
    },
    async saveDiscoveryState(discovery) {
      values.discovery = discovery;
    },
    async invalidate(scope, issuer) {
      values.invalidations.push([scope, issuer]);
      if (scope === "all") values.state = undefined;
      if (scope === "all" || scope === "verifier") values.verifier = undefined;
      if (scope === "all" || scope === "tokens") values.tokens = undefined;
      if (scope === "all" || scope === "discovery") values.discovery = undefined;
      if (scope === "all" || scope === "client") values.clientInformation.clear();
    },
  };
}

function createProvider(overrides = {}) {
  const storage = overrides.storage ?? createStorage();
  const opened = [];
  const provider = createMcpNativeOAuthProvider({
    serverUrl: SERVER_URL,
    redirectUrl: REDIRECT_URL,
    clientMetadata: {
      client_name: "MCP Native test host",
      redirect_uris: [REDIRECT_URL],
    },
    storage,
    createState: () => VALID_STATE,
    openAuthorization: (url) => opened.push(url.href),
    ...overrides,
  });
  return { opened, provider, storage };
}

test("OAuth provider validates metadata and supplies native registration defaults", () => {
  const { provider } = createProvider();
  assert.equal(provider.redirectUrl.href, REDIRECT_URL);
  assert.equal(provider.clientMetadata.application_type, "native");
  assert.deepEqual(provider.clientMetadata.grant_types, ["authorization_code", "refresh_token"]);

  assert.throws(
    () =>
      createProvider({
        clientMetadata: { redirect_uris: ["mcp-native://other/callback"] },
      }),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
  );
  assert.throws(
    () => createProvider({ serverUrl: "http://remote.example.com/mcp" }),
    /HTTPS or an HTTP loopback address/,
  );
  for (const redirectUrl of [
    "javascript:alert(1)",
    "data:text/html,callback",
    "file:///tmp/oauth-callback",
  ]) {
    assert.throws(
      () =>
        createProvider({
          redirectUrl,
          clientMetadata: { redirect_uris: [redirectUrl] },
        }),
      /safe private-use app scheme/,
    );
  }
});

test("OAuth provider persists and validates state and PKCE material", async () => {
  const { provider, storage } = createProvider();
  assert.equal(await provider.state(), VALID_STATE);
  assert.equal(storage.values.state, VALID_STATE);

  await provider.saveCodeVerifier(VALID_VERIFIER);
  assert.equal(await provider.codeVerifier(), VALID_VERIFIER);

  await assert.rejects(
    () => provider.saveCodeVerifier("short"),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
  );
  await assert.rejects(
    () => createProvider({ createState: () => "predictable" }).provider.state(),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
  );
});

test("OAuth credentials are bound to their authorization-server issuer", async () => {
  const { provider, storage } = createProvider();
  await provider.saveClientInformation(
    { client_id: "client", client_secret: "secret", issuer: ISSUER },
    { issuer: ISSUER },
  );
  assert.equal((await provider.clientInformation({ issuer: ISSUER })).client_id, "client");

  await provider.saveTokens(
    { access_token: "access", refresh_token: "refresh", token_type: "Bearer", issuer: ISSUER },
    { issuer: ISSUER },
  );
  assert.equal((await provider.tokens()).issuer, ISSUER);
  assert.equal(storage.values.tokens.access_token, "access");

  storage.values.tokens = {
    access_token: "wrong",
    token_type: "Bearer",
    issuer: "https://other.example.com",
  };
  storage.loadTokens = async () => storage.values.tokens;
  await assert.rejects(
    () => provider.tokens({ issuer: ISSUER }),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
  );
});

test("OAuth token values are bounded before parsing, persistence, and reuse", async () => {
  const { provider, storage } = createProvider();
  await assert.rejects(
    () =>
      provider.saveTokens(
        { access_token: "a".repeat(16_385), token_type: "Bearer" },
        { issuer: ISSUER },
      ),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
  );
  assert.equal(storage.values.tokens, undefined);

  await assert.rejects(
    () =>
      provider.saveTokens(
        {
          access_token: "a".repeat(13_000),
          refresh_token: "r".repeat(13_000),
          token_type: "Bearer",
        },
        { issuer: ISSUER },
      ),
    /cumulative supported size/,
  );
  assert.equal(storage.values.tokens, undefined);

  storage.values.tokens = {
    access_token: "a".repeat(16_385),
    token_type: "Bearer",
    issuer: ISSUER,
  };
  await assert.rejects(
    () => provider.tokens({ issuer: ISSUER }),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
  );
});

test("OAuth resource indicators are pinned to the configured MCP server", async () => {
  const { provider } = createProvider();
  assert.equal((await provider.validateResourceURL(SERVER_URL)).href, SERVER_URL);
  assert.equal(
    (await provider.validateResourceURL(SERVER_URL, "https://mcp.example.com/mcp")).href,
    SERVER_URL,
  );
  await assert.rejects(
    () => provider.validateResourceURL(SERVER_URL, "https://evil.example.com/mcp"),
    (error) => error instanceof McpNativeOAuthError && error.code === "resource-mismatch",
  );
  await assert.rejects(
    () => provider.validateResourceURL("https://other.example.com/mcp"),
    (error) => error instanceof McpNativeOAuthError && error.code === "resource-mismatch",
  );
});

test("OAuth discovery cache rejects issuer and protected-resource substitution", async () => {
  const { provider, storage } = createProvider();
  storage.values.discovery = {
    authorizationServerUrl: ISSUER,
    authorizationServerMetadata: {
      issuer: "https://evil.example.com",
      authorization_endpoint: "https://evil.example.com/authorize",
      token_endpoint: "https://evil.example.com/token",
      response_types_supported: ["code"],
    },
  };
  await assert.rejects(
    () => provider.discoveryState(),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
  );

  storage.values.discovery = {
    authorizationServerUrl: ISSUER,
    resourceMetadata: {
      resource: SERVER_URL,
      authorization_servers: ["https://other.example.com"],
    },
  };
  await provider.saveCodeVerifier(VALID_VERIFIER);
  await assert.rejects(
    () => provider.discoveryState(),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
  );

  storage.values.discovery = {
    authorizationServerUrl: ISSUER,
    resourceMetadata: {
      resource: "https://evil.example.com/mcp",
      authorization_servers: [ISSUER],
    },
  };
  await assert.rejects(
    () => provider.discoveryState(),
    (error) => error instanceof McpNativeOAuthError && error.code === "resource-mismatch",
  );

  await Promise.all(
    [`${ISSUER}?tenant=x`, `${ISSUER}#tenant-x`].map(async (authorizationServerUrl) => {
      const invalid = createProvider();
      invalid.storage.values.discovery = { authorizationServerUrl };
      await assert.rejects(
        () => invalid.provider.discoveryState(),
        (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
      );
    }),
  );
});

test("OAuth discovery state is reusable only across the pending PKCE callback", async () => {
  const { provider, storage } = createProvider();
  storage.values.discovery = {
    authorizationServerUrl: ISSUER,
    authorizationServerMetadata: {
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/authorize`,
      token_endpoint: `${ISSUER}/token`,
      response_types_supported: ["code"],
    },
    resourceMetadata: {
      resource: SERVER_URL,
      authorization_servers: [ISSUER],
    },
  };

  assert.equal(await provider.discoveryState(), undefined);
  await provider.saveCodeVerifier(VALID_VERIFIER);
  assert.equal((await provider.discoveryState()).authorizationServerUrl, ISSUER);
});

test("OAuth callback completion validates redirect, state, duplicates, and consumes secrets", async () => {
  const { provider, storage } = createProvider();
  await provider.state();
  await provider.saveCodeVerifier(VALID_VERIFIER);
  let received;
  const finisher = {
    async finishAuth(parameters) {
      received = new URLSearchParams(parameters);
      assert.equal(await provider.codeVerifier(), VALID_VERIFIER);
    },
  };

  await provider.finishAuthorization(
    finisher,
    `${REDIRECT_URL}?code=code-1&state=${VALID_STATE}&iss=${encodeURIComponent(ISSUER)}`,
  );
  assert.equal(received.get("code"), "code-1");
  assert.equal(received.get("iss"), ISSUER);
  assert.equal(storage.values.state, undefined);
  assert.equal(storage.values.verifier, undefined);
  await assert.rejects(
    () =>
      provider.finishAuthorization(
        finisher,
        `${REDIRECT_URL}?code=code-1&state=${VALID_STATE}&iss=${encodeURIComponent(ISSUER)}`,
      ),
    (error) => error instanceof McpNativeOAuthError && error.code === "state-mismatch",
  );

  await provider.state();
  await assert.rejects(
    () => provider.finishAuthorization(finisher, `${REDIRECT_URL}?code=x&state=wrong`),
    (error) => error instanceof McpNativeOAuthError && error.code === "state-mismatch",
  );
  await assert.rejects(
    () =>
      provider.finishAuthorization(
        finisher,
        `${REDIRECT_URL}?code=x&state=${VALID_STATE}&state=${VALID_STATE}`,
      ),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-callback",
  );
  await assert.rejects(
    () =>
      provider.finishAuthorization(
        finisher,
        `mcp-native://attacker/callback?code=x&state=${VALID_STATE}`,
      ),
    (error) => error instanceof McpNativeOAuthError && error.code === "callback-mismatch",
  );
});

test("OAuth recovery callbacks are bounded before URL parsing and code redemption", async () => {
  await Promise.all(
    [
      `${REDIRECT_URL}?code=${"c".repeat(4_097)}&state=${VALID_STATE}`,
      `${REDIRECT_URL}?code=code-1&state=${VALID_STATE}&extension=${"x".repeat(64)}`,
      `${REDIRECT_URL}?error=access_denied&error_description=${"x".repeat(8_193)}&state=${VALID_STATE}`,
    ].map(async (callback) => {
      const { provider, storage } = createProvider();
      await provider.state();
      await provider.saveCodeVerifier(VALID_VERIFIER);
      await assert.rejects(
        () =>
          provider.finishAuthorization(
            { finishAuth: () => assert.fail("must not redeem") },
            callback,
          ),
        (error) => error instanceof McpNativeOAuthError && error.code === "invalid-callback",
      );
      assert.equal(storage.values.state, VALID_STATE);
      assert.equal(storage.values.verifier, VALID_VERIFIER);
    }),
  );
});

test("OAuth callback errors do not expose attacker-controlled descriptions", async () => {
  const { provider, storage } = createProvider();
  await provider.state();
  await provider.saveCodeVerifier(VALID_VERIFIER);
  const callback = `${REDIRECT_URL}?error=access_denied&error_description=render-me&state=${VALID_STATE}`;
  await assert.rejects(
    () =>
      provider.finishAuthorization({ finishAuth: () => assert.fail("must not redeem") }, callback),
    (error) => {
      assert.ok(error instanceof McpNativeOAuthError);
      assert.equal(error.code, "authorization-denied");
      assert.doesNotMatch(error.message, /render-me/);
      return true;
    },
  );
  assert.equal(storage.values.verifier, undefined);
});

test("OAuth authorization handoff and transport reject credential bypasses", async () => {
  const { opened, provider } = createProvider();
  await provider.redirectToAuthorization(new URL("https://auth.example.com/authorize?client_id=x"));
  await provider.redirectToAuthorization(new URL("https://auth.example.com/authorize?client_id=x"));
  assert.deepEqual(opened, ["https://auth.example.com/authorize?client_id=x"]);
  await assert.rejects(
    () => provider.redirectToAuthorization(new URL("http://auth.example.com/authorize")),
    /HTTPS or an HTTP loopback address/,
  );

  const transport = createMcpNativeOAuthTransport(SERVER_URL, provider, {
    headers: { "X-Host": "mobile" },
  });
  assert.ok(transport instanceof StreamableHTTPClientTransport);
  assert.throws(
    () =>
      createMcpNativeOAuthTransport(SERVER_URL, provider, {
        headers: { Authorization: "Bearer bypass" },
      }),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
  );
  assert.throws(
    () => createMcpNativeOAuthTransport("https://other.example.com/mcp", provider),
    (error) => error instanceof McpNativeOAuthError && error.code === "resource-mismatch",
  );
});

test("OAuth reauthorization requires an exact host approval decision", async () => {
  const decisions = [];
  const { opened, provider } = createProvider({
    approveReauthorization(request) {
      decisions.push(request);
      return true;
    },
  });
  await provider.saveTokens(
    {
      access_token: "access",
      token_type: "Bearer",
      scope: "mcp:read",
      issuer: ISSUER,
    },
    { issuer: ISSUER },
  );

  await provider.redirectToAuthorization(
    new URL("https://auth.example.com/authorize?scope=mcp%3Aread%20mcp%3Awrite"),
  );
  assert.equal(decisions.length, 1);
  assert.deepEqual(decisions[0], {
    issuer: ISSUER,
    currentScopes: ["mcp:read"],
    requestedScopes: ["mcp:read", "mcp:write"],
    addedScopes: ["mcp:write"],
  });
  assert.ok(Object.isFrozen(decisions[0]));
  assert.ok(Object.isFrozen(decisions[0].addedScopes));
  assert.equal(opened.length, 1);

  await provider.redirectToAuthorization(
    new URL("https://auth.example.com/authorize?scope=mcp%3Aread"),
  );
  assert.deepEqual(decisions[1].addedScopes, []);
  assert.equal(opened.length, 2);

  const denied = createProvider({ approveReauthorization: () => false });
  await denied.provider.saveTokens(
    { access_token: "access", token_type: "Bearer", scope: "mcp:read", issuer: ISSUER },
    { issuer: ISSUER },
  );
  await assert.rejects(
    () =>
      denied.provider.redirectToAuthorization(
        new URL("https://auth.example.com/authorize?scope=mcp%3Aread%20mcp%3Awrite"),
      ),
    (error) => error instanceof McpNativeOAuthError && error.code === "reauthorization-denied",
  );
  assert.deepEqual(denied.opened, []);
});

test("OAuth reauthorization is fail-closed and bounded", async () => {
  const { opened, provider } = createProvider();
  await provider.saveTokens(
    { access_token: "access", token_type: "Bearer", scope: "mcp:read", issuer: ISSUER },
    { issuer: ISSUER },
  );

  await assert.rejects(
    () =>
      provider.redirectToAuthorization(
        new URL("https://auth.example.com/authorize?scope=mcp%3Aread%20mcp%3Awrite"),
      ),
    (error) => error instanceof McpNativeOAuthError && error.code === "reauthorization-denied",
  );
  await assert.rejects(
    () =>
      provider.redirectToAuthorization(
        new URL("https://auth.example.com/authorize?scope=mcp%3Aread%20mcp%3Aread"),
      ),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
  );
  await assert.rejects(
    () =>
      provider.redirectToAuthorization(
        new URL(`https://auth.example.com/authorize?scope=${"a".repeat(2_049)}`),
      ),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
  );
  assert.deepEqual(opened, []);

  assert.throws(
    () =>
      createMcpNativeOAuthTransport(SERVER_URL, provider, {
        scopeEscalation: "host-approved",
      }),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
  );
  const approved = createProvider({ approveReauthorization: () => true });
  assert.ok(
    createMcpNativeOAuthTransport(SERVER_URL, approved.provider, {
      scopeEscalation: "host-approved",
    }) instanceof StreamableHTTPClientTransport,
  );
});
