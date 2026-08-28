import type { JsonObject } from "@mcp-native/core";

import { MCP_APPS_MAX_HTML_LENGTH, McpAppsError } from "./apps.js";
import type {
  McpAppsPermission,
  McpAppsResource,
  McpAppsResourceCsp,
  McpAppsResourcePermissions,
} from "./apps.js";

export type McpAppsNavigationDecision = "allow-in-document" | "deny" | "open-externally";

export interface McpAppsNativeSandboxPolicy {
  /** Sensitive capabilities explicitly approved by the host for this View. */
  readonly grantedPermissions?: readonly McpAppsPermission[];
  /**
   * Host-specific approval for a requested stable sandbox domain. Native adapters
   * that cannot actually provide that origin must leave this unset and fail closed.
   */
  readonly approveDedicatedDomain?: (domain: string) => boolean;
  /** Exact HTTP(S) origins that a user-activated top-level link may open externally. */
  readonly allowedExternalOrigins?: readonly string[];
}

/**
 * Closed platform descriptor. A host adapter must select these properties
 * explicitly when mapping them into its locally bundled WebView implementation.
 */
export interface McpAppsNativeSandboxConfiguration {
  readonly source: {
    readonly html: string;
    readonly baseUrl: string;
  };
  readonly contentSecurityPolicy: string;
  readonly javaScriptEnabled: true;
  readonly javaScriptCanOpenWindowsAutomatically: false;
  readonly fileAccessEnabled: false;
  readonly contentAccessEnabled: false;
  readonly cookiesEnabled: false;
  readonly thirdPartyCookiesEnabled: false;
  readonly sharedCookiesEnabled: false;
  readonly storage: "ephemeral";
  readonly downloads: "host-mediated";
  readonly externalLinks: "host-mediated";
  readonly multipleWindowsEnabled: false;
  readonly mediaPlaybackRequiresUserAction: true;
  /** Fixed local shim that connects official `window.postMessage` traffic to the native bridge. */
  readonly injectedJavaScriptBeforeContentLoaded: string;
  readonly grantedPermissions: readonly McpAppsPermission[];
  readonly prefersBorder?: boolean;
  decideNavigation(uri: string, isTopFrame: boolean): McpAppsNavigationDecision;
  allowsPermission(permission: McpAppsPermission): boolean;
}

export interface McpAppsReactNativeWebViewCallbacks {
  readonly onMessage: (serializedMessage: string) => void | Promise<void>;
  readonly onExternalLink?: (uri: string) => void | Promise<void>;
  /** Required host error boundary for rejected or thrown native callback work. */
  readonly onError: (error: unknown) => void | Promise<void>;
}

export interface McpAppsReactNativeNavigationRequest {
  readonly url: string;
  readonly isTopFrame?: boolean;
  readonly navigationType?: string;
}

/** Closed safe-prop subset for a locally bundled `react-native-webview` component. */
export interface McpAppsReactNativeWebViewProps {
  readonly source: { readonly html: string; readonly baseUrl: string };
  readonly originWhitelist: readonly string[];
  readonly javaScriptEnabled: true;
  readonly javaScriptCanOpenWindowsAutomatically: false;
  readonly allowFileAccess: false;
  readonly allowFileAccessFromFileURLs: false;
  readonly allowUniversalAccessFromFileURLs: false;
  readonly domStorageEnabled: false;
  readonly thirdPartyCookiesEnabled: false;
  readonly sharedCookiesEnabled: false;
  readonly incognito: true;
  readonly setSupportMultipleWindows: false;
  readonly mediaPlaybackRequiresUserAction: true;
  readonly geolocationEnabled: false;
  readonly mediaCapturePermissionGrantType: "deny";
  readonly injectedJavaScriptBeforeContentLoaded: string;
  onShouldStartLoadWithRequest(request: McpAppsReactNativeNavigationRequest): boolean;
  onMessage(event: { readonly nativeEvent: { readonly data: unknown } }): void;
}

