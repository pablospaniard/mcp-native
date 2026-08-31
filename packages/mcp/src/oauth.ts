import {
  checkResourceAllowed,
  resolveClientMetadata,
  resourceUrlFromServerUrl,
  StreamableHTTPClientTransport,
  validateClientMetadataUrl,
} from "@modelcontextprotocol/client";
import type {
  FetchLike,
  OAuthClientInformationContext,
  OAuthClientMetadata,
  OAuthClientProvider,
  OAuthDiscoveryState,
  ReconnectionScheduler,
  StoredOAuthClientInformation,
  StoredOAuthTokens,
  StreamableHTTPReconnectionOptions,
} from "@modelcontextprotocol/client";
import {
  OAuthClientInformationFullSchema,
  OAuthClientInformationSchema,
  OAuthClientMetadataSchema,
  OAuthMetadataSchema,
  OAuthProtectedResourceMetadataSchema,
  OAuthTokensSchema,
  OpenIdProviderDiscoveryMetadataSchema,
} from "@modelcontextprotocol/core";

const CALLBACK_PARAMETER_NAMES = new Set([
  "code",
  "error",
  "error_description",
  "error_uri",
  "iss",
  "state",
]);
const STATE_PATTERN = /^[A-Za-z0-9._~-]{32,512}$/u;
const PKCE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/u;
const SCOPE_TOKEN_PATTERN = /^[\u0021\u0023-\u005b\u005d-\u007e]{1,256}$/u;
const MAX_SCOPE_CODE_UNITS = 2_048;
const MAX_SCOPE_TOKENS = 64;

export type McpNativeOAuthCredentialScope = "all" | "client" | "discovery" | "tokens" | "verifier";

/**
 * Host-owned durable storage for one interactive OAuth session.
 *
 * Production native hosts should back secrets with the OS keychain or an equivalent
 * encrypted store. Plain files and AsyncStorage are not suitable for access tokens,
 * refresh tokens, client secrets, PKCE verifiers, or OAuth state.
 */
export interface McpNativeOAuthSecureStore {
  loadClientInformation(
    issuer: string,
  ): StoredOAuthClientInformation | undefined | Promise<StoredOAuthClientInformation | undefined>;
  saveClientInformation(
    issuer: string,
    information: StoredOAuthClientInformation,
  ): void | Promise<void>;
  loadTokens(
    issuer?: string,
  ): StoredOAuthTokens | undefined | Promise<StoredOAuthTokens | undefined>;
  saveTokens(issuer: string, tokens: StoredOAuthTokens): void | Promise<void>;
  loadCodeVerifier(): string | undefined | Promise<string | undefined>;
  saveCodeVerifier(verifier: string): void | Promise<void>;
  saveOAuthState(state: string): void | Promise<void>;
  /** Atomically compares and deletes the stored state to prevent concurrent callback replay. */
  consumeOAuthState(state: string): boolean | Promise<boolean>;
  loadDiscoveryState(): OAuthDiscoveryState | undefined | Promise<OAuthDiscoveryState | undefined>;
  saveDiscoveryState(state: OAuthDiscoveryState): void | Promise<void>;
  invalidate(scope: McpNativeOAuthCredentialScope, issuer?: string): void | Promise<void>;
}

export interface McpNativeOAuthProviderOptions {
  /** Exact protected MCP Streamable HTTP endpoint this provider may authorize. */
  readonly serverUrl: string | URL;
  /** Native deep link, app link, or loopback URL registered for this client. */
  readonly redirectUrl: string | URL;
  readonly clientMetadata: OAuthClientMetadata;
  readonly clientMetadataUrl?: string;
  readonly storage: McpNativeOAuthSecureStore;
  /** Must return a fresh, cryptographically random, URL-safe value for every redirect. */
  readonly createState: () => string | Promise<string>;
  /** Host-owned browser or authentication-session handoff. */
  readonly openAuthorization: (authorizationUrl: URL) => void | Promise<void>;
  /**
   * Required before the SDK may open a new authorization request while credentials exist.
   * `addedScopes` identifies an actual scope increase and may be empty on a repeated challenge.
   * Return exactly `true` only after the host has applied its user-decision and retry policy.
   */
  readonly approveReauthorization?: (
    request: McpNativeOAuthReauthorizationRequest,
  ) => boolean | Promise<boolean>;
}

