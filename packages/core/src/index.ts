export type JsonPrimitive = boolean | null | number | string;

export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/** Maximum nesting depth accepted by the public JSON validators (root is depth 0). */
export const JSON_MAX_DEPTH = 64;
/** Maximum number of values accepted in one JSON graph. */
export const JSON_MAX_VALUES = 10_000;
/** Maximum UTF-16 code units accepted in one JSON string. */
export const JSON_MAX_STRING_LENGTH = 65_536;
/** Shared protocol-facing cumulative UTF-16 code-unit budget for strings and object keys. */
export const JSON_MAX_TOTAL_STRING_CODE_UNITS = 1_048_576;

/** Thrown when an untrusted value cannot be represented as JSON data. */
export class JsonValidationError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "JsonValidationError";
  }
}

export interface JsonValidationOptions {
  /** Maximum cumulative UTF-16 code units across all string values and object keys. */
  readonly maxTotalStringCodeUnits?: number;
}

/**
 * Validates and safely reconstructs an untrusted JSON object.
 *
 * The returned object keeps keys such as `__proto__` as ordinary own data
 * properties instead of invoking legacy prototype setters.
 */
export function parseJsonObject(
  value: unknown,
  path = "value",
  options: JsonValidationOptions = {},
): JsonObject {
  return parseJsonObjectWithState(value, path, createJsonValidationState(options), 0);
}

/** Validates and safely reconstructs an untrusted JSON value. */
export function parseJsonValue(
  value: unknown,
  path = "value",
  options: JsonValidationOptions = {},
): JsonValue {
  return parseJsonValueWithState(value, path, createJsonValidationState(options), 0);
}

export type McpRole = "assistant" | "user";

export interface McpAnnotations {
  readonly audience?: readonly McpRole[];
  readonly priority?: number;
  readonly lastModified?: string;
}

export interface McpIcon {
  readonly src: string;
  readonly mimeType?: string;
  readonly sizes?: readonly string[];
  readonly theme?: "dark" | "light";
}

export interface McpToolAnnotations {
  readonly title?: string;
  readonly readOnlyHint?: boolean;
  readonly destructiveHint?: boolean;
  readonly idempotentHint?: boolean;
  readonly openWorldHint?: boolean;
}

export interface McpTool {
  readonly icons?: readonly McpIcon[];
  readonly name: string;
  readonly title?: string;
  readonly description?: string;
  readonly inputSchema: JsonObject;
  readonly outputSchema?: JsonObject;
  readonly annotations?: McpToolAnnotations;
  readonly _meta?: JsonObject;
}

export interface McpTextContent {
  readonly type: "text";
  readonly text: string;
  readonly annotations?: McpAnnotations;
  readonly _meta?: JsonObject;
}

export interface McpImageContent {
  readonly type: "image";
  readonly data: string;
  readonly mimeType: string;
  readonly annotations?: McpAnnotations;
  readonly _meta?: JsonObject;
}

export interface McpAudioContent {
  readonly type: "audio";
  readonly data: string;
  readonly mimeType: string;
  readonly annotations?: McpAnnotations;
  readonly _meta?: JsonObject;
}

export interface McpResourceLink {
  readonly type: "resource_link";
  readonly icons?: readonly McpIcon[];
  readonly name: string;
  readonly title?: string;
  readonly uri: string;
  readonly description?: string;
  readonly mimeType?: string;
  readonly annotations?: McpAnnotations;
  readonly size?: number;
  readonly _meta?: JsonObject;
}

interface McpResourceContentsBase {
  readonly uri: string;
  readonly mimeType?: string;
  readonly _meta?: JsonObject;
}

export interface McpTextResourceContents extends McpResourceContentsBase {
  readonly text: string;
  readonly blob?: never;
}

export interface McpBlobResourceContents extends McpResourceContentsBase {
  readonly blob: string;
  readonly text?: never;
}

export type McpResource = McpTextResourceContents | McpBlobResourceContents;

export interface McpEmbeddedResource {
  readonly type: "resource";
  readonly resource: McpResource;
  readonly annotations?: McpAnnotations;
  readonly _meta?: JsonObject;
}

export type McpContent =
  | McpAudioContent
  | McpEmbeddedResource
  | McpImageContent
  | McpResourceLink
  | McpTextContent;

export interface McpToolCallResult {
  readonly content: readonly McpContent[];
  readonly isError?: boolean;
  readonly structuredContent?: JsonValue;
  readonly _meta?: JsonObject;
}

export type McpCacheScope = "private" | "public";

export interface McpListToolsResult {
  readonly tools: readonly McpTool[];
  readonly nextCursor?: string;
  readonly ttlMs?: number;
  readonly cacheScope?: McpCacheScope;
  readonly _meta?: JsonObject;
}

