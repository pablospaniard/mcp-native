# Stable MCP Apps compatibility profile

This document defines the exact MCP Apps profile implemented by `@mcp-native/webview`. Browser hosts
use a cross-origin double-iframe sandbox; native hosts apply the closed sandbox, lifecycle, and
platform integration contract documented here.

## Normative pin

- Protocol: MCP Apps `2026-01-26`, status Stable
- Extension identifier: `io.modelcontextprotocol/ui`
- Resource MIME type: `text/html;profile=mcp-app`
- Official interoperability dependency: `@modelcontextprotocol/ext-apps` `1.7.5`
- Official package source commit: `92f46a574568a3ddac7600343b7d3c4c4ed7b588`
- Core MCP boundary: MCP `2026-07-28` through the official TypeScript SDK v2 adapter

The official package is an exact development dependency. Tests compare the local revision, MIME
type, initialization result, visibility values, and host-to-View lifecycle notifications with its
exported schemas. Runtime code does not depend on the official AppBridge because that bridge targets
the v1 MCP SDK and browser `Window.postMessage`; MCP Native uses the v2 SDK at the server boundary and
a native WebView message channel. The local bridge implements the same pinned JSON-RPC shapes and
ordering at that native boundary.

Any change to the protocol revision, official package pin, extension settings, message set, or
resource interpretation requires a compatibility review, official-schema test updates, and this
document plus the changelog to change in the same pull request.

## Implemented stable profile

| Area               | Implemented behavior                                                                                                                                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Negotiation        | Mutual `io.modelcontextprotocol/ui` declaration with `mimeTypes` containing the exact stable HTML profile; metadata and MIME recognition alone grant nothing                                                                                                                               |
| Discovery          | Strict `_meta.ui.resourceUri` and `visibility`; app-only tools can be filtered from the model list and model-only tools are rejected from View calls                                                                                                                                       |
| Resources          | One exact predeclared `ui://` resource fetched through `resources/read`; text and canonical base64 UTF-8 bodies; exact stable MIME type                                                                                                                                                    |
| Resource metadata  | Closed `csp`, `permissions`, `domain`, and `prefersBorder` parsing with cumulative domain and HTML limits                                                                                                                                                                                  |
| View lifecycle     | `ui/initialize`, `ui/notifications/initialized`, host tool-input partial/complete/result/cancelled notifications, host-context changes, and graceful `ui/resource-teardown`                                                                                                                |
| View requests      | `ping`, `tools/call`, `resources/read`, `ui/open-link`, `ui/download-file`, `ui/message`, `ui/update-model-context`, and `ui/request-display-mode`                                                                                                                                         |
| View notifications | `notifications/message`, `ui/notifications/size-changed`, and `ui/notifications/request-teardown`                                                                                                                                                                                          |
| Host policy        | Capabilities are advertised only when a corresponding host callback exists; external links require an explicit positive callback result; tool calls are limited to the same supplied tool snapshot and stable app visibility; one tool authorization and delivery may be pending at a time |
| Bounds             | One MiB serialized bridge messages, at most 128 concurrent inbound method handlers, core JSON graph limits, 1,024 bridge tools, 2 MiB decoded HTML, 64 cumulative CSP domains, bounded content and download blocks, and one pending teardown request                                       |

The bridge implements the method set listed above. Sampling, prompts, resource/tool listing,
app-owned tools, methods outside the stable profile, and sandbox-proxy-reserved messages can be
added through a future reviewed profile with their official schemas, authority model, and bounds.

## Native sandbox contract

`createMcpAppsNativeSandbox()` produces a closed descriptor rather than accepting arbitrary WebView
props. It:

- inserts the resource-derived CSP before any server HTML and requires an HTML5 doctype plus leading
  `html` and `head` elements so executable content cannot precede the policy;
- uses the specification's inline script/style and self/data defaults while adding explicit
  `frame-src`, `base-uri`, `object-src`, and `form-action` restrictions;
