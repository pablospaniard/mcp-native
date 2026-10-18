import { parseJsonObject } from "@mcp-native/core";
import type { JsonObject } from "@mcp-native/core";

import { MCP_APPS_MAX_BRIDGE_MESSAGE_LENGTH, McpAppsBridgeError } from "./bridge.js";
import { McpAppsError } from "./apps.js";
import type { McpAppsPermission, McpAppsResource } from "./apps.js";

export const MCP_APPS_SANDBOX_PROXY_READY_METHOD = "ui/notifications/sandbox-proxy-ready" as const;
export const MCP_APPS_SANDBOX_RESOURCE_READY_METHOD =
  "ui/notifications/sandbox-resource-ready" as const;

const INNER_SANDBOX = "allow-scripts allow-forms";
const OUTER_SANDBOX = "allow-scripts allow-same-origin";
const browserSandboxes = new WeakSet<object>();
const browserResourceReady = new WeakMap<object, JsonObject>();

export interface McpAppsBrowserSandboxPolicy {
  /** Exact origin of the host page. */
  readonly hostOrigin: string;
  /** Host-controlled sandbox-proxy document. It must use a different origin. */
  readonly proxyUrl: string;
  /** Sensitive browser features explicitly approved by the host. */
  readonly grantedPermissions?: readonly McpAppsPermission[];
}

export interface McpAppsBrowserSandboxConfiguration {
  readonly proxyFrame: {
    readonly src: string;
    readonly origin: string;
    readonly sandbox: typeof OUTER_SANDBOX;
    readonly referrerPolicy: "strict-origin";
  };
  readonly viewFrame: {
    readonly sandbox: typeof INNER_SANDBOX;
    readonly allow: string;
  };
  readonly grantedPermissions: readonly McpAppsPermission[];
  readonly resourceReady: JsonObject;
}

export interface McpAppsBrowserMessageEvent {
  readonly origin: string;
  readonly source: object | null;
  readonly data: unknown;
}

export interface McpAppsBrowserMessageRouter {
  readonly ready: boolean;
  receive(event: McpAppsBrowserMessageEvent): Promise<void>;
  send(message: unknown): Promise<void>;
}

export interface McpAppsBrowserMessageCallbacks {
  readonly proxySource: object;
  readonly postToProxy: (message: JsonObject, targetOrigin: string) => void | Promise<void>;
  readonly receiveFromView: (message: JsonObject) => void | Promise<void>;
}

/**
 * Creates the closed browser counterpart to the native WebView sandbox.
 * The outer proxy is host-controlled and cross-origin; server HTML is confined
 * to an opaque-origin inner iframe without same-origin or top-navigation grants.
 */
export function createMcpAppsBrowserSandbox(
  resource: McpAppsResource,
  policy: McpAppsBrowserSandboxPolicy,
): McpAppsBrowserSandboxConfiguration {
  const hostOrigin = expectOrigin(policy.hostOrigin, "hostOrigin");
  const proxy = expectProxyUrl(policy.proxyUrl);
  if (proxy.origin === hostOrigin) {
    throw new McpAppsError("MCP Apps sandbox proxy must use a different origin from its host");
  }
  const grantedPermissions = selectPermissions(
    resource.meta.permissions,
    policy.grantedPermissions ?? [],
  );
  const permissions = Object.fromEntries(grantedPermissions.map((permission) => [permission, {}]));
  const resourceReady = freezeJson(
    parseBrowserMessage(
      {
        jsonrpc: "2.0",
        method: MCP_APPS_SANDBOX_RESOURCE_READY_METHOD,
        params: {
          html: resource.html,
          sandbox: INNER_SANDBOX,
          ...(resource.meta.csp === undefined ? {} : { csp: resource.meta.csp }),
          ...(grantedPermissions.length === 0 ? {} : { permissions }),
        },
      },
      "sandbox resource-ready notification",
    ),
  );
  const configuration: McpAppsBrowserSandboxConfiguration = Object.freeze({
    proxyFrame: Object.freeze({
      src: proxy.href,
      origin: proxy.origin,
      sandbox: OUTER_SANDBOX,
      referrerPolicy: "strict-origin" as const,
    }),
    viewFrame: Object.freeze({
      sandbox: INNER_SANDBOX,
      allow: grantedPermissions.map(toPermissionsPolicyName).join("; "),
    }),
    grantedPermissions,
    resourceReady,
  });
  browserSandboxes.add(configuration);
  browserResourceReady.set(configuration, resourceReady);
  return configuration;
}

