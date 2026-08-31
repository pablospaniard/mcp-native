import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  McpNativeOAuthError,
  createMcpNativeOAuthAuthorizationSession,
  createMcpNativeOAuthPlatformSecureStore,
  createMcpNativeOAuthProvider,
} from "../packages/mcp/dist/oauth.js";
import {
  NATIVE_OAUTH_CASES,
  NATIVE_OAUTH_EVIDENCE_PATH,
  validateNativeOAuthEvidence,
} from "../scripts/verify-native-oauth-evidence.mjs";

const ISSUER = "https://auth.example.com";
const REDIRECT_URL = "mcp-native://oauth/callback";
const SERVER_URL = "https://mcp.example.com/mcp";
const VALID_STATE = "state_abcdefghijklmnopqrstuvwxyz-0123456789";
const VALID_VERIFIER = "v".repeat(64);
const nativeOAuthEvidence = JSON.parse(readFileSync(NATIVE_OAUTH_EVIDENCE_PATH, "utf8"));

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
  await storage.saveOAuthState(VALID_STATE);
  const results = await Promise.all([
    storage.consumeOAuthState(VALID_STATE),
    storage.consumeOAuthState(VALID_STATE),
  ]);
  assert.deepEqual(results.sort(), [false, true]);

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
});

test("OS authorization-session adapter rejects cancellation, overlap, and callback substitution", async () => {
  const cancelled = createMcpNativeOAuthAuthorizationSession({
    redirectUrl: REDIRECT_URL,
    open: () => ({ type: "cancel" }),
  });
  await assert.rejects(
    () => cancelled.openAuthorization(new URL(`${ISSUER}/authorize`)),
    (error) => error instanceof McpNativeOAuthError && error.code === "authorization-denied",
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
  assert.equal(await storage.consumeOAuthState(VALID_STATE), false);
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

test("native OAuth evidence scaffold is exact and remains incomplete before platform runs", () => {
  assert.deepEqual(validateNativeOAuthEvidence(nativeOAuthEvidence), {
    complete: false,
    passedRows: 0,
    requiredRows: 2,
  });
  assert.throws(
    () => validateNativeOAuthEvidence(nativeOAuthEvidence, { strict: true }),
    /must be "pass" for a release candidate/,
  );
});

test("native OAuth release evidence requires exact passing cases and reviewable artifacts", () => {
  const complete = structuredClone(nativeOAuthEvidence);
  for (const [index, row] of complete.matrix.entries()) {
    row.operatingSystem = `Test OS ${index}`;
    row.backendLibrary = "test-native-backend";
    row.backendVersion = "1.0.0";
    row.device = `Test device ${index}`;
    row.date = "2026-08-31";
    row.tester = "Test operator";
    row.revision = "a".repeat(40);
    row.result = "pass";
    row.cases = Object.fromEntries(NATIVE_OAUTH_CASES.map((name) => [name, "pass"]));
    row.evidence = [`https://example.com/native-oauth/${row.id}`];
  }
  assert.deepEqual(validateNativeOAuthEvidence(complete, { strict: true }), {
    complete: true,
    passedRows: 2,
    requiredRows: 2,
  });

  complete.matrix[0].cases["embedded-webview"] = "pass";
  assert.throws(
    () => validateNativeOAuthEvidence(complete, { strict: true }),
    /unknown field "embedded-webview"/,
  );
});

test("native OAuth evidence rejects unsafe artifact references", () => {
  const invalid = structuredClone(nativeOAuthEvidence);
  invalid.matrix[0].evidence = ["../outside.log"];
  assert.throws(() => validateNativeOAuthEvidence(invalid), /safe repository-relative path/);
});
