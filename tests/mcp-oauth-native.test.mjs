import assert from "node:assert/strict";
import test from "node:test";

import {
  McpNativeOAuthError,
  createMcpNativeOAuthAuthorizationSession,
  createMcpNativeOAuthPlatformSecureStore,
  createMcpNativeOAuthProvider,
} from "../packages/mcp/dist/oauth.js";

const ISSUER = "https://auth.example.com";
const REDIRECT_URL = "mcp-native://oauth/callback";
const SERVER_URL = "https://mcp.example.com/mcp";
const VALID_STATE = "state_abcdefghijklmnopqrstuvwxyz-0123456789";
const VALID_VERIFIER = "v".repeat(64);

function createSecretBackend(initial = {}) {
  const values = new Map(Object.entries(initial));
  const operations = [];
  return {
    values,
    operations,
    backend: {
      async read(service) {
        operations.push(["read", service]);
        return values.get(service);
      },
      async write(service, value) {
        operations.push(["write", service]);
        values.set(service, value);
      },
      async remove(service) {
        operations.push(["remove", service]);
        values.delete(service);
      },
    },
  };
}

function createPlatformStore() {
  const secrets = createSecretBackend();
  const storage = createMcpNativeOAuthPlatformSecureStore({
    namespace: "com.example.host.production",
    backend: secrets.backend,
  });
  return { secrets, storage };
}

test("platform OAuth storage uses fixed app-owned slots and exact issuer binding", async () => {
  const { secrets, storage } = createPlatformStore();
  const client = { client_id: "client", client_secret: "secret", issuer: ISSUER };
  const tokens = {
    access_token: "access",
    refresh_token: "refresh",
    token_type: "Bearer",
    issuer: ISSUER,
  };

  await storage.saveClientInformation(ISSUER, client);
  assert.deepEqual(await storage.loadClientInformation(ISSUER), client);
  assert.equal(await storage.loadClientInformation("https://other.example.com"), undefined);

  await storage.saveTokens(ISSUER, tokens);
  assert.deepEqual(await storage.loadTokens(), tokens);
  assert.deepEqual(await storage.loadTokens(ISSUER), tokens);
  assert.equal(await storage.loadTokens("https://other.example.com"), undefined);

  await storage.saveCodeVerifier(VALID_VERIFIER);
  assert.equal(await storage.loadCodeVerifier(), VALID_VERIFIER);
  await storage.saveDiscoveryState({ authorizationServerUrl: ISSUER });
  assert.deepEqual(await storage.loadDiscoveryState(), { authorizationServerUrl: ISSUER });

  const services = [...secrets.values.keys()];
  assert.ok(services.every((service) => service.startsWith("com.example.host.production.")));
  assert.ok(services.every((service) => !service.includes("auth.example.com")));

  await storage.invalidate("tokens", "https://other.example.com");
  assert.deepEqual(await storage.loadTokens(ISSUER), tokens);
  await storage.invalidate("tokens", ISSUER);
  assert.equal(await storage.loadTokens(), undefined);
});

test("platform OAuth storage serializes state consumption and bounds corrupt secrets", async () => {
  const { secrets, storage } = createPlatformStore();
  const owner = {};
  const competingOwner = {};
  await storage.saveOAuthState(VALID_STATE, owner);
  const results = await Promise.all([
    storage.consumeOAuthState(VALID_STATE, owner),
    storage.consumeOAuthState(VALID_STATE, competingOwner),
  ]);
  assert.deepEqual(results.sort(), [false, true]);
  await storage.clearOAuthState(owner);

  await assert.rejects(
    () => storage.saveOAuthState({ toString: () => VALID_STATE }, owner),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
  );
  await assert.rejects(
    () => storage.saveCodeVerifier({ toString: () => VALID_VERIFIER }),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
  );

  await assert.rejects(
    () => storage.saveTokens(ISSUER, { access_token: "x".repeat(40_000) }),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
  );

  await storage.saveCodeVerifier(VALID_VERIFIER);
  const verifierService = [...secrets.values.keys()].find((service) =>
    service.endsWith(".verifier"),
  );
  secrets.values.set(verifierService, "x".repeat(32_769));
  await assert.rejects(
    () => storage.loadCodeVerifier(),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
  );

  assert.throws(
    () =>
      createMcpNativeOAuthPlatformSecureStore({
        namespace: "server supplied/unsafe",
        backend: secrets.backend,
      }),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
  );
  assert.throws(
    () =>
      createMcpNativeOAuthPlatformSecureStore({
        namespace: undefined,
        backend: secrets.backend,
      }),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
  );
});

