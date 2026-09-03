# RFC-0001: MCP Native architecture

- Status: Accepted; architecture retained through Milestone 10
- Protocol profiles: [MCP](protocol-support.md), [A2UI v1 Candidate](a2ui-v1-conformance.md), and
  [MCP Apps](mcp-apps-compatibility.md)
- Date: 2026-08-25
- Last updated: 2026-09-03

## Summary

MCP Native turns MCP resources and actions into host-controlled native UI. It parses the documented
A2UI v1 Candidate profile into an internal trusted render plan, maps that plan to a local component
catalog, and returns validated actions to a host-owned delivery callback. The earlier custom `0.1`
model remains isolated under `/legacy` for migration.

HTML MCP Apps use a separately policy-gated WebView path. The WebView package implements the
documented stable `2026-01-26` native host-adapter profile without weakening the declarative native
boundary.

RFC-0001 established the package boundaries and trust model retained by the current release
candidate. See [Standards and compatibility](standards-compatibility.md) for the exact normative
baselines, verified profiles, and planned extensions.

Milestone 10 adds `@mcp-native/host` above these boundaries. That package composes official SDK
connection, negotiation, result classification, resource loading, rendering, policy, and lifecycle;
it does not move transport or UI dependencies into core or create a new server trust path.

## Non-negotiable security rule

Remote MCP servers may provide declarative UI and actions, but MCP Native never downloads and executes arbitrary React Native JavaScript.

All executable application code and native components are supplied by the host application. Server-provided input is untrusted data and must be validated before it reaches a renderer.

## Data flow

```text
MCP server
    |
    | tools/list, tools/call, resources/read
    v
official @modelcontextprotocol/client
    |
    v
@mcp-native/mcp
    | validated, JSON-safe contracts
    v
@mcp-native/core
    |
    +-- negotiated A2UI v1 JSONL resource_link
    |       |
    |       `-- resources/read --> validated text resource
    |       |
    |       v
    |   @mcp-native/a2ui
    |       |
    |       v
    |   validated surface
    |       |
    |       v
    |   @mcp-native/react-native
    |       |
    |       v
    |   host-owned native components
    |
    `-- HTML resource --> @mcp-native/webview --> policy-gated WebView
```

User actions take the reverse path. A component emits a typed action; the core runtime validates the complete action and dispatches the corresponding `tools/call` through the connected MCP client only when the host's action policy explicitly allows it.

## Package boundaries

### `@mcp-native/core`

Owns protocol-independent runtime contracts, MCP client abstraction, resource access, strict JSON/action validation, fail-closed action dispatch, and the generic extension capability substrate. It has no React Native or A2UI dependency.

Its resource contract preserves every content item returned by `resources/read`; a single URI can resolve to more than one text or blob item. Tool results preserve JSON-safe content blocks, the error flag, and structured content without exposing SDK-specific transport types.

### `@mcp-native/mcp`

Owns the integration with the official MCP TypeScript SDK. It accepts an already connected SDK `Client`, adapts `listTools`, `callTool`, and `readResource` to the contracts in `@mcp-native/core`, advertises host-approved extension settings, and exposes validated server extension settings. For protected Streamable HTTP it also supplies an issuer-bound interactive OAuth provider, exact official transport factory, bounded adapter over an app-owned native secret backend, and closed OS authentication-session result adapter while keeping native dependency selection, browser presentation, consent, and lifecycle in the host.

This package is the validation boundary between SDK results and the runtime. It rejects malformed collections, non-JSON values, non-plain objects, circular values, invalid optional fields, and resource bodies that are missing or ambiguous. The OAuth boundary additionally rejects insecure endpoints, any unsafe registered redirect URI, duplicate redirect query names, insecure or fragment-bearing endpoint/URI fields retained from discovery, literal fragment delimiters on server/redirect/authorization/callback URLs, issuer query/fragment components, callback/state substitution, cross-issuer stored credentials, malformed persistent scope or pending-authorization history, oversized individual or cumulative registration, discovery, and token data, resource-indicator mismatch, credential-bearing custom headers, overlapping authorization attempts or system sessions, cancellation races during active setup, handoff, or completion, and malformed or oversized native/recovery callbacks. Its reference store persists only through the host-supplied secret backend with fixed app-owned keys and bounded values, serializes state operations across same-namespace store objects in one JS runtime, binds a live state reservation and exact requested scopes to its provider, and retains a claimed reservation through verifier cleanup while allowing stale cleanup and callback completion after process restart; it never chooses a native module or treats general application storage as secure. An optional lifecycle coordinator manages only bounded host operations and data-free state around fresh host-created official SDK client/transport units, and serializes online/offline/shutdown transitions; SDK wire behavior remains outside it.

