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

This package is a provisional workspace on `feature/native-platforms`; it is not a released product
or a finalized cross-platform contract. The
[runtime and package assessment](../../docs/RFC-0002-native-platforms.md) will determine whether it
becomes a separate public package. Existing React Native imports retain their compatibility contract.

## Install

Use the monorepo workspace for the experiment:

```bash
npm ci
npm run build
```

Run these commands from the repository root. The workspace depends on `@mcp-native/a2ui` and
`@mcp-native/core`. Its build is ESM-only and includes TypeScript declarations.

## Quick start

Most applications never import this package directly; use a platform renderer such as
[`@mcp-native/react-native`](https://www.npmjs.com/package/@mcp-native/react-native), which
re-exports everything under its own concise public names. Import `@mcp-native/renderer-core`
directly only when building another platform renderer or when sharing catalog-conformance
fixtures across renderer test suites:

```ts
import { createA2uiV1BasicCatalogPolicy } from "@mcp-native/a2ui";
import {
  createA2uiV1NativeRenderPlan,
  A2UI_V1_NATIVE_COMPONENT_NAMES,
} from "@mcp-native/renderer-core";
import { createA2uiV1NativeCatalogConformanceCases } from "@mcp-native/renderer-core/testing";

// `validatedSurface` comes from your A2UI v1 surface store; see @mcp-native/a2ui.
const policy = createA2uiV1BasicCatalogPolicy({
  allowedComponentNames: A2UI_V1_NATIVE_COMPONENT_NAMES,
});
const plan = createA2uiV1NativeRenderPlan(validatedSurface, policy);

for (const testCase of createA2uiV1NativeCatalogConformanceCases()) {
  // Feed testCase.surface through a platform renderer and assert testCase.expectedBehaviors.
}
```

## Public API

| Export                                                                                                                                                   | Purpose                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `A2UI_V1_NATIVE_COMPONENT_NAMES`                                                                                                                         | The closed, pinned basic-catalog component name list.                       |
| `createA2uiV1NativeRenderPlan`, `createA2uiV1NativeRenderPlanForLocalEdits`, `createA2uiV1NativeStructuralRenderPlan`                                    | Turn a validated surface into a trusted, ordered native render plan.        |
| `resolveA2uiV1NativeEvent`, `resolveA2uiV1NativeOpenUrl`, `parseA2uiV1NativeOpenUrlDescriptor`                                                           | Resolve catalog action, event, and `openUrl` semantics against host policy. |
| `validateA2uiV1NativeDateTimeInputChange`                                                                                                                | Validate a `DateTimeInput` callback value against its declared component.   |
| `NativeElement`, `NativeComponentName`                                                                                                                   | The trusted render-tree node shape and closed component-name union.         |
| `A2uiV1NativeMountDiagnostic`, `A2uiV1NativeMountDiagnosticCode`, `A2uiV1NativeMountReport`, `InspectA2uiV1NativeMountOptions`, `A2uiV1NativeMountError` | Mount-time diagnostic types shared by every platform renderer.              |
| Prop-shape types (`NativeButtonComponentProps`, `NativeTextComponentProps`, `NativeImageComponentProps`, `NativeSliderComponentProps`, …)                | Platform-neutral prop contracts for each catalog component.                 |
| `A2UI_V1_NATIVE_ICON_NAMES`                                                                                                                              | The closed pinned icon-name list.                                           |
| `A2UI_V1_NATIVE_MAX_RENDER_NODES`, `A2UI_V1_NATIVE_MAX_OPEN_URL_LENGTH`, `A2UI_V1_NATIVE_MAX_IMAGE_*`, `A2UI_V1_NATIVE_MAX_MEDIA_*`                      | Fixed complexity and resource limits enforced while building a render plan. |
| `createA2uiV1NativeCatalogConformanceCases` (from `@mcp-native/renderer-core/testing`)                                                                   | Shared fixtures every platform renderer's test suite can assert against.    |

`@mcp-native/react-native` preserves its existing public names and concise aliases
(for example `createRenderPlan`). Newly exposed internal planner helpers in this experimental
workspace are not additional React Native exports; see the existing
[migration guide](https://github.com/pablospaniard/mcp-native/blob/main/docs/migration-to-1.0.md).

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