export function isMcpAppsBrowserSandboxConfiguration(
  value: unknown,
): value is McpAppsBrowserSandboxConfiguration {
  return value !== null && typeof value === "object" && browserSandboxes.has(value);
}

/** Routes only messages from the exact proxy window and origin. */
export function createMcpAppsBrowserMessageRouter(
  sandbox: McpAppsBrowserSandboxConfiguration,
  callbacks: McpAppsBrowserMessageCallbacks,
): McpAppsBrowserMessageRouter {
  if (!isMcpAppsBrowserSandboxConfiguration(sandbox)) {
    throw new McpAppsError(
      "Browser message routing requires an opaque createMcpAppsBrowserSandbox result",
    );
  }
  if (
    callbacks === null ||
    typeof callbacks !== "object" ||
    callbacks.proxySource === null ||
    typeof callbacks.proxySource !== "object" ||
    typeof callbacks.postToProxy !== "function" ||
    typeof callbacks.receiveFromView !== "function"
  ) {
    throw new McpAppsError("Invalid MCP Apps browser message callbacks");
  }
  const proxySource = callbacks.proxySource;
  const postToProxy = callbacks.postToProxy;
  const receiveFromView = callbacks.receiveFromView;
  let ready = false;
  return {
    get ready() {
      return ready;
    },
    async receive(event) {
      if (
        event === null ||
        typeof event !== "object" ||
        event.source !== proxySource ||
        event.origin !== sandbox.proxyFrame.origin
      ) {
        throw new McpAppsBridgeError(
          "Rejected MCP Apps message from an unexpected source or origin",
        );
      }
      const message = parseBrowserMessage(event.data, "browser sandbox message");
      if (!ready) {
        expectProxyReady(message);
        ready = true;
        await postToProxy(browserResourceReady.get(sandbox)!, sandbox.proxyFrame.origin);
        return;
      }
      if (isSandboxMethod(message.method)) {
        throw new McpAppsBridgeError("Reserved sandbox messages cannot be forwarded by a View");
      }
      await receiveFromView(message);
    },
    async send(value) {
      if (!ready) {
        throw new McpAppsBridgeError("MCP Apps sandbox proxy is not ready", -32002);
      }
      const message = parseBrowserMessage(value, "browser host message");
      if (isSandboxMethod(message.method)) {
        throw new McpAppsBridgeError(
          "Reserved sandbox messages are managed by the browser adapter",
        );
      }
      await postToProxy(message, sandbox.proxyFrame.origin);
    },
  };
}

function expectProxyReady(message: JsonObject): void {
  if (
    message.jsonrpc !== "2.0" ||
    message.method !== MCP_APPS_SANDBOX_PROXY_READY_METHOD ||
    Object.keys(message).some((key) => !["jsonrpc", "method", "params"].includes(key)) ||
    message.params === null ||
    typeof message.params !== "object" ||
    Array.isArray(message.params) ||
    Object.keys(message.params).length !== 0
  ) {
    throw new McpAppsBridgeError("Expected the exact sandbox-proxy-ready notification", -32600);
  }
}

