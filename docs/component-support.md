# Component support and expansion

MCP Native implements all 18 component names in the pinned A2UI basic catalog within its
[feature-scoped profile](a2ui-v1-conformance.md). That is a defined semantic catalog, not an
inventory of every React Native component or native platform API.

## The 18-component baseline

| Group             | Components                                                                   |
| ----------------- | ---------------------------------------------------------------------------- |
| Layout/content    | `Row`, `Column`, `List`, `Card`, `Text`, `Image`, `Icon`, `Divider`          |
| Controls          | `Button`, `TextField`, `CheckBox`, `ChoicePicker`, `Slider`, `DateTimeInput` |
| Composition/media | `Tabs`, `Modal`, `Video`, `AudioPlayer`                                      |

A2UI describes semantics; the application supplies implementations. For example, A2UI `Text`
can use React Native `Text` with the app's typography, `Column` can use a vertically arranged
`View`, and `Button` can use a locally bundled design-system button. These mappings do not expose
the underlying component's entire prop or method API to the server.

Suggested component-screen copy:

> Complete coverage of the pinned basic component catalog, with your own components and
> styles—within an explicit, tested contract.
>
> All 18 component names are implemented within the documented A2UI profile limits. Coverage
> available in any particular app depends on the adapters and policies it installs.

Component-name coverage does not imply support for every property, expression, protocol operation,
or upstream revision. The conformance profile owns those exact claims.

## What “full support” means

| Scope                                        | Current boundary                               | Work needed                                                                                                                                                |
| -------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All 18 pinned basic-catalog names            | Implemented within profile limits              | An app installs and verifies the adapters and required policies for the catalog it advertises.                                                             |
| Additional React Native or custom components | Locally compiled host extensions are available | Define and register a versioned semantic contract, map inputs/events, and validate platform behavior.                                                      |
| A maintained extended component catalog      | Planned workstream in the roadmap              | Select named adapters, publish an iOS/Android matrix, and meet the acceptance criteria below.                                                              |
| Broader native capabilities                  | Post-v1 Milestone 15                           | Add typed provider manifests, negotiation, a policy/permission broker, reference providers, and capability-specific tests.                                 |
| Broader A2UI protocol coverage               | Post-v1 Milestone 16                           | Review additional features and exact revisions, implement their lifecycle and authorization semantics, and update conformance and migration documentation. |
| Direct SwiftUI and Compose rendering         | Post-v1 Milestones 12–14                       | Establish the platform-neutral foundation and prove behavioral parity in each renderer.                                                                    |

There is no finite project promise to bundle “all React Native components”: applications and
third-party packages can continually add implementations. The target is an extensible, tested
contract plus a published list of maintained adapters. Component integration and device access
are separate responsibilities; a map view, for example, does not itself authorize location access.

## Adding a component today

1. Check whether an existing A2UI semantic component fits. If it does, map it through a typed
   host adapter or supported visual variant without expanding the wire catalog.
2. For new semantics, define a namespaced, versioned host extension with exact input/event schemas,
   platform availability, accessibility behavior, resource and permission needs, limits, and fallback.
3. Register a locally imported React Native or Fabric component and explicitly map validated
   semantic values into its props and emitted events. The server cannot supply module paths,
   executable code, native commands, raw props, or raw styles.
4. Install the required host policies and negotiate the exact extension/catalog/schema identity.
   Advertise only what the application actually implements and can authorize.
5. Verify interaction, lifecycle, accessibility, and resource enforcement on supported platforms,
   including rejected input, unavailable dependencies, denied permissions, and cumulative limits.

Use the [media and host-extension guide](media-and-host-extensions.md) for the existing registration
contract and the [host integration checklist](host-integration-checklist.md) for application wiring.
Custom components using that contract do not require the future custom-input registry in Milestone 11.
Host-owned navigation, screens, safe areas, and system UI remain application responsibilities.

## Extended catalog acceptance criteria

The [roadmap workstream](roadmap.md#extended-component-catalog-and-adapter-matrix) will select a
bounded initial catalog based on application demand. Selection is still pending; examples such as
charts, maps, or camera previews are candidates, not claims of shipped adapters or promised scope.

Before an adapter is listed as supported, its catalog entry must name:

- Semantic component identity, exact contract/schema version, and supported inputs and events.
- Adapter package/export, locally installed implementation and dependency versions, and maintenance owner.
- iOS and Android support, tested OS/toolchain ranges, and any Expo Go or custom-build constraints.
- Required policies, permissions, user activation, resource budgets, and unavailable-platform behavior.
- Evidence for interaction, local state, lifecycle cleanup, accessibility, performance, and negative tests.
- Compatibility and migration rules, documented limitations, and a runnable integration example.

The published matrix must distinguish planned, implemented, and verified entries, and show unsupported
platforms explicitly. A successful render alone does not establish behavioral or security support.
The existing [support matrix](support-matrix.md) continues to describe package requirements and
integration evidence; it does not certify unlisted third-party adapters.

The extension mechanism is available now. The maintained extended catalog and the broader native
provider and protocol work remain undated post-v1 work. None changes the pinned basic catalog or
automatically expands what an installed app advertises.
