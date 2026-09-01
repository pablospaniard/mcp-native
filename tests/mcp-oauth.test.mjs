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
const CLAIMED_STATE_MARKER = "mcp-native:claimed";

function createStorage(initial = {}) {
  const values = {
    clientInformation: new Map(),
    tokens: undefined,
    verifier: undefined,
    state: undefined,
    stateOwner: undefined,
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
    async reserveOAuthState(owner) {
      if (values.stateOwner !== undefined || values.state !== undefined) {
        throw new McpNativeOAuthError(
          "invalid-storage",
          "Another OAuth authorization state is already reserved",
        );
      }
      values.stateOwner = owner;
    },
    async saveOAuthState(state, owner) {
      if (
        (values.stateOwner !== undefined && values.stateOwner !== owner) ||
        values.state !== undefined
      ) {
        throw new McpNativeOAuthError(
          "invalid-storage",
          "Another OAuth authorization state is already reserved",
        );
      }
      values.state = state;
      values.stateOwner = owner;
    },
    async consumeOAuthState(state, owner) {
      if (values.state !== state) return false;
      if (values.stateOwner !== undefined && values.stateOwner !== owner) return false;
      values.state = CLAIMED_STATE_MARKER;
      values.stateOwner = owner;
      return true;
    },
    async claimOAuthStateForCleanup(owner) {
      if (values.stateOwner !== undefined && values.stateOwner !== owner) {
        throw new McpNativeOAuthError(
          "invalid-storage",
          "Another OAuth provider owns the authorization state reservation",
        );
      }
      values.stateOwner = owner;
    },
    async clearOAuthState(owner) {
      if (values.stateOwner !== owner) {
        throw new McpNativeOAuthError(
          "invalid-storage",
          "OAuth state reservation is not owned by this provider",
        );
      }
      values.state = undefined;
      values.stateOwner = undefined;
    },
    async loadDiscoveryState() {
      return values.discovery;
    },
    async saveDiscoveryState(discovery) {
      values.discovery = discovery;
    },
    async invalidate(scope, issuer) {
      values.invalidations.push([scope, issuer]);
      if (scope === "all") {
        values.state = undefined;
        values.stateOwner = undefined;
      }
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

function createScopeStore(initial) {
  let record = initial;
  return {
    get record() {
      return record;
    },
    async load(resource) {
      return record?.resource === resource ? record : undefined;
    },
    async save(value) {
      record = value;
    },
    async remove(resource) {
      if (record?.resource === resource) record = undefined;
    },
  };
}

async function reserveAuthorizationAttempt(provider) {
  await provider.state();
  await provider.saveCodeVerifier(VALID_VERIFIER);
}

test("OAuth provider validates metadata and supplies native registration defaults", () => {
  const { provider } = createProvider();
  assert.equal(provider.redirectUrl.href, REDIRECT_URL);
  assert.equal(provider.clientMetadata.application_type, "native");
  assert.deepEqual(provider.clientMetadata.grant_types, ["authorization_code", "refresh_token"]);

  for (const overrides of [
    { storage: {} },
    { createState: null },
    { openAuthorization: null },
    { approveReauthorization: true },
  ]) {
    assert.throws(
      () => createProvider(overrides),
      (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
    );
  }

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
  assert.doesNotThrow(() => createProvider({ serverUrl: "http://127.0.0.2:8080/mcp" }));
  const ipv4LoopbackRedirect = "http://127.42.0.9:49152/oauth/callback";
  assert.doesNotThrow(() =>
    createProvider({
      redirectUrl: ipv4LoopbackRedirect,
      clientMetadata: { redirect_uris: [ipv4LoopbackRedirect] },
    }),
  );
  assert.throws(() => createProvider({ serverUrl: `${SERVER_URL}#` }), /fragment/);
  assert.throws(
    () =>
      createProvider({
        redirectUrl: `${REDIRECT_URL}#`,
        clientMetadata: { redirect_uris: [`${REDIRECT_URL}#`] },
      }),
    /fragment/,
  );
  const duplicateQueryRedirect = `${REDIRECT_URL}?tenant=a&tenant=b`;
  assert.throws(
    () =>
      createProvider({
        redirectUrl: duplicateQueryRedirect,
        clientMetadata: { redirect_uris: [duplicateQueryRedirect] },
      }),
    /duplicate query parameter names/,
  );
  assert.throws(
    () =>
      createProvider({
        clientMetadata: { redirect_uris: [REDIRECT_URL, duplicateQueryRedirect] },
      }),
    /duplicate query parameter names/,
  );
  for (const redirectUrl of [
    `${REDIRECT_URL}?${"n".repeat(129)}=value`,
    `${REDIRECT_URL}?tenant=${"x".repeat(4_097)}`,
    `${REDIRECT_URL}?${Array.from({ length: 15 }, (_, index) => `p${index}=x`).join("&")}`,
    `mcp-native://oauth/${"p".repeat(3_600)}`,
  ]) {
    assert.throws(
      () =>
        createProvider({
          redirectUrl,
          clientMetadata: { redirect_uris: [redirectUrl] },
        }),
      (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
    );
  }
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
    assert.throws(
      () =>
        createProvider({
          clientMetadata: { redirect_uris: [REDIRECT_URL, redirectUrl] },
        }),
      (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
    );
  }
});

test("OAuth provider persists and validates state and PKCE material", async () => {
  const { provider, storage } = createProvider();
  await assert.rejects(
    () => provider.saveCodeVerifier(VALID_VERIFIER),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
  );
  assert.equal(await provider.state(), VALID_STATE);
  assert.equal(storage.values.state, VALID_STATE);

  await assert.rejects(
    () => provider.redirectToAuthorization(new URL(`${ISSUER}/authorize`)),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
  );

  await provider.saveCodeVerifier(VALID_VERIFIER);
  assert.equal(await provider.codeVerifier(), VALID_VERIFIER);
  await assert.rejects(
    () => provider.saveCodeVerifier(VALID_VERIFIER),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
  );

  await assert.rejects(
    () => provider.saveCodeVerifier("short"),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
  );
  await assert.rejects(
    () => provider.saveCodeVerifier({ toString: () => VALID_VERIFIER }),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
  );
  await assert.rejects(
    () => createProvider({ createState: () => "predictable" }).provider.state(),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
  );
  await assert.rejects(
    () => createProvider({ createState: () => ({ toString: () => VALID_STATE }) }).provider.state(),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
  );

  await provider.invalidateCredentials("verifier");
  assert.equal(storage.values.state, undefined);
  assert.equal(storage.values.verifier, undefined);
  assert.equal(await provider.state(), VALID_STATE);
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

  storage.values.tokens = {
    access_token: "access",
    token_type: "Bearer",
    issuer: ISSUER,
    extension: undefined,
  };
  await assert.rejects(
    () => provider.tokens({ issuer: ISSUER }),
    (error) =>
      error instanceof McpNativeOAuthError &&
      error.code === "invalid-storage" &&
      /non-JSON value/.test(error.message),
  );
});

test("OAuth dynamic registration records are bounded before parsing and persistence", async () => {
  const { provider, storage } = createProvider();
  await assert.rejects(
    () =>
      provider.saveClientInformation(
        { client_id: "c".repeat(4_097), client_secret: "secret" },
        { issuer: ISSUER },
      ),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
  );
  assert.equal(storage.values.clientInformation.size, 0);

  await assert.rejects(
    () =>
      provider.saveClientInformation(
        {
          client_id: "client",
          client_secret: "s".repeat(4_000),
          client_name: "n".repeat(8_000),
          redirect_uris: [REDIRECT_URL],
          software_statement: "j".repeat(8_000),
          scope: "x".repeat(5_000),
        },
        { issuer: ISSUER },
      ),
    /cumulative supported string size/,
  );
  assert.equal(storage.values.clientInformation.size, 0);

  storage.values.clientInformation.set(ISSUER, {
    client_id: "client",
    client_secret: "s".repeat(4_097),
    issuer: ISSUER,
  });
  await assert.rejects(
    () => provider.clientInformation({ issuer: ISSUER }),
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
    /cumulative supported (?:string )?size/,
  );
  assert.equal(storage.values.tokens, undefined);

  await assert.rejects(
    () =>
      provider.saveTokens(
        {
          access_token: "access",
          token_type: "Bearer",
          extension: { nested: "x".repeat(16_385) },
        },
        { issuer: ISSUER },
      ),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
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

test("malformed OAuth storage roots fail with controlled errors", async () => {
  const invalidClient = createProvider();
  invalidClient.storage.values.clientInformation.set(ISSUER, null);
  await assert.rejects(
    () => invalidClient.provider.clientInformation({ issuer: ISSUER }),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
  );

  const invalidTokens = createProvider();
  invalidTokens.storage.loadTokens = async () => [];
  await assert.rejects(
    () => invalidTokens.provider.tokens({ issuer: ISSUER }),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
  );

  const invalidDiscovery = createProvider();
  invalidDiscovery.storage.values.discovery = null;
  await assert.rejects(
    () => invalidDiscovery.provider.discoveryState(),
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
  await assert.rejects(
    () =>
      provider.validateResourceURL(SERVER_URL, `https://mcp.example.com/${"resource".repeat(513)}`),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
  );
  await assert.rejects(
    () => provider.validateResourceURL(SERVER_URL, "not an absolute URL"),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
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
  storage.values.verifier = VALID_VERIFIER;
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
    [
      `${ISSUER}?tenant=x`,
      `${ISSUER}#tenant-x`,
      "http://remote.example.com",
      "not an absolute URL",
      `https://auth.example.com/${"i".repeat(2_049)}`,
    ].flatMap((authorizationServerUrl) => {
      const persisted = createProvider();
      const cached = createProvider();
      cached.storage.values.discovery = { authorizationServerUrl };
      return [
        assert.rejects(
          () => persisted.provider.saveDiscoveryState({ authorizationServerUrl }),
          (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
        ),
        assert.rejects(
          () => cached.provider.discoveryState(),
          (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
        ),
      ];
    }),
  );

  await Promise.all(
    ["#", "#alternate"].flatMap((fragment) => {
      const resourceMetadataUrl = `https://mcp.example.com/.well-known/oauth-protected-resource${fragment}`;
      const persisted = createProvider();
      const cached = createProvider();
      cached.storage.values.discovery = { authorizationServerUrl: ISSUER, resourceMetadataUrl };
      return [
        assert.rejects(
          () =>
            persisted.provider.saveDiscoveryState({
              authorizationServerUrl: ISSUER,
              resourceMetadataUrl,
            }),
          (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
        ),
        assert.rejects(
          () => cached.provider.discoveryState(),
          (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
        ),
      ];
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
  storage.values.verifier = VALID_VERIFIER;
  assert.equal((await provider.discoveryState()).authorizationServerUrl, ISSUER);
});

test("OAuth discovery metadata is bounded before parsing, caching, and reuse", async () => {
  const baseMetadata = {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/authorize`,
    token_endpoint: `${ISSUER}/token`,
    response_types_supported: ["code"],
  };
  const oversizedStates = [
    {
      authorizationServerUrl: ISSUER,
      authorizationServerMetadata: {
        ...baseMetadata,
        authorization_endpoint: `${ISSUER}/${"a".repeat(4_097)}`,
      },
    },
    {
      authorizationServerUrl: ISSUER,
      authorizationServerMetadata: {
        ...baseMetadata,
        response_types_supported: Array.from({ length: 65 }, () => "code"),
      },
    },
    {
      authorizationServerUrl: ISSUER,
      authorizationServerMetadata: {
        ...baseMetadata,
        extension_1: "x".repeat(4_000),
        extension_2: "x".repeat(4_000),
        extension_3: "x".repeat(4_000),
        extension_4: "x".repeat(4_000),
        extension_5: "x".repeat(4_000),
        extension_6: "x".repeat(4_000),
        extension_7: "x".repeat(4_000),
      },
    },
  ];

  await Promise.all(
    oversizedStates.map(async (state) => {
      const invalid = createProvider();
      await assert.rejects(
        () => invalid.provider.saveDiscoveryState(state),
        (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
      );
      assert.equal(invalid.storage.values.discovery, undefined);
    }),
  );

  const corrupted = createProvider();
  corrupted.storage.values.discovery = oversizedStates[0];
  corrupted.storage.values.verifier = VALID_VERIFIER;
  await assert.rejects(
    () => corrupted.provider.discoveryState(),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
  );
});

test("OAuth discovery metadata rejects insecure or fragmented endpoints before caching and reuse", async () => {
  const baseMetadata = {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/authorize`,
    token_endpoint: `${ISSUER}/token`,
    response_types_supported: ["code"],
  };
  const endpointFields = [
    "authorization_endpoint",
    "token_endpoint",
    "registration_endpoint",
    "revocation_endpoint",
    "introspection_endpoint",
    "userinfo_endpoint",
    "jwks_uri",
    "service_documentation",
    "op_policy_uri",
    "op_tos_uri",
    "device_authorization_endpoint",
    "pushed_authorization_request_endpoint",
  ];

  await Promise.all(
    endpointFields.flatMap((field) =>
      [`http://remote.example.com/${field}`, `${ISSUER}/${field}#alternate`].map(async (value) => {
        const invalid = createProvider();
        await assert.rejects(
          () =>
            invalid.provider.saveDiscoveryState({
              authorizationServerUrl: ISSUER,
              authorizationServerMetadata: { ...baseMetadata, [field]: value },
            }),
          (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
        );
        assert.equal(invalid.storage.values.discovery, undefined);
      }),
    ),
  );

  await Promise.all(
    ["http://remote.example.com/token", `${ISSUER}/token#alternate`].map(async (tokenEndpoint) => {
      const corrupted = createProvider();
      corrupted.storage.values.discovery = {
        authorizationServerUrl: ISSUER,
        authorizationServerMetadata: { ...baseMetadata, token_endpoint: tokenEndpoint },
      };
      corrupted.storage.values.verifier = VALID_VERIFIER;
      await assert.rejects(
        () => corrupted.provider.discoveryState(),
        (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
      );
    }),
  );
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
      "not an absolute URL",
      `${REDIRECT_URL}?code=${"c".repeat(4_097)}&state=${VALID_STATE}`,
      `${REDIRECT_URL}?code=code-1&state=${VALID_STATE}&extension=${"x".repeat(64)}`,
      `${REDIRECT_URL}?error=access_denied&error_description=${"x".repeat(8_193)}&state=${VALID_STATE}`,
      `${REDIRECT_URL}?code=code-1&state=${VALID_STATE}#`,
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

test("OAuth recovery completion reserves persisted state against a new attempt", async () => {
  const storage = createStorage({ state: VALID_STATE, verifier: VALID_VERIFIER });
  const consume = storage.consumeOAuthState.bind(storage);
  let release;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  storage.consumeOAuthState = async (state, owner) => {
    await blocked;
    return consume(state, owner);
  };
  const { provider } = createProvider({ storage });
  let code;
  const completion = provider.finishAuthorization(
    {
      finishAuth(parameters) {
        code = parameters.get("code");
      },
    },
    `${REDIRECT_URL}?code=code-1&state=${VALID_STATE}`,
  );
  await Promise.resolve();

  await assert.rejects(
    () => provider.state(),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
  );
  await assert.rejects(
    () => provider.invalidateCredentials("all"),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
  );
  assert.equal(storage.values.state, VALID_STATE);
  assert.equal(storage.values.verifier, VALID_VERIFIER);

  release();
  await completion;
  assert.equal(code, "code-1");
  assert.equal(storage.values.state, undefined);
  assert.equal(storage.values.verifier, undefined);
});

test("OAuth cancellation cannot race an in-flight state reservation", async () => {
  const storage = createStorage({ verifier: VALID_VERIFIER });
  const save = storage.saveOAuthState.bind(storage);
  let release;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  storage.saveOAuthState = async (state, owner) => {
    await blocked;
    await save(state, owner);
  };
  const { provider } = createProvider({ storage });
  const pending = provider.state();
  await assert.rejects(
    () => provider.cancelAuthorization(),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
  );
  await assert.rejects(
    () => provider.invalidateCredentials("all"),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
  );
  assert.equal(storage.values.verifier, VALID_VERIFIER);

  release();
  assert.equal(await pending, VALID_STATE);
  assert.equal(storage.values.state, VALID_STATE);

  // The reservation survived the rejected cancellation, so no attempt can replace it.
  await assert.rejects(
    () => provider.state(),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
  );

  await provider.cancelAuthorization();
  assert.equal(storage.values.state, undefined);
  assert.equal(storage.values.verifier, undefined);
});

test("OAuth cancellation releases a reservation persisted by an earlier process", async () => {
  const storage = createStorage({ state: VALID_STATE, verifier: VALID_VERIFIER });
  const { provider } = createProvider({ storage });

  // A restarted host has no in-memory pending attempt to consume.
  await provider.cancelAuthorization();
  assert.equal(storage.values.state, undefined);
  assert.equal(storage.values.verifier, undefined);

  assert.equal(await provider.state(), VALID_STATE);
  assert.equal(storage.values.state, VALID_STATE);
});

test("overlapping OAuth cancellations cannot erase a new authorization attempt", async () => {
  const storage = createStorage({ state: VALID_STATE, verifier: VALID_VERIFIER });
  const invalidate = storage.invalidate.bind(storage);
  let release;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  storage.invalidate = async (scope, issuer) => {
    if (scope === "verifier") await blocked;
    await invalidate(scope, issuer);
  };
  const { provider } = createProvider({ storage });

  const cancellation = provider.cancelAuthorization();
  await Promise.resolve();
  await assert.rejects(
    () => provider.cancelAuthorization(),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
  );
  await assert.rejects(
    () => provider.state(),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
  );
  assert.equal(storage.values.state, VALID_STATE);

  release();
  await cancellation;
  assert.equal(await provider.state(), VALID_STATE);
  assert.equal(storage.values.state, VALID_STATE);
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
  await reserveAuthorizationAttempt(provider);
  await provider.redirectToAuthorization(new URL("https://auth.example.com/authorize?client_id=x"));
  await provider.redirectToAuthorization(new URL("https://auth.example.com/authorize?client_id=x"));
  assert.deepEqual(opened, ["https://auth.example.com/authorize?client_id=x"]);
  await assert.rejects(
    () =>
      provider.redirectToAuthorization(
        new URL("https://auth.example.com/authorize?client_id=different"),
      ),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
  );
  await assert.rejects(
    () => provider.redirectToAuthorization(new URL("http://auth.example.com/authorize")),
    /HTTPS or an HTTP loopback address/,
  );
  await assert.rejects(
    () => provider.redirectToAuthorization(new URL("https://auth.example.com/authorize#")),
    /fragment/,
  );
  await assert.rejects(
    () =>
      provider.redirectToAuthorization(
        new URL(`https://auth.example.com/authorize?padding=${"x".repeat(8_192)}`),
      ),
    /authorization URL exceeds the supported size/,
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

test("OAuth callback completion cannot race an authorization handoff", async () => {
  let handoffStarted;
  const started = new Promise((resolve) => {
    handoffStarted = resolve;
  });
  let releaseHandoff;
  const blocked = new Promise((resolve) => {
    releaseHandoff = resolve;
  });
  const { provider, storage } = createProvider({
    async openAuthorization() {
      handoffStarted();
      await blocked;
    },
  });
  await provider.state();
  await provider.saveCodeVerifier(VALID_VERIFIER);

  const handoff = provider.redirectToAuthorization(new URL(`${ISSUER}/authorize?client_id=x`));
  await started;
  await assert.rejects(
    () =>
      provider.finishAuthorization(
        { finishAuth: () => assert.fail("must not redeem") },
        `${REDIRECT_URL}?code=code-1&state=${VALID_STATE}`,
      ),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-callback",
  );
  assert.equal(storage.values.state, VALID_STATE);
  assert.equal(storage.values.verifier, VALID_VERIFIER);

  releaseHandoff();
  await handoff;
  await provider.finishAuthorization(
    { finishAuth: () => undefined },
    `${REDIRECT_URL}?code=code-1&state=${VALID_STATE}`,
  );
  assert.equal(storage.values.state, undefined);
  assert.equal(storage.values.verifier, undefined);
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

  await reserveAuthorizationAttempt(provider);
  await provider.redirectToAuthorization(
    new URL("https://auth.example.com/authorize?scope=mcp%3Aread%20mcp%3Awrite"),
  );
  assert.equal(decisions.length, 1);
  assert.deepEqual(decisions[0], {
    resource: SERVER_URL,
    issuer: ISSUER,
    currentScopes: ["mcp:read"],
    requestedScopes: ["mcp:read", "mcp:write"],
    addedScopes: ["mcp:write"],
  });
  assert.ok(Object.isFrozen(decisions[0]));
  assert.ok(Object.isFrozen(decisions[0].addedScopes));
  assert.equal(opened.length, 1);

  await provider.cancelAuthorization();
  await reserveAuthorizationAttempt(provider);
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
  await reserveAuthorizationAttempt(denied.provider);
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

  await reserveAuthorizationAttempt(provider);
  await assert.rejects(
    () =>
      provider.redirectToAuthorization(
        new URL("https://auth.example.com/authorize?scope=mcp%3Aread%20mcp%3Awrite"),
      ),
    (error) => error instanceof McpNativeOAuthError && error.code === "reauthorization-denied",
  );
  await reserveAuthorizationAttempt(provider);
  await assert.rejects(
    () =>
      provider.redirectToAuthorization(
        new URL("https://auth.example.com/authorize?scope=mcp%3Aread%20mcp%3Aread"),
      ),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
  );
  await reserveAuthorizationAttempt(provider);
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

test("OAuth scope history persists across provider instances and is resource-bound", async () => {
  const storage = createStorage();
  const scopeStore = createScopeStore();
  const first = createProvider({ storage, scopeStore });
  await first.provider.saveTokens(
    { access_token: "access", token_type: "Bearer", scope: "mcp:read", issuer: ISSUER },
    { issuer: ISSUER },
  );
  assert.deepEqual(scopeStore.record, {
    resource: SERVER_URL,
    issuer: ISSUER,
    scopes: ["mcp:read"],
  });
  await storage.invalidate("tokens", ISSUER);

  const decisions = [];
  const second = createProvider({
    storage,
    scopeStore,
    approveReauthorization(request) {
      decisions.push(request);
      return true;
    },
  });
  await reserveAuthorizationAttempt(second.provider);
  await second.provider.redirectToAuthorization(
    new URL("https://auth.example.com/authorize?scope=mcp%3Aread%20mcp%3Awrite"),
  );
  assert.deepEqual(decisions, [
    {
      resource: SERVER_URL,
      issuer: ISSUER,
      currentScopes: ["mcp:read"],
      requestedScopes: ["mcp:read", "mcp:write"],
      addedScopes: ["mcp:write"],
    },
  ]);

  await second.provider.cancelAuthorization();
  await second.provider.invalidateCredentials("all");
  assert.equal(scopeStore.record, undefined);
});

test("OAuth scope history fails closed for malformed or substituted records", async () => {
  await Promise.all(
    [
      { resource: "https://evil.example/mcp", issuer: ISSUER, scopes: ["mcp:read"] },
      { resource: SERVER_URL, issuer: "http://remote.example", scopes: ["mcp:read"] },
      { resource: SERVER_URL, issuer: ISSUER, scopes: ["mcp:read", "mcp:read"] },
      { resource: SERVER_URL, issuer: ISSUER, scopes: ["bad scope"] },
      { resource: SERVER_URL, issuer: ISSUER, scopes: [], extra: true },
      null,
      Object.assign(Object.create({ resource: SERVER_URL }), {
        issuer: ISSUER,
        scopes: ["mcp:read"],
      }),
      Object.assign(
        { resource: SERVER_URL, issuer: ISSUER, scopes: ["mcp:read"] },
        {
          scopes: Object.assign(["mcp:read"], { extra: true }),
        },
      ),
    ].map(async (record) => {
      const { provider } = createProvider({
        scopeStore: {
          load: () => record,
          save() {},
          remove() {},
        },
        approveReauthorization: () => true,
      });
      await reserveAuthorizationAttempt(provider);
      await assert.rejects(
        () => provider.redirectToAuthorization(new URL(`${ISSUER}/authorize?scope=mcp%3Awrite`)),
        (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
      );
    }),
  );

  assert.throws(
    () => createProvider({ scopeStore: { load() {}, save() {} } }),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
  );
});
