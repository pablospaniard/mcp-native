import type { Client, ClientOptions } from "@modelcontextprotocol/client";
import {
  parseJsonObject as parseCoreJsonObject,
  parseJsonValue as parseCoreJsonValue,
} from "@mcp-native/core";
import type {
  JsonObject,
  JsonValue,
  McpAnnotations,
  McpCacheScope,
  McpClient,
  McpContent,
  McpIcon,
  McpListToolsResult,
  McpReadResourceResult,
  McpResource,
  McpTool,
  McpToolAnnotations,
  McpToolCallResult,
} from "@mcp-native/core";

type OfficialMcpClient = Pick<Client, "callTool" | "listTools" | "readResource">;

/** The exact MCP core revision targeted by MCP Native's modern compatibility lane. */
export const MCP_NATIVE_PROTOCOL_REVISION = "2026-07-28" as const;

/** The only pre-2026 revision covered by MCP Native's compatibility tests. */
export const MCP_NATIVE_LEGACY_PROTOCOL_REVISION = "2025-11-25" as const;

/** Exact revisions MCP Native deliberately offers; no future revision is implied. */
export const MCP_NATIVE_SUPPORTED_PROTOCOL_REVISIONS = Object.freeze([
  MCP_NATIVE_PROTOCOL_REVISION,
  MCP_NATIVE_LEGACY_PROTOCOL_REVISION,
] as const);

export type McpNativeProtocolMode = "auto" | "legacy-only" | "modern-only";

/**
 * Creates official SDK client options matching MCP Native's documented
 * protocol policy. The host still owns client construction and connection.
 */
export function createMcpNativeClientOptions(mode: McpNativeProtocolMode = "auto"): ClientOptions {
  switch (mode) {
    case "auto":
      return {
        supportedProtocolVersions: [...MCP_NATIVE_SUPPORTED_PROTOCOL_REVISIONS],
        versionNegotiation: { mode: "auto" },
      };
    case "modern-only":
      return {
        supportedProtocolVersions: [MCP_NATIVE_PROTOCOL_REVISION],
        versionNegotiation: { mode: { pin: MCP_NATIVE_PROTOCOL_REVISION } },
      };
    case "legacy-only":
      return {
        supportedProtocolVersions: [MCP_NATIVE_LEGACY_PROTOCOL_REVISION],
        versionNegotiation: { mode: "legacy" },
      };
    default:
      throw new TypeError(`Unsupported MCP Native protocol mode: ${String(mode)}`);
  }
}

/** Thrown when an SDK result cannot be represented by MCP Native's JSON-safe contracts. */
export class McpSdkAdapterError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "McpSdkAdapterError";
  }
}

/**
 * Adapts a connected official MCP TypeScript SDK client to the transport-neutral
 * boundary consumed by `@mcp-native/core`.
 */
export class McpSdkClientAdapter implements McpClient {
  readonly #client: OfficialMcpClient;

  constructor(client: OfficialMcpClient) {
    this.#client = client;
  }