### `@mcp-native/a2ui`

Owns resource-link resolution, parsing, validation, and conversion boundaries for both the legacy
custom surface and the A2UI v1 Candidate adapter. It also owns the exact settings and negotiation
helper for the project-defined A2UI-over-MCP binding. Unsupported MIME types, ambiguous links or
contents, binary surfaces, versions, catalogs, components, bindings, functions, and actions fail
closed at their applicable boundary.

The custom resolver recognizes the legacy `application/a2ui+json` resource convention. Its deliberately small `0.1` input contains four nested node types, is deprecated and frozen, and remains isolated from the separately negotiated A2UI v1.0 Candidate path. The v1 adapter parses schema-validated lifecycle envelopes into bounded ordered state and requires a complete policy-gated snapshot before the React Native package adapts the supported subset, including bounded dynamic lists, into a trusted plan. It constructs pinned renderer-to-agent `action` envelopes and parses every renderer-to-agent message kind as owned data. Parsing never authorizes function execution, transport, or device access; agent-initiated renderer-function execution remains excluded from the [feature-scoped conformance profile](a2ui-v1-conformance.md).

### `@mcp-native/react-native`

Owns the native component catalog, React Native rendering, event translation, accessibility defaults, and host customization. The v1 typed render plan covers the complete pinned A2UI basic catalog plus exactly negotiated local host extensions; the deprecated custom `0.1` renderer remains limited to `View`, `Text`, `Button`, and `TextInput`.

The renderer accepts a catalog of locally bundled components instead of importing or resolving components named by the server. It explicitly selects every prop crossing into that catalog, derives closed accessibility semantics, and never spreads unchecked plan or server props. Hosts may use typed adapter helpers to translate those selected props into Expo UI, Gluestack, another design system, or application-owned components. The v1 catalog requires the four base primitives and provides optional slots for `Image`, `Icon`, `Divider`, `CheckBox`, `ChoicePicker`, `Slider`, `DateTimeInput`, `Tabs`, `Modal`, `Video`, and `AudioPlayer`; capability advertising is derived from installed, policy-ready slots. Closed variant catalogs may substitute host-owned structure, text, button, input, image, and choice-picker implementations. Required image and media grants carry exact resource and playback budgets to enforcing host loaders. Exactly negotiated, namespaced host extensions bind closed local manifests to helper-created registrations and explicit capability grants; inline catalogs remain disabled. The legacy `0.1` path remains on the four base primitives when a catalog is shared. None of these mechanisms lets a server select an import, native class, SVG payload, raw style, arbitrary prop, or command.

`createA2uiV1NativeHost` is the additive preferred ownership boundary for the React Native path. It
freezes a catalog snapshot and derives its validation policy, basic-catalog capabilities, exact
extension catalogs, resource policies, and host-authored layout declarations together. Explicit
mount preflight expands the same bounded trusted plan before React, verifies local registrations,
and rejects a component whose declared implementation does not support the shell's bounded,
unbounded, or scrolling parent. Layout metadata never enlarges protocol capability. The direct
surface API remains available for manual composition.

`useNativeRenderPlan` memoizes conversion for a validated surface identity. `useMcpNativeActionDispatcher` adapts asynchronous runtime dispatch to a synchronous component event and requires an error callback so action failures are observed. For the custom `0.1` legacy surface, text inputs emit `(binding, value)` only when the host provides a handler. `A2uiV1NativeSurface` instead owns a bounded local copy of the v1 data model, applies declared absolute string, boolean, number, and string-array bindings without network calls, rerenders dependent values, and resolves button context against the latest local state before emitting a validated action envelope to the host. Supported `openUrl` actions re-resolve a canonical HTTP(S) URL during that Button press and require a separate synchronous host predicate before the host-owned opener is called. The library never imports or invokes a platform URL handler. The host still owns action transport delivery, user consent, tool policy, and synchronization with the agent; the separate MCP adapter may own the validated SDK OAuth seam for protected HTTP.

Direct integrations may wrap rendering in `A2uiV1NativeSurfaceBoundary`; the registered-host surface
does so automatically. Adapter exceptions produce a stable redacted local error and unmount the
whole A2UI surface by default. A host may provide inert fallback UI, but the renderer never keeps a
partially actionable form mounted and never uses server-authored error text.

### `@mcp-native/webview`

Owns the compatibility path for HTML MCP Apps. It validates stable extension negotiation, tool
discovery and visibility, exact `ui://` resources, CSP and permission metadata, a closed native
WebView sandbox descriptor, a React Native WebView safe-prop adapter, and a bounded JSON-RPC
lifecycle. The older generic HTML document policy is a separate fallback and does not grant Apps
support. See the [exact native host profile](mcp-apps-compatibility.md).

