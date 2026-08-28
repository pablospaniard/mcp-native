import { JSON_MAX_STRING_LENGTH, negotiateMcpExtension, parseJsonObject } from "@mcp-native/core";
import type {
  JsonObject,
  McpExtensionSettings,
  McpReadResourceResult,
  McpResource,
  McpTool,
} from "@mcp-native/core";

/** Stable MCP Apps extension identifier. */
export const MCP_APPS_EXTENSION_ID = "io.modelcontextprotocol/ui" as const;
/** Stable MCP Apps protocol revision implemented by this package. */
export const MCP_APPS_PROTOCOL_VERSION = "2026-01-26" as const;
/** The only resource media type in the stable MCP Apps profile. */
export const MCP_APPS_MIME_TYPE = "text/html;profile=mcp-app" as const;
/** Maximum decoded HTML accepted from one Apps resource. */
export const MCP_APPS_MAX_HTML_LENGTH = 2_097_152;
/** Maximum number of origins accepted across one resource CSP. */
export const MCP_APPS_MAX_CSP_DOMAINS = 64;
/** Maximum number of bridge-visible tools retained for one Apps view. */
export const MCP_APPS_MAX_TOOLS = 1_024;

const mcpAppsMimeTypes = Object.freeze([MCP_APPS_MIME_TYPE]);
const mcpAppsSettings = Object.freeze({ mimeTypes: mcpAppsMimeTypes }) satisfies JsonObject;

/** Reuse this exact map for SDK advertisement and stable Apps negotiation. */
export const MCP_APPS_EXTENSION_CAPABILITIES: McpExtensionSettings = Object.freeze({
  [MCP_APPS_EXTENSION_ID]: mcpAppsSettings,
});

export type McpAppsNegotiation =
  | {
      readonly kind: "fallback";
      readonly identifier: typeof MCP_APPS_EXTENSION_ID;
      readonly reason: "client-unsupported" | "server-unsupported" | "incompatible-settings";
    }
  | {
      readonly kind: "negotiated";
      readonly identifier: typeof MCP_APPS_EXTENSION_ID;
      readonly protocolVersion: typeof MCP_APPS_PROTOCOL_VERSION;
      readonly mimeType: typeof MCP_APPS_MIME_TYPE;
    };

export type McpAppsGrant = Extract<McpAppsNegotiation, { kind: "negotiated" }>;

/** Negotiates the stable HTML profile only when both peers explicitly declare it. */
export function negotiateMcpApps(
  clientExtensions: unknown,
  serverExtensions: unknown,
): McpAppsNegotiation {
  const negotiation = negotiateMcpExtension(
    MCP_APPS_EXTENSION_ID,
    clientExtensions,
    serverExtensions,
  );
  if (negotiation.kind === "fallback") {
    return { ...negotiation, identifier: MCP_APPS_EXTENSION_ID };
  }
  if (
    !supportsStableAppsMimeType(negotiation.clientSettings) ||
    !supportsStableAppsMimeType(negotiation.serverSettings)
  ) {
    return {
      kind: "fallback",
      identifier: MCP_APPS_EXTENSION_ID,
      reason: "incompatible-settings",
    };
  }
  return {
    kind: "negotiated",
    identifier: MCP_APPS_EXTENSION_ID,
    protocolVersion: MCP_APPS_PROTOCOL_VERSION,
    mimeType: MCP_APPS_MIME_TYPE,
  };
}

export function isMcpAppsGrant(value: unknown): value is McpAppsGrant {
  if (!isPlainObject(value)) {
    return false;
  }
  return (
    Object.keys(value).length === 4 &&
    value.kind === "negotiated" &&
    value.identifier === MCP_APPS_EXTENSION_ID &&
    value.protocolVersion === MCP_APPS_PROTOCOL_VERSION &&
    value.mimeType === MCP_APPS_MIME_TYPE
  );
}

export type McpAppsToolVisibility = "app" | "model";

export interface McpAppsToolMeta {
  readonly resourceUri?: string;
  readonly visibility: readonly McpAppsToolVisibility[];
}