export interface McpReadResourceResult {
  readonly contents: readonly McpResource[];
  readonly ttlMs?: number;
  readonly cacheScope?: McpCacheScope;
  readonly _meta?: JsonObject;
}

/** Per-extension settings advertised through MCP capability declarations. */
export interface McpExtensionSettings {
  readonly [identifier: string]: JsonObject;
}

export type McpExtensionNegotiation =
  | {
      readonly kind: "fallback";
      readonly identifier: string;
      readonly reason: "client-unsupported" | "server-unsupported";
    }
  | {
      readonly kind: "negotiated";
      readonly identifier: string;
      readonly clientSettings: JsonObject;
      readonly serverSettings: JsonObject;
    };

/** Returns whether a value is a valid, mandatorily prefixed MCP extension identifier. */
export function isMcpExtensionIdentifier(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > JSON_MAX_STRING_LENGTH) {
    return false;
  }

  const slash = value.indexOf("/");
  if (slash <= 0 || slash !== value.lastIndexOf("/")) {
    return false;
  }
  const prefix = value.slice(0, slash);
  const name = value.slice(slash + 1);
  const labelPattern = /^[A-Za-z](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
  const namePattern = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
  return namePattern.test(name) && prefix.split(".").every((label) => labelPattern.test(label));
}

/** Validates and safely reconstructs an MCP extension capability map. */
export function parseMcpExtensionSettings(
  value: unknown,
  path = "extensions",
): McpExtensionSettings {
  const parsed = parseJsonObject(value, path);
  const extensions: Record<string, JsonValue> = {};

  for (const [identifier, settings] of Object.entries(parsed)) {
    if (!isMcpExtensionIdentifier(identifier)) {
      throw new JsonValidationError(
        `Invalid MCP extension identifier ${JSON.stringify(identifier)} at ${path}`,
      );
    }
    if (settings === null || typeof settings !== "object" || Array.isArray(settings)) {
      throw new JsonValidationError(`Expected an object at ${path}.${identifier}`);
    }
    defineJsonProperty(extensions, identifier, settings);
  }

  return extensions as McpExtensionSettings;
}

/**
 * Negotiates one extension from explicit client and server capability maps.
 * Metadata and MIME types are deliberately not considered capability grants.
 */
export function negotiateMcpExtension(
  identifier: string,
  clientExtensions: unknown,
  serverExtensions: unknown,
): McpExtensionNegotiation {
  if (!isMcpExtensionIdentifier(identifier)) {
    throw new JsonValidationError(`Invalid MCP extension identifier ${JSON.stringify(identifier)}`);
  }

  const client = parseMcpExtensionSettings(clientExtensions, "clientExtensions");
  const server = parseMcpExtensionSettings(serverExtensions, "serverExtensions");
  const clientSettings = client[identifier];
  if (clientSettings === undefined) {
    return { kind: "fallback", identifier, reason: "client-unsupported" };
  }
  const serverSettings = server[identifier];
  if (serverSettings === undefined) {
    return { kind: "fallback", identifier, reason: "server-unsupported" };
  }
  return { kind: "negotiated", identifier, clientSettings, serverSettings };
}

/**
 * The small client boundary consumed by the runtime. SDK-specific clients can
 * implement this interface without coupling the core package to a transport.
 */
export interface McpClient {
  listTools(): Promise<McpListToolsResult>;
  callTool(name: string, arguments_: JsonObject): Promise<McpToolCallResult>;
  readResource(uri: string): Promise<McpReadResourceResult>;
  /**
   * Optional snapshot of extensions this client actually advertised.
   * Omission means the client advertised none.
   */
  getClientExtensionSettings?(): McpExtensionSettings;
  /** Optional server capability snapshot; omission means no extension support. */
  getServerExtensionSettings?(): McpExtensionSettings;
}

export interface ToolAction {
  readonly type: "tool";
  readonly name: string;
  readonly arguments?: JsonObject;
}

export type McpNativeAction = ToolAction;

/** Validates and safely reconstructs a surface-declared native action. */
export function parseMcpNativeAction(value: unknown, path = "action"): McpNativeAction {
  const action = expectPlainObject(value, path);
  expectOnlyKeys(action, ["arguments", "name", "type"], path);
  if (action.type !== "tool") {
    throw new JsonValidationError(`Expected the string "tool" at ${path}.type`);
  }
  if (typeof action.name !== "string") {
    throw new JsonValidationError(`Expected a string at ${path}.name`);
  }
  if (action.name.length === 0) {
    throw new JsonValidationError(`Expected a non-empty string at ${path}.name`);
  }
  if (action.name.length > JSON_MAX_STRING_LENGTH) {
    throw new JsonValidationError(
      `String at ${path}.name exceeds maximum length of ${JSON_MAX_STRING_LENGTH}`,
    );
  }

  return {
    type: "tool",
    name: action.name,
    ...(action.arguments === undefined
      ? {}
      : { arguments: parseJsonObject(action.arguments, `${path}.arguments`) }),
  };
}

