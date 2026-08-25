<div align="center">

# @mcp-native/webview

### A deny-by-default HTML MCP App compatibility boundary

[![npm](https://img.shields.io/npm/v/@mcp-native/webview)](https://www.npmjs.com/package/@mcp-native/webview)
[![downloads](https://img.shields.io/npm/dm/@mcp-native/webview)](https://www.npmjs.com/package/@mcp-native/webview)
[![license](https://img.shields.io/npm/l/@mcp-native/webview)](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)

[GitHub](https://github.com/pablospaniard/mcp-native) · [Architecture](https://github.com/pablospaniard/mcp-native/blob/main/docs/RFC-0001-architecture.md) · [Security](https://github.com/pablospaniard/mcp-native/blob/main/SECURITY.md)

</div>

> **Experimental:** this package defines document validation and policy decisions. It does not yet mount or sandbox a platform WebView.

`@mcp-native/webview` handles the compatibility path for MCP resources that contain HTML. It recognizes supported MIME types, prefers inline documents, and rejects remote documents unless the host explicitly grants them through policy.

## Install

```bash
npm install @mcp-native/webview
```

`@mcp-native/core` is installed as a dependency. The package is ESM-only and includes TypeScript declarations.

## Inline HTML

```ts
import { createWebViewDocument } from "@mcp-native/webview";

const document = createWebViewDocument({
  uri: "mcp://example/app",
  mimeType: "text/html",
  text: "<main>Hello from an MCP App</main>",
});

// { kind: "inline", html: "...", baseUrl: "mcp://example/app" }
```

## Remote documents are denied by default

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
});
```

## Public API

| Export                  | Purpose                                                                        |
| ----------------------- | ------------------------------------------------------------------------------ |
| `isHtmlResource`        | Returns whether a resource declares a supported HTML MIME type.                |
| `createWebViewDocument` | Validates a resource and returns an inline or policy-approved remote document. |
| `WebViewPolicy`         | Host policy controlling whether remote documents are allowed.                  |
| `WebViewDocument`       | Discriminated union for inline and remote documents.                           |
| `WebViewPolicyError`    | Error thrown for unsupported MIME types or denied remote documents.            |

Supported MIME types are `text/html` and `text/html+skybridge`.

## Host responsibilities

Returning a `WebViewDocument` is not permission to render it without further controls. A production host must still define:

- allowed origins and navigation rules;
- bridge message schemas and directionality;
- storage, cookie, download, and external-link policy;
- camera, microphone, location, clipboard, and filesystem permissions;
- process isolation and platform-specific WebView hardening.

See the repository's [security policy](https://github.com/pablospaniard/mcp-native/blob/main/SECURITY.md) before expanding this boundary. Install [`mcp-native`](https://www.npmjs.com/package/mcp-native) for the combined runtime and UI APIs.

## License

[MIT](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)
