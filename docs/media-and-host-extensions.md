# Media and host extensions

Milestone 8 completes the pinned A2UI basic catalog with policy-gated `Video` and `AudioPlayer`
and gives applications a closed way to expose their own locally compiled semantic components. The
host continues to own code, native classes, libraries, prop and style mapping, permissions, and
imperative commands.

## Media flow

The server supplies a canonical HTTP(S) media URL and the A2UI component's semantic fields. Before
the renderer creates a trusted plan, it calls the host's synchronous `mediaPolicy` with the media
kind, canonical URL and origin, surface ID, source component ID, and expanded instance key. Denial
or an incomplete grant rejects the surface.

An affirmative grant declares all of the following:

- the exact source origin and permitted redirect origins;
- exact lower-case audio or video MIME types, with no wildcard;
- maximum redirect count and transfer bytes;
- whether autoplay, background playback, or external playback routes are allowed;
- whether playback requires user activation.

Allowing autoplay while requiring user activation is contradictory and fails closed. One expanded
plan is limited to 16 media components and 2 GiB of total granted transfer bytes. Individual URLs,
MIME lists, redirect lists, redirect counts, and byte grants are also bounded. A video poster is a
separate image request and requires the existing image grant.

The installed media component receives the exact grant in `resourcePolicy`. The package does not
perform the network request and cannot prove that a third-party player enforces the grant. The host
must choose or wrap a player that applies the origin, redirect, MIME, byte, activation, background,
and route controls before loading or playing media. Advertise `Video` or `AudioPlayer` only when
that enforcement exists.

```tsx
const components: NativeComponentCatalog = {
  View,
  Text,
  Button,
  TextInput,
  Video: createNativeVideoAdapter(LocalVideo, ({ uri, resourcePolicy }) => ({
    source: uri,
    policy: resourcePolicy,
  })),
};

const mediaPolicy: A2uiV1NativeMediaPolicy = ({ kind, sourceOrigin }) =>
  sourceOrigin === "https://media.example.com"
    ? {
        sourceOrigin,
        allowedRedirectOrigins: [],
        allowedMimeTypes: [kind === "video" ? "video/mp4" : "audio/mpeg"],
        maximumBytes: 25_000_000,
        maximumRedirects: 0,
        allowsAutoplay: false,
        allowsBackgroundPlayback: false,
        allowsExternalRoutes: false,
        requiresUserActivation: true,
      }
    : false;
```

## Host-extension flow

A host extension is application code that was compiled and registered before a server connection.
The safe end-to-end flow is:

1. The host author writes a compatibility manifest and a local React Native/Fabric component.
2. The host and server advertise the same exact extension, catalog, schema, and component tuple
   under `io.mcp-native/a2ui-host-extensions`, profile version `1`.
3. `negotiateA2uiV1HostExtensions` computes the exact intersection. Inline catalogs stay disabled.
4. `createA2uiV1HostExtensionRegistry` creates an opaque registry only from a genuine successful
   negotiation and matching local manifests for the current platform.
5. The parser, surface store, and pre-render policy use that registry to validate every extension
   component and to enforce its cumulative update limit.
6. `createNativeHostExtensionRegistration` binds the parsed manifest to one locally imported
   component and an explicit trusted-prop mapper.
7. Before plan construction, `hostExtensionPolicy` must grant exactly the manifest-declared
   resource and permission needs. Missing, extra, or changed grants reject the surface.
8. A local component may emit only a declared, schema-valid event. Events marked as requiring user
   activation are rejected unless the local component reports an actual activation.

The server sends only the component's declared semantic props. Structural children, imports,
module or class names, raw styles, generic actions, commands, and unchecked prop bags are reserved
and rejected. Parsed schemas and validated semantic props are recursively frozen, and policy
requests are immutable snapshots.

This host-extension mechanism is available in the current `0.9` line. It is not the post-`1.0`
public registry for arbitrary standard contracts or custom input formats. Generate a safe local
starting point with:

```bash
npx mcp-native scaffold-extension com.example/data-grid DataGrid src/mcp
```

The generated files are deliberately local and refuse to overwrite existing work. Data grids,
charts, maps, and other domain widgets should remain leaf extensions with closed bounded props;
they must not bring a component-library dependency into MCP Native or accept server-selected
modules, renderers, styles, child graphs, or commands.

## Compatibility manifest

The manifest is local JSON with these required fields:

| Field                              | Meaning                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| `profileVersion`                   | Exactly `"1"`.                                                                          |
| `extensionId`                      | Namespaced MCP extension identifier, such as `com.example/status-badge`.                |
| `catalogId`                        | Exactly `<extensionId>@<catalogVersion>`.                                               |
| `catalogVersion`, `schemaVersion`  | Stable numeric versions with one to three numeric segments.                             |
| `componentName`                    | Exactly the extension namespace plus a PascalCase local semantic name.                  |
| `propsSchema`                      | Closed local JSON Schema for semantic props. External references are forbidden.         |
| `events`                           | Bounded list of namespaced events, closed payload schemas, and activation requirements. |
| `platforms`                        | Non-empty subset of `ios` and `android`.                                                |
| `accessibility`                    | Host ownership, whether a label is required, and documented behavior.                   |
| `resourceNeeds`, `permissionNeeds` | Exact names the host policy must grant; metadata alone grants nothing.                  |
| `limits`                           | Instance, prop, event-payload, string-work, and per-surface update limits.              |
| `fallback`                         | Currently exactly `{ "kind": "reject" }`.                                               |
| `compatibility`                    | Responsible owner and optional HTTPS support URL.                                       |

Use `tests/fixtures/a2ui-v1/status-badge-extension-manifest.json` as a complete example. Manifest
changes are compatibility changes. A semantic or schema change needs a new schema version; a
catalog contract change needs a new catalog version. Keep old versions registered only while the
host actually supports and tests them.

## Author responsibilities

The host-extension author owns implementation correctness, platform availability, accessibility,
visual design, privacy and permission explanations, resource enforcement, version migration,
cancellation and cleanup, and support. The package validates the declared boundary; it does not
certify arbitrary local component behavior.

Imperative commands remain host-only. If a server must request an operation, model that operation
as a separate namespaced semantic action or future capability profile with closed schemas, explicit
policy, limits, and user activation where required. Do not add a generic command name or payload to
an extension component.

The generated native host provides a real Codegen specification plus UIKit `UILabel` and Android
`TextView` implementations through Fabric. This proves the local compilation path; it is not a
first-class SwiftUI or Jetpack Compose renderer. Those renderers and the wider universal native
capability provider model remain committed post-`1.0.0` roadmap work.