/** A host-owned policy deciding which validated tool actions may execute. */
export type McpNativeActionPolicy = (action: McpNativeAction) => boolean | Promise<boolean>;

/** Host-owned effect classification used when presenting one tool-action consent decision. */
export type McpNativeToolRisk = "read-only" | "local-write" | "external-write" | "destructive";

/**
 * A host-authored consent profile for one exact tool/argument match.
 *
 * Capability and sensitive-data identifiers are opaque, app-owned keys. A host should map them to
 * localized user-facing copy instead of displaying the identifiers or server-provided metadata.
 */
export type McpNativeToolConsentEntry = McpNativeToolAllowlistEntry & {
  readonly risk: McpNativeToolRisk;
  /** Explicit app-owned capability identifiers; use an empty array only after review. */
  readonly capabilities: readonly string[];
  /** Explicit app-owned sensitive-data identifiers; use an empty array only after review. */
  readonly sensitiveData: readonly string[];
  /** Must explicitly state whether the action sends any user or device data outside the app. */
  readonly sharesDataExternally: boolean;
};

/** Immutable input supplied for every matching surface-driven action. */
export interface McpNativeToolConsentRequest {
  readonly action: McpNativeAction;
  readonly risk: McpNativeToolRisk;
  readonly capabilities: readonly string[];
  readonly sensitiveData: readonly string[];
  readonly sharesDataExternally: boolean;
}

/** A host-owned user-decision callback. Only an exact boolean `true` authorizes execution. */
export type McpNativeToolConsentReviewer = (
  request: McpNativeToolConsentRequest,
) => boolean | Promise<boolean>;

export interface McpNativeConsentGrantRecord {
  readonly key: string;
  readonly expiresAt: number;
}

/** Host-owned durable storage for non-secret consent grants. */
export interface McpNativeConsentGrantStore {
  load(key: string): unknown | Promise<unknown>;
  save(record: McpNativeConsentGrantRecord): void | Promise<void>;
  remove(key: string): void | Promise<void>;
}

export interface McpNativeExpiringGrantPolicyOptions {
  /** Per-action approval used when no unexpired grant exists. */
  readonly authorize: McpNativeActionPolicy;
  /** Host-authored key binding the grant to app policy revision, server, tool, and argument class. */
  readonly grantKey: (action: McpNativeAction) => string | undefined | Promise<string | undefined>;
  /** Host-selected lifetime after a fresh approval. Zero means allow once without persistence. */
  readonly grantDurationMs: (action: McpNativeAction) => number | Promise<number>;
  readonly store: McpNativeConsentGrantStore;
  readonly now?: () => number;
  readonly maxGrantDurationMs?: number;
}

const MCP_NATIVE_MAX_GRANT_KEY_CODE_UNITS = 512;
const MCP_NATIVE_MAX_GRANT_DURATION_MS = 31 * 24 * 60 * 60 * 1_000;
const consentGrantOperations = new WeakMap<
  McpNativeConsentGrantStore,
  Map<string, Promise<void>>
>();

/**
 * Wraps a per-action policy with bounded, expiring, host-keyed grants.
 *
 * Persisted values are treated as untrusted. Reviews and store operations are serialized, expired
 * grants are removed, and a grant is saved only after exact approval. Revoke a grant at any time
 * through `revokeMcpNativeConsentGrant`.
 */
