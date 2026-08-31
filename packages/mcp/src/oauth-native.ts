import type {
  OAuthDiscoveryState,
  StoredOAuthClientInformation,
  StoredOAuthTokens,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

import { McpNativeOAuthError } from "./oauth-error.js";
import type {
  McpNativeOAuthClientProvider,
  McpNativeOAuthCredentialScope,
  McpNativeOAuthSecureStore,
} from "./oauth.js";

const MAX_SECRET_CODE_UNITS = 32_768;
const MAX_CALLBACK_CODE_UNITS = 8_192;
const MAX_ISSUER_CODE_UNITS = 2_048;
const NAMESPACE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const PKCE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/u;
const OAUTH_STATE_PATTERN = /^[A-Za-z0-9._~-]{32,512}$/u;
const PRIVATE_USE_REDIRECT_SCHEME_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+:$/u;
const RESERVED_REDIRECT_SCHEMES = new Set([
  "about:",
  "blob:",
  "chrome-extension:",
  "chrome:",
  "content:",
  "data:",
  "file:",
  "ftp:",
  "http:",
  "https:",
  "intent:",
  "javascript:",
  "mailto:",
  "tel:",
  "vbscript:",
  "ws:",
  "wss:",
]);
const CALLBACK_PARAMETER_NAMES = new Set([
  "code",
  "error",
  "error_description",
  "error_uri",
  "iss",
  "state",
]);
const CLAIMED_STATE_MARKER = "mcp-native:claimed";
const STATE_LOCKS = new Map<string, Promise<void>>();

type OAuthFinisher = Pick<StreamableHTTPClientTransport, "finishAuth">;
type SecretSlot = "client" | "discovery" | "state" | "tokens" | "verifier";

/**
 * Minimal bridge to an app-owned iOS Keychain / Android Keystore-backed module.
 * Implementations must not use AsyncStorage, plain files, or a remote service.
 */
export interface McpNativeOAuthSecretBackend {
  readonly read: (service: string) => Promise<string | undefined>;
  readonly write: (service: string, value: string) => Promise<void>;
  readonly remove: (service: string) => Promise<void>;
}

export interface McpNativeOAuthPlatformSecureStoreOptions {
  /** App-owned, environment-specific identifier. It must never come from an MCP server. */
  readonly namespace: string;
  readonly backend: McpNativeOAuthSecretBackend;
}

interface IssuerRecord<T> {
  readonly issuer: string;
  readonly value: T;
}

/**
 * Bounded reference implementation of the OAuth store contract over a native secret backend.
 * One namespace represents one protected-resource authorization context. State operations are
 * serialized across store objects using the same fixed namespaced service in this JS runtime,
 * and a claimed state keeps the reservation exclusive until it is explicitly cleared.
 */
export class McpNativeOAuthPlatformSecureStore implements McpNativeOAuthSecureStore {
  readonly #backend: McpNativeOAuthSecretBackend;
  readonly #services: Readonly<Record<SecretSlot, string>>;

  constructor(options: McpNativeOAuthPlatformSecureStoreOptions) {
    if (!NAMESPACE_PATTERN.test(options.namespace)) {
      throw new McpNativeOAuthError(
        "invalid-configuration",
        "OAuth secure-store namespace must contain 1 to 64 safe app-owned characters",
      );
    }
    if (
      typeof options.backend?.read !== "function" ||
      typeof options.backend.write !== "function" ||
      typeof options.backend.remove !== "function"
    ) {
      throw new McpNativeOAuthError(
        "invalid-configuration",
        "OAuth secure-store backend must implement read, write, and remove",
      );
    }
    this.#backend = options.backend;
    const prefix = `${options.namespace}.mcp-native.oauth.v1`;
    this.#services = Object.freeze({
      client: `${prefix}.client`,
      discovery: `${prefix}.discovery`,
      state: `${prefix}.state`,
      tokens: `${prefix}.tokens`,
      verifier: `${prefix}.verifier`,
    });
  }

  async loadClientInformation(issuer: string): Promise<StoredOAuthClientInformation | undefined> {
    assertIssuer(issuer);
    const record = await this.#readIssuerRecord<StoredOAuthClientInformation>("client");
    return record?.issuer === issuer ? record.value : undefined;
  }

  async saveClientInformation(
    issuer: string,
    information: StoredOAuthClientInformation,
  ): Promise<void> {
    assertIssuer(issuer);
    await this.#writeJson("client", { issuer, value: information });
  }

  async loadTokens(issuer?: string): Promise<StoredOAuthTokens | undefined> {
    if (issuer !== undefined) assertIssuer(issuer);
    const record = await this.#readIssuerRecord<StoredOAuthTokens>("tokens");
    return issuer === undefined || record?.issuer === issuer ? record?.value : undefined;
  }

  async saveTokens(issuer: string, tokens: StoredOAuthTokens): Promise<void> {
    assertIssuer(issuer);
    await this.#writeJson("tokens", { issuer, value: tokens });
  }

  async loadCodeVerifier(): Promise<string | undefined> {
    const verifier = await this.#read("verifier");
    if (verifier !== undefined && !PKCE_VERIFIER_PATTERN.test(verifier)) {
      throw new McpNativeOAuthError("invalid-storage", "Stored OAuth PKCE verifier is invalid");
    }
    return verifier;
  }

  async saveCodeVerifier(verifier: string): Promise<void> {
    if (!PKCE_VERIFIER_PATTERN.test(verifier)) {
      throw new McpNativeOAuthError("invalid-storage", "OAuth PKCE verifier is invalid");
    }
    await this.#backend.write(this.#services.verifier, verifier);
  }

  async saveOAuthState(state: string): Promise<void> {
    if (!OAUTH_STATE_PATTERN.test(state)) {
      throw new McpNativeOAuthError("invalid-storage", "OAuth state is invalid");
    }
    await this.#withStateLock(async () => {
      if ((await this.#read("state")) !== undefined) {
        throw new McpNativeOAuthError(
          "invalid-storage",
          "Another OAuth authorization state is already reserved for this namespace",
        );
      }
      await this.#backend.write(this.#services.state, state);
    });
  }

  async clearOAuthState(): Promise<void> {
    await this.#withStateLock(async () => {
      await this.#backend.remove(this.#services.state);
    });
  }

  async consumeOAuthState(state: string): Promise<boolean> {
    if (!OAUTH_STATE_PATTERN.test(state)) return false;
    return this.#withStateLock(async () => {
      const stored = await this.#read("state");
      if (stored !== state) return false;
      await this.#backend.write(this.#services.state, CLAIMED_STATE_MARKER);
      return true;
    });
  }

  async loadDiscoveryState(): Promise<OAuthDiscoveryState | undefined> {
    const value = await this.#readJson("discovery");
    return value as OAuthDiscoveryState | undefined;
  }

  async saveDiscoveryState(state: OAuthDiscoveryState): Promise<void> {
    await this.#writeJson("discovery", state);
  }

  async invalidate(scope: McpNativeOAuthCredentialScope, issuer?: string): Promise<void> {
    if (issuer !== undefined) assertIssuer(issuer);
    switch (scope) {
      case "all":
        await this.#withStateLock(async () => {
          await Promise.all(
            (["client", "discovery", "state", "tokens", "verifier"] as const).map((slot) =>
              this.#backend.remove(this.#services[slot]),
            ),
          );
        });
        return;
      case "client":
      case "tokens":
        await this.#removeIssuerRecord(scope, issuer);
        return;
      case "discovery":
        await this.#removeDiscovery(issuer);
        return;
      case "verifier":
        await this.#backend.remove(this.#services.verifier);
        return;
    }
  }

  async #read(slot: SecretSlot): Promise<string | undefined> {
    const value = await this.#backend.read(this.#services[slot]);
    if (
      value !== undefined &&
      (typeof value !== "string" || value.length > MAX_SECRET_CODE_UNITS)
    ) {
      throw new McpNativeOAuthError("invalid-storage", `Stored OAuth ${slot} value is invalid`);
    }
    return value;
  }

  async #readJson(
    slot: "client" | "discovery" | "tokens",
  ): Promise<Record<string, unknown> | undefined> {
    const serialized = await this.#read(slot);
    if (serialized === undefined) return undefined;
    let value: unknown;
    try {
      value = JSON.parse(serialized);
    } catch (error) {
      throw new McpNativeOAuthError("invalid-storage", `Stored OAuth ${slot} JSON is invalid`, {
        cause: error,
      });
    }
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new McpNativeOAuthError("invalid-storage", `Stored OAuth ${slot} value is invalid`);
    }
    return value as Record<string, unknown>;
  }

  async #readIssuerRecord<T>(slot: "client" | "tokens"): Promise<IssuerRecord<T> | undefined> {
    const value = await this.#readJson(slot);
    if (value === undefined) return undefined;
    if (
      Object.keys(value).length !== 2 ||
      !Object.hasOwn(value, "issuer") ||
      !Object.hasOwn(value, "value") ||
      typeof value.issuer !== "string" ||
      value.value === null ||
      typeof value.value !== "object" ||
      Array.isArray(value.value)
    ) {
      throw new McpNativeOAuthError("invalid-storage", `Stored OAuth ${slot} record is invalid`);
    }
    assertIssuer(value.issuer);
    return { issuer: value.issuer, value: value.value as T };
  }

  async #writeJson(slot: "client" | "discovery" | "tokens", value: object): Promise<void> {
    let serialized: string;
    try {
      serialized = JSON.stringify(value);
    } catch (error) {
      throw new McpNativeOAuthError("invalid-storage", `OAuth ${slot} value is not serializable`, {
        cause: error,
      });
    }
    if (serialized.length > MAX_SECRET_CODE_UNITS) {
      throw new McpNativeOAuthError(
        "invalid-storage",
        `OAuth ${slot} value exceeds the secure-store limit`,
      );
    }
    await this.#backend.write(this.#services[slot], serialized);
  }

  async #removeIssuerRecord(slot: "client" | "tokens", issuer?: string): Promise<void> {
    if (issuer === undefined) {
      await this.#backend.remove(this.#services[slot]);
      return;
    }
    let record: IssuerRecord<unknown> | undefined;
    try {
      record = await this.#readIssuerRecord(slot);
    } catch (error) {
      await this.#backend.remove(this.#services[slot]);
      throw error;
    }
    if (record?.issuer === issuer) await this.#backend.remove(this.#services[slot]);
  }

  async #removeDiscovery(issuer?: string): Promise<void> {
    if (issuer === undefined) {
      await this.#backend.remove(this.#services.discovery);
      return;
    }
    let discovery: Record<string, unknown> | undefined;
    try {
      discovery = await this.#readJson("discovery");
    } catch (error) {
      await this.#backend.remove(this.#services.discovery);
      throw error;
    }
    if (discovery?.authorizationServerUrl === issuer) {
      await this.#backend.remove(this.#services.discovery);
    }
  }

  #withStateLock<T>(operation: () => Promise<T>): Promise<T> {
    const service = this.#services.state;
    const previous = STATE_LOCKS.get(service) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    STATE_LOCKS.set(service, tail);
    void tail.then(() => {
      if (STATE_LOCKS.get(service) === tail) STATE_LOCKS.delete(service);
    });
    return result;
  }
}