export interface McpNativeOAuthReauthorizationRequest {
  readonly issuer: string | undefined;
  readonly currentScopes: readonly string[];
  readonly requestedScopes: readonly string[];
  readonly addedScopes: readonly string[];
}

export interface McpNativeOAuthTransportOptions {
  /** Additional non-credential headers. Authorization and Cookie are rejected. */
  readonly headers?: Record<string, string> | readonly (readonly [string, string])[];
  readonly fetch?: FetchLike;
  readonly reconnectionOptions?: StreamableHTTPReconnectionOptions;
  readonly reconnectionScheduler?: ReconnectionScheduler;
  /**
   * `host-approved` enables the SDK's bounded step-up retry only when the provider has
   * an `approveReauthorization` callback. The default surfaces `InsufficientScopeError`.
   */
  readonly scopeEscalation?: "throw" | "host-approved";
}

export type McpNativeOAuthErrorCode =
  | "authorization-denied"
  | "callback-mismatch"
  | "invalid-callback"
  | "invalid-configuration"
  | "invalid-storage"
  | "resource-mismatch"
  | "reauthorization-denied"
  | "state-mismatch";

export class McpNativeOAuthError extends Error {
  readonly code: McpNativeOAuthErrorCode;

  constructor(code: McpNativeOAuthErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "McpNativeOAuthError";
    this.code = code;
  }
}

type OAuthFinisher = Pick<StreamableHTTPClientTransport, "finishAuth">;

/**
 * SDK v2 OAuth provider with an explicit native-host persistence and callback boundary.
 * Discovery, PKCE, issuer validation, token exchange, and refresh remain owned by the
 * official SDK; this class pins their host-controlled seams.
 */
export class McpNativeOAuthClientProvider implements OAuthClientProvider {
  readonly redirectUrl: URL;
  readonly clientMetadata: OAuthClientMetadata;
  readonly clientMetadataUrl?: string;

  readonly #resourceUrl: URL;
  readonly #storage: McpNativeOAuthSecureStore;
  readonly #createState: () => string | Promise<string>;
  readonly #openAuthorization: (authorizationUrl: URL) => void | Promise<void>;
  readonly #approveReauthorization:
    | ((request: McpNativeOAuthReauthorizationRequest) => boolean | Promise<boolean>)
    | undefined;
  #activeIssuer: string | undefined;
  #pendingAuthorizationUrl: string | undefined;

  constructor(options: McpNativeOAuthProviderOptions) {
    this.#resourceUrl = resourceUrlFromServerUrl(parseProtectedServerUrl(options.serverUrl));
    this.redirectUrl = parseRedirectUrl(options.redirectUrl);
    validateClientMetadataUrl(options.clientMetadataUrl);
    if (options.clientMetadataUrl !== undefined) {
      this.clientMetadataUrl = options.clientMetadataUrl;
    }

    const metadataResult = OAuthClientMetadataSchema.safeParse(options.clientMetadata);
    if (!metadataResult.success) {
      throw new McpNativeOAuthError(
        "invalid-configuration",
        "OAuth client metadata does not match the official SDK schema",
        { cause: metadataResult.error },
      );
    }
    if (!metadataResult.data.redirect_uris.includes(this.redirectUrl.href)) {
      throw new McpNativeOAuthError(
        "invalid-configuration",
        "OAuth client metadata must contain the exact configured redirect URL",
      );
    }

    this.clientMetadata = Object.freeze({
      ...resolveClientMetadata({
        clientMetadata: metadataResult.data,
        redirectUrl: this.redirectUrl,
      }),
      application_type: metadataResult.data.application_type ?? "native",
    });
    this.#storage = options.storage;
    this.#createState = options.createState;
    this.#openAuthorization = options.openAuthorization;
    this.#approveReauthorization = options.approveReauthorization;
  }

  async state(): Promise<string> {
    const state = await this.#createState();
    if (!STATE_PATTERN.test(state)) {
      throw new McpNativeOAuthError(
        "invalid-configuration",
        "OAuth state must contain 32 to 512 URL-safe characters",
      );
    }
    await this.#storage.saveOAuthState(state);
    return state;
  }

  async clientInformation(
    context?: OAuthClientInformationContext,
  ): Promise<StoredOAuthClientInformation | undefined> {
    if (context === undefined) {
      return undefined;
    }
    const issuer = parseIssuer(context.issuer, "client-information issuer");
    const stored = await this.#storage.loadClientInformation(issuer);
    if (stored === undefined) {
      return undefined;
    }
    const parsed = parseStoredClientInformation(stored);
    requireMatchingIssuer(parsed.issuer, issuer, "client information");
    this.#activeIssuer = issuer;
    return parsed;
  }