test("platform OAuth storage serializes state consumption across store instances", async () => {
  const secrets = createSecretBackend();
  const first = createMcpNativeOAuthPlatformSecureStore({
    namespace: "com.example.host.shared",
    backend: secrets.backend,
  });
  const second = createMcpNativeOAuthPlatformSecureStore({
    namespace: "com.example.host.shared",
    backend: secrets.backend,
  });
  const owner = {};
  const competingOwner = {};
  await first.saveOAuthState(VALID_STATE, owner);

  const results = await Promise.all([
    first.consumeOAuthState(VALID_STATE, owner),
    second.consumeOAuthState(VALID_STATE, competingOwner),
  ]);
  assert.deepEqual(results.sort(), [false, true]);
  await second.clearOAuthState(owner);
});

test("platform OAuth storage reserves state exclusively across provider instances", async () => {
  const secrets = createSecretBackend();
  const createStore = () =>
    createMcpNativeOAuthPlatformSecureStore({
      namespace: "com.example.host.shared",
      backend: secrets.backend,
    });
  const createHostProvider = (storage, state) =>
    createMcpNativeOAuthProvider({
      serverUrl: SERVER_URL,
      redirectUrl: REDIRECT_URL,
      clientMetadata: { client_name: "Native host", redirect_uris: [REDIRECT_URL] },
      storage,
      createState: () => state,
      openAuthorization: () => {},
    });

  const firstStore = createStore();
  const secondStore = createStore();
  const firstState = `state_${"a".repeat(40)}`;
  const secondState = `state_${"b".repeat(40)}`;

  const firstProvider = createHostProvider(firstStore, firstState);
  const secondProvider = createHostProvider(secondStore, secondState);
  const results = await Promise.allSettled([firstProvider.state(), secondProvider.state()]);
  const reserved = results.filter((result) => result.status === "fulfilled");
  const rejected = results.filter((result) => result.status === "rejected");
  assert.equal(reserved.length, 1);
  assert.equal(rejected.length, 1);
  assert.ok(
    rejected[0].reason instanceof McpNativeOAuthError &&
      rejected[0].reason.code === "invalid-storage",
  );

  // The attempt that won the reservation keeps a usable callback state.
  const winner = results[0].status === "fulfilled" ? firstProvider : secondProvider;
  await winner.finishAuthorization(
    { finishAuth: () => undefined },
    `${REDIRECT_URL}?code=code-1&state=${reserved[0].value}`,
  );

  const firstOwner = {};
  const secondOwner = {};
  await firstStore.reserveOAuthState(firstOwner);
  await firstStore.saveOAuthState(firstState, firstOwner);
  await assert.rejects(
    () => secondStore.reserveOAuthState(secondOwner),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
  );
  await assert.rejects(
    () => secondStore.clearOAuthState(secondOwner),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
  );
  await firstStore.clearOAuthState(firstOwner);

  await secondStore.reserveOAuthState(secondOwner);
  await secondStore.saveOAuthState(secondState, secondOwner);
  assert.equal(await firstStore.consumeOAuthState(secondState, secondOwner), true);
  await firstStore.clearOAuthState(secondOwner);
});

