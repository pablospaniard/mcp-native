import type { McpTextResourceContents } from "@mcp-native/core";

const HTML_MIME_TYPES = new Set(["text/html", "text/html+skybridge"]);
/** Non-network schemes permitted for inline document base URLs. */
const INLINE_BASE_URL_SCHEMES = new Set(["ui", "mcp"]);

export interface WebViewPolicy {
  /**
   * Allows returning inline HTML from a text resource. Denied by default —
   * hosts must opt in and still apply their own WebView sandbox.
   */
  readonly allowInlineDocuments?: boolean;
  /**
   * Allows remote documents. Requires a non-empty `allowedRemoteOrigins` list
   * and only accepts credential-free `http:` / `https:` URIs.
   */
  readonly allowRemoteDocuments?: boolean;
  /** Exact origins such as `https://example.com` that may be loaded remotely. */
  readonly allowedRemoteOrigins?: readonly string[];
}

/**
 * A remote HTML document reference. Unlike `McpResource`, remote WebView inputs
 * intentionally omit `text`/`blob` bodies — the host loads `uri` after policy checks.
 */
export interface WebViewRemoteResource {
  readonly uri: string;
  readonly mimeType: string;
}

/** Inputs accepted by `createWebViewDocument`. Binary MCP resources are not accepted. */
export type WebViewDocumentInput = McpTextResourceContents | WebViewRemoteResource;

export type WebViewDocument =
  | {
      readonly kind: "inline";
      readonly html: string;
      readonly baseUrl: string;
    }
  | {
      readonly kind: "remote";
      readonly uri: string;
    };

export class WebViewPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebViewPolicyError";
  }
}

export function isHtmlResource(resource: { readonly mimeType?: string }): boolean {
  return resource.mimeType !== undefined && HTML_MIME_TYPES.has(resource.mimeType);
}

export function createWebViewDocument(
  resource: WebViewDocumentInput,
  policy: WebViewPolicy = {},
): WebViewDocument {
  if (!isHtmlResource(resource)) {
    throw new WebViewPolicyError(
      `Unsupported WebView MIME type: ${resource.mimeType ?? "unknown"}`,
    );
  }

  if (hasOwnDefined(resource, "blob")) {
    throw new WebViewPolicyError("Binary WebView resources are not supported");
  }

  if (hasOwnDefined(resource, "text")) {
    const text = (resource as McpTextResourceContents).text;
    if (typeof text !== "string") {
      throw new WebViewPolicyError("Expected a string at resource.text");
    }
    if (policy.allowInlineDocuments !== true) {
      throw new WebViewPolicyError("Inline WebView documents are disabled by policy");
    }
    assertInlineBaseUrl(resource.uri);
    return { kind: "inline", html: text, baseUrl: resource.uri };
  }

  if (policy.allowRemoteDocuments !== true) {
    throw new WebViewPolicyError("Remote WebView documents are disabled by policy");
  }

  const allowedOrigins = policy.allowedRemoteOrigins;
  if (allowedOrigins === undefined || allowedOrigins.length === 0) {
    throw new WebViewPolicyError(
      "Remote WebView documents require a non-empty allowedRemoteOrigins allowlist",
    );
  }
  for (const origin of allowedOrigins) {
    assertOriginAllowlistEntry(origin);
  }

  return {
    kind: "remote",
    uri: assertAllowedRemoteUri(resource.uri, allowedOrigins),
  };
}

type ParsedDocumentUrl = {
  readonly protocol: string;
  readonly hostname: string;
  readonly origin: string;
  readonly username: string;
  readonly password: string;
};

function hasOwnDefined(value: object, key: string): boolean {
  return Object.hasOwn(value, key) && (value as Record<string, unknown>)[key] !== undefined;
}

function parseDocumentUrl(uri: string, path: string): ParsedDocumentUrl {
  const URLParser = (
    globalThis as {
      URL?: new (value: string) => ParsedDocumentUrl;
    }
  ).URL;
  if (URLParser === undefined) {
    throw new WebViewPolicyError("URL parsing is unavailable in this runtime");
  }

  let url: ParsedDocumentUrl;
  try {
    url = new URLParser(uri);
  } catch {
    throw new WebViewPolicyError(`Invalid WebView document URI at ${path}`);
  }

  if (url.username.length > 0 || url.password.length > 0) {
    throw new WebViewPolicyError("WebView document URIs must not include embedded credentials");
  }

  return url;
}

function assertInlineBaseUrl(uri: string): void {
  const url = parseDocumentUrl(uri, "resource.uri");
  const scheme = url.protocol.replace(/:$/, "").toLowerCase();
  if (!INLINE_BASE_URL_SCHEMES.has(scheme)) {
    throw new WebViewPolicyError(`Inline WebView base URL scheme is not allowlisted: ${scheme}:`);
  }
}

function assertOriginAllowlistEntry(origin: string): void {
  const url = parseDocumentUrl(origin, "allowedRemoteOrigins");
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new WebViewPolicyError(
      `allowedRemoteOrigins entries must use http: or https:, received ${url.protocol}`,
    );
  }
  if (url.hostname.length === 0) {
    throw new WebViewPolicyError("allowedRemoteOrigins entries require a hostname");
  }
  if (url.origin !== origin) {
    throw new WebViewPolicyError(
      `allowedRemoteOrigins entries must be exact origins such as https://example.com, received ${origin}`,
    );
  }
}

function assertAllowedRemoteUri(uri: string, allowedOrigins: readonly string[]): string {
  const url = parseDocumentUrl(uri, "resource.uri");
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new WebViewPolicyError(
      `Remote WebView documents require http: or https:, received ${url.protocol}`,
    );
  }
  if (url.hostname.length === 0) {
    throw new WebViewPolicyError("Remote WebView documents require a hostname");
  }

  if (!allowedOrigins.includes(url.origin)) {
    throw new WebViewPolicyError(`Remote WebView origin is not allowlisted: ${url.origin}`);
  }
  return uri;
}