/** Parses stable `_meta.ui` discovery data without treating metadata as authority. */
export function parseMcpAppsToolMeta(tool: McpTool): McpAppsToolMeta | undefined {
  const uiValue = tool["_meta"]?.ui;
  if (uiValue === undefined) {
    return undefined;
  }
  const ui = expectObject(uiValue, `tool ${JSON.stringify(tool.name)}._meta.ui`);
  expectOnlyKeys(ui, ["resourceUri", "visibility"], `tool ${JSON.stringify(tool.name)}._meta.ui`);

  const resourceUri =
    ui.resourceUri === undefined
      ? undefined
      : expectUiUri(ui.resourceUri, `tool ${JSON.stringify(tool.name)}._meta.ui.resourceUri`);
  const visibility =
    ui.visibility === undefined
      ? (["model", "app"] as const)
      : parseVisibility(ui.visibility, `tool ${JSON.stringify(tool.name)}._meta.ui.visibility`);
  return {
    ...(resourceUri === undefined ? {} : { resourceUri }),
    visibility,
  };
}

/** Applies the stable visibility rule before tools are exposed to an agent. */
export function filterMcpAppsModelTools(tools: readonly McpTool[]): readonly McpTool[] {
  assertToolCount(tools);
  return tools.filter((tool) => {
    const meta = parseMcpAppsToolMeta(tool);
    return meta === undefined || meta.visibility.includes("model");
  });
}

/** Returns whether a tool may be called by a View on this same server connection. */
export function isMcpAppsToolCallableByApp(tool: McpTool): boolean {
  return parseMcpAppsToolMeta(tool)?.visibility.includes("app") ?? true;
}

export interface McpAppsResourceCsp {
  readonly connectDomains?: readonly string[];
  readonly resourceDomains?: readonly string[];
  readonly frameDomains?: readonly string[];
  readonly baseUriDomains?: readonly string[];
}

export type McpAppsPermission = "camera" | "clipboardWrite" | "geolocation" | "microphone";

export interface McpAppsResourcePermissions {
  readonly camera?: JsonObject;
  readonly microphone?: JsonObject;
  readonly geolocation?: JsonObject;
  readonly clipboardWrite?: JsonObject;
}

export interface McpAppsResourceMeta {
  readonly csp?: McpAppsResourceCsp;
  readonly permissions?: McpAppsResourcePermissions;
  readonly domain?: string;
  readonly prefersBorder?: boolean;
}

export interface McpAppsResource {
  readonly uri: string;
  readonly mimeType: typeof MCP_APPS_MIME_TYPE;
  readonly html: string;
  readonly meta: McpAppsResourceMeta;
}

export interface McpAppsResourceReader {
  readResource(uri: string): Promise<McpReadResourceResult>;
}

/** Reads the predeclared `ui://` resource and resolves the stable Apps profile. */
export async function loadMcpAppsResource(
  tool: McpTool,
  reader: McpAppsResourceReader,
  grant: McpAppsGrant,
): Promise<McpAppsResource> {
  const toolMeta = parseMcpAppsToolMeta(tool);
  if (toolMeta?.resourceUri === undefined) {
    throw new McpAppsError(
      `Tool ${JSON.stringify(tool.name)} does not declare _meta.ui.resourceUri`,
    );
  }
  return resolveMcpAppsResource(tool, await reader.readResource(toolMeta.resourceUri), grant);
}

/**
 * Resolves one predeclared stable Apps resource from a tool and read result.
 * Exactly one matching resource is required so a server cannot create selection ambiguity.
 */