### `mcp-native`

Convenience package for the runtime and UI APIs. Transport adapters remain separately installable so applications do not acquire an SDK or transport dependency they do not use.

### `@mcp-native/host` (`1.0.0` target)

Owns the optional high-level connect-call-render workflow. It composes `@mcp-native/mcp`, core,
A2UI, React Native, and WebView APIs; classifies supported negotiated results; supplies safe ordinary
MCP fallback; and coordinates action policy, cancellation, reconnect, error state, and teardown. It
does not reinterpret unknown formats, install custom server contracts, own application navigation,
or grant device capabilities. The low-level packages remain independently usable.

The implemented headless controller accepts fresh app-owned connection units and composes the MCP
adapter, runtime, connection lifecycle, and result resolver. It automatically discovers tools after
every connection, permits calls only against the exact active-connection definition, forwards
cancellation, rejects stale generations, bounds listeners and unsettled work, and exposes immutable
connection/tool/call snapshots. The optional `/react-native` entry point owns that controller's
mounted lifecycle and renders fixed accessible operational states, bounded inert ordinary content,
validated A2UI through the host catalog, or MCP Apps through one exact host-created sandbox and
bridge session. The host action-authorization helper presents separately validated A2UI actions and
MCP Apps tool calls to one immutable application decision union, denies by default, and serializes
reviews across both protocols. Protocol packages retain their own serialization, delivery, and
lifecycle rules.

## Capability model

The host owns the effective component and action allowlists. A server can request only capabilities the host has declared. Unknown components, actions, MIME types, and protocol versions are rejected rather than silently interpreted. Binding strings are accepted as opaque host data and must be validated by the host before path-like writes.

`McpNativeRuntime.dispatch()` applies a host-provided action policy and denies every surface action when no policy is configured. The lower-level `callTool()` operation remains available to trusted host code after JSON argument validation and is intentionally outside the surface-action policy. Prefer `createAllowlistActionPolicy()` so surface authorization includes exact or predicated arguments rather than tool names alone. When user review is required on this core dispatch path, `createConsentActionPolicy()` matches the same closed tool/argument boundary and supplies one immutable, host-authored risk, capability, sensitive-data, and external-sharing descriptor per dispatch; every descriptor dimension must be declared explicitly. Unknown actions and overlapping reviews fail closed, approval is not retained, and server annotations never populate or grant the consent descriptor. This core helper does not automatically govern direct `callTool()`, MCP Apps host callbacks, or A2UI v1 renderer-to-agent delivery. The high-level host package provides the explicit shared policy integration for the latter two paths; direct trusted calls remain separate.

Future capabilities that touch sensitive device APIs must be brokered by the host and may require user approval. Server declarations alone never grant device access.

MCP extension support is determined only from validated, explicit client and server capability maps. `_meta`, MIME types, and tool-result content are preserved as data but never grant an extension. The generic substrate reports negotiation or a typed fallback reason; each extension must separately validate its settings and implement its own semantics. The [project-owned A2UI binding](a2ui-mcp-binding.md) requires an exact settings match and defines ordinary MCP text/data as its graceful fallback.

## Architecture validation history

The original Milestone 0 path validated the package boundaries with the custom `0.1` model before
the repository added its current protocol profiles. That historical path remains covered through
the `/legacy` migration APIs.

That milestone established the following end-to-end flow:

1. Connect an MCP client and obtain `tools/list`.
2. Invoke a tool with `tools/call`.
3. Resolve an A2UI resource from the result.
4. Validate the surface through `@mcp-native/a2ui`.
5. Render native text, button, text input, and container components.
6. Route a button action back through `tools/call`.

## Current implementation status

Milestones 0–9 are complete in the `0.9.x` release candidate. The frozen low-level public API covers the
official SDK adapter and OAuth host boundary, the documented A2UI v1 Candidate profile and complete
pinned basic catalog, compiled host extensions, the stable MCP Apps native-host profile, and
host-owned mixed native/WebView composition. The original contract coverage remains in place:

- `@mcp-native/mcp` targets `@modelcontextprotocol/client` v2;
- an integration test connects the official `Client` and `McpServer` through the SDK's linked in-memory transport;
- `tools/list`, `tools/call`, and `resources/read` traverse the adapter and core runtime;
- malformed or aggregate-over-budget SDK-like results fail with `McpSdkAdapterError` before reaching UI code.
- an official SDK tool result can return an `application/a2ui+json` `resource_link` that is read and parsed through `@mcp-native/a2ui`;
- resolution requires exactly one matching link and one matching text resource, preventing server-controlled ambiguity or MIME guessing;
- errored tool results, oversized result collections, malformed links and contents, binary bodies, and invalid surfaces fail before rendering.
- validated surfaces mount through a host-provided catalog containing `View`, `Text`, `Button`, and `TextInput`, with optional closed host-owned variants for supported structure and style hints;
- buttons dispatch only their validated tool actions, and text inputs emit only declared binding changes;
- action arguments are validated again at the renderer and runtime boundaries;
- surface dispatch is deny-by-default and requires an explicit host action policy;
- all protocol-facing JSON reconstruction rejects cycles, non-plain objects, and non-finite numbers while preserving prototype-named keys as own data properties;
- renderer-selected accessibility labels are supplied for interactive components, while closed
  text/button roles, button disabled state, hidden-element focus exclusion, and text scaling are
  derived at the host boundary;