export function createMcpNativeOAuthPlatformSecureStore(
  options: McpNativeOAuthPlatformSecureStoreOptions,
): McpNativeOAuthPlatformSecureStore {
  return new McpNativeOAuthPlatformSecureStore(options);
}

export type McpNativeOAuthAuthorizationSessionResult =
  | { readonly type: "cancel" | "dismiss" }
  | { readonly type: "success"; readonly url: string };

export interface McpNativeOAuthAuthorizationSessionOptions {
  readonly redirectUrl: string | URL;
  /** Must invoke an OS authentication session, never an embedded application WebView. */
  readonly open: (
    authorizationUrl: URL,
    redirectUrl: URL,
  ) => McpNativeOAuthAuthorizationSessionResult | Promise<McpNativeOAuthAuthorizationSessionResult>;
}

/** Closed adapter for ASWebAuthenticationSession / Android Custom Tab callback results. */
export class McpNativeOAuthAuthorizationSession {
  readonly #redirectUrl: URL;
  readonly #open: McpNativeOAuthAuthorizationSessionOptions["open"];
  #callbackUrl: URL | undefined;
  #running = false;

  constructor(options: McpNativeOAuthAuthorizationSessionOptions) {
    this.#redirectUrl = parseRedirectUrl(options.redirectUrl);
    if (typeof options.open !== "function") {
      throw new McpNativeOAuthError(
        "invalid-configuration",
        "OAuth authorization-session opener is required",
      );
    }
    this.#open = options.open;
  }

