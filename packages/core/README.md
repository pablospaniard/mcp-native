<div align="center">

# @mcp-native/core

### Transport-neutral MCP runtime contracts and safe action routing

[![npm](https://img.shields.io/npm/v/@mcp-native/core)](https://www.npmjs.com/package/@mcp-native/core)
[![downloads](https://img.shields.io/npm/dm/@mcp-native/core)](https://www.npmjs.com/package/@mcp-native/core)
[![license](https://img.shields.io/npm/l/@mcp-native/core)](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)

[GitHub](https://github.com/pablospaniard/mcp-native) · [Architecture](https://github.com/pablospaniard/mcp-native/blob/main/docs/RFC-0001-architecture.md) · [Standards status](https://github.com/pablospaniard/mcp-native/blob/main/docs/standards-compatibility.md) · [Security](https://github.com/pablospaniard/mcp-native/blob/main/SECURITY.md)

</div>

`@mcp-native/core` is the protocol- and renderer-independent foundation of MCP Native. Use it to
connect an MCP client to the runtime, validate JSON data, and route declared actions through an
application policy. It does not depend on A2UI, React Native, WebViews, or a particular MCP SDK.

## Install

Until the stable `1.0.0` release, select the beta package explicitly:

```bash
npm install @mcp-native/core@beta
```

The package is ESM-only and includes TypeScript declarations.

## Quick start

Adapt any MCP client to the `McpClient` interface, then use `McpNativeRuntime` to coordinate operations:

```ts
import { McpNativeRuntime, createAllowlistActionPolicy, type McpClient } from "@mcp-native/core";

const client: McpClient = {
  async listTools() {
    return {
      tools: [
        {
          name: "save_profile",
          description: "Save profile details",
          inputSchema: { type: "object" },
        },
      ],
    };
  },
  async callTool(name, arguments_) {
    return {
      content: [{ type: "text", text: `Called ${name}` }],
      structuredContent: { name, arguments: arguments_ },
    };
  },
  async readResource(uri) {
    return {
      contents: [{ uri, mimeType: "text/plain", text: "Hello from MCP" }],
    };
  },
};

const runtime = new McpNativeRuntime(client, {
  actionPolicy: createAllowlistActionPolicy([
    { name: "save_profile", arguments: { displayName: "Ada" } },
  ]),
});

await runtime.dispatch({
  type: "tool",
  name: "save_profile",
  arguments: { displayName: "Ada" },
});
```

## Public API

| Export                                                                                            | Purpose                                                                                     |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `McpNativeRuntime`                                                                                | Delegates tool listing, tool calls, resource reads, and declared actions to an `McpClient`. |
| `McpClient`                                                                                       | Minimal interface implemented by an SDK- or transport-specific adapter.                     |
| `McpTool`, `McpListToolsResult`, `McpResource`, `McpReadResourceResult`, `McpToolCallResult`      | Transport-neutral MCP data contracts used by the runtime.                                   |
| `McpContent` and its discriminated content interfaces                                             | Exact text, image, audio, resource-link, and embedded-resource shapes.                      |
| `McpAnnotations`, `McpToolAnnotations`, `McpIcon`, `McpCacheScope`                                | Official metadata, presentation hints, and response-cache contracts.                        |
| `ToolAction`, `McpNativeAction`                                                                   | Declarative actions that can be dispatched through the runtime.                             |
| `McpNativeRuntimeOptions`, `McpNativeActionPolicy`                                                | Host policy controlling which validated surface actions `dispatch()` may execute.           |
| `createAllowlistActionPolicy`, `McpNativeToolAllowlistEntry`                                      | Fail-closed helper that authorizes tools by name and exact or predicated arguments.         |
| `createConsentActionPolicy`, `McpNativeToolConsentEntry`, `McpNativeToolConsentRequest`           | Core `dispatch()` consent over explicit risk, capability, and privacy descriptors.          |
| `McpNativeToolRisk`, `McpNativeToolConsentReviewer`                                               | Closed risk vocabulary and exact-boolean host review callback.                              |
| `createExpiringGrantActionPolicy`, `revokeMcpNativeConsentGrant`                                  | Bounded persistent grants around any action policy, with explicit revocation.               |
| `McpNativeConsentGrantStore`, `McpNativeConsentGrantRecord`                                       | Host-owned durable grant storage contract and validated record.                             |
| `McpNativeActionDeniedError`                                                                      | Fail-closed error for actions not explicitly allowed by the host.                           |
| `parseMcpNativeAction`, `parseJsonObject`, `parseJsonValue`                                       | Strict validators that return safely reconstructed untrusted data.                          |
| `JsonValidationOptions`                                                                           | Optional cumulative string/key budget for one reconstructed JSON graph.                     |
| `JSON_MAX_DEPTH`, `JSON_MAX_VALUES`, `JSON_MAX_STRING_LENGTH`, `JSON_MAX_TOTAL_STRING_CODE_UNITS` | Fixed complexity limits and a shared protocol-facing cumulative string/key budget.          |
| `JsonValidationError`                                                                             | Error for non-JSON, circular, non-plain, or non-finite input.                               |
| `JsonPrimitive`, `JsonValue`, `JsonObject`                                                        | JSON-safe value types for untrusted protocol data.                                          |
| `McpExtensionSettings`, `McpExtensionNegotiation`                                                 | Validated extension maps and explicit negotiation outcomes.                                 |
| `parseMcpExtensionSettings`, `isMcpExtensionIdentifier`                                           | Fail-closed validation for prefixed extension declarations.                                 |
| `negotiateMcpExtension`                                                                           | Computes mutual support from client and server declarations only.                           |

## Extension negotiation

Extension settings are JSON objects keyed by mandatorily prefixed identifiers. Core preserves this capability data without depending on an extension implementation:

```ts
import { negotiateMcpExtension } from "@mcp-native/core";

const result = negotiateMcpExtension(
  "com.example/native-ui",
  { "com.example/native-ui": { version: "1" } },
  { "com.example/native-ui": { version: "1" } },
);
```

Only the two explicit maps participate. Metadata, MIME types, and tool results cannot grant support. `McpNativeRuntime.negotiateExtension()` reads both maps from the optional `McpClient.getClientExtensionSettings()` and `getServerExtensionSettings()` boundary, so callers cannot substitute an unadvertised client map, and returns a typed fallback result when either side is absent.

## Per-action consent review

Use `createConsentActionPolicy()` when a core `McpNativeRuntime.dispatch()` action needs an explicit user decision rather than a static allowlist:

```ts
import { McpNativeRuntime, createConsentActionPolicy } from "@mcp-native/core";

const runtime = new McpNativeRuntime(client, {
  actionPolicy: createConsentActionPolicy(
    [
      {
        name: "share_location",
        risk: "external-write",
        authorizeArguments: (arguments_) => arguments_?.precision === "city",
        capabilities: ["device.location"],
        sensitiveData: ["user.location"],
        sharesDataExternally: true,
      },
    ],
    async (request) => presentLocalizedConsentSheet(request),
  ),
});
```

Profiles and their identifiers are host-authored. Every profile must explicitly provide `capabilities`, `sensitiveData`, and `sharesDataExternally`; use empty arrays or `false` only after the host has classified that dimension. Map identifiers to app-owned localized copy; do not display server tool names, descriptions, annotations, arguments, or metadata as trusted consent claims. Unknown tools and arguments are denied without prompting, the reviewer must return an exact boolean, and concurrent evaluations are denied instead of accumulating consent dialogs. Approval applies to one dispatch only.

Wrap the policy with `createExpiringGrantActionPolicy()` when the host offers remembered approval. Its app-owned grant key must bind the policy revision, server/account partition, tool, and argument class. Stored records are validated, expired records are removed, evaluation is serialized, and a grant is saved only after exact approval. Set a zero duration for allow-once and call `revokeMcpNativeConsentGrant()` from the host's user-visible revoke, logout, server-removal, and policy-migration paths.

`actionPolicy` protects `McpNativeRuntime.dispatch()`. Set `trustedToolPolicy` to protect direct `callTool()` operations with the same or another explicit policy; omission preserves the lower-level trusted seam. MCP Apps requires its own `authorizeToolCall` callback and A2UI v1 delivery requires `createActionDeliveryHandler`, because those packages own different protocol boundaries.

## Design boundaries

- No React Native dependency.
- No A2UI or WebView dependency.
- No transport or official MCP SDK dependency.
- No remote code loading or execution.
- Surface-driven `dispatch()` is denied unless the host's action policy explicitly allows it.
- Direct `callTool()` is a lower-level trusted seam by default. Set `trustedToolPolicy` when it must receive explicit policy review.
- Prefer `createAllowlistActionPolicy()` so authorization covers tool arguments, not only tool names.
- Use `createConsentActionPolicy()` for explicit review; it never treats server annotations as risk classification. Add the bounded grant wrapper only for host-authored, expiring, revocable persistence.
- Untrusted JSON is reconstructed without prototype mutation and rejects cycles, non-plain objects, non-finite numbers, excessive depth, excessive value counts, and oversized strings or object keys.
- Declared actions reject fields outside the exact `{ type, name, arguments? }` contract.
- Extension declarations require prefixed identifiers and JSON-object settings; server metadata never activates an extension.
- Host applications remain responsible for authentication, permissions, transport security, and user approval.

## Related packages

- [`@mcp-native/a2ui`](https://www.npmjs.com/package/@mcp-native/a2ui) validates declarative surfaces and actions.
- [`@mcp-native/mcp`](https://github.com/pablospaniard/mcp-native/tree/main/packages/mcp) adapts connected official SDK clients to this package's contracts.
- [`@mcp-native/react-native`](https://www.npmjs.com/package/@mcp-native/react-native) converts validated surfaces into trusted native render plans.
- [`@mcp-native/webview`](https://www.npmjs.com/package/@mcp-native/webview) defines the HTML compatibility policy boundary.
- [`mcp-native`](https://www.npmjs.com/package/mcp-native) re-exports the runtime and UI APIs.

## License

[MIT](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)
