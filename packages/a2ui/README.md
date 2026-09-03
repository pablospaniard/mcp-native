<div align="center">

# @mcp-native/a2ui

### Strict parsing for declarative MCP Native surfaces

[![npm](https://img.shields.io/npm/v/@mcp-native/a2ui)](https://www.npmjs.com/package/@mcp-native/a2ui)
[![downloads](https://img.shields.io/npm/dm/@mcp-native/a2ui)](https://www.npmjs.com/package/@mcp-native/a2ui)
[![license](https://img.shields.io/npm/l/@mcp-native/a2ui)](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)

[GitHub](https://github.com/pablospaniard/mcp-native) · [Architecture](https://github.com/pablospaniard/mcp-native/blob/main/docs/RFC-0001-architecture.md) · [Standards status](https://github.com/pablospaniard/mcp-native/blob/main/docs/standards-compatibility.md) · [Security](https://github.com/pablospaniard/mcp-native/blob/main/SECURITY.md)

</div>

`@mcp-native/a2ui` turns A2UI lifecycle messages into validated surface state that a host can safely
render. It covers the documented A2UI v1 Candidate profile: pinned schemas, catalog capabilities,
lifecycle messages, renderer messages, and the project-owned MCP binding.

New integrations should start with the v1 flow below. The older custom 0.1 APIs remain available
from `/legacy` for migration. The [A2UI profile](https://github.com/pablospaniard/mcp-native/blob/main/docs/a2ui-v1-conformance.md)
contains the exact protocol coverage and limits.

## Install

```bash
npm install @mcp-native/a2ui
```

`@mcp-native/core` is installed as a dependency. The package is ESM-only and includes TypeScript declarations.

## Start with A2UI v1 Candidate

New integrations negotiate the project-owned MCP binding, resolve the pinned JSONL lifecycle
stream, apply it to `A2uiSurfaceStore`, and validate the resulting snapshot against the host's
catalog policy. Continue with the [binding example](#a2ui-over-mcp-capability-binding), [catalog
capabilities](#a2ui-v1-catalog-capabilities), and [complete profile](https://github.com/pablospaniard/mcp-native/blob/main/docs/a2ui-v1-conformance.md).

## Legacy custom `0.1` migration example

The following APIs remain available for migration but are deprecated. New hosts should use the v1
flow above; existing custom `0.1` integrations can follow the [migration guide](https://github.com/pablospaniard/mcp-native/blob/main/docs/migration-to-1.0.md).
The current release candidate exposes them only from the explicit `/legacy` subpath, which stays
frozen for migration and security fixes.

```ts
import { parseA2uiSurface } from "@mcp-native/a2ui/legacy";

const surface = parseA2uiSurface({
  version: "0.1",
  root: {
    id: "welcome",
    type: "container",
    children: [
      { id: "title", type: "text", text: "Welcome" },
      {
        id: "name",
        type: "text-input",
        label: "Display name",
        binding: "profile.displayName",
      },
      {
        id: "save",
        type: "button",
        label: "Save",
        action: {
          type: "tool",
          name: "save_profile",
          arguments: { source: "onboarding" },
        },
      },
    ],
  },
});
```

The parser also accepts a JSON string:

```ts
const surface = parseA2uiSurface(
  '{"version":"0.1","root":{"id":"title","type":"text","text":"Hello"}}',
);
```

## Resolve a tool-result resource

An MCP tool may return a `resource_link` for a declarative surface. Pass the connected runtime or any `A2uiResourceReader` to the resolver:

```ts
import { resolveA2uiResourceFromToolResult } from "@mcp-native/a2ui/legacy";

const toolResult = await runtime.callTool("open_profile");
const resolved = await resolveA2uiResourceFromToolResult(runtime, toolResult);

console.log(resolved.uri);
console.log(resolved.surface.root);
```

Resolution succeeds only when:

1. the tool result is not marked as an error;
2. it contains exactly one `resource_link` with MIME type `application/a2ui+json`;
3. `resources/read` returns exactly one item with the same URI and MIME type;
4. that item contains text, not a blob;
5. the text passes `parseA2uiSurface`.

Other tool content and non-A2UI resource links may coexist with the surface link. MCP Native never guesses a MIME type or chooses between multiple matching surfaces.

The legacy `application/a2ui+json` resource convention comes from earlier A2UI-over-MCP work. The [A2UI v1.0 Candidate protocol](https://github.com/a2ui-project/a2ui/blob/7541f953050cd58b80f0bf5d85fe2d63192af305/specification/v1_0/docs/a2ui_protocol.md) is transport-agnostic and uses a stream of `v1.0` envelopes. New integrations use the negotiated v1 JSONL flow documented below.

The official v1.0 surface-store state now has a strict React Native adapter, including bounded dynamic lists, local string state, supported catalog functions, and host-callback action envelopes, into the internal trusted render plan. This does not evolve the custom `0.1` object into a competing wire protocol. See the [compatibility matrix and conformance roadmap](https://github.com/pablospaniard/mcp-native/blob/main/docs/standards-compatibility.md).

## A2UI-over-MCP capability binding

The package exports a project-owned binding under `io.github.pablospaniard/mcp-native-a2ui`. It is enabled only when both peers advertise the exact binding version, A2UI Candidate revision, JSONL resource transport, and MIME type:

```ts
import { A2UI_MCP_EXTENSION_CAPABILITIES, negotiateA2uiMcpBinding } from "@mcp-native/a2ui";

const result = negotiateA2uiMcpBinding(
  adapter.getClientExtensionSettings(),
  adapter.getServerExtensionSettings(),
);
```

A fallback result means the host uses ordinary MCP text or structured data. A resource link, MIME type, or `_meta` value never activates the binding by itself. The exact capability exchange, ordered `resource-text-jsonl` mapping, and failure behavior are documented in the [project binding contract](https://github.com/pablospaniard/mcp-native/blob/main/docs/a2ui-mcp-binding.md).

## A2UI v1 catalog capabilities

A2UI's agent and renderer capability objects are separate from the project-owned MCP binding settings. Parse peer metadata and negotiate only exact shared catalog IDs:

```ts
import {
  createA2uiV1RendererCapabilities,
  negotiateA2uiV1Capabilities,
  parseA2uiV1AgentCapabilities,
} from "@mcp-native/a2ui";

const rendererCapabilities = createA2uiV1RendererCapabilities({
  supportedCatalogIds: ["https://example.com/catalogs/native-v1"],
});
const agentCapabilities = parseA2uiV1AgentCapabilities(untrustedAgentMetadata);
const catalogs = negotiateA2uiV1Capabilities(agentCapabilities, rendererCapabilities);
```

These APIs close fields the pinned schemas leave permissive, require the protocol's normative agent catalog list, reject empty or duplicate IDs, and keep inline catalogs disabled. A host must advertise only catalogs it fully implements. The React Native adapter implements the complete basic catalog but still derives capability names from installed, policy-ready component slots; component-name coverage alone is not grounds to advertise functions or policies the host did not install.

Locally compiled semantic components use the separate project-owned
`io.mcp-native/a2ui-host-extensions` profile. Its helpers parse closed compatibility manifests,
negotiate exact extension/catalog/schema/component tuples, and create opaque platform registries.
Pass the registry to the envelope parser, resolver, surface store, and validation policy. Inline
catalogs, server-selected code, raw children/props/styles, and commands stay disabled. See the
[media and host-extension guide](../../docs/media-and-host-extensions.md).

## Official v1.0 envelopes and surface store

After mutual negotiation, hosts can resolve a JSONL resource and apply lifecycle envelopes:

```ts
import {
  A2UI_MCP_EXTENSION_CAPABILITIES,
  A2uiSurfaceStore,
  createA2uiV1BasicCatalogPolicy,
  negotiateA2uiMcpBinding,
  resolveA2uiV1JsonlFromToolResult,
} from "@mcp-native/a2ui";

const binding = negotiateA2uiMcpBinding(
  A2UI_MCP_EXTENSION_CAPABILITIES,
  adapter.getServerExtensionSettings(),
);
const { envelopes } = await resolveA2uiV1JsonlFromToolResult(runtime, toolResult, binding);
const store = new A2uiSurfaceStore();
store.applyAll(envelopes);

const surface = store.getValidated(
  "surface-id",
  createA2uiV1BasicCatalogPolicy({
    allowedComponentNames: ["Column", "Text", "Button"],
    allowedEventNames: ["continue"],
  }),
);
```

Only `createSurface`, `updateComponents`, `updateDataModel`, and `deleteSurface` agent-to-renderer envelopes are accepted by the lifecycle parser. Raw store snapshots may be incomplete while ordered updates arrive. Store snapshots include a host-owned `dataModelRevision` that changes only after an accepted agent data-model update, allowing renderers to preserve local edits across equivalent fresh snapshots. A batch is capped at 1,024 envelopes and at the store-wide JSON-value and string-work budgets; envelopes are parsed sequentially and any failure rolls back the batch. The store bounds retained surfaces and components, plus cumulative retained JSON values and string/key code units across all surfaces; component replacements update those budgets incrementally. `getValidated` is the required pre-render boundary for the pinned basic catalog, explicit host component/event/function allowlists, reachable child references and cycles, template-aware binding paths, component placement rules, and any negotiated extension registry. The React Native package adapts and mounts every basic-catalog component, including bounded dynamic lists, typed renderer-local bindings, formatting, pure boolean and validation functions, supported checks, required image/media grants, host-policy-gated HTTP(S) `openUrl`, and closed local extensions after revalidation. `createA2uiV1ActionEnvelope` constructs actions, while `parseA2uiV1RendererToAgentEnvelope` validates all four pinned renderer-to-agent message kinds as owned data. `createA2uiV1ActionDeliveryHandler` adds a serialized, fail-closed authorization boundary before a host-owned action transport; policy and delivery receive separate owned copies. An overlapping action is denied before its untrusted envelope or data model is parsed and therefore is not passed to `onDenied`. Parsing does not execute functions, select transport, or grant device access. The deprecated custom `0.1` resolver remains isolated and never receives a failed v1 stream. See the [exact conformance profile and migration guide](https://github.com/pablospaniard/mcp-native/blob/main/docs/a2ui-v1-conformance.md).

## Deprecated custom `0.1` surface

| Node         | Required fields         | Purpose                                                |
| ------------ | ----------------------- | ------------------------------------------------------ |
| `container`  | `id`, `children`        | Groups nested surface nodes.                           |
| `text`       | `id`, `text`            | Declares trusted text content.                         |
| `button`     | `id`, `label`, `action` | Declares a tool action for host-controlled dispatch.   |
| `text-input` | `id`, `label`           | Declares an input with optional `value` and `binding`. |

The only supported action is `{ type: "tool", name, arguments? }`. Arguments must contain JSON-safe values.

## Public API

| Export                                                                                                    | Purpose                                                                 |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `A2uiResourceError`, `A2uiParseError`                                                                     | Specific resolution and parsing failures.                               |
| `A2UI_MIME_TYPE`                                                                                          | Exact A2UI media type.                                                  |
| `A2UI_MCP_EXTENSION_ID`, `A2UI_MCP_EXTENSION_CAPABILITIES`                                                | Exact project-owned extension declaration.                              |
| `negotiateA2uiMcpBinding`, `A2uiMcpBindingNegotiation`, `A2uiMcpBindingGrant`                             | Exact-match negotiation with typed fallback reasons.                    |
| `A2UI_MCP_BINDING_VERSION`, `A2UI_MCP_PROTOCOL_VERSION`, `A2UI_MCP_SCHEMA_REVISION`, `A2UI_MCP_TRANSPORT` | Pinned binding and Candidate transport values.                          |
| `parseA2uiV1AgentCapabilities`, `parseA2uiV1RendererCapabilities`                                         | Strict pinned-schema capability metadata boundaries.                    |
| `createA2uiV1RendererCapabilities`, `negotiateA2uiV1Capabilities`                                         | Host-owned declarations and exact shared-catalog negotiation.           |
| Host-extension profile constants, manifest parser, capability parser, and negotiation                     | Exact project-owned local-extension declaration and mutual tuple match. |
| `createA2uiV1HostExtensionRegistry`, registry getters and validators                                      | Opaque platform registry plus closed component/event validation.        |
| `parseA2uiV1Envelope`, `parseA2uiV1Jsonl`                                                                 | Schema-validate v1 lifecycle envelopes and JSONL batches.               |
| `A2uiSurfaceStore`                                                                                        | Ordered lifecycle state plus policy-gated `getValidated`.               |
| `A2UI_V1_MAX_STORE_VALUES`, `A2UI_V1_MAX_STORE_STRING_CODE_UNITS`                                         | Cumulative retained-state limits for one surface store.                 |
| `createA2uiV1BasicCatalogPolicy`, `A2uiV1SurfaceValidationPolicy`                                         | Explicit host allowlists for components, events, and functions.         |
| `validateA2uiV1SurfaceState`                                                                              | Revalidate a complete snapshot at another public trust boundary.        |
| `createA2uiV1ActionEnvelope`, `A2uiV1ActionEnvelope`                                                      | Construct an owned, pinned-schema renderer action for host transport.   |
| `createA2uiV1ActionDeliveryHandler`                                                                       | Authorize each action before host-owned transport delivery.             |
| `parseA2uiV1RendererToAgentEnvelope`, renderer-to-agent envelope types                                    | Parse every pinned renderer message as owned, non-authorizing data.     |
| `evaluateA2uiV1FormatString`                                                                              | Evaluate interpolation and report parser-counted work to budgets.       |
| `A2UI_V1_BASIC_CATALOG_ID`, catalog name constants                                                        | Exact pinned catalog identity and selectable host capabilities.         |
| `resolveA2uiV1JsonlFromToolResult`, `ResolvedA2uiV1JsonlResource`                                         | Resolve a JSONL A2UI resource without using the `0.1` parser.           |
| `A2UI_V1_PROTOCOL_VERSION`, `A2UI_V1_MAX_SOURCE_LENGTH`, `A2UI_V1_MAX_ENVELOPES`, store limit constants   | v1 protocol and complexity limits.                                      |

### Legacy `/legacy` API

| Export                                             | Purpose                                                        |
| -------------------------------------------------- | -------------------------------------------------------------- |
| `resolveA2uiResourceFromToolResult`                | Deprecated custom `0.1` resource resolver.                     |
| `parseA2uiSurface`                                 | Deprecated custom `0.1` surface parser.                        |
| `A2UI_VERSION`                                     | Exact legacy custom model version.                             |
| `A2UI_MAX_DEPTH`, `A2UI_MAX_NODES`                 | Legacy container-tree complexity limits.                       |
| `A2UI_MAX_SOURCE_LENGTH`, `A2UI_MAX_STRING_LENGTH` | Legacy serialized-input and string-field limits.               |
| `ResolvedA2uiResource`                             | URI, MIME type, and validated legacy surface.                  |
| `A2uiSurface`, `A2uiNode`, node interfaces         | Validated legacy surface, node union, and concrete node types. |

## Security behavior

- Input is treated as untrusted at the parser boundary.
- Resolution requires an exact MIME type, URI match, and unambiguous text content.
- Errored tool results and binary A2UI resources are rejected.
- Unknown surface versions, node types, action types, and undeclared fields are rejected.
- Serialized surfaces, string fields, and tool-argument JSON graphs have fixed complexity limits.
- Tool arguments are recursively constrained to finite, acyclic JSON values in plain objects.
- JSON keys such as `__proto__` are preserved as ordinary own data properties without changing object prototypes.
- Parsing never resolves components or executes server-provided code.
- Renderer action construction selects a closed field set, owns its JSON context and metadata, and validates the official pinned renderer-to-agent schema.
- A2UI action delivery requires an exact host policy decision, denies concurrent reviews, and never treats parsing as authorization.
- Renderer-ready v1 snapshots require a complete acyclic root-reachable graph and explicit host allowlists.
- Capability metadata rejects unknown versions and fields, empty or duplicate catalog IDs, non-JSON values, and inline catalog definitions.
- Relative bindings and `@index` are accepted only inside dynamic-list template context.
- Catalog functions and agent events are denied unless named by host policy.
- `formatString` is accepted only when explicitly allowlisted and its `value` is a literal string. Its interpolation language is parsed with depth, expression-count, cumulative-source, per-result, and expanded-plan limits; every embedded binding and named function call is validated against template scope, the host allowlist, and the pinned catalog schema. Runtime-provided format sources are rejected because their interpolations cannot be inspected before rendering. The evaluator coerces null to an empty string, primitives conventionally, and arrays or objects through bounded JSON serialization; callers still own expression resolution.
- Successful parsing does not grant device capabilities or permission to call a tool; the host still owns those decisions.

## Next layer

Use [`@mcp-native/react-native`](https://www.npmjs.com/package/@mcp-native/react-native) to adapt the supported v1 subset or the custom `0.1` surface into a trusted native render plan. Install [`mcp-native`](https://www.npmjs.com/package/mcp-native) for the combined runtime and UI APIs.

## License

[MIT](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)
