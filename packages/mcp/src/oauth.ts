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

import { McpNativeOAuthError } from "./oauth-error.js";
import {
  assertOAuthRedirectParameterBudget,
  isLoopbackHostname,
  MAX_AUTHORIZATION_URL_CODE_UNITS,
  MAX_CALLBACK_CODE_UNITS,
  MAX_CALLBACK_PARAMETERS,
  MAX_CALLBACK_PARAMETER_NAME_CODE_UNITS,
  MAX_CALLBACK_PARAMETER_VALUE_CODE_UNITS,
  MAX_OAUTH_ISSUER_CODE_UNITS,
} from "./oauth-url.js";
export { McpNativeOAuthError } from "./oauth-error.js";
export type { McpNativeOAuthErrorCode } from "./oauth-error.js";
export {
  McpNativeOAuthAuthorizationSession,
  McpNativeOAuthPlatformSecureStore,
  createMcpNativeOAuthAuthorizationSession,
  createMcpNativeOAuthPlatformSecureStore,
} from "./oauth-native.js";
export type {
  McpNativeOAuthAuthorizationSessionOptions,
  McpNativeOAuthAuthorizationSessionResult,
  McpNativeOAuthPlatformSecureStoreOptions,
  McpNativeOAuthSecretBackend,
} from "./oauth-native.js";

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
const MAX_SCOPE_CODE_UNITS = 2_048;
const MAX_SCOPE_TOKENS = 64;
const MAX_RESOURCE_IDENTIFIER_CODE_UNITS = 4_096;
const CALLBACK_VALUE_LIMITS = Object.freeze({
  code: 4_096,
  error: 256,
  error_description: 2_048,
  error_uri: 2_048,
  iss: 2_048,
  state: 512,
});
const MAX_TOKEN_VALUE_CODE_UNITS = 16_384;
const MAX_TOKEN_TYPE_CODE_UNITS = 64;
const MAX_TOKEN_CUMULATIVE_CODE_UNITS = 24_576;
const TOKEN_STRING_LIMITS = Object.freeze({
  access_token: MAX_TOKEN_VALUE_CODE_UNITS,
  id_token: MAX_TOKEN_VALUE_CODE_UNITS,
  issuer: 2_048,
  refresh_token: MAX_TOKEN_VALUE_CODE_UNITS,
  scope: MAX_SCOPE_CODE_UNITS,
  token_type: MAX_TOKEN_TYPE_CODE_UNITS,
});
const TOKEN_INFORMATION_BUDGET = Object.freeze({
  maxArrayItems: 64,
  maxCumulativeArrayItems: 128,
  maxCumulativeProperties: 128,
  maxDepth: 8,
  maxNodes: 256,
  maxObjectProperties: 64,
  maxPropertyNameCodeUnits: 128,
  maxStringCodeUnits: MAX_TOKEN_VALUE_CODE_UNITS,
  maxTotalStringCodeUnits: MAX_TOKEN_CUMULATIVE_CODE_UNITS,
});
const MAX_CLIENT_IDENTIFIER_CODE_UNITS = 4_096;
const MAX_CLIENT_SECRET_CODE_UNITS = 4_096;
const CLIENT_INFORMATION_BUDGET = Object.freeze({
  maxArrayItems: 64,
  maxCumulativeArrayItems: 256,
  maxCumulativeProperties: 256,
  maxDepth: 8,
  maxNodes: 512,
  maxObjectProperties: 64,
  maxPropertyNameCodeUnits: 128,
  maxStringCodeUnits: 8_192,
  maxTotalStringCodeUnits: 24_576,
});
const DISCOVERY_STATE_BUDGET = Object.freeze({
  allowedUndefinedRootProperties: new Set([
    "authorizationServerMetadata",
    "resourceMetadata",
    "resourceMetadataUrl",
  ]),
  maxArrayItems: 64,
  maxCumulativeArrayItems: 256,
  maxCumulativeProperties: 256,
  maxDepth: 8,
  maxNodes: 512,
  maxObjectProperties: 128,
  maxPropertyNameCodeUnits: 128,
  maxStringCodeUnits: 4_096,
  maxTotalStringCodeUnits: 24_576,
});