export function createExpiringGrantActionPolicy(
  options: McpNativeExpiringGrantPolicyOptions,
): McpNativeActionPolicy {
  if (
    options === null ||
    typeof options !== "object" ||
    typeof options.authorize !== "function" ||
    typeof options.grantKey !== "function" ||
    typeof options.grantDurationMs !== "function" ||
    options.store === null ||
    typeof options.store !== "object" ||
    typeof options.store.load !== "function" ||
    typeof options.store.save !== "function" ||
    typeof options.store.remove !== "function" ||
    (options.now !== undefined && typeof options.now !== "function")
  ) {
    throw new JsonValidationError("Expected valid expiring consent-grant callbacks");
  }
  const now = options.now ?? Date.now;
  const maxDuration = options.maxGrantDurationMs ?? MCP_NATIVE_MAX_GRANT_DURATION_MS;
  if (
    !Number.isSafeInteger(maxDuration) ||
    maxDuration < 1 ||
    maxDuration > MCP_NATIVE_MAX_GRANT_DURATION_MS
  ) {
    throw new JsonValidationError(
      `Expected maximum consent-grant duration from 1 to ${MCP_NATIVE_MAX_GRANT_DURATION_MS}`,
    );
  }

  let evaluationRunning = false;
  return async (input) => {
    if (evaluationRunning) return false;
    evaluationRunning = true;
    try {
      const keyAction = parseFrozenAction(input, "grant key action");
      const authorizationAction = parseFrozenAction(input, "grant authorization action");
      const durationAction = parseFrozenAction(input, "grant duration action");
      const key = parseGrantKey(await options.grantKey(keyAction));
      const evaluate = async (): Promise<boolean> => {
        const currentTime = now();
        if (!Number.isSafeInteger(currentTime) || currentTime < 0) {
          throw new JsonValidationError("Consent-grant clock must return a non-negative integer");
        }
        if (key !== undefined) {
          const stored = await options.store.load(key);
          if (stored !== undefined) {
            const grant = parseConsentGrantRecord(stored, key);
            if (grant.expiresAt - currentTime > maxDuration) {
              throw new JsonValidationError(
                "Stored consent-grant lifetime exceeds the configured maximum",
              );
            }
            if (grant.expiresAt > currentTime) return true;
            await options.store.remove(key);
          }
        }

        const approved = await options.authorize(authorizationAction);
        if (approved !== true && approved !== false) {
          throw new JsonValidationError("Consent-grant authorization policy must return a boolean");
        }
        if (!approved) return false;

        const duration = await options.grantDurationMs(durationAction);
        if (!Number.isSafeInteger(duration) || duration < 0 || duration > maxDuration) {
          throw new JsonValidationError(
            `Consent-grant duration must be an integer from 0 to ${maxDuration}`,
          );
        }
        if (key !== undefined && duration > 0) {
          const approvedAt = now();
          if (!Number.isSafeInteger(approvedAt) || approvedAt < 0) {
            throw new JsonValidationError("Consent-grant clock must return a non-negative integer");
          }
          const expiresAt = approvedAt + duration;
          if (!Number.isSafeInteger(expiresAt)) {
            throw new JsonValidationError("Consent-grant expiry exceeds the safe integer range");
          }
          await options.store.save(Object.freeze({ key, expiresAt }));
        }
        return true;
      };
      return key === undefined
        ? await evaluate()
        : await serializeConsentGrantOperation(options.store, key, evaluate);
    } finally {
      evaluationRunning = false;
    }
  };
}

export async function revokeMcpNativeConsentGrant(
  store: McpNativeConsentGrantStore,
  key: string,
): Promise<void> {
  if (store === null || typeof store !== "object" || typeof store.remove !== "function") {
    throw new JsonValidationError("Expected a consent-grant store");
  }
  const parsedKey = parseGrantKey(key);
  if (parsedKey === undefined) {
    throw new JsonValidationError("Expected a consent-grant key");
  }
  await serializeConsentGrantOperation(store, parsedKey, () => store.remove(parsedKey));
}

function serializeConsentGrantOperation<T>(
  store: McpNativeConsentGrantStore,
  key: string,
  operation: () => T | Promise<T>,
): Promise<T> {
  let operations = consentGrantOperations.get(store);
  if (operations === undefined) {
    operations = new Map();
    consentGrantOperations.set(store, operations);
  }
  const previous = operations.get(key) ?? Promise.resolve();
  const result = previous.then(operation, operation);
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  operations.set(key, tail);
  void tail.then(() => {
    if (operations?.get(key) === tail) operations.delete(key);
  });
  return result;
}

/**
 * An allowlist entry that authorizes a tool by name and either exact arguments
 * or a host-provided argument predicate. Name-only allowlists are intentionally
 * unsupported — omit `arguments` to require empty/missing arguments, or supply
 * `authorizeArguments` for dynamic checks.
 *
 * `authorizeArguments` may be sync or async, but must resolve to a boolean.
 * Only an explicit `true` authorizes; thenables are awaited so a denied async
 * predicate cannot be treated as a truthy Promise object.
 */
export type McpNativeToolAllowlistEntry =
  | {
      readonly name: string;
      /** Exact JSON arguments required. Omit to allow only empty/missing arguments. */
      readonly arguments?: JsonObject;
    }
  | {
      readonly name: string;
      readonly authorizeArguments: (arguments_?: JsonObject) => boolean | Promise<boolean>;
    };

