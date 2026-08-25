<div align="center">

# @mcp-native/webview

### Deny-by-default HTML policy primitives for a future MCP Apps host

[![npm](https://img.shields.io/npm/v/@mcp-native/webview)](https://www.npmjs.com/package/@mcp-native/webview)
[![downloads](https://img.shields.io/npm/dm/@mcp-native/webview)](https://www.npmjs.com/package/@mcp-native/webview)
[![license](https://img.shields.io/npm/l/@mcp-native/webview)](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)

[GitHub](https://github.com/pablospaniard/mcp-native) · [Architecture](https://github.com/pablospaniard/mcp-native/blob/main/docs/RFC-0001-architecture.md) · [Standards status](https://github.com/pablospaniard/mcp-native/blob/main/docs/standards-compatibility.md) · [Security](https://github.com/pablospaniard/mcp-native/blob/main/SECURITY.md)

</div>

> **Experimental:** this package defines document validation and one policy decision. It does not mount or sandbox a platform WebView and is not a complete MCP Apps host.

`@mcp-native/webview` handles the compatibility path for MCP resources that contain HTML. It recognizes supported MIME types and rejects both inline and remote documents unless the host explicitly grants them through policy. Inline base URLs are limited to non-network `ui:` / `mcp:` schemes. Remote loads require an exact origin allowlist, accept only credential-free `http:` / `https:` URIs, and use a dedicated `{ uri, mimeType }` input rather than an MCP blob/text body.

Current support does not include tool `_meta.ui.resourceUri` discovery, `ui://` preloading, resource CSP or permission metadata, `ui/initialize`, AppBridge, the Apps JSON-RPC protocol, or a postMessage bridge. Those are required before this package can claim [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview) host compatibility.

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

| Export                  | Purpose                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| `isHtmlResource`        | Returns whether a resource declares a supported HTML MIME type.                           |
| `createWebViewDocument` | Validates a text or remote HTML input and returns a policy-approved document descriptor.  |
| `WebViewDocumentInput`  | `McpTextResourceContents` or `{ uri, mimeType }` remote reference (never blob resources). |
| `WebViewRemoteResource` | Remote HTML reference without a resource body.                                            |
| `WebViewPolicy`         | Host policy for inline opt-in, remote opt-in, and remote origin allowlists.               |
| `WebViewDocument`       | Discriminated union for inline and remote documents.                                      |
| `WebViewPolicyError`    | Error thrown for unsupported MIME types, schemes, credentials, or denied documents.       |

Supported MIME types are `text/html` and `text/html+skybridge`.

## Host responsibilities

Returning a `WebViewDocument` is not permission to render it without further controls. A production host must still define:

- allowed origins and navigation rules;
- bridge message schemas and directionality;
- storage, cookie, download, and external-link policy;
- camera, microphone, location, clipboard, and filesystem permissions;
- process isolation and platform-specific WebView hardening.

See the repository's [security policy](https://github.com/pablospaniard/mcp-native/blob/main/SECURITY.md) before expanding this boundary. Install [`mcp-native`](https://www.npmjs.com/package/mcp-native) for the combined runtime and UI APIs.

The planned compatibility work and the differences between browser iframe isolation and native WebView isolation are tracked in [Standards and compatibility](https://github.com/pablospaniard/mcp-native/blob/main/docs/standards-compatibility.md).

## License

[MIT](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)
