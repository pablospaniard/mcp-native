# Stable MCP Apps compatibility profile

This document defines the exact MCP Apps profile implemented by `@mcp-native/webview`. Browser hosts
use a cross-origin double-iframe sandbox; native hosts apply the closed sandbox, lifecycle, and
platform integration contract documented here.

## Normative pin

- Protocol: MCP Apps `2026-01-26`, status Stable
- Extension identifier: `io.modelcontextprotocol/ui`
- Resource MIME type: `text/html;profile=mcp-app`
- Official interoperability dependency: `@modelcontextprotocol/ext-apps` `2.0.3`
- Official package source commit: `82221c0c8ce7661efa6771c9d461511b1650495f`
- Core MCP boundary: MCP `2026-07-28` through the official TypeScript SDK v2 adapter

The official `v2.0.3` tag resolves to the source commit above. Its stable `2026-01-26`
specification has the same Git blob as the previously reviewed `1.7.5` source. The 2.x release
changes SDK package integration, not the Apps wire protocol. The machine-readable
[profile audit](protocol-profile-audit.json) binds the dependency and source pins; re-review the tag
and stable specification whenever either changes.

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
| View requests      | Base profile: `ping`, `tools/call`, `resources/read`, `ui/open-link`, `ui/download-file`, `ui/message`, `ui/update-model-context`, and `ui/request-display-mode`; optional list profile: `tools/list` and `resources/list`                                                                 |
| View notifications | `notifications/message`, `ui/notifications/size-changed`, and `ui/notifications/request-teardown`                                                                                                                                                                                          |
| Host policy        | Capabilities are advertised only when a corresponding host callback exists; external links require an explicit positive callback result; tool calls are limited to the same supplied tool snapshot and stable app visibility; one tool authorization and delivery may be pending at a time |
| Bounds             | One MiB serialized bridge messages, at most 128 concurrent inbound method handlers, core JSON graph limits, 1,024 bridge tools, 2 MiB decoded HTML, 64 cumulative CSP domains, bounded content and download blocks, and one pending teardown request                                       |

The list profile is disabled unless the host passes an opaque `createMcpAppsServerMethods()` result.
It lists only the bounded tool snapshot already supplied to the bridge, filters model-only tools,
and exposes only the exact bound UI resource. Both methods accept the standard `cursor` and `_meta`
request shape; because each immutable snapshot is a single page, a cursor returns an empty terminal
page. The bridge does not advertise `listChanged` or emit list-change notifications because it has
no mutable discovery source. Sampling, prompts, resource templates, app-owned tools, and other
methods remain unsupported. Tool descriptors preserve bounded unknown JSON fields for forward
compatibility while requiring object-root input and output schemas for the fields the host uses.

## Browser double-iframe contract

`createMcpAppsBrowserSandbox()` implements the stable browser-host profile separately from the
native descriptor. It requires a host-controlled HTTPS (or loopback HTTP) proxy URL on an origin
different from the host, emits fixed outer `allow-scripts allow-same-origin` and inner
`allow-scripts allow-forms` sandbox policies, and intersects requested browser permissions with an
explicit host grant. The same Permissions Policy `allow` value is applied to both frames so an
approved feature can traverse the proxy without granting anything extra. The inner View never
receives `allow-same-origin` or top-navigation authority.

`createMcpAppsBrowserMessageRouter()` accepts traffic only from the exact proxy window object and
origin. The first message must be the exact `sandbox-proxy-ready` notification, after which the
adapter sends one bounded `sandbox-resource-ready` notification containing owned HTML, CSP,
permission grants, and the fixed inner policy. Later `ui/notifications/sandbox-*` traffic is
rejected in both directions so the untrusted View cannot impersonate the proxy handshake. All
ordinary forwarded values pass the same JSON graph and one-MiB serialized-size bounds as the native
bridge. The resource-ready envelope instead retains the separately validated two-MiB HTML allowance
without applying the core 64-KiB per-string limit a second time. A failed resource post leaves the
router retryable and does not report readiness.
The package provides descriptors and routing rather than downloading or evaluating proxy code; the
host owns and audits the proxy document it installs.

## Native sandbox contract

`createMcpAppsNativeSandbox()` produces a closed descriptor rather than accepting arbitrary WebView
props. It:

- inserts the resource-derived CSP before any server HTML and requires an HTML5 doctype plus leading
  `html` and `head` elements so executable content cannot precede the policy;
- uses the specification's inline script/style and self/data defaults while adding explicit
  `frame-src`, `base-uri`, `object-src`, and `form-action` restrictions. As required by the stable
  MCP Apps profile, resource metadata's `resourceDomains` grants `img-src`, `script-src`,
  `style-src`, `media-src`, and `font-src`. A granted resource origin can therefore deliver
  executable JavaScript and CSS and can remain usable as an exfiltration beacon regardless of
  `connect-src`; hosts must review and grant these origins no more broadly than required.
  `frameDomains` governs the `frame-src` directive only — native sub-frame navigation to any origin
  is always denied by the sandbox's navigation decision below, independent of this list;
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
resource metadata. It pins `injectedJavaScriptBeforeContentLoadedForMainFrameOnly: true` so the
native bridge bootstrap executes only in the top-level document even if some platform quirk allows
a sub-frame navigation to proceed. The explicit cache setting avoids relying on native
prop-application order to retain the cache-disabled side effect of Android's incognito setter.
Because the standard cross-platform props cannot prove enforcement of individual camera,
microphone, geolocation, or clipboard grants, this adapter rejects any non-empty grant. A host that
supports a sensitive permission must provide an audited platform adapter and user-approval boundary
before advertising it.

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

`tests/mcp-apps.test.mjs` covers official-schema interoperability for initialization, sandbox
handshake, and host
notifications, exact discovery and visibility behavior, text/blob resources, CSP and permission
metadata, native prop selection, data-only bridge delivery, lifecycle ordering, tool visibility,
link policy, optional lists and notifications, browser source/origin spoofing, reserved-message
smuggling, display modes, bounded and concurrently amplified input, contained callback failures,
async lifecycle races, unknown methods and fields, malformed JSON, premature messages, and graceful
teardown. `npm run check` runs this file through the coverage gate, and
`npm run package:smoke` verifies the public declarations and installable package output.