/** Builds a fail-closed action policy from an explicit tool/argument allowlist. */
export function createAllowlistActionPolicy(
  allowlist: readonly McpNativeToolAllowlistEntry[],
): McpNativeActionPolicy {
  const entries = allowlist.map((entry) => {
    if (typeof entry.name !== "string" || entry.name.length === 0) {
      throw new JsonValidationError("Expected a non-empty allowlist tool name");
    }
    if ("authorizeArguments" in entry) {
      if (typeof entry.authorizeArguments !== "function") {
        throw new JsonValidationError(
          `Expected authorizeArguments to be a function for tool ${entry.name}`,
        );
      }
      return entry;
    }
    return {
      name: entry.name,
      arguments:
        entry.arguments === undefined
          ? undefined
          : parseJsonObject(entry.arguments, `allowlist.${entry.name}.arguments`),
    };
  });

  return async (action) => {
    for (const entry of entries) {
      if (entry.name !== action.name) {
        continue;
      }
      if ("authorizeArguments" in entry) {
        // Predicates must run sequentially so a denied match does not race later entries.
        // eslint-disable-next-line no-await-in-loop -- intentional fail-closed short-circuit
        const allowed = await entry.authorizeArguments(action.arguments);
        if (allowed === true) {
          return true;
        }
        if (allowed !== false) {
          throw new JsonValidationError(
            `authorizeArguments for tool ${entry.name} must return a boolean`,
          );
        }
        continue;
      }
      if (jsonArgumentsMatch(entry.arguments, action.arguments)) {
        return true;
      }
    }
    return false;
  };
}

const MCP_NATIVE_CONSENT_RISKS: ReadonlySet<McpNativeToolRisk> = new Set([
  "read-only",
  "local-write",
  "external-write",
  "destructive",
]);
const MCP_NATIVE_MAX_CONSENT_ENTRIES = 1_024;
const MCP_NATIVE_MAX_CONSENT_LABELS = 64;
const MCP_NATIVE_MAX_CONSENT_LABEL_CODE_UNITS = 128;

/**
 * Builds a fail-closed, per-dispatch consent policy from host-authored risk profiles.
 *
 * The first matching entry is reviewed. Unknown tools and arguments are denied without prompting,
 * concurrent evaluations are denied instead of queuing dialogs, and no approval is retained. A
 * server's tool annotations are intentionally absent from this boundary because they are untrusted
 * hints rather than capability or consent grants.
 */
export function createConsentActionPolicy(
  entries: readonly McpNativeToolConsentEntry[],
  review: McpNativeToolConsentReviewer,
): McpNativeActionPolicy {
  if (!Array.isArray(entries) || entries.length > MCP_NATIVE_MAX_CONSENT_ENTRIES) {
    throw new JsonValidationError(
      `Expected at most ${MCP_NATIVE_MAX_CONSENT_ENTRIES} tool consent entries`,
    );
  }
  if (typeof review !== "function") {
    throw new JsonValidationError("Expected tool consent reviewer to be a function");
  }

  const profiles = entries.map((entry, index) => {
    const profile = expectPlainObject(entry, `consent[${index}]`);
    expectOnlyKeys(
      profile,
      [
        "arguments",
        "authorizeArguments",
        "capabilities",
        "name",
        "risk",
        "sensitiveData",
        "sharesDataExternally",
      ],
      `consent[${index}]`,
    );
    for (const field of ["capabilities", "name", "risk", "sensitiveData", "sharesDataExternally"]) {
      if (!Object.hasOwn(profile, field)) {
        throw new JsonValidationError(
          `Missing required field ${JSON.stringify(field)} at consent[${index}]`,
        );
      }
    }
    const hasAuthorizeArguments = Object.hasOwn(profile, "authorizeArguments");
    const hasArguments = Object.hasOwn(profile, "arguments");
    if (hasAuthorizeArguments && hasArguments) {
      throw new JsonValidationError(
        `Tool consent entry at consent[${index}] cannot declare both arguments and authorizeArguments`,
      );
    }
    if (typeof entry.name !== "string" || entry.name.length === 0) {
      throw new JsonValidationError(`Expected a non-empty tool name at consent[${index}]`);
    }
    if (entry.name.length > JSON_MAX_STRING_LENGTH) {
      throw new JsonValidationError(
        `Tool name at consent[${index}] exceeds maximum length of ${JSON_MAX_STRING_LENGTH}`,
      );
    }
    if (!MCP_NATIVE_CONSENT_RISKS.has(entry.risk)) {
      throw new JsonValidationError(`Unsupported tool risk at consent[${index}]`);
    }
    if (typeof entry.sharesDataExternally !== "boolean") {
      throw new JsonValidationError(
        `Expected sharesDataExternally to be a boolean at consent[${index}]`,
      );
    }

    const matcher = hasAuthorizeArguments
      ? (() => {
          if (typeof entry.authorizeArguments !== "function") {
            throw new JsonValidationError(
              `Expected authorizeArguments to be a function for tool ${entry.name}`,
            );
          }
          return { authorizeArguments: entry.authorizeArguments } as const;
        })()
      : {
          arguments:
            !hasArguments || entry.arguments === undefined
              ? undefined
              : parseJsonObject(entry.arguments, `consent[${index}].arguments`),
        };

    return Object.freeze({
      name: entry.name,
      ...matcher,
      risk: entry.risk,
      capabilities: parseConsentLabels(entry.capabilities, `consent[${index}].capabilities`),
      sensitiveData: parseConsentLabels(entry.sensitiveData, `consent[${index}].sensitiveData`),
      sharesDataExternally: entry.sharesDataExternally,
    });
  });

  let evaluationRunning = false;
  return async (action) => {
    if (evaluationRunning) {
      return false;
    }
    evaluationRunning = true;
    try {
      for (const profile of profiles) {
        if (profile.name !== action.name) {
          continue;
        }
        let matches: boolean;
        if ("authorizeArguments" in profile) {
          const predicateArguments =
            action.arguments === undefined
              ? undefined
              : parseJsonObject(action.arguments, "consent predicate arguments");
          // Predicates run sequentially to preserve deterministic, first-match review behavior.
          // eslint-disable-next-line no-await-in-loop -- intentional fail-closed short-circuit
          const decision = await profile.authorizeArguments(predicateArguments);
          if (decision !== true && decision !== false) {
            throw new JsonValidationError(
              `authorizeArguments for tool ${profile.name} must return a boolean`,
            );
          }
          matches = decision;
        } else {
          matches = jsonArgumentsMatch(profile.arguments, action.arguments);
        }
        if (!matches) {
          continue;
        }

        const parsedReviewAction = parseMcpNativeAction(action, "consent action");
        if (parsedReviewAction.arguments !== undefined) {
          freezeJsonValue(parsedReviewAction.arguments);
        }
        const reviewAction = Object.freeze(parsedReviewAction);
        const request = Object.freeze({
          action: reviewAction,
          risk: profile.risk,
          capabilities: profile.capabilities,
          sensitiveData: profile.sensitiveData,
          sharesDataExternally: profile.sharesDataExternally,
        });
        // Reviews are intentionally serialized with the first matching profile.
        // eslint-disable-next-line no-await-in-loop -- consent prompts must never race
        const decision = await review(request);
        if (decision !== true && decision !== false) {
          throw new JsonValidationError("Tool consent reviewer must return a boolean");
        }
        return decision;
      }
      return false;
    } finally {
      evaluationRunning = false;
    }
  };
}

