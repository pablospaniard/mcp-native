import { JSON_MAX_STRING_LENGTH, parseJsonObject } from "@mcp-native/core";
import type {
  JsonObject,
  JsonValue,
  McpReadResourceResult,
  McpTool,
  McpToolCallResult,
} from "@mcp-native/core";

import {
  MCP_APPS_MAX_TOOLS,
  MCP_APPS_PROTOCOL_VERSION,
  McpAppsError,
  isMcpAppsToolCallableByApp,
  parseMcpAppsToolMeta,
} from "./apps.js";
import type { McpAppsResource } from "./apps.js";
import type { McpAppsNativeSandboxConfiguration } from "./sandbox.js";

export const MCP_APPS_MAX_BRIDGE_MESSAGE_LENGTH = 1_048_576;
export const MCP_APPS_MAX_PENDING_REQUESTS = 128;

export type McpAppsDisplayMode = "fullscreen" | "inline" | "pip";
export type McpAppsBridgeState =
  | "awaiting-initialize"
  | "awaiting-initialized"
  | "ready"
  | "closing"
  | "closed";
export type McpAppsContentModality =
  | "audio"
  | "image"
  | "resource"
  | "resourceLink"
  | "structuredContent"
  | "text";

export interface McpAppsBridgeHandlers {
  readonly callTool?: (
    name: string,
    arguments_: JsonObject,
    requestMeta?: JsonObject,
  ) => McpToolCallResult | Promise<McpToolCallResult>;
  readonly readResource?: (
    uri: string,
    requestMeta?: JsonObject,
  ) => McpReadResourceResult | Promise<McpReadResourceResult>;
  readonly openLink?: (url: string) => boolean | Promise<boolean>;
  readonly downloadFile?: (contents: readonly JsonObject[]) => void | Promise<void>;
  readonly sendMessage?: (message: JsonObject) => void | Promise<void>;
  readonly updateModelContext?: (context: JsonObject) => void | Promise<void>;
  readonly requestDisplayMode?: (
    mode: McpAppsDisplayMode,
  ) => McpAppsDisplayMode | Promise<McpAppsDisplayMode>;
  readonly log?: (message: JsonObject) => void | Promise<void>;
  readonly sizeChanged?: (size: { readonly width?: number; readonly height?: number }) => void;
  readonly requestTeardown?: () => void | Promise<void>;
}

export interface McpAppsBridgeOptions {
  readonly postMessage: (serializedMessage: string) => void | Promise<void>;
  readonly hostInfo: {
    readonly name: string;
    readonly version: string;
    readonly title?: string;
    readonly websiteUrl?: string;
  };
  readonly hostContext?: unknown;
  readonly tools?: readonly McpTool[];
  readonly resource: McpAppsResource;
  readonly sandbox: McpAppsNativeSandboxConfiguration;
  readonly handlers?: McpAppsBridgeHandlers;
  readonly messageModalities?: readonly McpAppsContentModality[];
  readonly updateModelContextModalities?: readonly McpAppsContentModality[];
  readonly onProtocolError?: (error: McpAppsBridgeError) => void;
  readonly onTeardownComplete?: (result: "error" | "success") => void;
}

export class McpAppsBridgeError extends McpAppsError {
  readonly code: number;

  constructor(message: string, code = -32602, options?: ErrorOptions) {
    super(message, options);
    this.name = "McpAppsBridgeError";
    this.code = code;
  }
}

type RequestId = number | string;
type ParsedRpc = {
  readonly id?: RequestId;
  readonly method?: string;
  readonly params?: JsonValue;
  readonly result?: JsonValue;
  readonly error?: JsonObject;
};

/**
 * Stable MCP Apps host lifecycle for a single native WebView. Incoming data is
 * schema-shaped and bounded before any host callback runs.
 */
export class McpAppsBridge {
  readonly #postMessage: McpAppsBridgeOptions["postMessage"];
  readonly #hostInfo: JsonObject;
  readonly #hostContext: JsonObject;
  readonly #hostCapabilities: JsonObject;
  readonly #tools: ReadonlyMap<string, McpTool>;
  readonly #handlers: McpAppsBridgeHandlers;
  readonly #onProtocolError: McpAppsBridgeOptions["onProtocolError"];
  readonly #onTeardownComplete: McpAppsBridgeOptions["onTeardownComplete"];
  #state: McpAppsBridgeState = "awaiting-initialize";
  #appDisplayModes: readonly McpAppsDisplayMode[] = [];
  #toolInputSent = false;
  #toolTerminalSent = false;
  #toolLifecycleTail: Promise<void> = Promise.resolve();
  #pendingInboundMessages = 0;
  #teardownId: string | undefined;
  #nextRequestId = 1;