/** Builds a restrictive CSP from the stable resource metadata. */
export function createMcpAppsContentSecurityPolicy(csp: McpAppsResourceCsp = {}): string {
  const resources = csp.resourceDomains ?? [];
  const connections = csp.connectDomains ?? [];
  const frames = csp.frameDomains ?? [];
  const bases = csp.baseUriDomains ?? [];
  return [
    "default-src 'none'",
    joinDirective("script-src", ["'self'", "'unsafe-inline'", ...resources]),
    joinDirective("style-src", ["'self'", "'unsafe-inline'", ...resources]),
    joinDirective("img-src", ["'self'", "data:", ...resources]),
    joinDirective("media-src", ["'self'", "data:", ...resources]),
    joinDirective("font-src", ["'self'", "data:", ...resources]),
    joinDirective("connect-src", connections.length === 0 ? ["'none'"] : connections),
    joinDirective("frame-src", frames.length === 0 ? ["'none'"] : frames),
    joinDirective("base-uri", ["'self'", ...bases]),
    "object-src 'none'",
    "form-action 'none'",
  ].join("; ");
}

/**
 * Creates a platform-neutral native WebView configuration for one validated resource.
 * The returned HTML has the restrictive policy inserted before any server content.
 */
export function createMcpAppsNativeSandbox(
  resource: McpAppsResource,
  policy: McpAppsNativeSandboxPolicy = {},
): McpAppsNativeSandboxConfiguration {
  if (
    resource.meta.domain !== undefined &&
    policy.approveDedicatedDomain?.(resource.meta.domain) !== true
  ) {
    throw new McpAppsError(
      `Requested MCP Apps sandbox domain is unsupported by this native host: ${resource.meta.domain}`,
    );
  }
  const grantedPermissions = selectGrantedPermissions(
    resource.meta.permissions,
    policy.grantedPermissions,
  );
  const contentSecurityPolicy = createMcpAppsContentSecurityPolicy(resource.meta.csp);
  const html = injectCsp(resource.html, contentSecurityPolicy);
  const allowedExternalOrigins = parseExternalOrigins(policy.allowedExternalOrigins ?? []);
  return {
    source: { html, baseUrl: resource.uri },
    contentSecurityPolicy,
    javaScriptEnabled: true,
    javaScriptCanOpenWindowsAutomatically: false,
    fileAccessEnabled: false,
    contentAccessEnabled: false,
    cookiesEnabled: false,
    thirdPartyCookiesEnabled: false,
    sharedCookiesEnabled: false,
    storage: "ephemeral",
    downloads: "host-mediated",
    externalLinks: "host-mediated",
    multipleWindowsEnabled: false,
    mediaPlaybackRequiresUserAction: true,
    injectedJavaScriptBeforeContentLoaded: MCP_APPS_NATIVE_BRIDGE_BOOTSTRAP,
    grantedPermissions,
    ...(resource.meta.prefersBorder === undefined
      ? {}
      : { prefersBorder: resource.meta.prefersBorder }),
    decideNavigation(uri, isTopFrame) {
      if (!isTopFrame && uri === "about:blank") return "allow-in-document";
      if (uri === resource.uri || uri.startsWith(`${resource.uri}#`)) {
        return "allow-in-document";
      }
      const origin = getHttpOrigin(uri);
      return origin !== undefined && allowedExternalOrigins.has(origin)
        ? "open-externally"
        : "deny";
    },
    allowsPermission(permission) {
      return grantedPermissions.includes(permission);
    },
  };
}

/**
 * Maps the trusted sandbox descriptor into an explicit React Native WebView
 * prop subset. No resource-controlled object is spread into the component.
 */