export interface McpNativeRuntimeOptions {
  /**
   * Authorizes surface-driven actions through `dispatch()` only. When omitted,
   * `dispatch()` denies every action. Trusted host code can continue to use
   * `callTool()` directly after JSON argument validation.
   */
  readonly actionPolicy?: McpNativeActionPolicy;
  /** Optional policy for host-initiated `callTool()` calls. Omission preserves the trusted seam. */
  readonly trustedToolPolicy?: McpNativeActionPolicy;
}

export class McpNativeActionDeniedError extends Error {
  readonly toolName: string;

  constructor(toolName: string) {
    super(`MCP native action denied by host policy: ${toolName}`);
    this.name = "McpNativeActionDeniedError";
    this.toolName = toolName;
  }
}

/**
 * Coordinates MCP operations without knowing about A2UI, React Native, or any
 * other renderer. It deliberately routes declared actions instead of loading
 * executable code from a server.
 */
export class McpNativeRuntime {
  readonly #client: McpClient;
  readonly #actionPolicy: McpNativeActionPolicy | undefined;
  readonly #trustedToolPolicy: McpNativeActionPolicy | undefined;

  constructor(client: McpClient, options: McpNativeRuntimeOptions = {}) {
    if (
      (options.actionPolicy !== undefined && typeof options.actionPolicy !== "function") ||
      (options.trustedToolPolicy !== undefined && typeof options.trustedToolPolicy !== "function")
    ) {
      throw new JsonValidationError("Runtime action policies must be functions");
    }
    this.#client = client;
    this.#actionPolicy = options.actionPolicy;
    this.#trustedToolPolicy = options.trustedToolPolicy;
  }

  listTools(): Promise<McpListToolsResult> {
    return this.#client.listTools();
  }

  async callTool(name: string, arguments_: JsonObject = {}): Promise<McpToolCallResult> {
    const validatedAction = parseMcpNativeAction({
      type: "tool",
      name,
      arguments: arguments_,
    });
    if (this.#trustedToolPolicy !== undefined) {
      const allowed = await this.#trustedToolPolicy(validatedAction);
      if (allowed !== true) {
        throw new McpNativeActionDeniedError(validatedAction.name);
      }
    }
    return this.#client.callTool(validatedAction.name, validatedAction.arguments ?? {});
  }