  constructor(options: McpAppsBridgeOptions) {
    if (typeof options.postMessage !== "function") {
      throw new McpAppsBridgeError("Expected postMessage to be a function");
    }
    this.#postMessage = options.postMessage;
    this.#hostInfo = parseImplementation(options.hostInfo, "hostInfo");
    this.#hostContext =
      options.hostContext === undefined
        ? { platform: "mobile" }
        : parseHostContext(options.hostContext, "hostContext");
    this.#handlers = options.handlers ?? {};
    this.#hostCapabilities = createHostCapabilities(options);
    this.#tools = createToolMap(options.tools ?? []);
    this.#onProtocolError = options.onProtocolError;
    this.#onTeardownComplete = options.onTeardownComplete;
  }

  get state(): McpAppsBridgeState {
    return this.#state;
  }

  get hostCapabilities(): JsonObject {
    return this.#hostCapabilities;
  }

  /** Receives a serialized native WebView message or an already-decoded test value. */
  async receive(value: unknown): Promise<void> {
    let message: ParsedRpc;
    try {
      message = parseRpcMessage(value);
    } catch (error) {
      const bridgeError = asBridgeError(error, -32700);
      this.#onProtocolError?.(bridgeError);
      throw bridgeError;
    }

    if (message.method === undefined) {
      this.#handleResponse(message);
      return;
    }

    if (this.#pendingInboundMessages >= MCP_APPS_MAX_PENDING_REQUESTS) {
      const bridgeError = new McpAppsBridgeError(
        `MCP Apps bridge exceeds ${MCP_APPS_MAX_PENDING_REQUESTS} concurrent inbound messages`,
        -32000,
      );
      this.#onProtocolError?.(bridgeError);
      throw bridgeError;
    }
    this.#pendingInboundMessages += 1;
    try {
      if (message.id === undefined) {
        try {
          await this.#handleNotification(message.method, message.params);
        } catch (error) {
          const bridgeError = asBridgeError(error);
          this.#onProtocolError?.(bridgeError);
          throw bridgeError;
        }
        return;
      }

      try {
        const result = await this.#handleRequest(message.method, message.params);
        await this.#send({ jsonrpc: "2.0", id: message.id, result });
      } catch (error) {
        const bridgeError = asBridgeError(error);
        this.#onProtocolError?.(bridgeError);
        await this.#send({
          jsonrpc: "2.0",
          id: message.id,
          error: { code: bridgeError.code, message: bridgeError.message },
        });
      }
    } finally {
      this.#pendingInboundMessages -= 1;
    }
  }

  async sendToolInput(arguments_: unknown = {}): Promise<void> {
    const argumentsObject = parseBoundedObject(arguments_, "tool input arguments");
    await this.#enqueueToolLifecycle(async () => {
      this.#assertReady("ui/notifications/tool-input");
      if (this.#toolInputSent || this.#toolTerminalSent) {
        throw new McpAppsBridgeError("Complete tool input may be sent exactly once", -32002);
      }
      // Delivery failure is ambiguous, so reserve exactly-once state before transport and never retry.
      this.#toolInputSent = true;
      await this.#sendNotification("ui/notifications/tool-input", { arguments: argumentsObject });
    });
  }

  async sendPartialToolInput(arguments_: unknown = {}): Promise<void> {
    const argumentsObject = parseBoundedObject(arguments_, "partial tool input arguments");
    await this.#enqueueToolLifecycle(async () => {
      this.#assertReady("ui/notifications/tool-input-partial");
      if (this.#toolInputSent || this.#toolTerminalSent) {
        throw new McpAppsBridgeError("Partial tool input is closed after complete input", -32002);
      }
      await this.#sendNotification("ui/notifications/tool-input-partial", {
        arguments: argumentsObject,
      });
    });
  }

  async sendToolResult(result: McpToolCallResult): Promise<void> {
    const parsedResult = parseBoundedObject(result, "tool result");
    await this.#enqueueToolLifecycle(async () => {
      this.#assertReady("ui/notifications/tool-result");
      if (!this.#toolInputSent || this.#toolTerminalSent) {
        throw new McpAppsBridgeError(
          "Tool result requires complete input and may be sent exactly once",
          -32002,
        );
      }
      // A rejected transport may have delivered; retain terminal state to prevent duplication.
      this.#toolTerminalSent = true;
      await this.#sendNotification("ui/notifications/tool-result", parsedResult);
    });
  }

  async sendToolCancelled(reason?: string): Promise<void> {
    const parsedReason =
      reason === undefined ? undefined : expectBoundedString(reason, "tool cancellation reason");
    await this.#enqueueToolLifecycle(async () => {
      this.#assertReady("ui/notifications/tool-cancelled");
      if (this.#toolTerminalSent) {
        throw new McpAppsBridgeError("Tool terminal notification may be sent exactly once", -32002);
      }
      this.#toolTerminalSent = true;
      await this.#sendNotification("ui/notifications/tool-cancelled", {
        ...(parsedReason === undefined ? {} : { reason: parsedReason }),
      });
    });
  }

  async #enqueueToolLifecycle(operation: () => Promise<void>): Promise<void> {
    const result = this.#toolLifecycleTail.then(operation);
    this.#toolLifecycleTail = result.catch(() => {
      // Keep the queue usable while returning the original rejection to its caller.
    });
    await result;
  }

  async sendHostContextChanged(context: unknown): Promise<void> {
    this.#assertReady("ui/notifications/host-context-changed");
    await this.#sendNotification(
      "ui/notifications/host-context-changed",
      parseHostContext(context, "host context update"),
    );
  }

  /** Begins graceful teardown. The View's matching response closes the bridge. */
  async requestResourceTeardown(): Promise<RequestId> {
    this.#assertReady("ui/resource-teardown");
    if (this.#teardownId !== undefined) {
      throw new McpAppsBridgeError("Resource teardown is already pending", -32002);
    }
    const id = `mcp-native-teardown-${this.#nextRequestId}`;
    this.#nextRequestId += 1;
    if (this.#nextRequestId > MCP_APPS_MAX_PENDING_REQUESTS) this.#nextRequestId = 1;
    this.#teardownId = id;
    this.#state = "closing";
    await this.#send({ jsonrpc: "2.0", id, method: "ui/resource-teardown", params: {} });
    return id;
  }

  close(): void {
    this.#state = "closed";
    this.#teardownId = undefined;
  }

  async #handleRequest(method: string, params: JsonValue | undefined): Promise<JsonValue> {
    if (method === "ui/initialize") {
      return this.#initialize(params);
    }
    this.#assertReady(method);
    switch (method) {
      case "ping":
        expectEmptyParams(params, method);
        return {};
      case "tools/call":
        return this.#callTool(params);
      case "resources/read":
        return this.#readResource(params);
      case "ui/open-link":
        return this.#openLink(params);
      case "ui/download-file":
        return this.#downloadFile(params);
      case "ui/message":
        return this.#message(params);
      case "ui/update-model-context":
        return this.#updateModelContext(params);
      case "ui/request-display-mode":
        return this.#requestDisplayMode(params);
      default:
        throw new McpAppsBridgeError(`Unsupported MCP Apps request method: ${method}`, -32601);
    }
  }

  async #handleNotification(method: string, params: JsonValue | undefined): Promise<void> {
    if (method === "ui/notifications/initialized") {
      expectEmptyParams(params, method);
      if (this.#state !== "awaiting-initialized") {
        throw new McpAppsBridgeError("Unexpected initialized notification", -32002);
      }
      this.#state = "ready";
      return;
    }
    this.#assertReady(method);
    switch (method) {
      case "notifications/message": {
        const message = expectParamsObject(params, method);
        if (this.#handlers.log === undefined) {
          throw new McpAppsBridgeError("Logging is not enabled by this host", -32601);
        }
        await this.#handlers.log(message);
        return;
      }
      case "ui/notifications/size-changed": {
        const size = expectParamsObject(params, method);
        expectOnlyKeys(size, ["width", "height"], `${method}.params`);
        const width = optionalDimension(size.width, `${method}.params.width`);
        const height = optionalDimension(size.height, `${method}.params.height`);
        if (width === undefined && height === undefined) {
          throw new McpAppsBridgeError("Size notification requires width or height");
        }
        this.#handlers.sizeChanged?.({
          ...(width === undefined ? {} : { width }),
          ...(height === undefined ? {} : { height }),
        });
        return;
      }
      case "ui/notifications/request-teardown":
        expectEmptyParams(params, method);
        if (this.#handlers.requestTeardown === undefined) {
          throw new McpAppsBridgeError("App-initiated teardown is not enabled", -32601);
        }
        await this.#handlers.requestTeardown();
        return;
      default:
        throw new McpAppsBridgeError(`Unsupported MCP Apps notification method: ${method}`, -32601);
    }
  }

  #initialize(params: JsonValue | undefined): JsonObject {
    if (this.#state !== "awaiting-initialize") {
      throw new McpAppsBridgeError("MCP Apps View may initialize exactly once", -32002);
    }
    const initialize = expectParamsObject(params, "ui/initialize");
    expectOnlyKeys(
      initialize,
      ["appInfo", "appCapabilities", "protocolVersion"],
      "ui/initialize.params",
    );
    if (initialize.protocolVersion !== MCP_APPS_PROTOCOL_VERSION) {
      throw new McpAppsBridgeError(
        `Unsupported MCP Apps protocol version: ${String(initialize.protocolVersion)}`,
        -32602,
      );
    }
    parseImplementation(initialize.appInfo, "ui/initialize.params.appInfo");
    this.#appDisplayModes = parseAppCapabilities(
      initialize.appCapabilities,
      "ui/initialize.params.appCapabilities",
    );
    this.#state = "awaiting-initialized";
    return {
      protocolVersion: MCP_APPS_PROTOCOL_VERSION,
      hostInfo: this.#hostInfo,
      hostCapabilities: this.#hostCapabilities,
      hostContext: this.#hostContext,
    };
  }

  async #callTool(params: JsonValue | undefined): Promise<JsonObject> {
    if (this.#handlers.callTool === undefined) {
      throw new McpAppsBridgeError("Server tool proxying is not enabled", -32601);
    }
    const call = expectParamsObject(params, "tools/call");
    expectOnlyKeys(call, ["name", "arguments", "_meta"], "tools/call.params");
    const name = expectBoundedString(call.name, "tools/call.params.name");
    const tool = this.#tools.get(name);
    if (tool === undefined) {
      throw new McpAppsBridgeError(
        `App cannot call undeclared tool ${JSON.stringify(name)}`,
        -32001,
      );
    }
    if (!isMcpAppsToolCallableByApp(tool)) {
      throw new McpAppsBridgeError(`Tool is not visible to apps: ${name}`, -32001);
    }
    const arguments_ =
      call.arguments === undefined
        ? {}
        : parseBoundedObject(call.arguments, "tools/call.params.arguments");
    const requestMeta =
      call["_meta"] === undefined
        ? undefined
        : parseBoundedObject(call["_meta"], "tools/call.params._meta");
    const result = await this.#handlers.callTool(name, arguments_, requestMeta);
    return parseBoundedObject(result, "tools/call result");
  }

  async #readResource(params: JsonValue | undefined): Promise<JsonObject> {
    if (this.#handlers.readResource === undefined) {
      throw new McpAppsBridgeError("Server resource proxying is not enabled", -32601);
    }
    const read = expectParamsObject(params, "resources/read");
    expectOnlyKeys(read, ["uri", "_meta"], "resources/read.params");
    const uri = expectBoundedString(read.uri, "resources/read.params.uri");
    const requestMeta =
      read["_meta"] === undefined
        ? undefined
        : parseBoundedObject(read["_meta"], "resources/read.params._meta");
    const result = await this.#handlers.readResource(uri, requestMeta);
    return parseBoundedObject(result, "resources/read result");
  }

  async #openLink(params: JsonValue | undefined): Promise<JsonObject> {
    if (this.#handlers.openLink === undefined) {
      throw new McpAppsBridgeError("External links are not enabled", -32601);
    }
    const request = expectParamsObject(params, "ui/open-link");
    expectOnlyKeys(request, ["url"], "ui/open-link.params");
    const url = expectExternalUrl(request.url, "ui/open-link.params.url");
    if ((await this.#handlers.openLink(url)) !== true) {
      throw new McpAppsBridgeError("External link denied by host policy", -32001);
    }
    return {};
  }

  async #downloadFile(params: JsonValue | undefined): Promise<JsonObject> {
    if (this.#handlers.downloadFile === undefined) {
      throw new McpAppsBridgeError("File downloads are not enabled", -32601);
    }
    const request = expectParamsObject(params, "ui/download-file");
    expectOnlyKeys(request, ["contents"], "ui/download-file.params");
    if (
      !Array.isArray(request.contents) ||
      request.contents.length === 0 ||
      request.contents.length > 16
    ) {
      throw new McpAppsBridgeError("Download request requires 1 to 16 resource content blocks");
    }
    const contents = request.contents.map((content, index) =>
      parseDownloadContent(content, `ui/download-file.params.contents[${index}]`),
    );
    await this.#handlers.downloadFile(contents);
    return {};
  }

  async #message(params: JsonValue | undefined): Promise<JsonObject> {
    if (this.#handlers.sendMessage === undefined || this.#hostCapabilities.message === undefined) {
      throw new McpAppsBridgeError("App messages are not enabled", -32601);
    }
    const message = expectParamsObject(params, "ui/message");
    expectOnlyKeys(message, ["role", "content"], "ui/message.params");
    if (message.role !== "user") {
      throw new McpAppsBridgeError('Expected role "user" at ui/message.params.role');
    }
    validateContentArray(
      message.content,
      "ui/message.params.content",
      this.#hostCapabilities.message as JsonObject,
    );
    await this.#handlers.sendMessage(message);
    return {};
  }

  async #updateModelContext(params: JsonValue | undefined): Promise<JsonObject> {
    if (
      this.#handlers.updateModelContext === undefined ||
      this.#hostCapabilities.updateModelContext === undefined
    ) {
      throw new McpAppsBridgeError("Model context updates are not enabled", -32601);
    }
    const context = expectParamsObject(params, "ui/update-model-context");
    expectOnlyKeys(context, ["content", "structuredContent"], "ui/update-model-context.params");
    if (context.content === undefined && context.structuredContent === undefined) {
      throw new McpAppsBridgeError(
        "Model context update must contain content or structuredContent",
      );
    }
    if (context.content !== undefined) {
      validateContentArray(
        context.content,
        "ui/update-model-context.params.content",
        this.#hostCapabilities.updateModelContext as JsonObject,
      );
    }
    if (context.structuredContent !== undefined) {
      if (
        !Object.hasOwn(this.#hostCapabilities.updateModelContext as JsonObject, "structuredContent")
      ) {
        throw new McpAppsBridgeError("Structured model context is not enabled by this host");
      }
      parseBoundedObject(
        context.structuredContent,
        "ui/update-model-context.params.structuredContent",
      );
    }
    await this.#handlers.updateModelContext(context);
    return {};
  }

  async #requestDisplayMode(params: JsonValue | undefined): Promise<JsonObject> {
    const request = expectParamsObject(params, "ui/request-display-mode");
    expectOnlyKeys(request, ["mode"], "ui/request-display-mode.params");
    const requested = expectDisplayMode(request.mode, "ui/request-display-mode.params.mode");
    const available = getHostDisplayModes(this.#hostContext);
    if (
      this.#handlers.requestDisplayMode === undefined ||
      !this.#appDisplayModes.includes(requested) ||
      !available.includes(requested)
    ) {
      return { mode: getCurrentDisplayMode(this.#hostContext) };
    }
    const actual = expectDisplayMode(
      await this.#handlers.requestDisplayMode(requested),
      "display mode handler result",
    );
    if (!this.#appDisplayModes.includes(actual) || !available.includes(actual)) {
      throw new McpAppsBridgeError("Display mode handler returned an unnegotiated mode", -32002);
    }
    return { mode: actual };
  }

  #handleResponse(message: ParsedRpc): void {
    if (
      this.#state !== "closing" ||
      this.#teardownId === undefined ||
      message.id !== this.#teardownId
    ) {
      throw new McpAppsBridgeError("Unexpected MCP Apps JSON-RPC response", -32600);
    }
    const success = message.error === undefined && message.result !== undefined;
    this.#state = "closed";
    this.#teardownId = undefined;
    this.#onTeardownComplete?.(success ? "success" : "error");
  }

  #assertReady(method: string): void {
    if (this.#state !== "ready") {
      throw new McpAppsBridgeError(
        `MCP Apps method ${method} is unavailable while bridge state is ${this.#state}`,
        -32002,
      );
    }
  }

  async #sendNotification(method: string, params: JsonObject): Promise<void> {
    await this.#send({ jsonrpc: "2.0", method, params });
  }

  async #send(message: JsonObject): Promise<void> {
    const serialized = JSON.stringify(parseBoundedObject(message, "outbound bridge message"));
    if (serialized.length > MCP_APPS_MAX_BRIDGE_MESSAGE_LENGTH) {
      throw new McpAppsBridgeError("Outbound bridge message exceeds its serialized size limit");
    }
    await this.#postMessage(serialized);
  }
}