- disables file/content access, persistent storage, cookies, third-party/shared cookies, automatic
  windows, direct downloads, and non-user-initiated media;
- keeps top-level navigation local to the exact `ui://` document and routes allowlisted HTTP(S)
  clicks to a host callback instead of navigating the WebView;
- intersects requested device permissions with an explicit host grant, defaulting to none; and
- supplies a fixed local bridge bootstrap plus data-only delivery helper. Server text is parsed as
  JSON data and is never evaluated as JavaScript source.

`createMcpAppsReactNativeWebViewProps()` maps the descriptor to an explicit safe subset for a locally
bundled `react-native-webview`. It selects props individually, explicitly disables caching in
addition to requesting incognito storage, denies media capture and geolocation, and never spreads
resource metadata. The explicit cache setting avoids relying on native prop-application order to
retain the cache-disabled side effect of Android's incognito setter. Because the standard
cross-platform props cannot prove enforcement of individual camera, microphone, geolocation, or
clipboard grants, this adapter rejects any non-empty grant. A host that supports a sensitive
permission must provide an audited platform adapter and user-approval boundary before advertising
it.

The React Native adapter requires an explicit `onError` boundary. It contains both synchronous
throws and asynchronous rejections from message and external-link callbacks so hostile View input
cannot create unhandled host-runtime rejections. The bridge rejects inbound work above its
concurrency limit before another host callback runs. Exactly-once tool lifecycle notifications are
serialized and reserve their state before transport; an ambiguous transport failure is never
retried because the View may already have received it.

App-visible `tools/call` proxying is advertised only when the host supplies both an explicit action
policy and a tool handler. The bridge validates visibility and bounded arguments, then requires the
policy to return exactly `true` before the handler runs. Request `_meta`, tool annotations, and
visibility remain non-authorizing. `createConsentActionPolicy()` can provide per-dispatch review;
direct trusted host calls remain a separate boundary. High-level hosts can install
`actionAuthorization.authorizeMcpAppsToolCall` from a configured
`createMcpNativeHostActionAuthorization({ authorize })` instance here so the same application
decision callback also reviews A2UI actions without changing this bridge's validation or delivery.

The optional resource `domain` field is host-specific. It is rejected unless the host supplies a
synchronous approval callback and its platform adapter can actually provide that dedicated origin.

## Native WebView isolation versus browser iframes

The stable specification requires web hosts to use a sandbox proxy on a different origin around the
View. A native WebView is a top-level embedded browser surface, so several guarantees differ:

- process and site isolation depend on WKWebView/Android WebView and OS versions rather than an outer
  cross-origin iframe;
- CSP is injected as the first document meta policy because an inline native HTML source has no HTTP
  response headers; platform adapters must not remove it, and should use response headers when they
  own an equivalent custom scheme handler;
- cookie jars, website data stores, safe browsing, process pools, permission delegates, and download
  delegates are platform settings, not iframe attributes;
- native navigation callbacks replace parent-frame navigation isolation; every top-level transition
  must use the closed navigation decision;
- a host must destroy the WebView, bridge listener, ephemeral data store, and platform delegates after
  teardown or terminal failure.

The provided descriptor and React Native prop adapter cover the common cross-platform controls.
Hosts must verify any additional native wrapper settings on their supported WKWebView and Android
WebView versions. Unsupported settings and platforms must deny rendering rather than silently weaken
the descriptor.

## Verification coverage

`tests/mcp-apps.test.mjs` covers official-schema interoperability for initialization and host
notifications, exact discovery and visibility behavior, text/blob resources, CSP and permission
metadata, native prop selection, data-only bridge delivery, lifecycle ordering, tool visibility,
link policy, display modes, bounded and concurrently amplified input, contained callback failures,
async lifecycle races, unknown methods and fields, malformed JSON, premature messages, and graceful
teardown. `npm run check` runs this file through the coverage gate, and
`npm run package:smoke` verifies the public declarations and installable package output.