export function resolveMcpAppsResource(
  tool: McpTool,
  readResult: McpReadResourceResult,
  grant: McpAppsGrant,
): McpAppsResource {
  if (!isMcpAppsGrant(grant)) {
    throw new McpAppsError("Stable MCP Apps resource resolution requires a negotiated grant");
  }
  const toolMeta = parseMcpAppsToolMeta(tool);
  if (toolMeta?.resourceUri === undefined) {
    throw new McpAppsError(
      `Tool ${JSON.stringify(tool.name)} does not declare _meta.ui.resourceUri`,
    );
  }
  if (readResult.contents.length !== 1) {
    throw new McpAppsError(
      `Expected exactly one resource for ${toolMeta.resourceUri}, received ${readResult.contents.length}`,
    );
  }
  const resource = readResult.contents[0]!;
  if (resource.uri !== toolMeta.resourceUri) {
    throw new McpAppsError(
      `Expected resource URI ${toolMeta.resourceUri}, received ${JSON.stringify(resource.uri)}`,
    );
  }
  if (resource.mimeType !== MCP_APPS_MIME_TYPE) {
    throw new McpAppsError(
      `Expected MCP Apps MIME type ${MCP_APPS_MIME_TYPE}, received ${JSON.stringify(resource.mimeType)}`,
    );
  }
  return {
    uri: expectUiUri(resource.uri, "resource.uri"),
    mimeType: MCP_APPS_MIME_TYPE,
    html: decodeResourceHtml(resource),
    meta: parseResourceMeta(resource["_meta"]),
  };
}

/** Controlled error for stable Apps discovery, resources, sandboxing, and bridge input. */
export class McpAppsError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "McpAppsError";
  }
}

function supportsStableAppsMimeType(settings: JsonObject): boolean {
  const mimeTypes = settings.mimeTypes;
  if (!Array.isArray(mimeTypes) || mimeTypes.length === 0 || mimeTypes.length > 16) {
    return false;
  }
  return (
    mimeTypes.every((value) => typeof value === "string") && mimeTypes.includes(MCP_APPS_MIME_TYPE)
  );
}

function parseVisibility(value: unknown, path: string): readonly McpAppsToolVisibility[] {
  if (!Array.isArray(value) || value.length > 2) {
    throw new McpAppsError(`Expected an array of at most two visibility values at ${path}`);
  }
  const result: McpAppsToolVisibility[] = [];
  for (const [index, item] of value.entries()) {
    if (item !== "model" && item !== "app") {
      throw new McpAppsError(`Expected "model" or "app" at ${path}[${index}]`);
    }
    if (result.includes(item)) {
      throw new McpAppsError(`Duplicate visibility ${JSON.stringify(item)} at ${path}[${index}]`);
    }
    result.push(item);
  }
  return result;
}

function parseResourceMeta(metaValue: JsonObject | undefined): McpAppsResourceMeta {
  if (metaValue === undefined || metaValue.ui === undefined) {
    return {};
  }
  const ui = expectObject(metaValue.ui, "resource._meta.ui");
  expectOnlyKeys(ui, ["csp", "permissions", "domain", "prefersBorder"], "resource._meta.ui");
  const csp = ui.csp === undefined ? undefined : parseCsp(ui.csp);
  const permissions = ui.permissions === undefined ? undefined : parsePermissions(ui.permissions);
  const domain = optionalBoundedString(ui.domain, "resource._meta.ui.domain");
  const prefersBorder = optionalBoolean(ui.prefersBorder, "resource._meta.ui.prefersBorder");
  return {
    ...(csp === undefined ? {} : { csp }),
    ...(permissions === undefined ? {} : { permissions }),
    ...(domain === undefined ? {} : { domain }),
    ...(prefersBorder === undefined ? {} : { prefersBorder }),
  };
}

function parseCsp(value: unknown): McpAppsResourceCsp {
  const csp = expectObject(value, "resource._meta.ui.csp");
  expectOnlyKeys(
    csp,
    ["connectDomains", "resourceDomains", "frameDomains", "baseUriDomains"],
    "resource._meta.ui.csp",
  );
  const result: {
    connectDomains?: readonly string[];
    resourceDomains?: readonly string[];
    frameDomains?: readonly string[];
    baseUriDomains?: readonly string[];
  } = {};
  let totalDomains = 0;
  for (const key of [
    "connectDomains",
    "resourceDomains",
    "frameDomains",
    "baseUriDomains",
  ] as const) {
    const domains = csp[key];
    if (domains === undefined) {
      continue;
    }
    if (!Array.isArray(domains)) {
      throw new McpAppsError(`Expected an array at resource._meta.ui.csp.${key}`);
    }
    totalDomains += domains.length;
    if (totalDomains > MCP_APPS_MAX_CSP_DOMAINS) {
      throw new McpAppsError(`Resource CSP exceeds ${MCP_APPS_MAX_CSP_DOMAINS} cumulative domains`);
    }
    result[key] = domains.map((domain, index) =>
      parseCspSource(domain, key, `resource._meta.ui.csp.${key}[${index}]`),
    );
  }
  return result;
}