  readonly openAuthorization = async (authorizationUrl: URL): Promise<void> => {
    if (this.#running || this.#callbackUrl !== undefined) {
      throw new McpNativeOAuthError(
        "invalid-configuration",
        "Another OAuth authorization session or callback is already pending",
      );
    }
    const authorization = parseSecureUrl(authorizationUrl, "OAuth authorization URL");
    this.#running = true;
    try {
      let result: McpNativeOAuthAuthorizationSessionResult;
      try {
        result = await this.#open(new URL(authorization.href), new URL(this.#redirectUrl.href));
      } catch (error) {
        throw new McpNativeOAuthError(
          "authorization-denied",
          "The platform authorization session did not complete",
          { cause: error },
        );
      }
      if (!isPlainObject(result) || !hasExactSessionResultKeys(result)) {
        throw new McpNativeOAuthError(
          "invalid-callback",
          "The platform authorization session returned an invalid result",
        );
      }
      if (result.type !== "success") {
        throw new McpNativeOAuthError(
          "authorization-denied",
          "The platform authorization session was cancelled",
        );
      }
      if (typeof result.url !== "string" || result.url.length > MAX_CALLBACK_CODE_UNITS) {
        throw new McpNativeOAuthError(
          "invalid-callback",
          "The platform authorization callback is invalid",
        );
      }
      const callback = parseCallbackUrl(result.url, this.#redirectUrl);
      this.#callbackUrl = callback;
    } finally {
      this.#running = false;
    }
  };

  hasPendingCallback(): boolean {
    return this.#callbackUrl !== undefined;
  }

  async finishAuthorization(
    provider: McpNativeOAuthClientProvider,
    finisher: OAuthFinisher,
  ): Promise<void> {
    const callback = this.#callbackUrl;
    if (callback === undefined) {
      throw new McpNativeOAuthError(
        "invalid-callback",
        "No platform authorization callback is pending",
      );
    }
    this.#callbackUrl = undefined;
    await provider.finishAuthorization(finisher, callback);
  }
}

export function createMcpNativeOAuthAuthorizationSession(
  options: McpNativeOAuthAuthorizationSessionOptions,
): McpNativeOAuthAuthorizationSession {
  return new McpNativeOAuthAuthorizationSession(options);
}

function assertIssuer(issuer: string): void {
  if (typeof issuer !== "string" || issuer.length === 0 || issuer.length > MAX_ISSUER_CODE_UNITS) {
    throw new McpNativeOAuthError("invalid-storage", "OAuth issuer is invalid or too large");
  }
  let url: URL;
  try {
    url = new URL(issuer);
  } catch (error) {
    throw new McpNativeOAuthError("invalid-storage", "OAuth issuer is invalid", { cause: error });
  }
  if (
    url.username !== "" ||
    url.password !== "" ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && isLoopbackHostname(url.hostname))) ||
    url.href.includes("?") ||
    url.href.includes("#")
  ) {
    throw new McpNativeOAuthError("invalid-storage", "OAuth issuer is invalid");
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactSessionResultKeys(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value);
  if (value.type === "success") {
    return keys.length === 2 && Object.hasOwn(value, "type") && Object.hasOwn(value, "url");
  }
  return (
    (value.type === "cancel" || value.type === "dismiss") &&
    keys.length === 1 &&
    Object.hasOwn(value, "type")
  );
}

