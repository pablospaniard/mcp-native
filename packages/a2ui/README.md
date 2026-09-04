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
lifecycle messages, renderer messages, and the project-owned MCP binding. The
[A2UI profile](https://github.com/pablospaniard/mcp-native/blob/main/docs/a2ui-v1-conformance.md)
contains the exact protocol coverage and limits.

## Install

Until the stable `1.0.0` release, select the RC package explicitly:

```bash
npm install @mcp-native/a2ui@rc
```

`@mcp-native/core` is installed as a dependency. The package is ESM-only and includes TypeScript declarations.

The package root is the namespace for the current supported A2UI profile, so public names are
concise (`SurfaceStore`, `parseEnvelope`, `Envelope`). Exact `"v1.0"` wire values and schema pins do
not change. Earlier prefixed exports remain compatible aliases throughout `1.x`; see the
[migration guide](https://github.com/pablospaniard/mcp-native/blob/main/docs/migration-to-1.0.md).

## Start with A2UI v1 Candidate

New integrations negotiate the project-owned MCP binding, resolve the pinned JSONL lifecycle
stream, apply it to `SurfaceStore`, and validate the resulting snapshot against the host's
catalog policy. Continue with the [binding example](#a2ui-over-mcp-capability-binding), [catalog
capabilities](#a2ui-v1-catalog-capabilities), and [complete profile](https://github.com/pablospaniard/mcp-native/blob/main/docs/a2ui-v1-conformance.md).

## A2UI-over-MCP capability binding

The package exports a project-owned binding under `io.github.pablospaniard/mcp-native-a2ui`. It is enabled only when both peers advertise the exact binding version, A2UI Candidate revision, JSONL resource transport, and MIME type:

```ts
import { MCP_EXTENSION_CAPABILITIES, negotiateMcpBinding } from "@mcp-native/a2ui";

const result = negotiateMcpBinding(
  adapter.getClientExtensionSettings(),
  adapter.getServerExtensionSettings(),
);
```

A fallback result means the host uses ordinary MCP text or structured data. A resource link, MIME type, or `_meta` value never activates the binding by itself. The exact capability exchange, ordered `resource-text-jsonl` mapping, and failure behavior are documented in the [project binding contract](https://github.com/pablospaniard/mcp-native/blob/main/docs/a2ui-mcp-binding.md).

## A2UI v1 catalog capabilities

A2UI's agent and renderer capability objects are separate from the project-owned MCP binding settings. Parse peer metadata and negotiate only exact shared catalog IDs:

```ts
import {
  createRendererCapabilities,
  negotiateCapabilities,
  parseAgentCapabilities,
} from "@mcp-native/a2ui";

const rendererCapabilities = createRendererCapabilities({
  supportedCatalogIds: ["https://example.com/catalogs/native-v1"],
});
const agentCapabilities = parseAgentCapabilities(untrustedAgentMetadata);
const catalogs = negotiateCapabilities(agentCapabilities, rendererCapabilities);
```

These APIs close fields the pinned schemas leave permissive, require the protocol's normative agent catalog list, reject empty or duplicate IDs, and keep inline catalogs disabled. A host must advertise only catalogs it fully implements. The React Native adapter implements the complete basic catalog but still derives capability names from installed, policy-ready component slots; component-name coverage alone is not grounds to advertise functions or policies the host did not install.

Locally compiled semantic components use the separate project-owned
`io.mcp-native/a2ui-host-extensions` profile. Its helpers parse closed compatibility manifests,
negotiate exact extension/catalog/schema/component tuples, and create opaque platform registries.
Pass the registry to the envelope parser, resolver, surface store, and validation policy. Inline
catalogs, server-selected code, raw children/props/styles, and commands stay disabled. See the
[media and host-extension guide](https://github.com/pablospaniard/mcp-native/blob/main/docs/media-and-host-extensions.md).

## Official v1.0 envelopes and surface store

After mutual negotiation, hosts can resolve a JSONL resource and apply lifecycle envelopes:

```ts
import {
  MCP_EXTENSION_CAPABILITIES,
  SurfaceStore,
  createBasicCatalogPolicy,
  negotiateMcpBinding,
  resolveJsonlFromToolResult,
} from "@mcp-native/a2ui";

const binding = negotiateMcpBinding(
  MCP_EXTENSION_CAPABILITIES,
  adapter.getServerExtensionSettings(),
);
const { envelopes } = await resolveJsonlFromToolResult(runtime, toolResult, binding);
const store = new SurfaceStore();
store.applyAll(envelopes);

const surface = store.getValidated(
  "surface-id",
  createBasicCatalogPolicy({
    allowedComponentNames: ["Column", "Text", "Button"],
    allowedEventNames: ["continue"],
  }),
);
```

Only `createSurface`, `updateComponents`, `updateDataModel`, and `deleteSurface` agent-to-renderer envelopes are accepted by the lifecycle parser. Raw store snapshots may be incomplete while ordered updates arrive. Store snapshots include a host-owned `dataModelRevision` that changes only after an accepted agent data-model update, allowing renderers to preserve local edits across equivalent fresh snapshots. A batch is capped at 1,024 envelopes and at the store-wide JSON-value and string-work budgets; envelopes are parsed sequentially and any failure rolls back the batch. The store bounds retained surfaces and components, plus cumulative retained JSON values and string/key code units across all surfaces; component replacements update those budgets incrementally. `getValidated` is the required pre-render boundary for the pinned basic catalog, explicit host component/event/function allowlists, reachable child references and cycles, template-aware binding paths, component placement rules, and any negotiated extension registry. The React Native package adapts and mounts every basic-catalog component, including bounded dynamic lists, typed renderer-local bindings, formatting, pure boolean and validation functions, supported checks, required image/media grants, host-policy-gated HTTP(S) `openUrl`, and closed local extensions after revalidation. `createActionEnvelope` constructs actions, while `parseRendererToAgentEnvelope` validates all four pinned renderer-to-agent message kinds as owned data. `createActionDeliveryHandler` adds a serialized, fail-closed authorization boundary before a host-owned action transport; policy and delivery receive separate owned copies. An overlapping action is denied before its untrusted envelope or data model is parsed and therefore is not passed to `onDenied`. Parsing does not execute functions, select transport, or grant device access. See the [exact conformance profile and migration guide](https://github.com/pablospaniard/mcp-native/blob/main/docs/a2ui-v1-conformance.md).

## Public API

| Export                                                                                | Purpose                                                                 |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `ResourceError`, `ParseError`                                                         | Specific resolution and parsing failures.                               |
| `MIME_TYPE`                                                                           | Exact A2UI media type.                                                  |
| `MCP_EXTENSION_ID`, `MCP_EXTENSION_CAPABILITIES`                                      | Exact project-owned extension declaration.                              |
| `negotiateMcpBinding`, `McpBindingNegotiation`, `McpBindingGrant`                     | Exact-match negotiation with typed fallback reasons.                    |
| `MCP_BINDING_VERSION`, `MCP_PROTOCOL_VERSION`, `MCP_SCHEMA_REVISION`, `MCP_TRANSPORT` | Pinned binding and Candidate transport values.                          |
| `parseAgentCapabilities`, `parseRendererCapabilities`                                 | Strict pinned-schema capability metadata boundaries.                    |
| `createRendererCapabilities`, `negotiateCapabilities`                                 | Host-owned declarations and exact shared-catalog negotiation.           |
| Host-extension profile constants, manifest parser, capability parser, and negotiation | Exact project-owned local-extension declaration and mutual tuple match. |
| `createHostExtensionRegistry`, registry getters and validators                        | Opaque platform registry plus closed component/event validation.        |
| `parseEnvelope`, `parseJsonl`                                                         | Schema-validate v1 lifecycle envelopes and JSONL batches.               |
| `SurfaceStore`                                                                        | Ordered lifecycle state plus policy-gated `getValidated`.               |
| `MAX_STORE_VALUES`, `MAX_STORE_STRING_CODE_UNITS`                                     | Cumulative retained-state limits for one surface store.                 |
| `createBasicCatalogPolicy`, `SurfaceValidationPolicy`                                 | Explicit host allowlists for components, events, and functions.         |
| `validateSurfaceState`                                                                | Revalidate a complete snapshot at another public trust boundary.        |
| `createActionEnvelope`, `ActionEnvelope`                                              | Construct an owned, pinned-schema renderer action for host transport.   |
| `createActionDeliveryHandler`                                                         | Authorize each action before host-owned transport delivery.             |
| `parseRendererToAgentEnvelope`, renderer-to-agent envelope types                      | Parse every pinned renderer message as owned, non-authorizing data.     |
| `evaluateFormatString`                                                                | Evaluate interpolation and report parser-counted work to budgets.       |
| `BASIC_CATALOG_ID`, catalog name constants                                            | Exact pinned catalog identity and selectable host capabilities.         |
| `resolveJsonlFromToolResult`, `ResolvedJsonlResource`                                 | Resolve a JSONL A2UI resource from a tool result.                       |
| `PROTOCOL_VERSION`, `MAX_SOURCE_LENGTH`, `MAX_ENVELOPES`, store limit constants       | Current protocol and complexity limits.                                 |

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

Use [`@mcp-native/react-native`](https://www.npmjs.com/package/@mcp-native/react-native) to adapt the supported v1 catalog into a trusted native render plan. Install [`mcp-native`](https://www.npmjs.com/package/mcp-native) for the combined runtime and UI APIs.

## License

[MIT](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)
