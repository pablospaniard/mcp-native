export type JsonPrimitive = boolean | null | number | string;

export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

export interface JsonObject {
  readonly [key: string]: JsonValue;
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

/**
 * Coordinates MCP operations without knowing about A2UI, React Native, or any
 * other renderer. It deliberately routes declared actions instead of loading
 * executable code from a server.
 */
export class McpNativeRuntime {
  readonly #client: McpClient;

  constructor(client: McpClient) {
    this.#client = client;
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

  dispatch(action: McpNativeAction): Promise<McpToolCallResult> {
    return this.callTool(action.name, action.arguments ?? {});
  }
}