  async listTools(): Promise<McpListToolsResult> {
    const result = expectObject(await this.#client.listTools(), "tools result");
    return {
      tools: expectArray(result.tools, "tools result.tools").map((value, index) =>
        mapTool(value, `tools result.tools[${index}]`),
      ),
      ...mapPagination(result, "tools result"),
      ...mapCacheHints(result, "tools result"),
      ...mapResultMeta(result, "tools result"),
    };
  }

  async callTool(name: string, arguments_: JsonObject): Promise<McpToolCallResult> {
    const result = expectObject(
      await this.#client.callTool({ name, arguments: arguments_ }),
      "tool result",
    );
    const isError = optionalBoolean(result.isError, "tool result.isError");
    const structuredContent =
      result.structuredContent === undefined
        ? undefined
        : expectJsonValue(result.structuredContent, "tool result.structuredContent");

    return {
      content: expectArray(result.content, "tool result.content").map((block, index) =>
        mapContent(block, `tool result.content[${index}]`),
      ),
      ...(isError === undefined ? {} : { isError }),
      ...(structuredContent === undefined ? {} : { structuredContent }),
      ...mapResultMeta(result, "tool result"),
    };
  }

  async readResource(uri: string): Promise<McpReadResourceResult> {
    const result = expectObject(await this.#client.readResource({ uri }), "resource result");
    return {
      contents: expectArray(result.contents, "resource result.contents").map((resource, index) =>
        mapResource(resource, `resource result.contents[${index}]`),
      ),
      ...mapCacheHints(result, "resource result"),
      ...mapResultMeta(result, "resource result"),
    };
  }
}

export function createMcpSdkClientAdapter(client: OfficialMcpClient): McpSdkClientAdapter {
  return new McpSdkClientAdapter(client);
}

function mapContent(value: unknown, path: string): McpContent {
  const block = expectObject(value, path);
  const type = expectString(block.type, `${path}.type`);
  const annotations = mapOptionalAnnotations(block.annotations, `${path}.annotations`);
  const meta = optionalMetaObject(block["_meta"], `${path}._meta`);
  const common = {
    ...(annotations === undefined ? {} : { annotations }),
    ...(meta === undefined ? {} : { _meta: meta }),
  };

  switch (type) {
    case "text":
      return { type, text: expectString(block.text, `${path}.text`), ...common };
    case "image":
    case "audio":
      return {
        type,
        data: expectString(block.data, `${path}.data`),
        mimeType: expectString(block.mimeType, `${path}.mimeType`),
        ...common,
      };
    case "resource_link": {
      const icons = mapOptionalIcons(block.icons, `${path}.icons`);
      const title = optionalString(block.title, `${path}.title`);
      const description = optionalString(block.description, `${path}.description`);
      const mimeType = optionalString(block.mimeType, `${path}.mimeType`);
      const size = optionalNonNegativeInteger(block.size, `${path}.size`);
      return {
        type,
        ...(icons === undefined ? {} : { icons }),
        name: expectString(block.name, `${path}.name`),
        ...(title === undefined ? {} : { title }),
        uri: expectString(block.uri, `${path}.uri`),
        ...(description === undefined ? {} : { description }),
        ...(mimeType === undefined ? {} : { mimeType }),
        ...(size === undefined ? {} : { size }),
        ...common,
      };
    }
    case "resource":
      return {
        type,
        resource: mapResource(block.resource, `${path}.resource`),
        ...common,
      };
    default:
      throw new McpSdkAdapterError(
        `Unsupported MCP content type ${JSON.stringify(type)} at ${path}`,
      );
  }
}

function mapResource(value: unknown, path: string): McpResource {
  const resource = expectObject(value, path);
  const mimeType = optionalString(resource.mimeType, `${path}.mimeType`);
  const text = optionalString(resource.text, `${path}.text`);
  const blob = optionalString(resource.blob, `${path}.blob`);
  const meta = optionalMetaObject(resource["_meta"], `${path}._meta`);

  if ((text === undefined) === (blob === undefined)) {
    throw new McpSdkAdapterError(`Expected exactly one of text or blob at ${path}`);
  }

  const common = {
    uri: expectString(resource.uri, `${path}.uri`),
    ...(mimeType === undefined ? {} : { mimeType }),
    ...(meta === undefined ? {} : { _meta: meta }),
  };
  return text === undefined ? { ...common, blob: blob! } : { ...common, text };
}

function mapTool(value: unknown, path: string): McpTool {
  const tool = expectObject(value, path);
  const icons = mapOptionalIcons(tool.icons, `${path}.icons`);
  const title = optionalString(tool.title, `${path}.title`);
  const description = optionalString(tool.description, `${path}.description`);
  const inputSchema = expectJsonObject(tool.inputSchema, `${path}.inputSchema`);
  const outputSchema = optionalJsonObject(tool.outputSchema, `${path}.outputSchema`);
  const annotations = mapOptionalToolAnnotations(tool.annotations, `${path}.annotations`);
  const meta = optionalMetaObject(tool["_meta"], `${path}._meta`);

  if (inputSchema.type !== "object") {
    throw new McpSdkAdapterError(`Expected the string "object" at ${path}.inputSchema.type`);
  }

  return {
    ...(icons === undefined ? {} : { icons }),
    name: expectString(tool.name, `${path}.name`),
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
    inputSchema,
    ...(outputSchema === undefined ? {} : { outputSchema }),
    ...(annotations === undefined ? {} : { annotations }),
    ...(meta === undefined ? {} : { _meta: meta }),
  };
}

function mapOptionalAnnotations(value: unknown, path: string): McpAnnotations | undefined {
  if (value === undefined) {
    return undefined;
  }
  const annotations = expectObject(value, path);
  const audience = mapOptionalAudience(annotations.audience, `${path}.audience`);
  const priority = optionalBoundedNumber(annotations.priority, `${path}.priority`, 0, 1);
  const lastModified = optionalString(annotations.lastModified, `${path}.lastModified`);
  return {
    ...(audience === undefined ? {} : { audience }),
    ...(priority === undefined ? {} : { priority }),
    ...(lastModified === undefined ? {} : { lastModified }),
  };
}

function mapOptionalAudience(
  value: unknown,
  path: string,
): readonly ("assistant" | "user")[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return expectArray(value, path).map((role, index) => {
    if (role !== "assistant" && role !== "user") {
      throw new McpSdkAdapterError(`Expected "assistant" or "user" at ${path}[${index}]`);
    }
    return role;
  });
}

function mapOptionalIcons(value: unknown, path: string): readonly McpIcon[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return expectArray(value, path).map((iconValue, index) => {
    const iconPath = `${path}[${index}]`;
    const icon = expectObject(iconValue, iconPath);
    const mimeType = optionalString(icon.mimeType, `${iconPath}.mimeType`);
    const sizes = optionalStringArray(icon.sizes, `${iconPath}.sizes`);
    const theme = optionalTheme(icon.theme, `${iconPath}.theme`);
    return {
      src: expectString(icon.src, `${iconPath}.src`),
      ...(mimeType === undefined ? {} : { mimeType }),
      ...(sizes === undefined ? {} : { sizes }),
      ...(theme === undefined ? {} : { theme }),
    };
  });
}

function mapOptionalToolAnnotations(value: unknown, path: string): McpToolAnnotations | undefined {
  if (value === undefined) {
    return undefined;
  }
  const annotations = expectObject(value, path);
  const title = optionalString(annotations.title, `${path}.title`);
  const readOnlyHint = optionalBoolean(annotations.readOnlyHint, `${path}.readOnlyHint`);
  const destructiveHint = optionalBoolean(annotations.destructiveHint, `${path}.destructiveHint`);
  const idempotentHint = optionalBoolean(annotations.idempotentHint, `${path}.idempotentHint`);
  const openWorldHint = optionalBoolean(annotations.openWorldHint, `${path}.openWorldHint`);
  return {
    ...(title === undefined ? {} : { title }),
    ...(readOnlyHint === undefined ? {} : { readOnlyHint }),
    ...(destructiveHint === undefined ? {} : { destructiveHint }),
    ...(idempotentHint === undefined ? {} : { idempotentHint }),
    ...(openWorldHint === undefined ? {} : { openWorldHint }),
  };
}

function mapPagination(value: Record<string, unknown>, path: string): Partial<McpListToolsResult> {
  const nextCursor = optionalString(value.nextCursor, `${path}.nextCursor`);
  return nextCursor === undefined ? {} : { nextCursor };
}

function mapCacheHints(
  value: Record<string, unknown>,
  path: string,
): { readonly ttlMs?: number; readonly cacheScope?: McpCacheScope } {
  const ttlMs = optionalNonNegativeInteger(value.ttlMs, `${path}.ttlMs`);
  const cacheScope = optionalCacheScope(value.cacheScope, `${path}.cacheScope`);
  return {
    ...(ttlMs === undefined ? {} : { ttlMs }),
    ...(cacheScope === undefined ? {} : { cacheScope }),
  };
}

function mapResultMeta(
  value: Record<string, unknown>,
  path: string,
): { readonly _meta?: JsonObject } {
  const meta = optionalMetaObject(value["_meta"], `${path}._meta`);
  return meta === undefined ? {} : { _meta: meta };
}

function expectObject(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new McpSdkAdapterError(`Expected an object at ${path}`);
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new McpSdkAdapterError(`Expected a plain object at ${path}`);
  }

  return value as Record<string, unknown>;
}

function expectArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new McpSdkAdapterError(`Expected an array at ${path}`);
  }
  return value;
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new McpSdkAdapterError(`Expected a string at ${path}`);
  }
  return value;
}