function parseBrowserMessage(value: unknown, path: string): JsonObject {
  let decoded = value;
  if (typeof value === "string") {
    if (value.length === 0 || value.length > MCP_APPS_MAX_BRIDGE_MESSAGE_LENGTH) {
      throw new McpAppsBridgeError(`${path} exceeds its serialized size limit`, -32700);
    }
    try {
      decoded = JSON.parse(value) as unknown;
    } catch (error) {
      throw new McpAppsBridgeError(`Invalid JSON at ${path}`, -32700, { cause: error });
    }
  }
  let message: JsonObject;
  try {
    message = parseJsonObject(decoded, path, {
      maxTotalStringCodeUnits: MCP_APPS_MAX_BRIDGE_MESSAGE_LENGTH,
    });
  } catch (error) {
    throw new McpAppsBridgeError(`Invalid ${path}`, -32600, { cause: error });
  }
  if (JSON.stringify(message).length > MCP_APPS_MAX_BRIDGE_MESSAGE_LENGTH) {
    throw new McpAppsBridgeError(`${path} exceeds its serialized size limit`, -32600);
  }
  return message;
}

function isSandboxMethod(value: unknown): boolean {
  return typeof value === "string" && value.startsWith("ui/notifications/sandbox-");
}

function freezeJson<T extends JsonObject>(value: T): T {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === "object") {
      freezeJsonValue(child);
    }
  }
  return Object.freeze(value);
}

function freezeJsonValue(value: JsonObject | readonly unknown[]): void {
  if (Array.isArray(value)) {
    for (const child of value) {
      if (child !== null && typeof child === "object") {
        freezeJsonValue(child as JsonObject | readonly unknown[]);
      }
    }
    Object.freeze(value);
    return;
  }
  freezeJson(value as JsonObject);
}

function selectPermissions(
  requested: McpAppsResource["meta"]["permissions"],
  granted: readonly McpAppsPermission[],
): readonly McpAppsPermission[] {
  if (!Array.isArray(granted) || granted.length > 4) {
    throw new McpAppsError("Browser sandbox grants must contain at most four permissions");
  }
  const result: McpAppsPermission[] = [];
  for (const permission of granted) {
    if (!isPermission(permission) || result.includes(permission)) {
      throw new McpAppsError(
        `Invalid or duplicate browser permission grant: ${String(permission)}`,
      );
    }
    if (requested?.[permission] !== undefined) result.push(permission);
  }
  return Object.freeze(result);
}

function isPermission(value: unknown): value is McpAppsPermission {
  return ["camera", "clipboardWrite", "geolocation", "microphone"].includes(String(value));
}

function toPermissionsPolicyName(permission: McpAppsPermission): string {
  return permission === "clipboardWrite" ? "clipboard-write" : permission;
}

function expectOrigin(value: unknown, path: string): string {
  if (typeof value !== "string") throw new McpAppsError(`Expected a string at ${path}`);
  const url = parseUrl(value, path);
  if (!isAllowedWebUrl(url) || url.origin !== value) {
    throw new McpAppsError(`${path} must be an exact secure or loopback HTTP origin`);
  }
  return value;
}

type ParsedUrl = {
  readonly hash: string;
  readonly hostname: string;
  readonly href: string;
  readonly origin: string;
  readonly password: string;
  readonly protocol: string;
  readonly username: string;
};

function expectProxyUrl(value: unknown): ParsedUrl {
  if (typeof value !== "string") throw new McpAppsError("Expected a string at proxyUrl");
  const url = parseUrl(value, "proxyUrl");
  if (!isAllowedWebUrl(url) || url.hash.length !== 0) {
    throw new McpAppsError("proxyUrl must be a fragment-free secure or loopback HTTP URL");
  }
  return url;
}

function isAllowedWebUrl(url: ParsedUrl): boolean {
  const loopback =
    url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  return (
    (url.protocol === "https:" || (url.protocol === "http:" && loopback)) &&
    url.hostname.length > 0 &&
    url.username.length === 0 &&
    url.password.length === 0
  );
}

function parseUrl(value: string, path: string): ParsedUrl {
  const URLParser = (globalThis as { URL?: new (value: string) => ParsedUrl }).URL;
  if (URLParser === undefined) throw new McpAppsError("URL parsing is unavailable");
  try {
    return new URLParser(value);
  } catch (error) {
    throw new McpAppsError(`Invalid URL at ${path}`, { cause: error });
  }
}