  readResource(uri: string): Promise<McpReadResourceResult> {
    return this.#client.readResource(uri);
  }

  /**
   * Negotiates one extension from the client's advertised map and the server's
   * validated map. Callers cannot substitute an unadvertised client map.
   */
  negotiateExtension(identifier: string): McpExtensionNegotiation {
    const clientExtensions = this.#client.getClientExtensionSettings?.() ?? {};
    const serverExtensions = this.#client.getServerExtensionSettings?.() ?? {};
    return negotiateMcpExtension(identifier, clientExtensions, serverExtensions);
  }

  async dispatch(action: McpNativeAction): Promise<McpToolCallResult> {
    const validatedAction = parseMcpNativeAction(action);
    if (this.#actionPolicy === undefined) {
      throw new McpNativeActionDeniedError(validatedAction.name);
    }
    const allowed = await this.#actionPolicy(validatedAction);
    if (allowed !== true) {
      throw new McpNativeActionDeniedError(validatedAction.name);
    }
    return this.#client.callTool(validatedAction.name, validatedAction.arguments ?? {});
  }
}

function parseGrantKey(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MCP_NATIVE_MAX_GRANT_KEY_CODE_UNITS ||
    containsControlCodeUnit(value)
  ) {
    throw new JsonValidationError(
      `Consent-grant key must contain 1 to ${MCP_NATIVE_MAX_GRANT_KEY_CODE_UNITS} non-control code units`,
    );
  }
  return value;
}

function containsControlCodeUnit(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function parseFrozenAction(value: unknown, path: string): McpNativeAction {
  const action = parseMcpNativeAction(value, path);
  if (action.arguments !== undefined) freezeJsonValue(action.arguments);
  return Object.freeze(action);
}

function parseConsentGrantRecord(value: unknown, expectedKey: string): McpNativeConsentGrantRecord {
  const record = expectPlainObject(value, "stored consent grant");
  expectOnlyKeys(record, ["expiresAt", "key"], "stored consent grant");
  const key = parseGrantKey(record.key);
  if (key !== expectedKey) {
    throw new JsonValidationError("Stored consent-grant key does not match its lookup key");
  }
  if (!Number.isSafeInteger(record.expiresAt) || (record.expiresAt as number) < 0) {
    throw new JsonValidationError("Stored consent-grant expiry must be a non-negative integer");
  }
  return Object.freeze({ key, expiresAt: record.expiresAt as number });
}

function jsonArgumentsMatch(
  expected: JsonObject | undefined,
  actual: JsonObject | undefined,
): boolean {
  if (expected === undefined) {
    return actual === undefined || Object.keys(actual).length === 0;
  }
  if (actual === undefined) {
    return Object.keys(expected).length === 0;
  }
  return jsonValuesEqual(expected, actual);
}

function parseConsentLabels(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new JsonValidationError(`Expected an array of consent identifiers at ${path}`);
  }
  if (value.length > MCP_NATIVE_MAX_CONSENT_LABELS) {
    throw new JsonValidationError(
      `Expected at most ${MCP_NATIVE_MAX_CONSENT_LABELS} consent identifiers at ${path}`,
    );
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const label = value[index];
    if (
      typeof label !== "string" ||
      label.length === 0 ||
      label.length > MCP_NATIVE_MAX_CONSENT_LABEL_CODE_UNITS
    ) {
      throw new JsonValidationError(
        `Expected a non-empty consent identifier of at most ${MCP_NATIVE_MAX_CONSENT_LABEL_CODE_UNITS} code units at ${path}[${index}]`,
      );
    }
    if (seen.has(label)) {
      throw new JsonValidationError(
        `Duplicate consent identifier ${JSON.stringify(label)} at ${path}`,
      );
    }
    seen.add(label);
    result.push(label);
  }
  return Object.freeze(result);
}

function jsonValuesEqual(left: JsonValue, right: JsonValue): boolean {
  if (left === right) {
    return true;
  }
  if (left === null || right === null || typeof left !== typeof right) {
    return false;
  }
  if (typeof left !== "object" || typeof right !== "object") {
    return false;
  }
  if (Array.isArray(left)) {
    if (!Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((value, index) => jsonValuesEqual(value, right[index]!));
  }
  if (Array.isArray(right)) {
    return false;
  }

  const leftObject = left as JsonObject;
  const rightObject = right as JsonObject;
  const leftKeys = Object.keys(leftObject);
  const rightKeys = Object.keys(rightObject);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every(
    (key) =>
      Object.hasOwn(rightObject, key) && jsonValuesEqual(leftObject[key]!, rightObject[key]!),
  );
}

function freezeJsonValue(value: JsonValue): void {
  if (value === null || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    for (const child of value) {
      freezeJsonValue(child);
    }
  } else {
    for (const child of Object.values(value)) {
      freezeJsonValue(child);
    }
  }
  Object.freeze(value);
}

function expectPlainObject(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new JsonValidationError(`Expected an object at ${path}`);
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new JsonValidationError(`Expected a plain object at ${path}`);
  }

  return value as Record<string, unknown>;
}

