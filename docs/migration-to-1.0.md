# Migration to `1.0.0`

## Align the A2UI schema revision on both peers

The v1 protocol baseline uses upstream A2UI revision
`8ff4651232ab0e02b0123730b502711170637a3a`, replacing
`7541f953050cd58b80f0bf5d85fe2d63192af305` used by `1.0.0-rc.1` and earlier builds.
Update the server's project-owned A2UI extension settings and the host packages together. Prefer
the exported `MCP_EXTENSION_CAPABILITIES` map; servers configuring settings themselves must set
`schemaRevision` to the new exact commit. Reconnect to negotiate fresh settings after upgrading.

A host and server advertising different revisions fall back to ordinary MCP content. The host
does not load or render the incompatible A2UI resource, and stored grants for the previous pin
are rejected. The binding version, protocol value `v1.0`, catalog ID, MIME type, and JSONL transport
are unchanged.

This pre-stable revision update preserves imports, callable signatures, and the supported component
and function set. The exported `MCP_SCHEMA_REVISION` / `A2UI_MCP_SCHEMA_REVISION` constant and its
TypeScript literal type change intentionally. Code that hard-codes the old literal must update it.
After `1.0.0`, incompatible pin changes follow the major-version migration policy.

Upstream [PR #2486](https://github.com/a2ui-project/a2ui/pull/2486) moves shared function validation
into the `FunctionCall` envelope. Catalog definitions are now flat; validators must use the full
envelope to enforce common fields and reject unknown properties. This update does not add the
separate upstream v0.9 MCP catalog or template/data delivery profile.

## Use concise current-profile names

The package name already identifies A2UI or React Native, and the package root identifies the
current supported profile. New code therefore omits redundant `A2ui`, `A2uiV1`, and
`A2uiV1Native` prefixes:

| Previous compatible name          | Canonical name             |
| --------------------------------- | -------------------------- |
| `A2uiSurfaceStore`                | `SurfaceStore`             |
| `parseA2uiV1Envelope`             | `parseEnvelope`            |
| `createA2uiV1BasicCatalogPolicy`  | `createBasicCatalogPolicy` |
| `A2uiV1SurfaceState`              | `SurfaceState`             |
| `createA2uiV1NativeHost`          | `createHost`               |
| `A2uiV1NativeHostSurface`         | `HostSurface`              |
| `createA2uiV1NativeRenderPlan`    | `createRenderPlan`         |
| `A2UI_V1_NATIVE_MAX_RENDER_NODES` | `MAX_RENDER_NODES`         |

This is a source-compatible migration: every previous package-root export remains an alias of the
same runtime value, and previous type names remain exported. Those aliases are deprecated for new
code but remain supported throughout `1.x`; removal requires a future major release. No wire value,
JSON field, MIME type, capability identifier, schema pin, or negotiated `"v1.0"` value changed.

The `mcp-native` convenience package additionally exposes `a2ui` and `reactNative` namespaces for
call sites where names from several focused packages appear together:

```ts
import { a2ui, reactNative } from "mcp-native";

const store = new a2ui.SurfaceStore();
const Surface = reactNative.HostSurface;
```

The deprecated custom A2UI `0.1` model does not appear in package root exports. Applications with
existing `0.1` documents can still reach the frozen parser and renderer through the explicit
`/legacy` subpaths:

```ts
import { parseA2uiSurface } from "@mcp-native/a2ui/legacy";
import { McpNativeSurface } from "@mcp-native/react-native/legacy";

// Or, when using the convenience package:
import { McpNativeSurface, parseA2uiSurface } from "mcp-native/legacy";
```

The `/legacy` subpaths preserve the custom `version: "0.1"` meaning; they never reinterpret that
input as A2UI v1. They remain isolated, frozen, and eligible only for security and critical
correctness fixes, and receive no new A2UI v1 components, functions, capabilities, extensions, or
renderer behavior. New integrations should use the A2UI v1.0 Candidate flow instead; see the
[A2UI package guide](https://github.com/pablospaniard/mcp-native/tree/main/packages/a2ui).

## Keep MCP Apps WebView isolation props

The finalized v1 API includes two required literal fields in `McpAppsReactNativeWebViewProps`:

- `cacheEnabled: false` keeps ephemeral storage independent of native prop-application order; and
- `injectedJavaScriptBeforeContentLoadedForMainFrameOnly: true` confines the paired
  `injectedJavaScriptBeforeContentLoaded` bridge bootstrap to the top-level document.

Callers that obtain the object from `createMcpAppsReactNativeWebViewProps()` receive both fields
automatically and need no code change.

If a custom React Native WebView wrapper reconstructs or narrows that exported prop object, update
the wrapper to accept and forward both fields unchanged. Do not make either value configurable or
allow resource metadata or other server input to override it.

## Automated upgrade path

`npm run package:smoke` installs the latest coordinated stable `0.9.x` packages from npm into a
clean consumer and runs modern APIs together with the explicit `/legacy` imports shown above. It
then replaces all seven coordinated dependencies with locally packed
v1 release artifacts, confirms that npm selected each local tarball, and runs the consumer
again. Mixed `0.9.x` package versions, retained registry dependencies, missing migration entry
points, and stale installed versions fail the gate.

Pull-request CI runs this upgrade smoke test. The final `1.0.0` release commit therefore exercises
the same path with the actual coordinated stable artifacts before publication.

## Use the v1 profile

New surfaces should negotiate the project-owned A2UI-over-MCP binding, parse `version: "v1.0"`
lifecycle envelopes into `SurfaceStore`, validate through an explicit host catalog policy, and
mount `Surface`. There is no automatic conversion because the custom tree/action model
and A2UI v1 catalog/data/event model have different semantics.

## Adopt host ownership explicitly

A v1 host owns these integration boundaries:

- replace open component maps or prop spreading with the typed local catalog and adapters;
- advertise only installed, policy-ready components and exact extension tuples;
- keep application navigation and sensitive permission decisions outside server UI;
- use the MCP Apps sandbox and bridge pair for HTML;
- use the mixed-surface coordinator only for host-created sibling regions, not server-described
  layout;
- run the exact [support matrix](support-matrix.md), `npm run check`, and
  `npm run package:smoke` against the application integration.

The v1 API is finalized. Future changes follow the [1.x compatibility policy](compatibility-policy.md);
breaking changes require a major release and explicit upgrade guidance.
