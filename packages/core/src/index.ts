export type JsonPrimitive = boolean | null | number | string;

export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface McpTool {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema: JsonObject;
}

export interface McpContent {
  readonly type: string;
  readonly data: JsonObject;
}

export interface McpToolCallResult {
  readonly content: readonly McpContent[];
  readonly isError?: boolean;
}

export interface McpResource {
  readonly uri: string;
  readonly mimeType?: string;
  readonly text?: string;
  readonly blob?: string;
}

/**
 * The small client boundary consumed by the runtime. SDK-specific clients can
 * implement this interface without coupling the core package to a transport.
 */
export interface McpClient {
  listTools(): Promise<readonly McpTool[]>;
  callTool(name: string, arguments_: JsonObject): Promise<McpToolCallResult>;
  readResource(uri: string): Promise<McpResource>;
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

  listTools(): Promise<readonly McpTool[]> {
    return this.#client.listTools();
  }

  callTool(name: string, arguments_: JsonObject = {}): Promise<McpToolCallResult> {
    return this.#client.callTool(name, arguments_);
  }

  readResource(uri: string): Promise<McpResource> {
    return this.#client.readResource(uri);
  }

  dispatch(action: McpNativeAction): Promise<McpToolCallResult> {
    return this.callTool(action.name, action.arguments ?? {});
  }
}