export function createMcpAppsReactNativeWebViewProps(
  sandbox: McpAppsNativeSandboxConfiguration,
  callbacks: McpAppsReactNativeWebViewCallbacks,
): McpAppsReactNativeWebViewProps {
  if (typeof callbacks.onMessage !== "function") {
    throw new McpAppsError("React Native WebView adapter requires an onMessage callback");
  }
  if (typeof callbacks.onError !== "function") {
    throw new McpAppsError("React Native WebView adapter requires an onError callback");
  }
  if (sandbox.grantedPermissions.length !== 0) {
    throw new McpAppsError(
      "The standard React Native WebView prop adapter cannot enforce sensitive permission grants; use an audited platform adapter",
    );
  }
  return {
    source: sandbox.source,
    originWhitelist: Object.freeze(["ui://*", "about:blank"]),
    javaScriptEnabled: true,
    javaScriptCanOpenWindowsAutomatically: false,
    allowFileAccess: false,
    allowFileAccessFromFileURLs: false,
    allowUniversalAccessFromFileURLs: false,
    domStorageEnabled: false,
    thirdPartyCookiesEnabled: false,
    sharedCookiesEnabled: false,
    incognito: true,
    setSupportMultipleWindows: false,
    mediaPlaybackRequiresUserAction: true,
    geolocationEnabled: false,
    mediaCapturePermissionGrantType: "deny",
    injectedJavaScriptBeforeContentLoaded: sandbox.injectedJavaScriptBeforeContentLoaded,
    onShouldStartLoadWithRequest(request) {
      try {
        const decision = sandbox.decideNavigation(request.url, request.isTopFrame !== false);
        if (
          decision === "open-externally" &&
          request.navigationType === "click" &&
          callbacks.onExternalLink !== undefined
        ) {
          runMcpAppsNativeCallback(
            () => callbacks.onExternalLink?.(request.url),
            callbacks.onError,
          );
        }
        return decision === "allow-in-document";
      } catch (error) {
        reportMcpAppsNativeCallbackError(callbacks.onError, error);
        return false;
      }
    },
    onMessage(event) {
      const message = event.nativeEvent.data;
      if (typeof message !== "string") {
        reportMcpAppsNativeCallbackError(
          callbacks.onError,
          new McpAppsError("Native WebView bridge messages must be strings"),
        );
        return;
      }
      runMcpAppsNativeCallback(() => callbacks.onMessage(message), callbacks.onError);
    },
  };
}

function runMcpAppsNativeCallback(
  callback: () => void | Promise<void> | undefined,
  onError: (error: unknown) => void | Promise<void>,
): void {
  try {
    void Promise.resolve(callback()).catch((error: unknown) => {
      reportMcpAppsNativeCallbackError(onError, error);
    });
  } catch (error) {
    reportMcpAppsNativeCallbackError(onError, error);
  }
}

function reportMcpAppsNativeCallbackError(
  onError: (error: unknown) => void | Promise<void>,
  error: unknown,
): void {
  try {
    void Promise.resolve(onError(error)).catch(() => {
      // A rejected host error boundary is contained for the same reason as a thrown one.
    });
  } catch {
    // A broken host error boundary must not create another unhandled View-controlled failure.
  }
}

/**
 * Fixed, host-authored native bridge bootstrap. It forwards JSON-RPC objects
 * from the View to the platform message handler and exposes one private inbound
 * delivery function. It never evaluates server-provided source text.
 */
export const MCP_APPS_NATIVE_BRIDGE_BOOTSTRAP = `(() => {
  const nativeBridge = globalThis.ReactNativeWebView;
  if (!nativeBridge || typeof nativeBridge.postMessage !== "function") return;
  const dispatch = globalThis.dispatchEvent.bind(globalThis);
  Object.defineProperty(globalThis, "__MCP_NATIVE_DELIVER__", {
    configurable: false,
    enumerable: false,
    writable: false,
    value(message) {
      dispatch(new MessageEvent("message", { data: message, source: globalThis }));
    },
  });
  globalThis.postMessage = (message) => nativeBridge.postMessage(JSON.stringify(message));
})();
true;`;

/** Creates a fixed delivery call containing JSON data, never executable server source. */
export function createMcpAppsNativeDeliveryScript(serializedMessage: string): string {
  if (serializedMessage.length === 0 || serializedMessage.length > 1_048_576) {
    throw new McpAppsError("Native bridge delivery exceeds its serialized size limit");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serializedMessage) as unknown;
  } catch (error) {
    throw new McpAppsError("Native bridge delivery must contain valid JSON", { cause: error });
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new McpAppsError("Native bridge delivery must contain a JSON-RPC object");
  }
  const literal = JSON.stringify(serializedMessage)
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
  return `globalThis.__MCP_NATIVE_DELIVER__(JSON.parse(${literal}));\ntrue;`;
}

/** Converts granted resource permissions to browser Permission Policy feature names. */
export function getMcpAppsPermissionPolicy(
  permissions: readonly McpAppsPermission[],
): readonly string[] {
  return permissions.map((permission) => {
    switch (permission) {
      case "camera":
        return "camera";
      case "microphone":
        return "microphone";
      case "geolocation":
        return "geolocation";
      case "clipboardWrite":
        return "clipboard-write";
    }
  });
}

