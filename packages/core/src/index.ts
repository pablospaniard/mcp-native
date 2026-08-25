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

  return {
    type: "tool",
    name: action.name,
    ...(action.arguments === undefined
      ? {}
      : { arguments: parseJsonObject(action.arguments, `${path}.arguments`) }),
  };
}

/** A host-owned policy deciding which validated surface actions may execute. */
export type McpNativeActionPolicy = (action: McpNativeAction) => boolean | Promise<boolean>;

export interface McpNativeRuntimeOptions {
  /**
   * Authorizes surface-driven actions. When omitted, `dispatch()` denies every
   * action; trusted host code can continue to use `callTool()` directly.
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

  callTool(name: string, arguments_: JsonObject = {}): Promise<McpToolCallResult> {
    return this.#client.callTool(name, arguments_);
  }

  readResource(uri: string): Promise<McpReadResourceResult> {
    return this.#client.readResource(uri);
  }

  async dispatch(action: McpNativeAction): Promise<McpToolCallResult> {
    const validatedAction = parseMcpNativeAction(action);
    if (this.#actionPolicy === undefined || !(await this.#actionPolicy(validatedAction))) {
      throw new McpNativeActionDeniedError(validatedAction.name);
    }
    return this.callTool(validatedAction.name, validatedAction.arguments ?? {});
  }
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
    const result = value.map((child, index) =>
      parseJsonValueWithAncestors(child, `${path}[${index}]`, ancestors),
    );
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