test("platform OAuth storage holds a claimed state through verifier cleanup", async () => {
  const secrets = createSecretBackend();
  let cleanupStarted;
  const cleanupStarting = new Promise((resolve) => {
    cleanupStarted = resolve;
  });
  let releaseCleanup;
  const cleanupBlocked = new Promise((resolve) => {
    releaseCleanup = resolve;
  });
  const backend = {
    ...secrets.backend,
    async remove(service) {
      if (service.endsWith(".verifier")) {
        cleanupStarted();
        await cleanupBlocked;
      }
      await secrets.backend.remove(service);
    },
  };
  const createStore = () =>
    createMcpNativeOAuthPlatformSecureStore({
      namespace: "com.example.host.overlap",
      backend,
    });
  const firstStore = createStore();
  const secondStore = createStore();
  const firstState = `state_${"a".repeat(40)}`;
  const secondState = `state_${"b".repeat(40)}`;
  const firstVerifier = "v".repeat(64);
  const secondVerifier = "w".repeat(64);
  const createHostProvider = (storage, state) =>
    createMcpNativeOAuthProvider({
      serverUrl: SERVER_URL,
      redirectUrl: REDIRECT_URL,
      clientMetadata: { client_name: "Native host", redirect_uris: [REDIRECT_URL] },
      storage,
      createState: () => state,
      openAuthorization: () => {},
    });
  const first = createHostProvider(firstStore, firstState);
  const second = createHostProvider(secondStore, secondState);

  await first.state();
  await first.saveCodeVerifier(firstVerifier);
  const completion = first.finishAuthorization(
    {
      async finishAuth() {
        assert.equal(await first.codeVerifier(), firstVerifier);
      },
    },
    `${REDIRECT_URL}?code=code-1&state=${firstState}`,
  );
  await cleanupStarting;

  await assert.rejects(
    () => second.state(),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
  );
  assert.equal(await secondStore.loadCodeVerifier(), firstVerifier);

  releaseCleanup();
  await completion;
  assert.equal(await firstStore.loadCodeVerifier(), undefined);
  assert.equal(await firstStore.consumeOAuthState(firstState, {}), false);

  assert.equal(await second.state(), secondState);
  await second.saveCodeVerifier(secondVerifier);
  assert.equal(await firstStore.loadCodeVerifier(), secondVerifier);
});

test("platform OAuth storage retains a claimed state when verifier cleanup fails", async () => {
  const secrets = createSecretBackend();
  let failVerifierCleanup = true;
  const backend = {
    ...secrets.backend,
    async remove(service) {
      if (failVerifierCleanup && service.endsWith(".verifier")) {
        throw new Error("verifier cleanup failed");
      }
      await secrets.backend.remove(service);
    },
  };
  const createStore = () =>
    createMcpNativeOAuthPlatformSecureStore({
      namespace: "com.example.host.cleanup-failure",
      backend,
    });
  const firstStore = createStore();
  const secondStore = createStore();
  const secondState = `state_${"b".repeat(40)}`;
  const provider = createMcpNativeOAuthProvider({
    serverUrl: SERVER_URL,
    redirectUrl: REDIRECT_URL,
    clientMetadata: { client_name: "Native host", redirect_uris: [REDIRECT_URL] },
    storage: firstStore,
    createState: () => VALID_STATE,
    openAuthorization: () => {},
  });

  await provider.state();
  await provider.saveCodeVerifier(VALID_VERIFIER);
  await assert.rejects(
    () =>
      provider.finishAuthorization(
        { finishAuth: () => undefined },
        `${REDIRECT_URL}?code=code-1&state=${VALID_STATE}`,
      ),
    /verifier cleanup failed/,
  );

  assert.equal(await secondStore.consumeOAuthState(VALID_STATE, {}), false);
  const secondOwner = {};
  await assert.rejects(
    () => secondStore.saveOAuthState(secondState, secondOwner),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
  );

  failVerifierCleanup = false;
  await provider.cancelAuthorization();
  await secondStore.saveOAuthState(secondState, secondOwner);
  assert.equal(await firstStore.consumeOAuthState(secondState, secondOwner), true);
  await firstStore.clearOAuthState(secondOwner);
});

test("platform OAuth storage removes corrupt issuer records during invalidation", async () => {
  const { secrets, storage } = createPlatformStore();
  await storage.saveTokens(ISSUER, {
    access_token: "access",
    token_type: "Bearer",
    issuer: ISSUER,
  });
  const tokenService = [...secrets.values.keys()].find((service) => service.endsWith(".tokens"));
  secrets.values.set(tokenService, "not-json");

  await assert.rejects(
    () => storage.invalidate("tokens", ISSUER),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
  );
  assert.equal(secrets.values.has(tokenService), false);
});