function createHostCapabilities(options: McpAppsBridgeOptions): JsonObject {
  const handlers = options.handlers ?? {};
  const permissions: Record<string, JsonObject> = {};
  for (const permission of options.sandbox.grantedPermissions) {
    Object.defineProperty(permissions, permission, {
      value: {},
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  const sandbox: JsonObject = {
    permissions,
    ...(options.resource.meta.csp === undefined
      ? {}
      : { csp: parseBoundedObject(options.resource.meta.csp, "resource CSP") }),
  };
  return {
    ...(handlers.openLink === undefined ? {} : { openLinks: {} }),
    ...(handlers.downloadFile === undefined ? {} : { downloadFile: {} }),
    ...(handlers.callTool === undefined ? {} : { serverTools: {} }),
    ...(handlers.readResource === undefined ? {} : { serverResources: {} }),
    ...(handlers.log === undefined ? {} : { logging: {} }),
    sandbox,
    ...(handlers.sendMessage === undefined
      ? {}
      : { message: createModalities(options.messageModalities ?? ["text"]) }),
    ...(handlers.updateModelContext === undefined
      ? {}
      : {
          updateModelContext: createModalities(
            options.updateModelContextModalities ?? ["text", "structuredContent"],
          ),
        }),
  };
}

function createModalities(values: readonly McpAppsContentModality[]): JsonObject {
  const allowed = new Set<McpAppsContentModality>([
    "audio",
    "image",
    "resource",
    "resourceLink",
    "structuredContent",
    "text",
  ]);
  if (values.length === 0 || values.length > allowed.size) {
    throw new McpAppsBridgeError("Capability modalities require 1 to 6 values");
  }
  const result: Record<string, JsonObject> = {};
  for (const value of values) {
    if (!allowed.has(value) || Object.hasOwn(result, value)) {
      throw new McpAppsBridgeError(`Invalid or duplicate capability modality: ${String(value)}`);
    }
    Object.defineProperty(result, value, {
      value: {},
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return result;
}

function createToolMap(tools: readonly McpTool[]): ReadonlyMap<string, McpTool> {
  if (tools.length > MCP_APPS_MAX_TOOLS) {
    throw new McpAppsBridgeError(`Tool list exceeds maximum length of ${MCP_APPS_MAX_TOOLS}`);
  }
  const result = new Map<string, McpTool>();
  for (const tool of tools) {
    parseMcpAppsToolMeta(tool);
    if (result.has(tool.name)) {
      throw new McpAppsBridgeError(`Duplicate bridge tool name: ${tool.name}`);
    }
    result.set(tool.name, tool);
  }
  return result;
}

function parseRpcMessage(value: unknown): ParsedRpc {
  let decoded = value;
  if (typeof value === "string") {
    if (value.length === 0 || value.length > MCP_APPS_MAX_BRIDGE_MESSAGE_LENGTH) {
      throw new McpAppsBridgeError("Bridge message exceeds its serialized size limit", -32700);
    }
    try {
      decoded = JSON.parse(value) as unknown;
    } catch (error) {
      throw new McpAppsBridgeError("Invalid JSON bridge message", -32700, { cause: error });
    }
  }
  const message = parseBoundedObject(decoded, "bridge message");
  if (message.jsonrpc !== "2.0") {
    throw new McpAppsBridgeError('Expected jsonrpc "2.0" at bridge message.jsonrpc', -32600);
  }
  const hasMethod = typeof message.method === "string";
  const hasResult = Object.hasOwn(message, "result");
  const hasError = Object.hasOwn(message, "error");
  if (hasMethod) {
    expectOnlyKeys(message, ["jsonrpc", "id", "method", "params"], "bridge message");
    return {
      ...(message.id === undefined ? {} : { id: parseRequestId(message.id, "bridge message.id") }),
      method: expectBoundedString(message.method, "bridge message.method"),
      ...(message.params === undefined ? {} : { params: message.params }),
    };
  }
  if (message.id === undefined || hasResult === hasError) {
    throw new McpAppsBridgeError("Malformed JSON-RPC response", -32600);
  }
  expectOnlyKeys(message, ["jsonrpc", "id", "result", "error"], "bridge message");
  return {
    id: parseRequestId(message.id, "bridge message.id"),
    ...(hasResult ? { result: message.result } : {}),
    ...(hasError ? { error: parseBoundedObject(message.error, "bridge message.error") } : {}),
  };
}

function parseAppCapabilities(value: unknown, path: string): readonly McpAppsDisplayMode[] {
  const capabilities = parseBoundedObject(value, path);
  expectOnlyKeys(capabilities, ["experimental", "tools", "availableDisplayModes"], path);
  if (capabilities.experimental !== undefined)
    parseBoundedObject(capabilities.experimental, `${path}.experimental`);
  if (capabilities.tools !== undefined) {
    const tools = parseBoundedObject(capabilities.tools, `${path}.tools`);
    expectOnlyKeys(tools, ["listChanged"], `${path}.tools`);
    if (tools.listChanged !== undefined && typeof tools.listChanged !== "boolean") {
      throw new McpAppsBridgeError(`Expected a boolean at ${path}.tools.listChanged`);
    }
  }
  if (capabilities.availableDisplayModes === undefined) return [];
  if (
    !Array.isArray(capabilities.availableDisplayModes) ||
    capabilities.availableDisplayModes.length > 3
  ) {
    throw new McpAppsBridgeError(
      `Expected at most three display modes at ${path}.availableDisplayModes`,
    );
  }
  const result: McpAppsDisplayMode[] = [];
  for (const [index, value_] of capabilities.availableDisplayModes.entries()) {
    const mode = expectDisplayMode(value_, `${path}.availableDisplayModes[${index}]`);
    if (result.includes(mode)) throw new McpAppsBridgeError(`Duplicate display mode ${mode}`);
    result.push(mode);
  }
  return result;
}

function parseImplementation(value: unknown, path: string): JsonObject {
  const implementation = parseBoundedObject(value, path);
  expectBoundedString(implementation.name, `${path}.name`);
  expectBoundedString(implementation.version, `${path}.version`);
  if (implementation.title !== undefined)
    expectBoundedString(implementation.title, `${path}.title`);
  if (implementation.websiteUrl !== undefined) {
    expectExternalUrl(implementation.websiteUrl, `${path}.websiteUrl`);
  }
  return implementation;
}

function parseHostContext(value: unknown, path: string): JsonObject {
  const context = parseBoundedObject(value, path);
  if (context.theme !== undefined && context.theme !== "light" && context.theme !== "dark") {
    throw new McpAppsBridgeError(`Expected light or dark at ${path}.theme`);
  }
  if (context.displayMode !== undefined)
    expectDisplayMode(context.displayMode, `${path}.displayMode`);
  if (context.availableDisplayModes !== undefined) {
    if (!Array.isArray(context.availableDisplayModes) || context.availableDisplayModes.length > 3) {
      throw new McpAppsBridgeError(`Expected at most three modes at ${path}.availableDisplayModes`);
    }
    for (const [index, mode] of context.availableDisplayModes.entries()) {
      expectDisplayMode(mode, `${path}.availableDisplayModes[${index}]`);
    }
  }
  if (
    context.platform !== undefined &&
    !["web", "desktop", "mobile"].includes(String(context.platform))
  ) {
    throw new McpAppsBridgeError(`Unsupported platform at ${path}.platform`);
  }
  return context;
}

function validateContentArray(value: unknown, path: string, modalities: JsonObject): void {
  if (!Array.isArray(value) || value.length === 0 || value.length > 64) {
    throw new McpAppsBridgeError(`Expected 1 to 64 content blocks at ${path}`);
  }
  for (const [index, blockValue] of value.entries()) {
    const block = parseBoundedObject(blockValue, `${path}[${index}]`);
    const modality = block.type === "resource_link" ? "resourceLink" : block.type;
    if (
      typeof modality !== "string" ||
      !["text", "image", "audio", "resource", "resourceLink"].includes(modality) ||
      !Object.hasOwn(modalities, modality)
    ) {
      throw new McpAppsBridgeError(`Unsupported content type at ${path}[${index}].type`);
    }
    validateContentBlock(block, `${path}[${index}]`);
  }
}

function parseDownloadContent(value: unknown, path: string): JsonObject {
  const block = parseBoundedObject(value, path);
  if (block.type !== "resource" && block.type !== "resource_link") {
    throw new McpAppsBridgeError(`Expected resource or resource_link at ${path}.type`);
  }
  validateContentBlock(block, path);
  return block;
}

function validateContentBlock(block: JsonObject, path: string): void {
  validateOptionalAnnotations(block.annotations, `${path}.annotations`);
  validateOptionalMeta(block["_meta"], `${path}._meta`);
  switch (block.type) {
    case "text":
      expectOnlyKeys(block, ["type", "text", "annotations", "_meta"], path);
      expectBoundedString(block.text, `${path}.text`);
      break;
    case "image":
    case "audio":
      expectOnlyKeys(block, ["type", "data", "mimeType", "annotations", "_meta"], path);
      expectBoundedString(block.data, `${path}.data`);
      expectBoundedString(block.mimeType, `${path}.mimeType`);
      break;
    case "resource": {
      expectOnlyKeys(block, ["type", "resource", "annotations", "_meta"], path);
      const resource = parseBoundedObject(block.resource, `${path}.resource`);
      expectOnlyKeys(resource, ["uri", "mimeType", "text", "blob", "_meta"], `${path}.resource`);
      expectBoundedString(resource.uri, `${path}.resource.uri`);
      validateOptionalMeta(resource["_meta"], `${path}.resource._meta`);
      if (resource.mimeType !== undefined) {
        expectBoundedString(resource.mimeType, `${path}.resource.mimeType`);
      }
      const hasText = resource.text !== undefined;
      const hasBlob = resource.blob !== undefined;
      if (hasText === hasBlob) {
        throw new McpAppsBridgeError(`Expected exactly one of text or blob at ${path}.resource`);
      }
      expectBoundedString(hasText ? resource.text : resource.blob, `${path}.resource content`);
      break;
    }
    case "resource_link":
      expectOnlyKeys(
        block,
        [
          "type",
          "name",
          "title",
          "uri",
          "description",
          "mimeType",
          "size",
          "icons",
          "annotations",
          "_meta",
        ],
        path,
      );
      expectBoundedString(block.name, `${path}.name`);
      expectBoundedString(block.uri, `${path}.uri`);
      for (const field of ["title", "description", "mimeType"] as const) {
        if (block[field] !== undefined) expectBoundedString(block[field], `${path}.${field}`);
      }
      if (
        block.size !== undefined &&
        (typeof block.size !== "number" || !Number.isSafeInteger(block.size) || block.size < 0)
      ) {
        throw new McpAppsBridgeError(`Expected a non-negative safe integer at ${path}.size`);
      }
      validateOptionalIcons(block.icons, `${path}.icons`);
      break;
    default:
      throw new McpAppsBridgeError(`Unsupported content type at ${path}.type`);
  }
}

function validateOptionalAnnotations(value: JsonValue | undefined, path: string): void {
  if (value === undefined) return;
  const annotations = parseBoundedObject(value, path);
  expectOnlyKeys(annotations, ["audience", "priority", "lastModified"], path);
  if (annotations.audience !== undefined) {
    if (!Array.isArray(annotations.audience) || annotations.audience.length > 2) {
      throw new McpAppsBridgeError(`Expected at most two audience roles at ${path}.audience`);
    }
    for (const [index, role] of annotations.audience.entries()) {
      if (role !== "assistant" && role !== "user") {
        throw new McpAppsBridgeError(`Expected assistant or user at ${path}.audience[${index}]`);
      }
    }
  }
  if (
    annotations.priority !== undefined &&
    (typeof annotations.priority !== "number" ||
      !Number.isFinite(annotations.priority) ||
      annotations.priority < 0 ||
      annotations.priority > 1)
  ) {
    throw new McpAppsBridgeError(`Expected a number from 0 to 1 at ${path}.priority`);
  }
  if (annotations.lastModified !== undefined) {
    expectBoundedString(annotations.lastModified, `${path}.lastModified`);
  }
}

function validateOptionalIcons(value: JsonValue | undefined, path: string): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 64) {
    throw new McpAppsBridgeError(`Expected at most 64 icons at ${path}`);
  }
  for (const [index, iconValue] of value.entries()) {
    const iconPath = `${path}[${index}]`;
    const icon = parseBoundedObject(iconValue, iconPath);
    expectOnlyKeys(icon, ["src", "mimeType", "sizes", "theme"], iconPath);
    expectBoundedString(icon.src, `${iconPath}.src`);
    if (icon.mimeType !== undefined) expectBoundedString(icon.mimeType, `${iconPath}.mimeType`);
    if (icon.sizes !== undefined) {
      if (!Array.isArray(icon.sizes) || icon.sizes.length > 64) {
        throw new McpAppsBridgeError(`Expected at most 64 icon sizes at ${iconPath}.sizes`);
      }
      for (const [sizeIndex, size] of icon.sizes.entries()) {
        expectBoundedString(size, `${iconPath}.sizes[${sizeIndex}]`);
      }
    }
    if (icon.theme !== undefined && icon.theme !== "dark" && icon.theme !== "light") {
      throw new McpAppsBridgeError(`Expected dark or light at ${iconPath}.theme`);
    }
  }
}

function validateOptionalMeta(value: JsonValue | undefined, path: string): void {
  if (value !== undefined) parseBoundedObject(value, path);
}

function expectParamsObject(value: JsonValue | undefined, method: string): JsonObject {
  if (value === undefined) throw new McpAppsBridgeError(`Missing params for ${method}`);
  return parseBoundedObject(value, `${method}.params`);
}

function expectEmptyParams(value: JsonValue | undefined, method: string): void {
  if (value === undefined) return;
  const params = parseBoundedObject(value, `${method}.params`);
  if (Object.keys(params).length !== 0) {
    throw new McpAppsBridgeError(`Expected empty params for ${method}`);
  }
}

function parseBoundedObject(value: unknown, path: string): JsonObject {
  try {
    return parseJsonObject(value, path, {
      maxTotalStringCodeUnits: MCP_APPS_MAX_BRIDGE_MESSAGE_LENGTH,
    });
  } catch (error) {
    throw asBridgeError(error);
  }
}

function parseRequestId(value: unknown, path: string): RequestId {
  if (typeof value === "string") return expectBoundedString(value, path);
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  throw new McpAppsBridgeError(`Expected a string or safe integer at ${path}`, -32600);
}

function expectBoundedString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > JSON_MAX_STRING_LENGTH) {
    throw new McpAppsBridgeError(`Expected a non-empty bounded string at ${path}`);
  }
  return value;
}

function expectDisplayMode(value: unknown, path: string): McpAppsDisplayMode {
  if (value !== "inline" && value !== "fullscreen" && value !== "pip") {
    throw new McpAppsBridgeError(`Expected inline, fullscreen, or pip at ${path}`);
  }
  return value;
}

function optionalDimension(value: unknown, path: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100_000) {
    throw new McpAppsBridgeError(`Expected a finite dimension from 0 to 100000 at ${path}`);
  }
  return value;
}

function expectExternalUrl(value: unknown, path: string): string {
  const urlValue = expectBoundedString(value, path);
  const URLParser = (
    globalThis as {
      URL?: new (value: string) => {
        protocol: string;
        hostname: string;
        username: string;
        password: string;
      };
    }
  ).URL;
  if (URLParser === undefined) throw new McpAppsBridgeError("URL parsing is unavailable");
  let url;
  try {
    url = new URLParser(urlValue);
  } catch (error) {
    throw new McpAppsBridgeError(`Invalid URL at ${path}`, -32602, { cause: error });
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.hostname.length === 0 ||
    url.username.length > 0 ||
    url.password.length > 0
  ) {
    throw new McpAppsBridgeError(`Expected a credential-free HTTP(S) URL at ${path}`);
  }
  return urlValue;
}

function getHostDisplayModes(context: JsonObject): readonly McpAppsDisplayMode[] {
  if (Array.isArray(context.availableDisplayModes)) {
    return context.availableDisplayModes.map((mode, index) =>
      expectDisplayMode(mode, `hostContext.availableDisplayModes[${index}]`),
    );
  }
  return [getCurrentDisplayMode(context)];
}

function getCurrentDisplayMode(context: JsonObject): McpAppsDisplayMode {
  return context.displayMode === undefined
    ? "inline"
    : expectDisplayMode(context.displayMode, "hostContext.displayMode");
}

function expectOnlyKeys(value: JsonObject, allowed: readonly string[], path: string): void {
  const keys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) {
      throw new McpAppsBridgeError(`Unsupported field ${JSON.stringify(key)} at ${path}`);
    }
  }
}

function asBridgeError(error: unknown, code = -32602): McpAppsBridgeError {
  if (error instanceof McpAppsBridgeError) return error;
  const message = error instanceof Error ? error.message : "Invalid MCP Apps bridge value";
  return new McpAppsBridgeError(message, code, { cause: error });
}
