import type { Client } from "@modelcontextprotocol/client";
import type {
  JsonObject,
  JsonValue,
  McpClient,
  McpContent,
  McpReadResourceResult,
  McpResource,
  McpTool,
  McpToolCallResult,
} from "@mcp-native/core";

type OfficialMcpClient = Pick<Client, "callTool" | "listTools" | "readResource">;

/** Thrown when an SDK result cannot be represented by MCP Native's JSON-safe contracts. */
export class McpSdkAdapterError extends Error {
  constructor(message: string) {
    super(message);
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

  async listTools(): Promise<readonly McpTool[]> {
    const result = expectObject(await this.#client.listTools(), "tools result");
    return expectArray(result.tools, "tools result.tools").map((value, index) => {
      const tool = expectObject(value, `tools[${index}]`);
      const description = optionalString(tool.description, `tools[${index}].description`);

      return {
        name: expectString(tool.name, `tools[${index}].name`),
        ...(description === undefined ? {} : { description }),
        inputSchema: expectJsonObject(tool.inputSchema, `tools[${index}].inputSchema`),
      };
    });
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
    };
  }

  async readResource(uri: string): Promise<McpReadResourceResult> {
    const result = expectObject(await this.#client.readResource({ uri }), "resource result");
    return {
      contents: expectArray(result.contents, "resource result.contents").map((resource, index) =>
        mapResource(resource, `resource result.contents[${index}]`),
      ),
    };
  }
}

export function createMcpSdkClientAdapter(client: OfficialMcpClient): McpSdkClientAdapter {
  return new McpSdkClientAdapter(client);
}

function mapContent(value: unknown, path: string): McpContent {
  const block = expectObject(value, path);
  const type = expectString(block.type, `${path}.type`);
  const data: Record<string, JsonValue> = {};

  for (const [key, child] of Object.entries(block)) {
    if (key !== "type") {
      data[key] = expectJsonValue(child, `${path}.${key}`);
    }
  }

  return { type, data };
}

function mapResource(value: unknown, path: string): McpResource {
  const resource = expectObject(value, path);
  const mimeType = optionalString(resource.mimeType, `${path}.mimeType`);
  const text = optionalString(resource.text, `${path}.text`);
  const blob = optionalString(resource.blob, `${path}.blob`);

  if ((text === undefined) === (blob === undefined)) {
    throw new McpSdkAdapterError(`Expected exactly one of text or blob at ${path}`);
  }

  return {
    uri: expectString(resource.uri, `${path}.uri`),
    ...(mimeType === undefined ? {} : { mimeType }),
    ...(text === undefined ? {} : { text }),
    ...(blob === undefined ? {} : { blob }),
  };
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

function expectJsonObject(value: unknown, path: string): JsonObject {
  return expectJsonObjectWithAncestors(value, path, new Set());
}

function expectJsonObjectWithAncestors(
  value: unknown,
  path: string,
  ancestors: Set<object>,
): JsonObject {
  const object = expectObject(value, path);
  if (ancestors.has(object)) {
    throw new McpSdkAdapterError(`Circular JSON value at ${path}`);
  }

  ancestors.add(object);
  const result: Record<string, JsonValue> = {};
  for (const [key, child] of Object.entries(object)) {
    result[key] = expectJsonValueWithAncestors(child, `${path}.${key}`, ancestors);
  }
  ancestors.delete(object);
  return result;
}

function expectJsonValue(value: unknown, path: string): JsonValue {
  return expectJsonValueWithAncestors(value, path, new Set());
}

function expectJsonValueWithAncestors(
  value: unknown,
  path: string,
  ancestors: Set<object>,
): JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new McpSdkAdapterError(`Expected a finite number at ${path}`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new McpSdkAdapterError(`Circular JSON value at ${path}`);
    }
    ancestors.add(value);
    const result = value.map((child, index) =>
      expectJsonValueWithAncestors(child, `${path}[${index}]`, ancestors),
    );
    ancestors.delete(value);
    return result;
  }
  if (typeof value === "object") {
    return expectJsonObjectWithAncestors(value, path, ancestors);
  }
  throw new McpSdkAdapterError(`Expected a JSON value at ${path}`);
}