test("OS authorization-session adapter accepts one exact callback and consumes it once", async () => {
  const opened = [];
  const session = createMcpNativeOAuthAuthorizationSession({
    redirectUrl: REDIRECT_URL,
    open(authorizationUrl, redirectUrl) {
      opened.push([authorizationUrl.href, redirectUrl.href]);
      return { type: "success", url: `${REDIRECT_URL}?code=code-1&state=${VALID_STATE}` };
    },
  });

  await session.openAuthorization(new URL(`${ISSUER}/authorize?client_id=client`));
  assert.equal(session.hasPendingCallback(), true);
  assert.deepEqual(opened, [[`${ISSUER}/authorize?client_id=client`, REDIRECT_URL]]);

  let callback;
  const provider = {
    async finishAuthorization(finisher, url) {
      callback = url.href;
      await finisher.finishAuth(url.searchParams);
    },
  };
  let code;
  await session.finishAuthorization(provider, {
    finishAuth(parameters) {
      code = parameters.get("code");
    },
  });
  assert.equal(code, "code-1");
  assert.equal(callback, `${REDIRECT_URL}?code=code-1&state=${VALID_STATE}`);
  assert.equal(session.hasPendingCallback(), false);
  await assert.rejects(
    () => session.finishAuthorization(provider, { finishAuth: () => undefined }),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-callback",
  );

  const loopbackRedirect = "http://127.42.0.9:49152/oauth/callback";
  const loopback = createMcpNativeOAuthAuthorizationSession({
    redirectUrl: loopbackRedirect,
    open: () => ({
      type: "success",
      url: `${loopbackRedirect}?code=code-2&state=${VALID_STATE}`,
    }),
  });
  await loopback.openAuthorization(new URL("http://127.0.0.2:49153/authorize"));
  assert.equal(loopback.hasPendingCallback(), true);
});

