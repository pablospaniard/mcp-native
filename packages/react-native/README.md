<div align="center">

# @mcp-native/react-native

### Trusted native render plans for validated MCP surfaces

[![npm](https://img.shields.io/npm/v/@mcp-native/react-native)](https://www.npmjs.com/package/@mcp-native/react-native)
[![downloads](https://img.shields.io/npm/dm/@mcp-native/react-native)](https://www.npmjs.com/package/@mcp-native/react-native)
[![license](https://img.shields.io/npm/l/@mcp-native/react-native)](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)

[GitHub](https://github.com/pablospaniard/mcp-native) · [Architecture](https://github.com/pablospaniard/mcp-native/blob/main/docs/RFC-0001-architecture.md) · [Standards status](https://github.com/pablospaniard/mcp-native/blob/main/docs/standards-compatibility.md) · [Security](https://github.com/pablospaniard/mcp-native/blob/main/SECURITY.md)

</div>

> **Experimental:** this package now mounts the initial surface model, but its API and component catalog may change before `1.0.0`.

`@mcp-native/react-native` converts a surface already validated by `@mcp-native/a2ui` into a trusted render plan and mounts it with components supplied by the host application. Servers provide data and declared actions—not JavaScript modules, component implementations, or arbitrary component names.

The renderer is an internal platform layer, not proof of complete A2UI v1.0 conformance. The custom `0.1` surface remains supported, and the separate v1.0 adapter converts a strict component subset, including bounded dynamic lists, into the same host-owned `NativeElement` boundary.

## Install

```bash
npm install @mcp-native/react-native react react-native
```

`@mcp-native/a2ui` and `@mcp-native/core` are installed as dependencies. React is a peer dependency. React Native is an optional peer because the renderer does not import it or choose a platform implementation; a native host supplies its locally bundled components.

## Quick start

```tsx
import { parseA2uiSurface } from "@mcp-native/a2ui";
import type { McpNativeRuntime } from "@mcp-native/core";
import { McpNativeSurface, useMcpNativeActionDispatcher } from "@mcp-native/react-native";
import { Button, Text, TextInput, View } from "react-native";

const components = { Button, Text, TextInput, View };

const surface = parseA2uiSurface({
  version: "0.1",
  root: {
    id: "card",
    type: "container",
    children: [
      { id: "title", type: "text", text: "Ready to continue?" },
      {
        id: "continue",
        type: "button",
        label: "Continue",
        action: { type: "tool", name: "continue_flow" },
      },
    ],
  },
});

function Example({ runtime }: { runtime: McpNativeRuntime }) {
  const onAction = useMcpNativeActionDispatcher(runtime, {
    onError(error) {
      console.error("MCP action failed", error);
    },
  });

  return (
    <McpNativeSurface
      surface={surface}
      components={components}
      onAction={onAction}
      onBindingChange={(binding, value) => {
        console.log("binding changed", binding, value);
      }}
    />
  );
}
```

The renderer uses only the currently allowed component names:

```ts
type NativeComponentName = "Button" | "Text" | "TextInput" | "View";
```

The application host decides how each name maps to a locally bundled component and how declared custom `0.1` button actions reach `McpNativeRuntime`. `onBindingChange` reports a validated binding name and the next text value for that legacy proof surface.

## A2UI v1 render-plan adapter

Use the v1 adapter only with an explicit host policy. It revalidates the snapshot before resolving data-model bindings or creating a trusted plan.

```ts
import { createA2uiV1BasicCatalogPolicy } from "@mcp-native/a2ui";
import {
  A2UI_V1_NATIVE_COMPONENT_NAMES,
  createA2uiV1NativeRenderPlan,
} from "@mcp-native/react-native";

const policy = createA2uiV1BasicCatalogPolicy({
  allowedComponentNames: A2UI_V1_NATIVE_COMPONENT_NAMES,
  allowedEventNames: ["save_profile"],
});

const surface = store.get("profile");
const plan = surface && createA2uiV1NativeRenderPlan(surface, policy);
```

The adapter maps `Row`, `Column`, static or dynamic `List`, and `Card` to `View`; `Text` to `Text`; `Button` with a `Text` child to `Button`; and `TextField` to `TextInput`. Dynamic lists expand one validated template component per bound array item and remain inside the 1,024-node plan limit. The adapter resolves absolute and item-relative JSON Pointer values, translates relative `TextField` bindings into absolute renderer-local pointers, evaluates bounded literal `formatString`, host-localized `formatNumber`, `formatCurrency`, `formatDate`, and `pluralize`, pure `and`, `or`, and `not`, `required`, bounded `regex`, `length`, `numeric`, and `email`, and `@index` with optional offsets, maps supported container direction and alignment to owned React Native flex styles, applies component weight through a host-owned `View` wrapper with `flexGrow`, maps `TextField` variants to explicit native input behavior (including `secureTextEntry` for `obscured`), and preserves event context and explicit accessibility fields. At the mounted boundary, text and buttons receive closed native roles, button accessibility state mirrors the derived disabled state, hidden text and controls are not accessibility elements, and text plus text inputs explicitly allow font scaling. Supported `TextField` checks set explicit `invalid` and `validationMessages` props on the host component and append declared failures to its accessibility hint; supported `Button` checks set `disabled`, expose declared messages, and cannot resolve or dispatch the event or local URL action until current renderer-local state passes. Main-axis `stretch` and negative weight, which React Native flex layout cannot represent faithfully, fail closed.

These mappings have automated host-boundary coverage but are not a claim of VoiceOver, TalkBack,
device, or WCAG conformance. The [native accessibility test
plan](../../docs/native-accessibility-testing.md) defines the target platform matrix, shared fixture,
required physical-device runs, and evidence needed before making a narrower platform claim.

### Host component adapters

The catalog may use React Native primitives directly or typed adapters around any locally bundled design system. The adapter helpers receive only the trusted primitive props selected by MCP Native and map them into the host component's API:

```tsx
import { createNativeButtonAdapter, type NativeComponentCatalog } from "@mcp-native/react-native";
import { Text, TextInput, View } from "react-native";
import { DesignButton } from "your-design-system";

const components: NativeComponentCatalog = {
  View,
  Text,
  TextInput,
  Button: createNativeButtonAdapter(
    DesignButton,
    ({
      title,
      onPress,
      disabled,
      accessibilityLabel,
      accessibilityRole,
      accessibilityState,
      accessible,
      validationMessages,
    }) => ({
      label: title,
      onActivate: onPress,
      inactive: disabled === true,
      assistiveLabel: accessibilityLabel,
      assistiveElement: accessible,
      assistiveRole: accessibilityRole,
      assistiveState: accessibilityState,
      ...(validationMessages === undefined ? {} : { errors: validationMessages }),
    }),
  ),
};
```

`createNativeViewAdapter`, `createNativeTextAdapter`, and `createNativeTextInputAdapter` provide the same typed boundary for the other primitives. This supports wrappers around libraries such as Expo UI or Gluestack without coupling MCP Native to them. These helpers do not create new wire-level components: the supported semantic names remain the closed `View`, `Text`, `Button`, and `TextInput` render-plan catalog, and the A2UI adapter continues to reject components outside its explicit host allowlist. Mapper functions and target components are trusted application code; server input never selects an import, mapper, or unchecked target prop.

For richer local presentation, provide optional closed variant slots alongside the base primitives:

```tsx
const components: NativeComponentCatalog = {
  View,
  Text,
  Button,
  TextInput,
  variants: {
    View: { row: HorizontalStack, column: VerticalStack, card: SurfaceCard, list: ItemList },
    Text: { body: BodyText, caption: CaptionText },
    Button: { default: DefaultButton, primary: PrimaryButton, borderless: LinkButton },
    TextInput: {
      shortText: ShortInput,
      longText: MultilineInput,
      number: NumericInput,
      obscured: PasswordInput,
    },
  },
};
```

Each override receives the same explicitly selected primitive props as its base component. Missing
entries fall back to `View`, `Text`, `Button`, or `TextInput`; omitted A2UI hints select their pinned
defaults (`body`, `default`, and `shortText`). The renderer consumes structural and style hints while
choosing a local component and never forwards `variant`, a server-provided style object, or an
arbitrary native prop. Hosts can combine variant slots with the typed adapter helpers when a design
system uses a different prop API. Variant slots apply only to `A2uiV1NativeSurface`; the custom `0.1`
`McpNativeSurface` always uses the four base primitives, even when the same host catalog is reused.

Create adapter components and the catalog at module scope, as above, or memoize them with stable dependencies. Each factory call intentionally creates a new React component type; calling one during every host render would remount that catalog entry and discard its component-local state. Generated adapters include descriptive React DevTools display names.

Use `A2uiV1NativeSurface` to mount that subset with renderer-local string state and official action envelopes:

```tsx
import { A2uiV1NativeSurface } from "@mcp-native/react-native";
import { Linking } from "react-native";

<A2uiV1NativeSurface
  surface={surface}
  policy={policy}
  components={{ Button, Text, TextInput, View }}
  onAction={(envelope, dataModel) => {
    // dataModel is present only when the surface explicitly enables sendDataModel.
    if (dataModel === undefined) {
      sendToAgent(envelope);
    } else {
      sendToAgent(envelope, { dataModel });
    }
  }}
  openUrlPolicy={({ url }) => new URL(url).origin === "https://docs.example.com"}
  onOpenUrl={({ url }) => {
    void Linking.openURL(url).catch(reportOpenUrlError);
  }}
/>;
```

Bound `TextField` changes update an owned local data model and rerender absolute or dynamic-list-relative bindings and formatted output immediately; they do not call the agent on each keystroke. Equivalent fresh store snapshots preserve those edits, while accepted agent data-model updates reset them. Repeated template buttons retain a renderer-only instance key, so pressing one resolves its user message, supported renderer functions, `@index`, and context again against the correct item in the latest local model while the official wire `sourceComponentId` remains the catalog component ID. The action is timestamped, reconstructed as finite JSON, and validated against the pinned official renderer-to-agent action schema. The callback receives the local data model only when the surface explicitly sets `sendDataModel: true`; otherwise its second argument is omitted. The host callback owns transport delivery and permission or consent boundaries.

`openUrl` is a local Button action, not an agent event. The host must allow the function name in the catalog policy and provide both `openUrlPolicy` and `onOpenUrl`. The adapter re-resolves the URL against current local state during the originating press, canonicalizes it, rejects non-HTTP(S), relative, credential-bearing, whitespace-containing, control-containing, Unicode-format-containing, or oversized values, and invokes the opener only when the synchronous policy returns exactly `true`. Invalid initial server values reject the surface; temporary invalid renderer-local text edits instead disable the affected Button until the value becomes valid, and strict resolution runs again before an enabled press can reach host policy. No URL handler is imported or called by this package. Each URL is capped at 8,192 UTF-16 code units and one expanded pass is capped at 1,048,576 URL code units.

Renderer functions other than `formatString`, `formatNumber`, `formatCurrency`, `formatDate`, `pluralize`, `required`, `regex`, `length`, `numeric`, `email`, `and`, `or`, `not`, template-scoped `@index`, and local Button action `openUrl`, nested inline catalogs, and every other basic-catalog component fail closed. Number and currency formatting uses `Intl.NumberFormat`, date formatting uses `Intl.DateTimeFormat`, and cardinal plural selection uses `Intl.PluralRules` with the required `other` fallback. `required` follows the pinned reference behavior for null, empty strings, and empty arrays. `length` and `numeric` use inclusive, ordered bounds, and `email` uses the pinned basic check with a 320-code-unit input cap. Agent-supplied `regex` is limited to 256 UTF-16 code units, a 4,096-code-unit input, repeats no larger than 4,096, no groups, alternation, backreferences, or Unicode property escapes, and at most one variable repeat; inputs over the cap fail the check, while unsupported or malformed patterns reject the surface. Expanded plans evaluate at most 10,000 renderer checks per pass. Each combined validation accessibility output is capped at 65,536 UTF-16 code units before construction, with at most 1,048,576 such output code units across one expanded pass. `formatDate` accepts finite Unix seconds or milliseconds, their numeric string forms, RFC 3339 timestamps, and strict `yyyy-MM-dd` dates. Absolute numeric magnitudes greater than `10,000,000,000` are milliseconds; all others are seconds. It supports the pinned catalog's `yy`, `yyyy`, `M`, `MM`, `MMM`, `MMMM`, `d`, `dd`, `E`, `EEEE`, `h`, `hh`, `H`, `HH`, `mm`, `ss`, and `a` token subset plus quoted literals; `h` and `hh` require `a`, other pattern letters fail closed, and one pattern may contain at most 128 tokens. The host may supply one validated, runtime-supported BCP 47 `locale` to the mounted surface, render-plan options, event-resolution options, and URL-resolution options, or omit it to use the runtime locale. A date-only `yyyy-MM-dd` value is a calendar date interpreted at midnight in the runtime time zone. An RFC 3339 value is an instant whose declared offset is applied before it is formatted in that runtime time zone. Agent-controlled decimal precision is restricted to an integer from 0 through 100, currency must appear in ISO 4217 List One published 2026-01-01, dynamic values resolve with strict types, formatter construction failures are controlled parse errors, and formatter caches live only for one bounded render, event-resolution, or URL-resolution pass. Expanded plans are capped at 1,024 nodes, 10,000 interpolations, and 1,048,576 formatted UTF-16 code units so repeated references or large bound arrays cannot amplify a small component graph into unbounded work; each formatted result also retains the shared 65,536-code-unit string limit.

## Public API

| Export                                  | Purpose                                                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `McpNativeSurface`                      | Mounts a validated surface using the host's component catalog.                                           |
| `A2uiV1NativeSurface`                   | Mounts the supported v1 subset with local bindings and official action-envelope callbacks.               |
| `useMcpNativeActionDispatcher`          | Adapts asynchronous runtime dispatch into a stable event callback with required error handling.          |
| `useNativeRenderPlan`                   | Memoizes a trusted render plan for a validated surface identity.                                         |
| `createNativeRenderPlan`                | Converts a validated `A2uiSurface` into a `NativeElement` tree.                                          |
| `createA2uiV1NativeRenderPlan`          | Revalidates and adapts the supported v1 subset into a trusted `NativeElement` tree.                      |
| `resolveA2uiV1NativeEvent`              | Revalidates and resolves one reachable static or template-instance event against the latest local model. |
| `resolveA2uiV1NativeOpenUrl`            | Revalidates and resolves one reachable HTTP(S) URL action against the latest local model.                |
| `A2UI_V1_NATIVE_COMPONENT_NAMES`        | Exact basic-catalog component names implemented by the current native adapter.                           |
| `A2UI_V1_NATIVE_MAX_RENDER_NODES`       | Bound on expanded v1 render-plan nodes.                                                                  |
| `A2UI_V1_NATIVE_MAX_OPEN_URL_LENGTH`    | Per-action bound on canonical HTTP(S) URL length.                                                        |
| `A2uiV1NativeEventDescriptor`           | Resolved trusted-plan event data used by mounted dispatch or custom hosts.                               |
| `A2uiV1NativeOpenUrlDescriptor`         | Canonical URL plus surface, component, and optional template-instance identity.                          |
| `A2uiV1NativeRenderPlanOptions`         | Optional renderer-local model and host-owned BCP 47 locale.                                              |
| `A2uiV1NativeEventResolutionOptions`    | Optional template instance key and matching host-owned BCP 47 locale.                                    |
| `A2uiV1NativeOpenUrlResolutionOptions`  | Optional template instance key and matching host-owned BCP 47 locale for URL resolution.                 |
| `A2uiV1NativeActionHandler`             | Host callback receiving the validated action envelope and, when opted in, the local data model.          |
| `A2uiV1NativeOpenUrlPolicy`             | Synchronous host predicate authorizing one canonical URL during its Button press.                        |
| `A2uiV1NativeOpenUrlHandler`            | Host-owned callback that opens an authorized URL through a platform API.                                 |
| `NativeComponentCatalog`                | Base primitives plus optional closed host-owned component variants.                                      |
| `NativeComponentVariants`               | Optional overrides for supported structure and pinned style hints, with primitive fallbacks.             |
| `Native*Variant` types                  | Closed view, text, button, and text-input variant keys.                                                  |
| `NativeAccessibilityRole`               | Renderer-derived closed role union for supported text and button primitives.                             |
| `NativeAccessibilityState`              | Renderer-derived state currently exposing only the supported button disabled flag.                       |
| `createNative*Adapter` helpers          | Typed mappings from trusted primitive props into locally bundled component-library APIs.                 |
| `NativeComponentPropMapper`             | Generic mapper type used by the four host component adapter helpers.                                     |
| `NativeActionHandler`                   | Synchronous handler for a validated declared action.                                                     |
| `NativeBindingChangeHandler`            | Handler receiving a validated binding name and the next text value.                                      |
| `McpNativeActionDispatcherOptions`      | Required action error callback and optional result callback.                                             |
| `NativeElement` / `NativeComponentName` | Serializable trusted-plan node and its fixed component-name union.                                       |

## Current mappings

| Surface node | Native component | Host props and event behavior                                                             |
| ------------ | ---------------- | ----------------------------------------------------------------------------------------- |
| `container`  | `View`           | Nested trusted children                                                                   |
| `text`       | `Text`           | Validated `children`, closed `text` role, and enabled font scaling                        |
| `button`     | `Button`         | `title`, label, closed `button` role/state, and `onPress` for its validated action        |
| `text-input` | `TextInput`      | Label/placeholder, enabled font scaling, optional value, and binding-aware `onChangeText` |

## Trust boundary

- The server cannot select components outside the catalog.
- The server cannot send executable React Native code.
- Render plans should only be created from a successfully validated surface.
- The v1 adapter performs policy validation again at its public boundary.
- The mounted v1 surface owns local binding state and revalidates action context at dispatch time.
- Unsupported v1 components and arbitrary executable functions fail closed.
- Declared actions and their complete JSON arguments are validated again immediately before emission.
- Rendered component props are selected explicitly; unchecked server props are never spread into host components.
- Accessibility roles, native state, focus eligibility, and font scaling are renderer-derived; server data cannot replace them.
- The host must explicitly map components, enforce permissions, and choose the renderer-to-agent transport; emitting an envelope does not grant network or device access.
- Asynchronous action failures cannot become unhandled rejections because `useMcpNativeActionDispatcher` requires an error callback.
- Styling variants preserve pinned allowlists and never spread unchecked server props; future component expansion must retain the same boundary.

See [`@mcp-native/a2ui`](https://www.npmjs.com/package/@mcp-native/a2ui) for parsing and [`@mcp-native/core`](https://www.npmjs.com/package/@mcp-native/core) for action dispatch. Install [`mcp-native`](https://www.npmjs.com/package/mcp-native) for the combined runtime and UI APIs.

## License

[MIT](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)