function injectCsp(html: string, csp: string): string {
  if (html.length > MCP_APPS_MAX_HTML_LENGTH) {
    throw new McpAppsError(`MCP Apps HTML exceeds maximum length of ${MCP_APPS_MAX_HTML_LENGTH}`);
  }
  // Restrict the accepted shape so no executable element can precede the policy.
  const start = /^\s*<!doctype\s+html\s*>\s*<html(?:\s[^>]*)?>\s*<head(?:\s[^>]*)?>/iu.exec(html);
  if (start === null || start.index !== 0) {
    throw new McpAppsError(
      "MCP Apps HTML must start with an HTML5 doctype, html element, and head element",
    );
  }
  const escaped = escapeHtmlAttribute(csp);
  const meta = `<meta http-equiv="Content-Security-Policy" content="${escaped}">`;
  const result = `${html.slice(0, start[0].length)}${meta}${html.slice(start[0].length)}`;
  if (result.length > MCP_APPS_MAX_HTML_LENGTH + 4_096) {
    throw new McpAppsError("CSP-injected MCP Apps HTML exceeds its output budget");
  }
  return result;
}

function escapeHtmlAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

function joinDirective(name: string, sources: readonly string[]): string {
  return `${name} ${sources.join(" ")}`;
}

function selectGrantedPermissions(
  requested: McpAppsResourcePermissions | undefined,
  granted: readonly McpAppsPermission[] | undefined,
): readonly McpAppsPermission[] {
  if (granted === undefined) return Object.freeze([]);
  const valid = new Set<McpAppsPermission>([
    "camera",
    "microphone",
    "geolocation",
    "clipboardWrite",
  ]);
  const unique = new Set<McpAppsPermission>();
  for (const permission of granted) {
    if (!valid.has(permission)) {
      throw new McpAppsError(`Unsupported native WebView permission: ${String(permission)}`);
    }
    if (requested?.[permission] !== undefined) unique.add(permission);
  }
  return Object.freeze([...unique]);
}

function parseExternalOrigins(origins: readonly string[]): ReadonlySet<string> {
  if (origins.length > 64) {
    throw new McpAppsError("External origin allowlist exceeds 64 entries");
  }
  const result = new Set<string>();
  for (const origin of origins) {
    const parsed = parseUrl(origin, "allowedExternalOrigins");
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username.length > 0 ||
      parsed.password.length > 0 ||
      parsed.origin !== origin
    ) {
      throw new McpAppsError(
        `External link allowlist entries must be exact HTTP(S) origins: ${origin}`,
      );
    }
    result.add(origin);
  }
  return result;
}

function getHttpOrigin(uri: string): string | undefined {
  try {
    const url = parseUrl(uri, "navigation URI");
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username.length > 0 ||
      url.password.length > 0
    ) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

type ParsedUrl = {
  readonly protocol: string;
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

/** JSON-safe snapshot useful for audit logs without serializing callback functions. */
export function describeMcpAppsNativeSandbox(
  sandbox: McpAppsNativeSandboxConfiguration,
): JsonObject {
  return {
    baseUrl: sandbox.source.baseUrl,
    contentSecurityPolicy: sandbox.contentSecurityPolicy,
    javaScriptEnabled: sandbox.javaScriptEnabled,
    javaScriptCanOpenWindowsAutomatically: sandbox.javaScriptCanOpenWindowsAutomatically,
    fileAccessEnabled: sandbox.fileAccessEnabled,
    contentAccessEnabled: sandbox.contentAccessEnabled,
    cookiesEnabled: sandbox.cookiesEnabled,
    thirdPartyCookiesEnabled: sandbox.thirdPartyCookiesEnabled,
    sharedCookiesEnabled: sandbox.sharedCookiesEnabled,
    storage: sandbox.storage,
    downloads: sandbox.downloads,
    externalLinks: sandbox.externalLinks,
    multipleWindowsEnabled: sandbox.multipleWindowsEnabled,
    mediaPlaybackRequiresUserAction: sandbox.mediaPlaybackRequiresUserAction,
    grantedPermissions: [...sandbox.grantedPermissions],
    ...(sandbox.prefersBorder === undefined ? {} : { prefersBorder: sandbox.prefersBorder }),
  };
}