interface OAuthJsonBudget {
  readonly allowedUndefinedRootProperties?: ReadonlySet<string>;
  readonly maxArrayItems: number;
  readonly maxCumulativeArrayItems: number;
  readonly maxCumulativeProperties: number;
  readonly maxDepth: number;
  readonly maxNodes: number;
  readonly maxObjectProperties: number;
  readonly maxPropertyNameCodeUnits: number;
  readonly maxStringCodeUnits: number;
  readonly maxTotalStringCodeUnits: number;
}

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
  /** Reserves this authorization context for one live provider before state generation begins. */
  reserveOAuthState(owner: object): void | Promise<void>;
  /**
   * Atomically reserves the single pending-state slot for one interactive attempt. It must
   * fail when a state is already reserved so concurrent providers sharing a namespace cannot
   * overwrite each other's redirect state.
   */
  saveOAuthState(state: string, owner: object): void | Promise<void>;
  /**
   * Atomically compares and claims the stored state to prevent callback replay while retaining
   * the reservation until verifier cleanup finishes and `clearOAuthState(owner)` releases it.
   */
  consumeOAuthState(state: string, owner: object): boolean | Promise<boolean>;
  /** Acquires cleanup ownership, including for a reservation left by a terminated process. */
  claimOAuthStateForCleanup(owner: object): void | Promise<void>;
  /** Releases a reservation owned by the calling provider. */
  clearOAuthState(owner: object): void | Promise<void>;
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
  readonly #authorizationOwner = Object.freeze({});
  #activeIssuer: string | undefined;
  #pendingAuthorizationUrl: string | undefined;
  #authorizationAttemptReserved = false;
  #authorizationCleanupRunning = false;
  #authorizationCodeVerifierSaved = false;
  #authorizationCodeVerifierSetupRunning = false;
  #authorizationStateSetupRunning = false;
  #authorizationCompletionRunning = false;
  #authorizationHandoffRunning = false;

  constructor(options: McpNativeOAuthProviderOptions) {
    assertSecureStore(options.storage);
    if (
      typeof options.createState !== "function" ||
      typeof options.openAuthorization !== "function" ||
      (options.approveReauthorization !== undefined &&
        typeof options.approveReauthorization !== "function")
    ) {
      throw new McpNativeOAuthError(
        "invalid-configuration",
        "OAuth provider callbacks must be functions",
      );
    }
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
    for (const redirectUrl of metadataResult.data.redirect_uris) {
      parseRedirectUrl(redirectUrl);
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
    if (this.#authorizationAttemptReserved || this.#authorizationCleanupRunning) {
      throw new McpNativeOAuthError(
        "invalid-configuration",
        "Another OAuth authorization attempt is already pending",
      );
    }
    this.#authorizationAttemptReserved = true;
    this.#authorizationCodeVerifierSaved = false;
    this.#authorizationStateSetupRunning = true;
    let storageReserved = false;
    try {
      await this.#storage.reserveOAuthState(this.#authorizationOwner);
      storageReserved = true;
      const state = await this.#createState();
      if (typeof state !== "string" || !STATE_PATTERN.test(state)) {
        throw new McpNativeOAuthError(
          "invalid-configuration",
          "OAuth state must contain 32 to 512 URL-safe characters",
        );
      }
      await this.#storage.saveOAuthState(state, this.#authorizationOwner);
      return state;
    } catch (error) {
      try {
        if (storageReserved) {
          await this.#storage.clearOAuthState(this.#authorizationOwner);
        }
      } catch (cleanupError) {
        throw new McpNativeOAuthError(
          "invalid-storage",
          "OAuth state setup failed and its reservation could not be released",
          { cause: new AggregateError([error, cleanupError]) },
        );
      } finally {
        this.#authorizationAttemptReserved = false;
        this.#authorizationCodeVerifierSaved = false;
      }
      throw error;
    } finally {
      this.#authorizationStateSetupRunning = false;
    }
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
    const serializedAuthorizationUrl = authorizationUrl.href;
    if (serializedAuthorizationUrl.length > MAX_AUTHORIZATION_URL_CODE_UNITS) {
      throw new McpNativeOAuthError(
        "invalid-configuration",
        "OAuth authorization URL exceeds the supported size",
      );
    }
    const url = parseSecureEndpoint(serializedAuthorizationUrl, "authorization URL");
    if (url.href.includes("#")) {
      throw new McpNativeOAuthError(
        "invalid-configuration",
        "OAuth authorization URL must not contain a fragment",
      );
    }
    if (
      this.#authorizationStateSetupRunning ||
      this.#authorizationCodeVerifierSetupRunning ||
      this.#authorizationCleanupRunning ||
      this.#authorizationCompletionRunning
    ) {
      throw new McpNativeOAuthError(
        "invalid-configuration",
        "OAuth authorization setup, callback completion, or cleanup is already running",
      );
    }
    if (!this.#authorizationAttemptReserved || !this.#authorizationCodeVerifierSaved) {
      throw new McpNativeOAuthError(
        "invalid-configuration",
        "OAuth authorization handoff requires reserved state and one saved PKCE verifier",
      );
    }
    if (this.#pendingAuthorizationUrl === url.href) {
      return;
    }
    if (this.#pendingAuthorizationUrl !== undefined) {
      throw new McpNativeOAuthError(
        "invalid-configuration",
        "Another OAuth authorization URL is already pending",
      );
    }
    if (this.#authorizationHandoffRunning) {
      throw new McpNativeOAuthError(
        "invalid-configuration",
        "Another OAuth authorization handoff is already running",
      );
    }
    this.#authorizationHandoffRunning = true;
    try {
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
    } catch (error) {
      await this.#discardPendingAuthorization();
      throw error;
    } finally {
      this.#authorizationHandoffRunning = false;
    }
  }

  async saveCodeVerifier(verifier: string): Promise<void> {
    assertCodeVerifier(verifier);
    if (
      !this.#authorizationAttemptReserved ||
      this.#authorizationCodeVerifierSaved ||
      this.#authorizationStateSetupRunning ||
      this.#authorizationCodeVerifierSetupRunning ||
      this.#authorizationCleanupRunning ||
      this.#authorizationCompletionRunning ||
      this.#authorizationHandoffRunning ||
      this.#pendingAuthorizationUrl !== undefined
    ) {
      throw new McpNativeOAuthError(
        "invalid-configuration",
        "OAuth PKCE verifier must belong to one reserved authorization attempt",
      );
    }
    this.#authorizationCodeVerifierSetupRunning = true;
    try {
      await this.#storage.saveCodeVerifier(verifier);
      this.#authorizationCodeVerifierSaved = true;
    } finally {
      this.#authorizationCodeVerifierSetupRunning = false;
    }
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
    if (resource !== undefined) {
      if (typeof resource !== "string" || resource.length > MAX_RESOURCE_IDENTIFIER_CODE_UNITS) {
        throw new McpNativeOAuthError(
          "invalid-storage",
          "Protected resource identifier is invalid or exceeds the supported size",
        );
      }
      let allowed: boolean;
      try {
        allowed = checkResourceAllowed({
          requestedResource: this.#resourceUrl,
          configuredResource: resource,
        });
      } catch (error) {
        throw new McpNativeOAuthError(
          "invalid-storage",
          "Protected resource metadata contains an invalid resource identifier",
          { cause: error },
        );
      }
      if (!allowed) {
        throw new McpNativeOAuthError(
          "resource-mismatch",
          "Protected resource metadata does not identify the configured MCP server",
        );
      }
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
    const clearsAuthorizationAttempt = scope === "all" || scope === "verifier";
    if (clearsAuthorizationAttempt) {
      if (
        this.#authorizationStateSetupRunning ||
        this.#authorizationCodeVerifierSetupRunning ||
        this.#authorizationCleanupRunning ||
        this.#authorizationCompletionRunning ||
        this.#authorizationHandoffRunning
      ) {
        throw new McpNativeOAuthError(
          "invalid-configuration",
          "OAuth authorization state/verifier setup, handoff, callback completion, or cleanup is already running",
        );
      }
      this.#authorizationCleanupRunning = true;
    }
    try {
      if (clearsAuthorizationAttempt) {
        await this.#storage.claimOAuthStateForCleanup(this.#authorizationOwner);
      }
      await this.#storage.invalidate(scope, this.#activeIssuer);
      if (scope === "verifier") {
        await this.#storage.clearOAuthState(this.#authorizationOwner);
        this.#pendingAuthorizationUrl = undefined;
        this.#authorizationAttemptReserved = false;
        this.#authorizationCodeVerifierSaved = false;
      }
      if (scope === "all" || scope === "discovery") {
        this.#activeIssuer = undefined;
      }
      if (scope === "all") {
        this.#pendingAuthorizationUrl = undefined;
        this.#authorizationAttemptReserved = false;
        this.#authorizationCodeVerifierSaved = false;
      }
    } finally {
      if (clearsAuthorizationAttempt) {
        this.#authorizationCleanupRunning = false;
      }
    }
  }

  /**
   * Clears an abandoned interactive attempt after the platform handoff has settled, including a
   * reservation persisted by an earlier process. Active state setup, handoff, and callback
   * completion cannot be cancelled through this method.
   */
  async cancelAuthorization(): Promise<void> {
    if (
      this.#authorizationStateSetupRunning ||
      this.#authorizationCodeVerifierSetupRunning ||
      this.#authorizationCleanupRunning ||
      this.#authorizationCompletionRunning ||
      this.#authorizationHandoffRunning
    ) {
      throw new McpNativeOAuthError(
        "invalid-configuration",
        "OAuth authorization state/verifier setup, handoff, callback completion, or cleanup is already running",
      );
    }
    await this.#discardPendingAuthorization();
  }

  /**
   * Validates an app/loopback callback before asking the SDK to redeem its code.
   * OAuth state is consumed before token exchange, so the callback cannot be replayed.
   */
  async finishAuthorization(finisher: OAuthFinisher, callbackUrl: string | URL): Promise<void> {
    if (
      this.#authorizationStateSetupRunning ||
      this.#authorizationCodeVerifierSetupRunning ||
      this.#authorizationHandoffRunning ||
      this.#authorizationCompletionRunning ||
      this.#authorizationCleanupRunning
    ) {
      throw new McpNativeOAuthError(
        "invalid-callback",
        "OAuth authorization setup, handoff, callback completion, or cleanup is already running",
      );
    }
    this.#authorizationCompletionRunning = true;
    const reservedForRecovery = !this.#authorizationAttemptReserved;
    this.#authorizationAttemptReserved = true;
    let stateClaimed = false;

    try {
      const callback = parseCallbackUrl(callbackUrl, this.redirectUrl);
      const parameters = callback.searchParams;
      requireSingleParameter(parameters, "state");
      if (
        !(await this.#storage.consumeOAuthState(parameters.get("state")!, this.#authorizationOwner))
      ) {
        throw new McpNativeOAuthError("state-mismatch", "OAuth callback state did not match");
      }
      stateClaimed = true;

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
        try {
          await this.#storage.invalidate("verifier", this.#activeIssuer);
          await this.#storage.clearOAuthState(this.#authorizationOwner);
        } finally {
          this.#authorizationAttemptReserved = false;
          this.#authorizationCodeVerifierSaved = false;
        }
      }
    } finally {
      this.#authorizationCompletionRunning = false;
      if (!stateClaimed && reservedForRecovery) {
        this.#authorizationAttemptReserved = false;
      }
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

  async #discardPendingAuthorization(): Promise<void> {
    if (this.#authorizationCleanupRunning) {
      throw new McpNativeOAuthError(
        "invalid-configuration",
        "OAuth authorization cleanup is already running",
      );
    }
    this.#authorizationCleanupRunning = true;
    this.#pendingAuthorizationUrl = undefined;
    try {
      await this.#storage.claimOAuthStateForCleanup(this.#authorizationOwner);
      await this.#storage.invalidate("verifier", this.#activeIssuer);
      await this.#storage.clearOAuthState(this.#authorizationOwner);
    } finally {
      this.#authorizationAttemptReserved = false;
      this.#authorizationCodeVerifierSaved = false;
      this.#authorizationCleanupRunning = false;
    }
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
  if (url.href.includes("#")) {
    throw new McpNativeOAuthError(
      "invalid-configuration",
      "MCP server URL must not contain a fragment",
    );
  }
  return url;
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
  assertOAuthRedirectParameterBudget(url);
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

function parseIssuer(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_OAUTH_ISSUER_CODE_UNITS
  ) {
    throw new McpNativeOAuthError("invalid-storage", `${label} is missing, invalid, or too large`);
  }
  const url = parseStoredSecureEndpoint(value, label);
  if (url.href.includes("?") || url.href.includes("#")) {
    throw new McpNativeOAuthError(
      "invalid-storage",
      `${label} must not contain a query or fragment`,
    );
  }
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
  assertBoundedOAuthJson(value, "Stored OAuth token response", TOKEN_INFORMATION_BUDGET);
  assertOAuthRecord(value, "Stored OAuth token response");
  assertBoundedTokenValues(value);
  const result = OAuthTokensSchema.safeParse(value);
  if (!result.success) {
    throw new McpNativeOAuthError("invalid-storage", "Stored OAuth tokens are invalid", {
      cause: result.error,
    });
  }
  const issuer = Object.hasOwn(value, "issuer") ? value.issuer : undefined;
  parseScope(result.data.scope ?? null);
  return { ...result.data, ...(issuer === undefined ? {} : { issuer }) };
}

function assertBoundedTokenValues(value: unknown): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return;
  const record = value as Record<string, unknown>;
  let total = 0;
  for (const [field, limit] of Object.entries(TOKEN_STRING_LIMITS)) {
    const fieldValue = record[field];
    if (typeof fieldValue !== "string") continue;
    if (fieldValue.length > limit) {
      throw new McpNativeOAuthError(
        "invalid-storage",
        `Stored OAuth ${field} exceeds the supported size`,
      );
    }
    total += fieldValue.length;
    if (total > MAX_TOKEN_CUMULATIVE_CODE_UNITS) {
      throw new McpNativeOAuthError(
        "invalid-storage",
        "Stored OAuth token values exceed the cumulative supported size",
      );
    }
  }
}

function parseStoredClientInformation(
  value: StoredOAuthClientInformation,
): StoredOAuthClientInformation {
  assertBoundedOAuthJson(value, "Stored OAuth client information", CLIENT_INFORMATION_BUDGET);
  assertOAuthRecord(value, "Stored OAuth client information");
  if (
    typeof value.client_id === "string" &&
    value.client_id.length > MAX_CLIENT_IDENTIFIER_CODE_UNITS
  ) {
    throw new McpNativeOAuthError(
      "invalid-storage",
      "Stored OAuth client identifier exceeds the supported size",
    );
  }
  if (
    typeof value.client_secret === "string" &&
    value.client_secret.length > MAX_CLIENT_SECRET_CODE_UNITS
  ) {
    throw new McpNativeOAuthError(
      "invalid-storage",
      "Stored OAuth client secret exceeds the supported size",
    );
  }
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
  assertBoundedOAuthJson(state, "Stored OAuth discovery state", DISCOVERY_STATE_BUDGET);
  assertOAuthRecord(state, "Stored OAuth discovery state");
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
  if (resourceMetadataResult?.success) {
    let allowed: boolean;
    try {
      allowed = checkResourceAllowed({
        requestedResource: resourceUrl,
        configuredResource: resourceMetadataResult.data.resource,
      });
    } catch (error) {
      throw new McpNativeOAuthError(
        "invalid-storage",
        "Stored protected-resource metadata contains an invalid resource identifier",
        { cause: error },
      );
    }
    if (!allowed) {
      throw new McpNativeOAuthError(
        "resource-mismatch",
        "Stored protected-resource metadata identifies a different MCP server",
      );
    }
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
  let resourceMetadataUrl: string | undefined;
  if (state.resourceMetadataUrl !== undefined) {
    const parsedResourceMetadataUrl = parseStoredSecureEndpoint(
      state.resourceMetadataUrl,
      "protected-resource metadata URL",
    );
    if (parsedResourceMetadataUrl.href.includes("#")) {
      throw new McpNativeOAuthError(
        "invalid-storage",
        "Stored protected-resource metadata URL must not contain a fragment",
      );
    }
    resourceMetadataUrl = parsedResourceMetadataUrl.href;
  }
  return {
    authorizationServerUrl,
    ...(authorizationServerMetadata === undefined ? {} : { authorizationServerMetadata }),
    ...(resourceMetadataResult?.success ? { resourceMetadata: resourceMetadataResult.data } : {}),
    ...(resourceMetadataUrl === undefined ? {} : { resourceMetadataUrl }),
  };
}

function assertOAuthRecord(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new McpNativeOAuthError("invalid-storage", `${label} must be a JSON object`);
  }
}

function assertBoundedOAuthJson(value: unknown, label: string, budget: OAuthJsonBudget): void {
  const seen = new WeakSet<object>();
  const pending: Array<{ readonly depth: number; readonly value: unknown }> = [{ depth: 0, value }];
  let arrayItems = 0;
  let nodes = 0;
  let properties = 0;
  let stringCodeUnits = 0;

  const countString = (text: string, limit: number): void => {
    if (text.length > limit) {
      throw new McpNativeOAuthError(
        "invalid-storage",
        `${label} contains a string that exceeds the supported size`,
      );
    }
    stringCodeUnits += text.length;
    if (stringCodeUnits > budget.maxTotalStringCodeUnits) {
      throw new McpNativeOAuthError(
        "invalid-storage",
        `${label} exceeds the cumulative supported string size`,
      );
    }
  };

  while (pending.length > 0) {
    const entry = pending.pop()!;
    nodes += 1;
    if (nodes > budget.maxNodes || entry.depth > budget.maxDepth) {
      throw new McpNativeOAuthError(
        "invalid-storage",
        `${label} exceeds the supported structural complexity`,
      );
    }
    if (entry.value === null) continue;
    if (entry.value === undefined) {
      throw new McpNativeOAuthError("invalid-storage", `${label} contains a non-JSON value`);
    }
    if (typeof entry.value === "string") {
      countString(entry.value, budget.maxStringCodeUnits);
      continue;
    }
    if (typeof entry.value === "number") {
      if (!Number.isFinite(entry.value)) {
        throw new McpNativeOAuthError("invalid-storage", `${label} contains a non-JSON number`);
      }
      continue;
    }
    if (typeof entry.value === "boolean") continue;
    if (typeof entry.value !== "object") {
      throw new McpNativeOAuthError("invalid-storage", `${label} contains a non-JSON value`);
    }
    if (seen.has(entry.value)) {
      throw new McpNativeOAuthError("invalid-storage", `${label} contains a circular value`);
    }
    seen.add(entry.value);

    if (Array.isArray(entry.value)) {
      if (entry.value.length > budget.maxArrayItems) {
        throw new McpNativeOAuthError(
          "invalid-storage",
          `${label} contains an array that exceeds the supported size`,
        );
      }
      arrayItems += entry.value.length;
      if (arrayItems > budget.maxCumulativeArrayItems) {
        throw new McpNativeOAuthError(
          "invalid-storage",
          `${label} exceeds the cumulative supported array size`,
        );
      }
      for (let index = 0; index < entry.value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(entry.value, index);
        if (descriptor === undefined || !("value" in descriptor)) {
          throw new McpNativeOAuthError("invalid-storage", `${label} contains a non-JSON array`);
        }
        pending.push({ depth: entry.depth + 1, value: descriptor.value });
      }
      continue;
    }

    const prototype = Object.getPrototypeOf(entry.value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new McpNativeOAuthError("invalid-storage", `${label} contains a non-plain object`);
    }
    const keys = Reflect.ownKeys(entry.value);
    if (keys.length > budget.maxObjectProperties) {
      throw new McpNativeOAuthError(
        "invalid-storage",
        `${label} contains an object that exceeds the supported size`,
      );
    }
    properties += keys.length;
    if (properties > budget.maxCumulativeProperties) {
      throw new McpNativeOAuthError(
        "invalid-storage",
        `${label} exceeds the cumulative supported property count`,
      );
    }
    for (const key of keys) {
      if (typeof key !== "string") {
        throw new McpNativeOAuthError("invalid-storage", `${label} contains a non-JSON key`);
      }
      countString(key, budget.maxPropertyNameCodeUnits);
      const descriptor = Object.getOwnPropertyDescriptor(entry.value, key)!;
      if (!descriptor.enumerable || !("value" in descriptor)) {
        throw new McpNativeOAuthError("invalid-storage", `${label} contains a non-JSON property`);
      }
      if (
        descriptor.value === undefined &&
        entry.depth === 0 &&
        budget.allowedUndefinedRootProperties?.has(key)
      ) {
        continue;
      }
      pending.push({ depth: entry.depth + 1, value: descriptor.value });
    }
  }
}

function parseAuthorizationServerMetadata(
  value: OAuthDiscoveryState["authorizationServerMetadata"],
) {
  if (value === undefined) {
    return undefined;
  }
  const oauth = OAuthMetadataSchema.safeParse(value);
  if (oauth.success) {
    assertSecureAuthorizationServerMetadataEndpoints(oauth.data);
    return oauth.data;
  }
  const openId = OpenIdProviderDiscoveryMetadataSchema.safeParse(value);
  if (openId.success) {
    assertSecureAuthorizationServerMetadataEndpoints(openId.data);
    return openId.data;
  }
  throw new McpNativeOAuthError(
    "invalid-storage",
    "Stored authorization-server metadata is invalid",
    { cause: openId.error },
  );
}

function assertSecureAuthorizationServerMetadataEndpoints(metadata: Record<string, unknown>): void {
  for (const [field, value] of Object.entries(metadata)) {
    if (
      typeof value !== "string" ||
      (field !== "service_documentation" && !field.endsWith("_endpoint") && !field.endsWith("_uri"))
    ) {
      continue;
    }
    const endpoint = parseStoredSecureEndpoint(value, `authorization-server metadata ${field}`);
    if (endpoint.href.includes("#")) {
      throw new McpNativeOAuthError(
        "invalid-storage",
        `Stored authorization-server metadata ${field} must not contain a fragment`,
      );
    }
  }
}

function parseStoredSecureEndpoint(value: string | URL, label: string): URL {
  try {
    return parseSecureEndpoint(value, label);
  } catch (error) {
    throw new McpNativeOAuthError("invalid-storage", `${label} is invalid`, { cause: error });
  }
}

function assertCodeVerifier(verifier: string): void {
  if (typeof verifier !== "string" || !PKCE_VERIFIER_PATTERN.test(verifier)) {
    throw new McpNativeOAuthError(
      "invalid-storage",
      "OAuth PKCE verifier must contain 43 to 128 RFC 7636 unreserved characters",
    );
  }
}

function assertSecureStore(storage: McpNativeOAuthSecureStore): void {
  const methods = [
    "loadClientInformation",
    "saveClientInformation",
    "loadTokens",
    "saveTokens",
    "loadCodeVerifier",
    "saveCodeVerifier",
    "reserveOAuthState",
    "saveOAuthState",
    "consumeOAuthState",
    "claimOAuthStateForCleanup",
    "clearOAuthState",
    "loadDiscoveryState",
    "saveDiscoveryState",
    "invalidate",
  ] as const;
  if (
    storage === null ||
    (typeof storage !== "object" && typeof storage !== "function") ||
    methods.some((method) => typeof storage[method] !== "function")
  ) {
    throw new McpNativeOAuthError(
      "invalid-configuration",
      "OAuth secure store must implement the complete persistence contract",
    );
  }
}

function parseCallbackUrl(value: string | URL, redirectUrl: URL): URL {
  const serialized = value instanceof URL ? value.href : value;
  if (serialized.length > MAX_CALLBACK_CODE_UNITS) {
    throw new McpNativeOAuthError(
      "invalid-callback",
      "OAuth callback URL exceeds the supported size",
    );
  }
  let callback: URL;
  try {
    callback = new URL(serialized);
  } catch (error) {
    throw new McpNativeOAuthError("invalid-callback", "OAuth callback must be an absolute URL", {
      cause: error,
    });
  }
  if (callback.href.includes("#")) {
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
  assertBoundedCallbackParameters(callback, redirectUrl);
  return callback;
}

function assertBoundedCallbackParameters(callback: URL, redirectUrl: URL): void {
  const configuredNames = new Set(redirectUrl.searchParams.keys());
  const parameters = [...callback.searchParams];
  if (parameters.length > MAX_CALLBACK_PARAMETERS) {
    throw new McpNativeOAuthError(
      "invalid-callback",
      "OAuth callback contains too many parameters",
    );
  }
  for (const [name, value] of parameters) {
    if (!CALLBACK_PARAMETER_NAMES.has(name) && !configuredNames.has(name)) {
      throw new McpNativeOAuthError(
        "invalid-callback",
        "OAuth callback contains an unsupported parameter",
      );
    }
    const limit =
      CALLBACK_VALUE_LIMITS[name as keyof typeof CALLBACK_VALUE_LIMITS] ??
      MAX_CALLBACK_PARAMETER_VALUE_CODE_UNITS;
    if (name.length > MAX_CALLBACK_PARAMETER_NAME_CODE_UNITS || value.length > limit) {
      throw new McpNativeOAuthError(
        "invalid-callback",
        "OAuth callback parameter exceeds the supported size",
      );
    }
  }
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
