export type JsonPrimitive = boolean | null | number | string;

export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/** Thrown when an untrusted value cannot be represented as JSON data. */
export class JsonValidationError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "JsonValidationError";
  }
}

/**
 * Validates and safely reconstructs an untrusted JSON object.
 *
 * The returned object keeps keys such as `__proto__` as ordinary own data
 * properties instead of invoking legacy prototype setters.
 */
export function parseJsonObject(value: unknown, path = "value"): JsonObject {
  return parseJsonObjectWithAncestors(value, path, new Set());
}

/** Validates and safely reconstructs an untrusted JSON value. */
export function parseJsonValue(value: unknown, path = "value"): JsonValue {
  return parseJsonValueWithAncestors(value, path, new Set());
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

/**
 * The small client boundary consumed by the runtime. SDK-specific clients can
 * implement this interface without coupling the core package to a transport.
 */
export interface McpClient {
  listTools(): Promise<McpListToolsResult>;
  callTool(name: string, arguments_: JsonObject): Promise<McpToolCallResult>;
  readResource(uri: string): Promise<McpReadResourceResult>;
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
  if (action.type !== "tool") {
    throw new JsonValidationError(`Expected the string "tool" at ${path}.type`);
  }
  if (typeof action.name !== "string") {
    throw new JsonValidationError(`Expected a string at ${path}.name`);
  }
  if (action.name.length === 0) {
    throw new JsonValidationError(`Expected a non-empty string at ${path}.name`);
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

export interface McpNativeRuntimeOptions {
  /**
   * Authorizes surface-driven actions through `dispatch()` only. When omitted,
   * `dispatch()` denies every action. Trusted host code can continue to use
   * `callTool()` directly after JSON argument validation.
   */
  readonly actionPolicy?: McpNativeActionPolicy;
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

  constructor(client: McpClient, options: McpNativeRuntimeOptions = {}) {
    this.#client = client;
    this.#actionPolicy = options.actionPolicy;
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
    return this.#client.callTool(validatedAction.name, validatedAction.arguments ?? {});
  }

  readResource(uri: string): Promise<McpReadResourceResult> {
    return this.#client.readResource(uri);
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

function parseJsonObjectWithAncestors(
  value: unknown,
  path: string,
  ancestors: Set<object>,
): JsonObject {
  const object = expectPlainObject(value, path);
  if (ancestors.has(object)) {
    throw new JsonValidationError(`Circular JSON value at ${path}`);
  }

  ancestors.add(object);
  const result: Record<string, JsonValue> = {};
  for (const [key, child] of Object.entries(object)) {
    defineJsonProperty(
      result,
      key,
      parseJsonValueWithAncestors(child, `${path}.${key}`, ancestors),
    );
  }
  ancestors.delete(object);
  return result;
}

function parseJsonValueWithAncestors(
  value: unknown,
  path: string,
  ancestors: Set<object>,
): JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new JsonValidationError(`Expected a finite number at ${path}`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new JsonValidationError(`Circular JSON value at ${path}`);
    }
    ancestors.add(value);
    const result: JsonValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        throw new JsonValidationError(`Sparse JSON array item at ${path}[${index}]`);
      }
      result.push(parseJsonValueWithAncestors(value[index], `${path}[${index}]`, ancestors));
    }
    ancestors.delete(value);
    return result;
  }
  if (typeof value === "object") {
    return parseJsonObjectWithAncestors(value, path, ancestors);
  }
  throw new JsonValidationError(`Expected a JSON value at ${path}`);
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