interface JsonValidationState {
  readonly ancestors: Set<object>;
  readonly maxTotalStringCodeUnits: number | undefined;
  totalStringCodeUnits: number;
  values: number;
}

function createJsonValidationState(options: JsonValidationOptions): JsonValidationState {
  const maxTotalStringCodeUnits = options.maxTotalStringCodeUnits;
  if (
    maxTotalStringCodeUnits !== undefined &&
    (!Number.isSafeInteger(maxTotalStringCodeUnits) || maxTotalStringCodeUnits < 0)
  ) {
    throw new JsonValidationError(
      "Expected maxTotalStringCodeUnits to be a non-negative safe integer",
    );
  }
  return {
    ancestors: new Set(),
    maxTotalStringCodeUnits,
    totalStringCodeUnits: 0,
    values: 0,
  };
}

function parseJsonObjectWithState(
  value: unknown,
  path: string,
  state: JsonValidationState,
  depth: number,
): JsonObject {
  consumeJsonBudget(state, path, depth);
  const object = expectPlainObject(value, path);
  if (state.ancestors.has(object)) {
    throw new JsonValidationError(`Circular JSON value at ${path}`);
  }

  state.ancestors.add(object);
  const result: Record<string, JsonValue> = {};
  for (const [key, child] of Object.entries(object)) {
    if (key.length > JSON_MAX_STRING_LENGTH) {
      throw new JsonValidationError(
        `JSON object key at ${path} exceeds maximum length of ${JSON_MAX_STRING_LENGTH}`,
      );
    }
    consumeJsonStringBudget(state, key.length, `${path} object key`);
    defineJsonProperty(
      result,
      key,
      parseJsonValueWithState(child, `${path}.${key}`, state, depth + 1),
    );
  }
  state.ancestors.delete(object);
  return result;
}

function parseJsonValueWithState(
  value: unknown,
  path: string,
  state: JsonValidationState,
  depth: number,
): JsonValue {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return parseJsonObjectWithState(value, path, state, depth);
  }

  consumeJsonBudget(state, path, depth);
  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    if (value.length > JSON_MAX_STRING_LENGTH) {
      throw new JsonValidationError(
        `String at ${path} exceeds maximum length of ${JSON_MAX_STRING_LENGTH}`,
      );
    }
    consumeJsonStringBudget(state, value.length, path);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new JsonValidationError(`Expected a finite number at ${path}`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (state.ancestors.has(value)) {
      throw new JsonValidationError(`Circular JSON value at ${path}`);
    }
    state.ancestors.add(value);
    const result: JsonValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        throw new JsonValidationError(`Sparse JSON array item at ${path}[${index}]`);
      }
      result.push(parseJsonValueWithState(value[index], `${path}[${index}]`, state, depth + 1));
    }
    state.ancestors.delete(value);
    return result;
  }
  throw new JsonValidationError(`Expected a JSON value at ${path}`);
}

function consumeJsonBudget(state: JsonValidationState, path: string, depth: number): void {
  if (depth > JSON_MAX_DEPTH) {
    throw new JsonValidationError(
      `JSON value exceeds maximum depth of ${JSON_MAX_DEPTH} at ${path}`,
    );
  }
  state.values += 1;
  if (state.values > JSON_MAX_VALUES) {
    throw new JsonValidationError(`JSON value exceeds maximum of ${JSON_MAX_VALUES} values`);
  }
}

function consumeJsonStringBudget(
  state: JsonValidationState,
  codeUnits: number,
  path: string,
): void {
  state.totalStringCodeUnits += codeUnits;
  if (
    state.maxTotalStringCodeUnits !== undefined &&
    state.totalStringCodeUnits > state.maxTotalStringCodeUnits
  ) {
    throw new JsonValidationError(
      `JSON value exceeds maximum cumulative string/key length of ${state.maxTotalStringCodeUnits} at ${path}`,
    );
  }
}

function expectOnlyKeys(
  object: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string,
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) {
      throw new JsonValidationError(`Unsupported field ${JSON.stringify(key)} at ${path}`);
    }
  }
}

function defineJsonProperty(
  object: Record<string, JsonValue>,
  key: string,
  value: JsonValue,
): void {
  Object.defineProperty(object, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}
