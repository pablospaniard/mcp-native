<div align="center">

# @mcp-native/webview

### Stable MCP Apps discovery, native sandbox, and JSON-RPC bridge

[![npm](https://img.shields.io/npm/v/@mcp-native/webview)](https://www.npmjs.com/package/@mcp-native/webview)
[![downloads](https://img.shields.io/npm/dm/@mcp-native/webview)](https://www.npmjs.com/package/@mcp-native/webview)
[![license](https://img.shields.io/npm/l/@mcp-native/webview)](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)

[GitHub](https://github.com/pablospaniard/mcp-native) · [Architecture](https://github.com/pablospaniard/mcp-native/blob/main/docs/RFC-0001-architecture.md) · [Standards status](https://github.com/pablospaniard/mcp-native/blob/main/docs/standards-compatibility.md) · [Security](https://github.com/pablospaniard/mcp-native/blob/main/SECURITY.md)

</div>

> **Experimental:** this package implements the documented stable MCP Apps `2026-01-26` native
> host-adapter profile. A shipping host must map the closed descriptor into its audited platform
> WebView and lifecycle; native isolation is not equivalent to a browser's cross-origin iframe.

`@mcp-native/webview` handles the compatibility path for MCP resources that contain HTML. The stable
path negotiates `io.modelcontextprotocol/ui`, discovers strict `_meta.ui` tool metadata, reads one
exact `ui://` resource with `text/html;profile=mcp-app`, preserves closed CSP and permission
metadata, builds a CSP-first native sandbox, and runs the bounded Apps JSON-RPC lifecycle. The
legacy generic helpers still recognize older HTML MIME types and reject both inline and remote
documents unless the host explicitly grants them through policy.

The exact protocol pin, message set, bounds, exclusions, native/browser differences, and official
schema coverage is documented in the [MCP Apps compatibility
profile](https://github.com/pablospaniard/mcp-native/blob/main/docs/mcp-apps-compatibility.md).

The convenience `mcp-native` package can coordinate this isolated region beside a native A2UI
region. Composition remains host-authored and does not add any A2UI-to-WebView configuration,
navigation, or message path. See the [mixed-surface
guide](https://github.com/pablospaniard/mcp-native/blob/main/docs/mixed-surfaces.md).

## Stable MCP Apps host flow

```ts
import { createConsentActionPolicy } from "@mcp-native/core";
import {
  MCP_APPS_EXTENSION_CAPABILITIES,
  McpAppsBridge,
  createMcpAppsNativeDeliveryScript,
  createMcpAppsNativeSandbox,
  createMcpAppsReactNativeWebViewProps,
  loadMcpAppsResource,
  negotiateMcpApps,
} from "@mcp-native/webview";

const grant = negotiateMcpApps(
  adapter.getClientExtensionSettings(),
  adapter.getServerExtensionSettings(),
);
if (grant.kind !== "negotiated") {
  // Render the tool's ordinary MCP text/structured fallback.
  throw new Error(grant.reason);
}

const resource = await loadMcpAppsResource(tool, runtime, grant);
const sandbox = createMcpAppsNativeSandbox(resource); // no sensitive permissions by default
const appToolPolicy = createConsentActionPolicy(
  [
    {
      name: "refresh",
      risk: "read-only",
      capabilities: [],
      sensitiveData: [],
      sharesDataExternally: false,
    },
  ],
  reviewMcpAppsToolCall,
);

let webViewRef;
const bridge = new McpAppsBridge({
  resource,
  sandbox,
  hostInfo: { name: "my-native-host", version: "1.0.0" },
  tools,
  postMessage(serialized) {
    webViewRef.injectJavaScript(createMcpAppsNativeDeliveryScript(serialized));
  },
  handlers: {
    authorizeToolCall: appToolPolicy,
    callTool: (name, arguments_) => runtime.callTool(name, arguments_),
    readResource: (uri) => runtime.readResource(uri),
    openLink: async (url) => {
      if (!hostPolicyAllows(url)) return false;
      await openExternalUrl(url);
      return true;
    },
  },
});

const webViewProps = createMcpAppsReactNativeWebViewProps(sandbox, {
  onMessage: (message) => bridge.receive(message),
  onExternalLink: openExternalUrl,
  onError: reportMcpAppsHostError,
});
```

Advertise `MCP_APPS_EXTENSION_CAPABILITIES` through `createMcpNativeClientOptions()` and pass the
same snapshot into the SDK adapter. Capabilities are not inferred from the tool or resource MIME
type. The bridge advertises View-facing tool proxying only when both `authorizeToolCall` and
`callTool` exist. The validated action must receive exact host-policy approval before the tool
handler runs; View `_meta`, server annotations, and tool visibility never grant execution. Other
View-facing host features are advertised only when the matching host callback exists. The native
adapter requires `onError` so rejected message and external-link callbacks remain inside the host's
controlled error boundary. Bridge work is capped at 128 concurrent inbound messages, and
exactly-once tool lifecycle sends are serialized across asynchronous transports.

## Install

```bash
npm install @mcp-native/webview
```

`@mcp-native/core` is installed as a dependency. The package is ESM-only and includes TypeScript declarations.

## Inline HTML (opt-in)

```ts
import { createWebViewDocument } from "@mcp-native/webview";

const document = createWebViewDocument(
  {
    uri: "mcp://example/app",
    mimeType: "text/html",
    text: "<main>Hello from an MCP App</main>",
  },
  { allowInlineDocuments: true },
);

// { kind: "inline", html: "...", baseUrl: "mcp://example/app" }
```

Inline documents and remote documents are both denied by default. Inline base URLs must use a non-network allowlisted scheme (`ui:` or `mcp:`) so relative fetches cannot be steered at an arbitrary https origin. Embedded credentials are always rejected.

## Remote documents require an origin allowlist

```ts
import { createWebViewDocument, WebViewPolicyError } from "@mcp-native/webview";

const resource = {
  uri: "https://example.com/app",
  mimeType: "text/html",
};

try {
  createWebViewDocument(resource);
} catch (error) {
  if (error instanceof WebViewPolicyError) {
    console.error(error.message);
  }
}

const allowed = createWebViewDocument(resource, {
  allowRemoteDocuments: true,
  allowedRemoteOrigins: ["https://example.com"],
});
```

Remote inputs are `{ uri, mimeType }` references (not MCP text/blob resource bodies). Only credential-free `http:` / `https:` URIs are accepted, and the URI origin must appear exactly in `allowedRemoteOrigins`. Binary `blob` resources are rejected.

## Public API

| Export                                                       | Purpose                                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `MCP_APPS_EXTENSION_CAPABILITIES`                            | Exact stable extension settings for SDK advertisement and negotiation.          |
| `negotiateMcpApps` / `isMcpAppsGrant`                        | Require explicit mutual support before the stable resource path.                |
| `parseMcpAppsToolMeta` / `filterMcpAppsModelTools`           | Validate discovery and enforce model/app visibility.                            |
| `loadMcpAppsResource` / `resolveMcpAppsResource`             | Read and validate one exact stable text/blob resource and metadata.             |
| `createMcpAppsNativeSandbox`                                 | Build the closed CSP, navigation, storage, permission, and document descriptor. |
| `createMcpAppsReactNativeWebViewProps`                       | Select an explicit safe subset for a locally bundled React Native WebView.      |
| `createMcpAppsNativeDeliveryScript`                          | Deliver JSON data through the fixed local native bridge shim.                   |
| `McpAppsBridge`                                              | Run the bounded stable View/host JSON-RPC lifecycle.                            |
| `isHtmlResource` / `createWebViewDocument`                   | Legacy generic HTML detection and deny-by-default document policy.              |
| `McpAppsError` / `McpAppsBridgeError` / `WebViewPolicyError` | Controlled validation and policy failures.                                      |

The stable Apps path accepts only `text/html;profile=mcp-app`. The separate generic helpers support
`text/html` and `text/html+skybridge`; those MIME types never negotiate or resolve a stable App.

## Host responsibilities

Returning a `WebViewDocument` or sandbox descriptor is not permission to weaken platform controls.
A production host must still verify:

- allowed origins and navigation rules;
- ephemeral website data and cookie/process-pool isolation on each supported OS version;
- native download, permission, safe-browsing, custom-scheme, and teardown delegates;
- that every descriptor field maps to the intended locally bundled WebView implementation;
- user approval before any sensitive device capability or external effect; and
- an explicit `authorizeToolCall` policy whenever the View may proxy a same-server tool call.

See the repository's [security policy](https://github.com/pablospaniard/mcp-native/blob/main/SECURITY.md) before expanding this boundary. Install [`mcp-native`](https://www.npmjs.com/package/mcp-native) for the combined runtime and UI APIs.

The exact stable compatibility profile and the differences between browser iframe isolation and native WebView isolation are documented in [Standards and compatibility](https://github.com/pablospaniard/mcp-native/blob/main/docs/standards-compatibility.md).

## License

[MIT](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)