- renderer hooks memoize plans and route asynchronous dispatch results or failures to explicit host callbacks;
- component, interaction, hook, malformed-plan, public-export, and isolated package-consumer tests cover the boundary.

The MCP `2026-07-28` foundation is complete for RFC-0001's client boundary. The tool/resource boundary preserves official metadata, schemas, annotations, discriminated content, and cache semantics; a pinned integration test exercises the SDK's current HTTP handler/fetch path; and the selected official client conformance scenarios pass without expected failures. The conformance gate ingests the frozen official requirements fixture and requires every scored client requirement to be selected or explicitly excluded. Shared-store integration tests also prove that private cache entries remain isolated by host-provided principal partitions while public entries may be reused only for the same server identity and request. The exact target, tested `2025-11-25` compatibility lane, implemented operations, and [pinned conformance coverage](mcp-conformance.md) are documented explicitly. The official SDK continues to own wire behavior.

The extension and capability substrate is also complete. Core validates prefixed extension maps and requires mutual declarations; the SDK adapter exchanges settings on the modern HTTP path; metadata alone never grants support; and the project-owned A2UI binding pins an exact Candidate revision and ordered resource transport with text/data fallback. The A2UI package parses lifecycle envelopes, retains bounded ordered state, validates complete snapshots against the pinned basic catalog plus explicit host allowlists, including nested expressions in literal `formatString` sources reconstructed as catalog calls, and constructs the supported official renderer action envelope. The React Native package adapts and mounts the complete basic catalog with bounded dynamic lists, renderer-local typed bindings, bounded string/number/currency/date/plural formatting, pure boolean and validation evaluation, supported checks, dispatch-time template event resolution, required image and media grants, press-time policy-gated HTTP(S) `openUrl`, and closed locally compiled host extensions while rejecting unsupported components and functions. See the [standards-first roadmap](roadmap.md) and [media/extension profile](media-and-host-extensions.md).

MCP Apps uses a separate stable native-host profile. Its grant, resource resolver, sandbox, and
bridge are explicit boundaries, so native A2UI and HTML Apps can run as host-created sibling regions
without sharing protocol or policy authority.

## Pre-1.0 compatibility history

The original `0.0.x` `McpClient.readResource(uri)` returned one `McpResource`. The official SDK and MCP response model return a `contents` collection, so RFC-0001 now defines `Promise<McpReadResourceResult>` with `contents: readonly McpResource[]`.

Adapters written against `0.0.x` must wrap their resource in `contents`:

```ts
// Before
return { uri, text: "..." };

// RFC-0001 adapter milestone
return { contents: [{ uri, text: "..." }] };
```

This intentional pre-1.0 correction prevents silent data loss when a server returns multiple resource content items.

The same fidelity rule now applies to tool listings and content. `listTools()` returns `McpListToolsResult` rather than discarding result `_meta`, pagination, and cache hints, and MCP content uses official discriminated fields rather than a generic `{ type, data }` wrapper:

```ts
// Before
return [{ name: "save", inputSchema: { type: "object" } }];
return { content: [{ type: "text", data: { text: "Saved" } }] };

// Current RFC-0001 contract
return { tools: [{ name: "save", inputSchema: { type: "object" } }] };
return { content: [{ type: "text", text: "Saved" }] };
```

## Next work

- complete the independent security, accessibility, compatibility, protocol/schema, and native
  WebView reviews that gate `1.0.0`;
- extend A2UI with renderer-function execution and capability transport placement after the
  documented profile is updated;
- extend MCP Apps with optional stable methods and browser-host double-iframe support as separate
  profiles;
- add a post-1.0 registry for additional reviewed standard contracts and explicitly installed,
  namespaced, versioned custom input adapters without fallback from failed standard validation;
- extend the Expo Go proof with useful host-owned catalog mappings when needed; and
- maintain canonical catalog conformance cases, local doctor diagnostics, and non-overwriting
  catalog/extension scaffolds as integration tooling; and
- develop first-class SwiftUI, Jetpack Compose, and native capability-provider packages after
  `1.0.0`.
