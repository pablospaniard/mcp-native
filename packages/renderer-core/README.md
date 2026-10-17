<div align="center">

# @mcp-native/renderer-core

### Platform-neutral render plan, catalog, and conformance contract for native renderers

[![npm](https://img.shields.io/npm/v/@mcp-native/renderer-core)](https://www.npmjs.com/package/@mcp-native/renderer-core)
[![downloads](https://img.shields.io/npm/dm/@mcp-native/renderer-core)](https://www.npmjs.com/package/@mcp-native/renderer-core)
[![license](https://img.shields.io/npm/l/@mcp-native/renderer-core)](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)

[GitHub](https://github.com/pablospaniard/mcp-native) · [Architecture](https://github.com/pablospaniard/mcp-native/blob/main/docs/RFC-0001-architecture.md) · [Standards status](https://github.com/pablospaniard/mcp-native/blob/main/docs/standards-compatibility.md) · [Security](https://github.com/pablospaniard/mcp-native/blob/main/SECURITY.md)

</div>

`@mcp-native/renderer-core` turns a validated A2UI v1 surface into a trusted, platform-neutral
render plan: the closed native component catalog, render-plan builder functions, event and
`openUrl` resolution, mount-diagnostic types, prop-shape contracts, numeric limits, and shared
catalog-conformance fixtures. It has no dependency on React, React Native, SwiftUI, or Jetpack
Compose — a platform renderer package (such as `@mcp-native/react-native`) composes this trusted
plan with its own concrete host components.

This package is the reviewed shared boundary selected by the
[runtime and package assessment](../../docs/RFC-0003-native-platforms.md). Publication still occurs
only through a coordinated release; the source manifest version is not a publication claim.
Existing React Native imports retain their compatibility contract.

## Install

Install it when authoring another native renderer:

```bash
npm install @mcp-native/renderer-core @mcp-native/a2ui @mcp-native/core
```

The package is ESM-only and includes TypeScript declarations.

## Quick start

Most applications never import this package directly; use a platform renderer such as
[`@mcp-native/react-native`](https://www.npmjs.com/package/@mcp-native/react-native), which
re-exports the shared public contract under concise names. Import `@mcp-native/renderer-core`
directly only when building another platform renderer or when sharing catalog-conformance
fixtures across renderer test suites:

```ts
import { createBasicCatalogPolicy } from "@mcp-native/a2ui";
import { createRenderPlan, COMPONENT_NAMES } from "@mcp-native/renderer-core";
import { createCatalogConformanceCases } from "@mcp-native/renderer-core/testing";

// `validatedSurface` comes from your A2UI v1 surface store; see @mcp-native/a2ui.
const policy = createBasicCatalogPolicy({
  allowedComponentNames: COMPONENT_NAMES,
});
const plan = createRenderPlan(validatedSurface, policy);

for (const testCase of createCatalogConformanceCases()) {
  // Feed testCase.surface through a platform renderer and assert testCase.expectedBehaviors.
}
```

For interactive adapters, `createNativeSession()` owns strict renderer-lifetime surface IDs,
server/local reconciliation, render revisions, opaque control tickets, action authorization,
cancellation, and bounded operation work. React Native's `createSession()` binds the same session
to an immutable registered host.

## Public API

| Export                                                                                                                                    | Purpose                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `COMPONENT_NAMES`                                                                                                                         | The closed, pinned basic-catalog component name list.                         |
| `createRenderPlan`, `createRenderPlanForLocalEdits`, `createStructuralRenderPlan`                                                         | Turn a validated surface into a trusted, ordered native render plan.          |
| `resolveEvent`, `resolveOpenUrl`, `parseOpenUrlDescriptor`                                                                                | Resolve catalog action, event, and `openUrl` semantics against host policy.   |
| `validateDateTimeInputChange`                                                                                                             | Validate a `DateTimeInput` callback value against its declared component.     |
| `createNativeSession`, `NativeSession`                                                                                                    | Own revisioned state, callbacks, authorization, and delivery for one surface. |
| `createDataModelSourceKey`, `createComponentSourceKey`, `updateDataModelBinding`                                                          | Shared local-state reconciliation and typed binding updates.                  |
| `NativeElement`, `NativeComponentName`                                                                                                    | The trusted render-tree node shape and closed component-name union.           |
| `MountDiagnostic`, `MountDiagnosticCode`, `MountReport`, `InspectMountOptions`, `MountError`                                              | Mount-time diagnostic types shared by every platform renderer.                |
| Prop-shape types (`NativeButtonComponentProps`, `NativeTextComponentProps`, `NativeImageComponentProps`, `NativeSliderComponentProps`, …) | Platform-neutral prop contracts for each catalog component.                   |
| `ICON_NAMES`                                                                                                                              | The closed pinned icon-name list.                                             |
| `MAX_RENDER_NODES`, `MAX_OPEN_URL_LENGTH`, `MAX_IMAGE_*`, `MAX_MEDIA_*`                                                                   | Fixed complexity and resource limits enforced while building a render plan.   |
| `createCatalogConformanceCases` (from `@mcp-native/renderer-core/testing`)                                                                | Shared fixtures every platform renderer's test suite can assert against.      |

New code uses these version-neutral names, following the [repository naming rule](../../CONTRIBUTING.md#naming).
Existing versioned exports remain compatibility aliases with the same function, constant and class
identities. The underlying pre-existing implementation and exact protocol version are unchanged.
`@mcp-native/react-native` preserves its existing public contract (including `createRenderPlan`).
The platform-neutral state helpers are exported by renderer-core and re-exported by React Native;
existing React Native names and identities remain compatible. See the repository
[compatibility policy](https://github.com/pablospaniard/mcp-native/blob/main/docs/compatibility-policy.md).

## Design boundaries

- No React, React Native, SwiftUI, or Jetpack Compose dependency.
- No concrete host component implementations — a platform renderer supplies those.
- No remote code loading or execution.
- The render plan and catalog only ever describe the pinned, closed A2UI v1 basic catalog; unknown
  component names, events, and functions never reach the plan.
- Numeric and structural limits are fixed, not configurable, so every platform renderer enforces
  the same bounds.

## Related packages

- [`@mcp-native/a2ui`](https://www.npmjs.com/package/@mcp-native/a2ui) validates declarative surfaces and actions.
- [`@mcp-native/core`](https://www.npmjs.com/package/@mcp-native/core) provides the transport-neutral runtime contracts.
- [`@mcp-native/react-native`](https://www.npmjs.com/package/@mcp-native/react-native) composes this trusted plan with a React Native component catalog.
- [`mcp-native`](https://www.npmjs.com/package/mcp-native) re-exports the runtime and UI APIs.

## License

[MIT](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)