function optionalString(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : expectString(value, path);
}

function optionalBoolean(value: unknown, path: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new McpSdkAdapterError(`Expected a boolean at ${path}`);
  }
  return value;
}

function optionalStringArray(value: unknown, path: string): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return expectArray(value, path).map((item, index) => expectString(item, `${path}[${index}]`));
}

function optionalTheme(value: unknown, path: string): "dark" | "light" | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value !== "dark" && value !== "light") {
    throw new McpSdkAdapterError(`Expected "dark" or "light" at ${path}`);
  }
  return value;
}

function optionalCacheScope(value: unknown, path: string): McpCacheScope | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value !== "private" && value !== "public") {
    throw new McpSdkAdapterError(`Expected "private" or "public" at ${path}`);
  }
  return value;
}

function optionalNonNegativeInteger(value: unknown, path: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new McpSdkAdapterError(`Expected a non-negative safe integer at ${path}`);
  }
  return value;
}

function optionalBoundedNumber(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new McpSdkAdapterError(`Expected a number from ${minimum} to ${maximum} at ${path}`);
  }
  return value;
}

function expectJsonObject(value: unknown, path: string): JsonObject {
  try {
    return parseCoreJsonObject(value, path);
  } catch (error) {
    const message = error instanceof Error ? error.message : `Invalid JSON object at ${path}`;
    throw new McpSdkAdapterError(message, { cause: error });
  }
}

