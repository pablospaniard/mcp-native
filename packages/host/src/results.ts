import {
  A2UI_MCP_EXTENSION_CAPABILITIES,
  A2UI_MIME_TYPE,
  negotiateA2uiMcpBinding,
  resolveA2uiV1JsonlFromToolResult,
  type A2uiV1EnvelopeParseOptions,
  type ResolvedA2uiV1JsonlResource,
} from "@mcp-native/a2ui";
import type {
  McpExtensionSettings,
  McpReadResourceResult,
  McpToolCallResult,
} from "@mcp-native/core";
import { parseMcpSdkTool, parseMcpSdkToolCallResult } from "@mcp-native/mcp";
import {
  MCP_APPS_EXTENSION_CAPABILITIES,
  loadMcpAppsResource,
  negotiateMcpApps,
  parseMcpAppsToolMeta,
  type McpAppsResource,
} from "@mcp-native/webview";

/** Exact built-in extension map advertised by the v1 host result resolver. */
export const MCP_NATIVE_HOST_EXTENSION_CAPABILITIES: McpExtensionSettings = Object.freeze({
  ...A2UI_MCP_EXTENSION_CAPABILITIES,
  ...MCP_APPS_EXTENSION_CAPABILITIES,
});

/**
 * Connection-bound MCP client surface required by the host result resolver.
 *
 * Resource reads and both extension snapshots must come from the same connected client so callers
 * cannot manufacture mutual negotiation independently of the connection that produced the result.
 */
export interface McpNativeHostClient {
  readResource(uri: string): Promise<McpReadResourceResult>;
  getClientExtensionSettings(): McpExtensionSettings;
  getServerExtensionSettings(): McpExtensionSettings;
}

export type McpNativeHostInvalidResultCode =
  | "ambiguous-standard-result"
  | "a2ui-resolution-failed"
  | "invalid-extension-settings"
  | "invalid-input"
  | "mcp-app-resolution-failed";

export interface McpNativeHostA2uiResult {
  readonly kind: "a2ui";
  readonly result: McpToolCallResult;
  readonly resource: ResolvedA2uiV1JsonlResource;
}

export interface McpNativeHostMcpAppsResult {
  readonly kind: "mcp-app";
  readonly result: McpToolCallResult;
  readonly resource: McpAppsResource;
}

export interface McpNativeHostOrdinaryResult {
  readonly kind: "ordinary";
  readonly result: McpToolCallResult;
}

export interface McpNativeHostInvalidResult {
  readonly kind: "invalid";
  /** Stable host-authored code. Server error strings are never exposed through this field. */
  readonly code: McpNativeHostInvalidResultCode;
}

export type McpNativeHostResult =
  | McpNativeHostA2uiResult
  | McpNativeHostInvalidResult
  | McpNativeHostMcpAppsResult
  | McpNativeHostOrdinaryResult;

export interface ResolveMcpNativeHostResultOptions {
  /** Untrusted SDK-shaped tool selected for this call. */
  readonly tool: unknown;
  /** Untrusted SDK-shaped tool result. */
  readonly result: unknown;
  /** Client bound to the MCP connection that produced the tool and result. */
  readonly client: McpNativeHostClient;
  readonly a2uiParseOptions?: A2uiV1EnvelopeParseOptions;
}

/**
 * Validates and deterministically resolves one MCP tool result.
 *
 * Negotiated standard claims are selected before resource loading. If both supported standards
 * claim the result, or if the selected path fails validation, the resolver returns `invalid` and
 * never retries through another executable UI path.
 */
export async function resolveMcpNativeHostResult(
  options: ResolveMcpNativeHostResultOptions,
): Promise<McpNativeHostResult> {
  if (
    options === null ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    options.client === null ||
    typeof options.client !== "object" ||
    typeof options.client.readResource !== "function" ||
    typeof options.client.getClientExtensionSettings !== "function" ||
    typeof options.client.getServerExtensionSettings !== "function"
  ) {
    return invalid("invalid-input");
  }

  let tool;
  let result;
  try {
    tool = parseMcpSdkTool(options.tool);
    result = parseMcpSdkToolCallResult(options.result);
  } catch {
    return invalid("invalid-input");
  }

  let a2uiNegotiation;
  let appsNegotiation;
  try {
    const clientExtensions = options.client.getClientExtensionSettings();
    const serverExtensions = options.client.getServerExtensionSettings();
    a2uiNegotiation = negotiateA2uiMcpBinding(clientExtensions, serverExtensions);
    appsNegotiation = negotiateMcpApps(clientExtensions, serverExtensions);
  } catch {
    return invalid("invalid-extension-settings");
  }

  const hasA2uiClaim = result.content.some(
    (block) => block.type === "resource_link" && block.mimeType === A2UI_MIME_TYPE,
  );
  const selectsA2ui = a2uiNegotiation.kind === "negotiated" && hasA2uiClaim;

  let appsResourceDeclared = false;
  if (appsNegotiation.kind === "negotiated") {
    try {
      appsResourceDeclared = parseMcpAppsToolMeta(tool)?.resourceUri !== undefined;
    } catch {
      return invalid("mcp-app-resolution-failed");
    }
  }
  const selectsApps = appsNegotiation.kind === "negotiated" && appsResourceDeclared;

  if (selectsA2ui && selectsApps) {
    return invalid("ambiguous-standard-result");
  }

  if (selectsA2ui) {
    try {
      const resource = await resolveA2uiV1JsonlFromToolResult(
        options.client,
        result,
        a2uiNegotiation,
        options.a2uiParseOptions,
      );
      deepFreeze(resource);
      deepFreeze(result);
      return Object.freeze({ kind: "a2ui", resource, result });
    } catch {
      return invalid("a2ui-resolution-failed");
    }
  }

  if (appsNegotiation.kind === "negotiated" && appsResourceDeclared) {
    try {
      const resource = await loadMcpAppsResource(tool, options.client, appsNegotiation);
      deepFreeze(resource);
      deepFreeze(result);
      return Object.freeze({ kind: "mcp-app", resource, result });
    } catch {
      return invalid("mcp-app-resolution-failed");
    }
  }

  deepFreeze(result);
  return Object.freeze({ kind: "ordinary", result });
}

function invalid(code: McpNativeHostInvalidResultCode): McpNativeHostInvalidResult {
  return Object.freeze({ kind: "invalid", code });
}

function deepFreeze(value: unknown): void {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return;
  }
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  Object.freeze(value);
}