  async saveClientInformation(
    information: StoredOAuthClientInformation,
    context?: OAuthClientInformationContext,
  ): Promise<void> {
    const parsed = parseStoredClientInformation(information);
    const issuer = resolveStoredIssuer(parsed.issuer, context?.issuer, "client information");
    this.#activeIssuer = issuer;
    await this.#storage.saveClientInformation(issuer, { ...parsed, issuer });
  }

  async tokens(context?: OAuthClientInformationContext): Promise<StoredOAuthTokens | undefined> {
    const requestedIssuer =
      context === undefined ? undefined : parseIssuer(context.issuer, "token issuer");
    const stored = await this.#storage.loadTokens(requestedIssuer);
    if (stored === undefined) {
      return undefined;
    }
    const parsed = parseStoredTokens(stored);
    const issuer = parseIssuer(parsed.issuer, "stored token issuer");
    if (requestedIssuer !== undefined) {
      requireMatchingIssuer(issuer, requestedIssuer, "tokens");
    }
    this.#activeIssuer = issuer;
    return parsed;
  }

  async saveTokens(
    tokens: StoredOAuthTokens,
    context?: OAuthClientInformationContext,
  ): Promise<void> {
    const parsed = parseStoredTokens(tokens);
    const issuer = resolveStoredIssuer(parsed.issuer, context?.issuer, "tokens");
    this.#activeIssuer = issuer;
    await this.#storage.saveTokens(issuer, { ...parsed, issuer });
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    const url = parseSecureEndpoint(authorizationUrl, "authorization URL");
    if (this.#pendingAuthorizationUrl === url.href) {
      return;
    }
    const requestedScopes = parseScope(url.searchParams.get("scope"));
    const storedTokens = await this.#storage.loadTokens(this.#activeIssuer);
    if (storedTokens !== undefined) {
      const currentScopes = parseScope(parseStoredTokens(storedTokens).scope ?? null);
      const currentScopeSet = new Set(currentScopes);
      const addedScopes = requestedScopes.filter((scope) => !currentScopeSet.has(scope));
      const approved = await this.#approveReauthorization?.(
        Object.freeze({
          issuer: this.#activeIssuer,
          currentScopes: Object.freeze([...currentScopes]),
          requestedScopes: Object.freeze([...requestedScopes]),
          addedScopes: Object.freeze([...addedScopes]),
        }),
      );
      if (approved !== true) {
        throw new McpNativeOAuthError(
          "reauthorization-denied",
          "OAuth reauthorization requires explicit host approval",
        );
      }
    }
    await this.#openAuthorization(new URL(url.href));
    this.#pendingAuthorizationUrl = url.href;
  }

  async saveCodeVerifier(verifier: string): Promise<void> {
    assertCodeVerifier(verifier);
    await this.#storage.saveCodeVerifier(verifier);
  }

  async codeVerifier(): Promise<string> {
    const verifier = await this.#storage.loadCodeVerifier();
    if (verifier === undefined) {
      throw new McpNativeOAuthError("invalid-storage", "OAuth PKCE verifier is missing");
    }
    assertCodeVerifier(verifier);
    return verifier;
  }

  async validateResourceURL(serverUrl: string | URL, resource?: string): Promise<URL> {
    const requestedServer = resourceUrlFromServerUrl(parseProtectedServerUrl(serverUrl));
    if (requestedServer.href !== this.#resourceUrl.href) {
      throw new McpNativeOAuthError(
        "resource-mismatch",
        "OAuth provider cannot be reused for a different MCP server",
      );
    }
    if (
      resource !== undefined &&
      !checkResourceAllowed({ requestedResource: this.#resourceUrl, configuredResource: resource })
    ) {
      throw new McpNativeOAuthError(
        "resource-mismatch",
        "Protected resource metadata does not identify the configured MCP server",
      );
    }
    return new URL(this.#resourceUrl.href);
  }

  async saveDiscoveryState(state: OAuthDiscoveryState): Promise<void> {
    const parsed = parseDiscoveryState(state, this.#resourceUrl);
    this.#activeIssuer = parsed.authorizationServerUrl;
    await this.#storage.saveDiscoveryState(parsed);
  }

  async discoveryState(): Promise<OAuthDiscoveryState | undefined> {
    const state = await this.#storage.loadDiscoveryState();
    if (state === undefined) {
      return undefined;
    }
    const parsed = parseDiscoveryState(state, this.#resourceUrl);
    const verifier = await this.#storage.loadCodeVerifier();
    if (verifier === undefined) {
      return undefined;
    }
    assertCodeVerifier(verifier);
    this.#activeIssuer = parsed.authorizationServerUrl;
    return parsed;
  }

  async invalidateCredentials(scope: McpNativeOAuthCredentialScope): Promise<void> {
    await this.#storage.invalidate(scope, this.#activeIssuer);
    if (scope === "all" || scope === "discovery") {
      this.#activeIssuer = undefined;
    }
  }

  /**
   * Validates an app/loopback callback before asking the SDK to redeem its code.
   * OAuth state is consumed before token exchange, so the callback cannot be replayed.
   */
  async finishAuthorization(finisher: OAuthFinisher, callbackUrl: string | URL): Promise<void> {
    const callback = parseCallbackUrl(callbackUrl, this.redirectUrl);
    const parameters = callback.searchParams;
    requireSingleParameter(parameters, "state");
    if (!(await this.#storage.consumeOAuthState(parameters.get("state")!))) {
      throw new McpNativeOAuthError("state-mismatch", "OAuth callback state did not match");
    }

    try {
      if (parameters.has("error")) {
        throw new McpNativeOAuthError(
          "authorization-denied",
          "The authorization server did not grant access",
        );
      }
      requireSingleParameter(parameters, "code");
      if (parameters.has("iss")) {
        requireSingleParameter(parameters, "iss");
      }
      await finisher.finishAuth(parameters);
    } finally {
      this.#pendingAuthorizationUrl = undefined;
      await this.#storage.invalidate("verifier", this.#activeIssuer);
    }
  }

  assertServerUrl(serverUrl: string | URL): URL {
    const parsed = parseProtectedServerUrl(serverUrl);
    if (resourceUrlFromServerUrl(parsed).href !== this.#resourceUrl.href) {
      throw new McpNativeOAuthError(
        "resource-mismatch",
        "OAuth transport URL does not match the provider's MCP server",
      );
    }
    return parsed;
  }

  hasReauthorizationApproval(): boolean {
    return this.#approveReauthorization !== undefined;
  }
}

export function createMcpNativeOAuthProvider(
  options: McpNativeOAuthProviderOptions,
): McpNativeOAuthClientProvider {
  return new McpNativeOAuthClientProvider(options);
}

/**
 * Creates the supported protected Streamable HTTP transport profile.
 * Scope step-up is surfaced to the host so consent can be obtained before reauthorization.
 */
export function createMcpNativeOAuthTransport(
  serverUrl: string | URL,
  provider: McpNativeOAuthClientProvider,
  options: McpNativeOAuthTransportOptions = {},
): StreamableHTTPClientTransport {
  const url = provider.assertServerUrl(serverUrl);
  const headers = parseNonCredentialHeaders(options.headers);
  const scopeEscalation = options.scopeEscalation ?? "throw";
  if (scopeEscalation === "host-approved" && !provider.hasReauthorizationApproval()) {
    throw new McpNativeOAuthError(
      "invalid-configuration",
      "Host-approved OAuth reauthorization requires an approval callback",
    );
  }
  return new StreamableHTTPClientTransport(url, {
    authProvider: provider,
    onInsufficientScope: scopeEscalation === "host-approved" ? "reauthorize" : "throw",
    maxStepUpRetries: 1,
    ...(headers === undefined ? {} : { requestInit: { headers } }),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.reconnectionOptions === undefined
      ? {}
      : { reconnectionOptions: options.reconnectionOptions }),
    ...(options.reconnectionScheduler === undefined
      ? {}
      : { reconnectionScheduler: options.reconnectionScheduler }),
  });
}

function parseScope(value: string | null): readonly string[] {
  if (value === null || value === "") {
    return [];
  }
  if (value.length > MAX_SCOPE_CODE_UNITS) {
    throw new McpNativeOAuthError(
      "invalid-configuration",
      "OAuth authorization scope exceeds the supported size",
    );
  }
  const scopes = value.split(" ");
  if (
    scopes.length > MAX_SCOPE_TOKENS ||
    scopes.some((scope) => !SCOPE_TOKEN_PATTERN.test(scope)) ||
    new Set(scopes).size !== scopes.length
  ) {
    throw new McpNativeOAuthError(
      "invalid-configuration",
      "OAuth authorization scope is invalid or exceeds the supported limits",
    );
  }
  return scopes;
}

function parseProtectedServerUrl(value: string | URL): URL {
  const url = parseSecureEndpoint(value, "MCP server URL");
  if (url.hash !== "") {
    throw new McpNativeOAuthError(
      "invalid-configuration",
      "MCP server URL must not contain a fragment",
    );
  }
  return url;
}

function parseRedirectUrl(value: string | URL): URL {
  const url = parseUrl(value, "OAuth redirect URL");
  if (url.username !== "" || url.password !== "" || url.hash !== "") {
    throw new McpNativeOAuthError(
      "invalid-configuration",
      "OAuth redirect URL must not contain credentials or a fragment",
    );
  }
  if (url.protocol === "http:" && !isLoopbackHostname(url.hostname)) {
    throw new McpNativeOAuthError(
      "invalid-configuration",
      "HTTP OAuth redirect URLs are allowed only for loopback hosts",
    );
  }
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

function parseSecureEndpoint(value: string | URL, label: string): URL {
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
  return url;
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

function parseIssuer(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new McpNativeOAuthError("invalid-storage", `${label} is missing`);
  }
  parseSecureEndpoint(value, label);
  return value;
}

function resolveStoredIssuer(
  storedIssuer: string | undefined,
  contextIssuer: string | undefined,
  label: string,
): string {
  const issuer = parseIssuer(contextIssuer ?? storedIssuer, `${label} issuer`);
  if (storedIssuer !== undefined) {
    requireMatchingIssuer(parseIssuer(storedIssuer, `${label} stored issuer`), issuer, label);
  }
  if (contextIssuer !== undefined) {
    requireMatchingIssuer(parseIssuer(contextIssuer, `${label} context issuer`), issuer, label);
  }
  return issuer;
}

function requireMatchingIssuer(actual: string | undefined, expected: string, label: string): void {
  if (actual !== expected) {
    throw new McpNativeOAuthError(
      "invalid-storage",
      `Stored ${label} belongs to a different authorization server`,
    );
  }
}

function parseStoredTokens(value: StoredOAuthTokens): StoredOAuthTokens {
  const result = OAuthTokensSchema.safeParse(value);
  if (!result.success) {
    throw new McpNativeOAuthError("invalid-storage", "Stored OAuth tokens are invalid", {
      cause: result.error,
    });
  }
  const issuer = Object.hasOwn(value, "issuer") ? value.issuer : undefined;
  return { ...result.data, ...(issuer === undefined ? {} : { issuer }) };
}

function parseStoredClientInformation(
  value: StoredOAuthClientInformation,
): StoredOAuthClientInformation {
  const full = OAuthClientInformationFullSchema.safeParse(value);
  const issuer = Object.hasOwn(value, "issuer") ? value.issuer : undefined;
  if (full.success) {
    return { ...full.data, ...(issuer === undefined ? {} : { issuer }) };
  }
  const basic = OAuthClientInformationSchema.safeParse(value);
  if (!basic.success) {
    throw new McpNativeOAuthError("invalid-storage", "Stored OAuth client information is invalid", {
      cause: basic.error,
    });
  }
  return { ...basic.data, ...(issuer === undefined ? {} : { issuer }) };
}

function parseDiscoveryState(state: OAuthDiscoveryState, resourceUrl: URL): OAuthDiscoveryState {
  const authorizationServerUrl = parseIssuer(
    state.authorizationServerUrl,
    "discovery authorization-server issuer",
  );
  const authorizationServerMetadata = parseAuthorizationServerMetadata(
    state.authorizationServerMetadata,
  );
  if (
    authorizationServerMetadata?.issuer !== undefined &&
    authorizationServerMetadata.issuer !== authorizationServerUrl
  ) {
    throw new McpNativeOAuthError(
      "invalid-storage",
      "Stored authorization-server metadata has a mismatched issuer",
    );
  }
  const resourceMetadataResult =
    state.resourceMetadata === undefined
      ? undefined
      : OAuthProtectedResourceMetadataSchema.safeParse(state.resourceMetadata);
  if (resourceMetadataResult !== undefined && !resourceMetadataResult.success) {
    throw new McpNativeOAuthError(
      "invalid-storage",
      "Stored protected-resource metadata is invalid",
      { cause: resourceMetadataResult.error },
    );
  }
  if (
    resourceMetadataResult?.success &&
    !checkResourceAllowed({
      requestedResource: resourceUrl,
      configuredResource: resourceMetadataResult.data.resource,
    })
  ) {
    throw new McpNativeOAuthError(
      "resource-mismatch",
      "Stored protected-resource metadata identifies a different MCP server",
    );
  }
  if (
    resourceMetadataResult?.success &&
    resourceMetadataResult.data.authorization_servers !== undefined &&
    !resourceMetadataResult.data.authorization_servers.includes(authorizationServerUrl)
  ) {
    throw new McpNativeOAuthError(
      "invalid-storage",
      "Stored protected-resource metadata does not advertise the selected authorization server",
    );
  }
  const resourceMetadataUrl =
    state.resourceMetadataUrl === undefined
      ? undefined
      : parseSecureEndpoint(state.resourceMetadataUrl, "protected-resource metadata URL").href;
  return {
    authorizationServerUrl,
    ...(authorizationServerMetadata === undefined ? {} : { authorizationServerMetadata }),
    ...(resourceMetadataResult?.success ? { resourceMetadata: resourceMetadataResult.data } : {}),
    ...(resourceMetadataUrl === undefined ? {} : { resourceMetadataUrl }),
  };
}

function parseAuthorizationServerMetadata(
  value: OAuthDiscoveryState["authorizationServerMetadata"],
) {
  if (value === undefined) {
    return undefined;
  }
  const oauth = OAuthMetadataSchema.safeParse(value);
  if (oauth.success) {
    return oauth.data;
  }
  const openId = OpenIdProviderDiscoveryMetadataSchema.safeParse(value);
  if (openId.success) {
    return openId.data;
  }
  throw new McpNativeOAuthError(
    "invalid-storage",
    "Stored authorization-server metadata is invalid",
    { cause: openId.error },
  );
}

function assertCodeVerifier(verifier: string): void {
  if (!PKCE_VERIFIER_PATTERN.test(verifier)) {
    throw new McpNativeOAuthError(
      "invalid-storage",
      "OAuth PKCE verifier must contain 43 to 128 RFC 7636 unreserved characters",
    );
  }
}

function parseCallbackUrl(value: string | URL, redirectUrl: URL): URL {
  const callback = parseUrl(value, "OAuth callback URL");
  if (callback.hash !== "") {
    throw new McpNativeOAuthError("invalid-callback", "OAuth callback must not contain a fragment");
  }
  if (
    callback.protocol !== redirectUrl.protocol ||
    callback.username !== redirectUrl.username ||
    callback.password !== redirectUrl.password ||
    callback.host !== redirectUrl.host ||
    callback.pathname !== redirectUrl.pathname
  ) {
    throw new McpNativeOAuthError(
      "callback-mismatch",
      "OAuth callback does not match the configured redirect URL",
    );
  }
  for (const [name, expected] of redirectUrl.searchParams) {
    const actual = callback.searchParams.getAll(name);
    if (actual.length !== 1 || actual[0] !== expected) {
      throw new McpNativeOAuthError(
        "callback-mismatch",
        "OAuth callback changed a configured redirect parameter",
      );
    }
  }
  return callback;
}

function requireSingleParameter(parameters: URLSearchParams, name: string): void {
  const values = parameters.getAll(name);
  if (values.length !== 1 || values[0] === "") {
    throw new McpNativeOAuthError(
      "invalid-callback",
      `OAuth callback must contain exactly one non-empty ${name} parameter`,
    );
  }
}

function parseNonCredentialHeaders(
  input: McpNativeOAuthTransportOptions["headers"],
): Record<string, string> | undefined {
  if (input === undefined) {
    return undefined;
  }
  const entries = Array.isArray(input) ? input : Object.entries(input);
  const output: Record<string, string> = {};
  for (const [name, value] of entries) {
    const normalized = name.toLowerCase();
    if (
      normalized === "authorization" ||
      normalized === "cookie" ||
      normalized === "proxy-authorization"
    ) {
      throw new McpNativeOAuthError(
        "invalid-configuration",
        `OAuth transport header ${name} may carry credentials outside the provider`,
      );
    }
    output[name] = value;
  }
  return output;
}