function optionalJsonObject(value: unknown, path: string): JsonObject | undefined {
  return value === undefined ? undefined : expectJsonObject(value, path);
}

function optionalMetaObject(value: unknown, path: string): JsonObject | undefined {
  if (value === undefined) {
    return undefined;
  }
  const meta = expectJsonObject(value, path);
  for (const key of Object.keys(meta)) {
    if (!isValidMetaKey(key)) {
      throw new McpSdkAdapterError(`Invalid MCP metadata key ${JSON.stringify(key)} at ${path}`);
    }
  }
  return meta;
}

function isValidMetaKey(key: string): boolean {
  const slash = key.indexOf("/");
  if (slash !== key.lastIndexOf("/")) {
    return false;
  }
  const prefix = slash === -1 ? undefined : key.slice(0, slash);
  const name = slash === -1 ? key : key.slice(slash + 1);
  const namePattern = /^(?:[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)?$/;
  if (!namePattern.test(name)) {
    return false;
  }
  if (prefix === undefined) {
    return true;
  }
  const labelPattern = /^[A-Za-z](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
  return prefix.length > 0 && prefix.split(".").every((label) => labelPattern.test(label));
}

function expectJsonValue(value: unknown, path: string): JsonValue {
  try {
    return parseCoreJsonValue(value, path);
  } catch (error) {
    const message = error instanceof Error ? error.message : `Invalid JSON value at ${path}`;
    throw new McpSdkAdapterError(message, { cause: error });
  }
}
