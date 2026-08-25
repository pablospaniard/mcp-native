import type { McpResource } from "@mcp-native/core";

const HTML_MIME_TYPES = new Set(["text/html", "text/html+skybridge"]);

export interface WebViewPolicy {
  readonly allowRemoteDocuments?: boolean;
}

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

export function isHtmlResource(resource: McpResource): boolean {
  return resource.mimeType !== undefined && HTML_MIME_TYPES.has(resource.mimeType);
}

export function createWebViewDocument(
  resource: McpResource,
  policy: WebViewPolicy = {},
): WebViewDocument {
  if (!isHtmlResource(resource)) {
    throw new WebViewPolicyError(`Unsupported WebView MIME type: ${resource.mimeType ?? "unknown"}`);
  }

  if (resource.text !== undefined) {
    return { kind: "inline", html: resource.text, baseUrl: resource.uri };
  }

  if (policy.allowRemoteDocuments !== true) {
    throw new WebViewPolicyError("Remote WebView documents are disabled by policy");
  }

  return { kind: "remote", uri: resource.uri };
}