test("OS authorization-session adapter rejects cancellation, overlap, and callback substitution", async () => {
  for (const redirectUrl of [
    "javascript:alert(1)",
    "data:text/html,callback",
    "file:///tmp/oauth-callback",
  ]) {
    assert.throws(
      () =>
        createMcpNativeOAuthAuthorizationSession({
          redirectUrl,
          open: () => ({ type: "cancel" }),
        }),
      /safe private-use app scheme/,
    );
  }
  assert.throws(
    () =>
      createMcpNativeOAuthAuthorizationSession({
        redirectUrl: `${REDIRECT_URL}#`,
        open: () => ({ type: "cancel" }),
      }),
    /fragment/,
  );
  assert.throws(
    () =>
      createMcpNativeOAuthAuthorizationSession({
        redirectUrl: `${REDIRECT_URL}?tenant=a&tenant=b`,
        open: () => ({ type: "cancel" }),
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
        createMcpNativeOAuthAuthorizationSession({
          redirectUrl,
          open: () => ({ type: "cancel" }),
        }),
      (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
    );
  }

  const cancelled = createMcpNativeOAuthAuthorizationSession({
    redirectUrl: REDIRECT_URL,
    open: () => ({ type: "cancel" }),
  });
  await assert.rejects(
    () => cancelled.openAuthorization(new URL(`${ISSUER}/authorize`)),
    (error) => error instanceof McpNativeOAuthError && error.code === "authorization-denied",
  );
  await assert.rejects(
    () => cancelled.openAuthorization(new URL(`${ISSUER}/authorize#`)),
    /fragment/,
  );

  const fragmented = createMcpNativeOAuthAuthorizationSession({
    redirectUrl: REDIRECT_URL,
    open: () => ({
      type: "success",
      url: `${REDIRECT_URL}?code=code-1&state=${VALID_STATE}#`,
    }),
  });
  await assert.rejects(
    () => fragmented.openAuthorization(new URL(`${ISSUER}/authorize`)),
    (error) => error instanceof McpNativeOAuthError && error.code === "callback-mismatch",
  );

  const substituted = createMcpNativeOAuthAuthorizationSession({
    redirectUrl: REDIRECT_URL,
    open: () => ({
      type: "success",
      url: `attacker://oauth/callback?code=code-1&state=${VALID_STATE}`,
    }),
  });
  await assert.rejects(
    () => substituted.openAuthorization(new URL(`${ISSUER}/authorize`)),
    (error) => error instanceof McpNativeOAuthError && error.code === "callback-mismatch",
  );

  const malformed = createMcpNativeOAuthAuthorizationSession({
    redirectUrl: REDIRECT_URL,
    open: () => ({
      type: "success",
      url: `${REDIRECT_URL}?code=code-1&state=${VALID_STATE}`,
      unchecked: true,
    }),
  });
  await assert.rejects(
    () => malformed.openAuthorization(new URL(`${ISSUER}/authorize`)),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-callback",
  );
  const malformedUrl = createMcpNativeOAuthAuthorizationSession({
    redirectUrl: REDIRECT_URL,
    open: () => ({ type: "success", url: "not an absolute URL" }),
  });
  await assert.rejects(
    () => malformedUrl.openAuthorization(new URL(`${ISSUER}/authorize`)),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-callback",
  );
  await assert.rejects(
    () =>
      cancelled.openAuthorization(
        new URL(`https://auth.example.com/authorize?padding=${"x".repeat(8_192)}`),
      ),
    /authorization URL exceeds the supported size/,
  );

  let complete;
  const blocked = new Promise((resolve) => {
    complete = resolve;
  });
  const overlapping = createMcpNativeOAuthAuthorizationSession({
    redirectUrl: REDIRECT_URL,
    async open() {
      await blocked;
      return { type: "success", url: `${REDIRECT_URL}?code=code-1&state=${VALID_STATE}` };
    },
  });
  const first = overlapping.openAuthorization(new URL(`${ISSUER}/authorize`));
  await Promise.resolve();
  await assert.rejects(
    () => overlapping.openAuthorization(new URL(`${ISSUER}/authorize`)),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
  );
  complete();
  await first;
});

test("OS authorization session stays exclusive through callback completion", async () => {
  const session = createMcpNativeOAuthAuthorizationSession({
    redirectUrl: REDIRECT_URL,
    open: () => ({
      type: "success",
      url: `${REDIRECT_URL}?code=code-1&state=${VALID_STATE}`,
    }),
  });
  const { storage } = createPlatformStore();
  const provider = createMcpNativeOAuthProvider({
    serverUrl: SERVER_URL,
    redirectUrl: REDIRECT_URL,
    clientMetadata: { client_name: "Native host", redirect_uris: [REDIRECT_URL] },
    storage,
    createState: () => VALID_STATE,
    openAuthorization: session.openAuthorization,
  });
  await provider.state();
  await provider.saveCodeVerifier(VALID_VERIFIER);
  await session.openAuthorization(new URL(`${ISSUER}/authorize`));

  let completionStarted;
  const started = new Promise((resolve) => {
    completionStarted = resolve;
  });
  let releaseCompletion;
  const blocked = new Promise((resolve) => {
    releaseCompletion = resolve;
  });
  const completion = session.finishAuthorization(provider, {
    async finishAuth() {
      completionStarted();
      await blocked;
    },
  });
  await started;
  await assert.rejects(
    () => session.openAuthorization(new URL(`${ISSUER}/authorize`)),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
  );
  await assert.rejects(
    () => session.finishAuthorization(provider, { finishAuth: () => undefined }),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-callback",
  );

  releaseCompletion();
  await completion;
});

test("cancelled OS authorization sessions clear durable state and PKCE material", async () => {
  const { storage } = createPlatformStore();
  const session = createMcpNativeOAuthAuthorizationSession({
    redirectUrl: REDIRECT_URL,
    open: () => ({ type: "dismiss" }),
  });
  const provider = createMcpNativeOAuthProvider({
    serverUrl: SERVER_URL,
    redirectUrl: REDIRECT_URL,
    clientMetadata: { client_name: "Native host", redirect_uris: [REDIRECT_URL] },
    storage,
    createState: () => VALID_STATE,
    openAuthorization: session.openAuthorization,
  });

  await provider.state();
  await provider.saveCodeVerifier(VALID_VERIFIER);
  await assert.rejects(
    () => provider.redirectToAuthorization(new URL(`${ISSUER}/authorize?client_id=client`)),
    (error) => error instanceof McpNativeOAuthError && error.code === "authorization-denied",
  );
  assert.equal(await storage.loadCodeVerifier(), undefined);
  assert.equal(await storage.consumeOAuthState(VALID_STATE, {}), false);
});

test("overlapping authorization attempts leave the first state and verifier usable", async () => {
  const { storage } = createPlatformStore();
  let complete;
  const blocked = new Promise((resolve) => {
    complete = resolve;
  });
  const session = createMcpNativeOAuthAuthorizationSession({
    redirectUrl: REDIRECT_URL,
    async open() {
      await blocked;
      return { type: "success", url: `${REDIRECT_URL}?code=code-1&state=${VALID_STATE}` };
    },
  });
  let stateCalls = 0;
  const provider = createMcpNativeOAuthProvider({
    serverUrl: SERVER_URL,
    redirectUrl: REDIRECT_URL,
    clientMetadata: { client_name: "Native host", redirect_uris: [REDIRECT_URL] },
    storage,
    createState() {
      stateCalls += 1;
      return VALID_STATE;
    },
    openAuthorization: session.openAuthorization,
  });

  await provider.state();
  await provider.saveCodeVerifier(VALID_VERIFIER);
  const first = provider.redirectToAuthorization(new URL(`${ISSUER}/authorize?client_id=client`));
  await Promise.resolve();
  await assert.rejects(
    () => provider.cancelAuthorization(),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
  );
  await assert.rejects(
    () => provider.state(),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
  );
  assert.equal(stateCalls, 1);
  assert.equal(await storage.loadCodeVerifier(), VALID_VERIFIER);

  complete();
  await first;
  let code;
  await session.finishAuthorization(provider, {
    finishAuth(parameters) {
      code = parameters.get("code");
    },
  });
  assert.equal(code, "code-1");
  assert.equal(await storage.loadCodeVerifier(), undefined);
  assert.equal(await storage.consumeOAuthState(VALID_STATE, {}), false);
});

test("a second provider cannot cancel another provider's authorization handoff", async () => {
  const secrets = createSecretBackend();
  const createStore = () =>
    createMcpNativeOAuthPlatformSecureStore({
      namespace: "com.example.host.handoff-ownership",
      backend: secrets.backend,
    });
  let handoffStarted;
  const started = new Promise((resolve) => {
    handoffStarted = resolve;
  });
  let releaseHandoff;
  const blocked = new Promise((resolve) => {
    releaseHandoff = resolve;
  });
  const createHostProvider = (storage, openAuthorization) =>
    createMcpNativeOAuthProvider({
      serverUrl: SERVER_URL,
      redirectUrl: REDIRECT_URL,
      clientMetadata: { client_name: "Native host", redirect_uris: [REDIRECT_URL] },
      storage,
      createState: () => VALID_STATE,
      openAuthorization,
    });
  const firstStore = createStore();
  const secondStore = createStore();
  const first = createHostProvider(firstStore, async () => {
    handoffStarted();
    await blocked;
  });
  const second = createHostProvider(secondStore, () => undefined);

  await first.state();
  await first.saveCodeVerifier(VALID_VERIFIER);
  const handoff = first.redirectToAuthorization(new URL(`${ISSUER}/authorize?client_id=client`));
  await started;

  await assert.rejects(
    () => second.cancelAuthorization(),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
  );
  await assert.rejects(
    () => first.invalidateCredentials("all"),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
  );
  await assert.rejects(
    () => second.invalidateCredentials("all"),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
  );
  await assert.rejects(
    () => first.invalidateCredentials("verifier"),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-configuration",
  );
  await assert.rejects(
    () => second.invalidateCredentials("verifier"),
    (error) => error instanceof McpNativeOAuthError && error.code === "invalid-storage",
  );
  assert.equal(await firstStore.loadCodeVerifier(), VALID_VERIFIER);

  releaseHandoff();
  await handoff;
  await first.finishAuthorization(
    { finishAuth: () => undefined },
    `${REDIRECT_URL}?code=code-1&state=${VALID_STATE}`,
  );
  assert.equal(await firstStore.loadCodeVerifier(), undefined);
  assert.equal(await secondStore.consumeOAuthState(VALID_STATE, {}), false);
});

test("authorization cancellation attempts verifier cleanup when state deletion fails", async () => {
  const secrets = createSecretBackend();
  const storage = createMcpNativeOAuthPlatformSecureStore({
    namespace: "com.example.host.cleanup",
    backend: {
      ...secrets.backend,
      async remove(service) {
        if (service.endsWith(".state")) throw new Error("state removal failed");
        await secrets.backend.remove(service);
      },
    },
  });
  const session = createMcpNativeOAuthAuthorizationSession({
    redirectUrl: REDIRECT_URL,
    open: () => ({ type: "cancel" }),
  });
  const provider = createMcpNativeOAuthProvider({
    serverUrl: SERVER_URL,
    redirectUrl: REDIRECT_URL,
    clientMetadata: { client_name: "Native host", redirect_uris: [REDIRECT_URL] },
    storage,
    createState: () => VALID_STATE,
    openAuthorization: session.openAuthorization,
  });

  await provider.state();
  await provider.saveCodeVerifier(VALID_VERIFIER);
  await assert.rejects(
    () => provider.redirectToAuthorization(new URL(`${ISSUER}/authorize?client_id=client`)),
    /state removal failed/,
  );
  const verifierService = [...secrets.values.keys()].find((service) =>
    service.endsWith(".verifier"),
  );
  assert.equal(secrets.values.has(verifierService), false);
});