function parsePermissions(value: unknown): McpAppsResourcePermissions {
  const permissions = expectObject(value, "resource._meta.ui.permissions");
  expectOnlyKeys(
    permissions,
    ["camera", "microphone", "geolocation", "clipboardWrite"],
    "resource._meta.ui.permissions",
  );
  const result: Record<string, JsonObject> = {};
  for (const permission of ["camera", "microphone", "geolocation", "clipboardWrite"] as const) {
    if (permissions[permission] !== undefined) {
      const settings = parseJsonObject(
        permissions[permission],
        `resource._meta.ui.permissions.${permission}`,
      );
      if (Object.keys(settings).length !== 0) {
        throw new McpAppsError(
          `Expected an empty object at resource._meta.ui.permissions.${permission}`,
        );
      }
      Object.defineProperty(result, permission, {
        value: settings,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  }
  return result;
}

function decodeResourceHtml(resource: McpResource): string {
  const html = "text" in resource ? resource.text : decodeBase64Utf8(resource.blob);
  if (html.length > MCP_APPS_MAX_HTML_LENGTH) {
    throw new McpAppsError(`MCP Apps HTML exceeds maximum length of ${MCP_APPS_MAX_HTML_LENGTH}`);
  }
  if (html.includes("\0")) {
    throw new McpAppsError("MCP Apps HTML must not contain NUL characters");
  }
  return html;
}

function decodeBase64Utf8(value: string): string {
  if (
    value.length === 0 ||
    value.length % 4 !== 0 ||
    value.length > Math.ceil((MCP_APPS_MAX_HTML_LENGTH * 4) / 3) + 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    throw new McpAppsError("Invalid base64 MCP Apps HTML resource");
  }
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 4) {
    const a = alphabet.indexOf(value[index]!);
    const b = alphabet.indexOf(value[index + 1]!);
    const c = value[index + 2] === "=" ? 0 : alphabet.indexOf(value[index + 2]!);
    const d = value[index + 3] === "=" ? 0 : alphabet.indexOf(value[index + 3]!);
    bytes.push((a << 2) | (b >> 4));
    if (value[index + 2] !== "=") bytes.push(((b & 15) << 4) | (c >> 2));
    if (value[index + 3] !== "=") bytes.push(((c & 3) << 6) | d);
    if (bytes.length > MCP_APPS_MAX_HTML_LENGTH * 4) {
      throw new McpAppsError("Decoded MCP Apps HTML exceeds its byte budget");
    }
  }
  return decodeUtf8(bytes);
}

function decodeUtf8(bytes: readonly number[]): string {
  let result = "";
  for (let index = 0; index < bytes.length;) {
    const first = bytes[index]!;
    let codePoint: number;
    let length: number;
    if (first <= 0x7f) {
      codePoint = first;
      length = 1;
    } else if (first >= 0xc2 && first <= 0xdf) {
      codePoint = first & 0x1f;
      length = 2;
    } else if (first >= 0xe0 && first <= 0xef) {
      codePoint = first & 0x0f;
      length = 3;
    } else if (first >= 0xf0 && first <= 0xf4) {
      codePoint = first & 0x07;
      length = 4;
    } else {
      throw new McpAppsError("MCP Apps blob is not valid UTF-8");
    }
    if (index + length > bytes.length) {
      throw new McpAppsError("MCP Apps blob ends in an incomplete UTF-8 sequence");
    }
    for (let offset = 1; offset < length; offset += 1) {
      const continuation = bytes[index + offset]!;
      if (continuation < 0x80 || continuation > 0xbf) {
        throw new McpAppsError("MCP Apps blob contains invalid UTF-8 continuation bytes");
      }
      codePoint = (codePoint << 6) | (continuation & 0x3f);
    }
    if (
      (length === 3 && codePoint < 0x800) ||
      (length === 4 && codePoint < 0x10000) ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff) ||
      codePoint > 0x10ffff
    ) {
      throw new McpAppsError("MCP Apps blob contains a non-canonical UTF-8 sequence");
    }
    result += String.fromCodePoint(codePoint);
    if (result.length > MCP_APPS_MAX_HTML_LENGTH) {
      throw new McpAppsError(`MCP Apps HTML exceeds maximum length of ${MCP_APPS_MAX_HTML_LENGTH}`);
    }
    index += length;
  }
  return result;
}

function parseCspSource(value: unknown, kind: string, path: string): string {
  const source = expectBoundedString(value, path);
  if (/\s|[;,'"`]/u.test(source)) {
    throw new McpAppsError(`Invalid CSP source at ${path}`);
  }
  const wildcard = source.includes("*.");
  if (wildcard && !/^https?:\/\/\*\.[A-Za-z0-9.-]+(?::[0-9]+)?$/.test(source)) {
    throw new McpAppsError(`Invalid wildcard CSP source at ${path}`);
  }
  const parsable = wildcard ? source.replace("*.", "wildcard.") : source;
  const url = parseUrl(parsable, path);
  const allowedSchemes =
    kind === "connectDomains" ? ["http:", "https:", "ws:", "wss:"] : ["http:", "https:"];
  if (!allowedSchemes.includes(url.protocol) || url.hostname.length === 0) {
    throw new McpAppsError(`Unsupported CSP source scheme at ${path}`);
  }
  if (url.username.length > 0 || url.password.length > 0 || url.origin !== parsable) {
    throw new McpAppsError(`CSP sources must be exact origins at ${path}`);
  }
  return source;
}

function expectUiUri(value: unknown, path: string): string {
  const uri = expectBoundedString(value, path);
  const url = parseUrl(uri, path);
  if (url.protocol !== "ui:" || url.username.length > 0 || url.password.length > 0) {
    throw new McpAppsError(`Expected a credential-free ui:// URI at ${path}`);
  }
  return uri;
}

type ParsedUrl = {
  readonly protocol: string;
  readonly hostname: string;
  readonly origin: string;
  readonly username: string;
  readonly password: string;
};

function parseUrl(value: string, path: string): ParsedUrl {
  const URLParser = (globalThis as { URL?: new (value: string) => ParsedUrl }).URL;
  if (URLParser === undefined) {
    throw new McpAppsError("URL parsing is unavailable in this runtime");
  }
  try {
    return new URLParser(value);
  } catch (error) {
    throw new McpAppsError(`Invalid URI at ${path}`, { cause: error });
  }
}

function assertToolCount(tools: readonly McpTool[]): void {
  if (tools.length > MCP_APPS_MAX_TOOLS) {
    throw new McpAppsError(`Tool list exceeds maximum length of ${MCP_APPS_MAX_TOOLS}`);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function expectObject(value: unknown, path: string): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new McpAppsError(`Expected an object at ${path}`);
  }
  return value;
}

function expectOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  path: string,
): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new McpAppsError(`Unsupported field ${JSON.stringify(key)} at ${path}`);
    }
  }
}

function expectBoundedString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new McpAppsError(`Expected a string at ${path}`);
  }
  if (value.length === 0 || value.length > JSON_MAX_STRING_LENGTH) {
    throw new McpAppsError(`Expected a non-empty bounded string at ${path}`);
  }
  return value;
}

function optionalBoundedString(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : expectBoundedString(value, path);
}

function optionalBoolean(value: unknown, path: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new McpAppsError(`Expected a boolean at ${path}`);
  }
  return value;
}