function parseRedirectUrl(value: string | URL): URL {
  const url = parseUrl(value, "OAuth redirect URL");
  if (url.username !== "" || url.password !== "" || url.href.includes("#")) {
    throw new McpNativeOAuthError(
      "invalid-configuration",
      "OAuth redirect URL must not contain credentials or a fragment",
    );
  }
  if (!isSupportedRedirectLocation(url)) {
    throw new McpNativeOAuthError(
      "invalid-configuration",
      "OAuth redirect URL must use HTTPS, HTTP loopback, or a safe private-use app scheme",
    );
  }
  assertUniqueRedirectParameters(url);
  for (const name of CALLBACK_PARAMETER_NAMES) {
    if (url.searchParams.has(name)) {
      throw new McpNativeOAuthError(
        "invalid-configuration",
        `OAuth redirect URL must not predefine callback parameter ${name}`,
      );
    }
  }
  return url;
}

function assertUniqueRedirectParameters(url: URL): void {
  const names = new Set<string>();
  for (const name of url.searchParams.keys()) {
    if (names.has(name)) {
      throw new McpNativeOAuthError(
        "invalid-configuration",
        "OAuth redirect URL must not contain duplicate query parameter names",
      );
    }
    names.add(name);
  }
}

function parseSecureUrl(value: string | URL, label: string): URL {
  const url = parseUrl(value, label);
  if (url.username !== "" || url.password !== "") {
    throw new McpNativeOAuthError("invalid-configuration", `${label} must not contain credentials`);
  }
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && isLoopbackHostname(url.hostname))
  ) {
    throw new McpNativeOAuthError(
      "invalid-configuration",
      `${label} must use HTTPS or an HTTP loopback address`,
    );
  }
  if (url.href.includes("#")) {
    throw new McpNativeOAuthError("invalid-configuration", `${label} must not contain a fragment`);
  }
  return url;
}

function parseCallbackUrl(value: string, redirectUrl: URL): URL {
  const callback = parseUrl(value, "OAuth callback URL");
  if (
    callback.href.includes("#") ||
    callback.protocol !== redirectUrl.protocol ||
    callback.username !== redirectUrl.username ||
    callback.password !== redirectUrl.password ||
    callback.host !== redirectUrl.host ||
    callback.pathname !== redirectUrl.pathname
  ) {
    throw new McpNativeOAuthError(
      "callback-mismatch",
      "OAuth callback URL does not match the configured redirect URL",
    );
  }
  return callback;
}

function parseUrl(value: string | URL, label: string): URL {
  try {
    return new URL(value instanceof URL ? value.href : value);
  } catch (error) {
    throw new McpNativeOAuthError("invalid-configuration", `${label} must be an absolute URL`, {
      cause: error,
    });
  }
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "[::1]";
}

function isSupportedRedirectLocation(url: URL): boolean {
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:") return isLoopbackHostname(url.hostname);
  return (
    !RESERVED_REDIRECT_SCHEMES.has(url.protocol) &&
    PRIVATE_USE_REDIRECT_SCHEME_PATTERN.test(url.protocol) &&
    url.hostname !== "" &&
    url.port === ""
  );
}
