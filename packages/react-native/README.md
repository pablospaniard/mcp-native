<div align="center">

# @mcp-native/react-native

### Trusted native render plans for validated MCP surfaces

[![npm](https://img.shields.io/npm/v/@mcp-native/react-native)](https://www.npmjs.com/package/@mcp-native/react-native)
[![downloads](https://img.shields.io/npm/dm/@mcp-native/react-native)](https://www.npmjs.com/package/@mcp-native/react-native)
[![license](https://img.shields.io/npm/l/@mcp-native/react-native)](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)

[GitHub](https://github.com/pablospaniard/mcp-native) · [Architecture](https://github.com/pablospaniard/mcp-native/blob/main/docs/RFC-0001-architecture.md) · [Standards status](https://github.com/pablospaniard/mcp-native/blob/main/docs/standards-compatibility.md) · [Security](https://github.com/pablospaniard/mcp-native/blob/main/SECURITY.md)

</div>

> **Release status:** this package mounts the complete pinned A2UI basic catalog, policy-gated
> media, and exactly negotiated local host extensions. Its `0.9.x` API is frozen for `1.0.0`, so
> teams can integrate it now; the stable `1.x` compatibility guarantee begins with `1.0.0`.

`@mcp-native/react-native` converts a surface already validated by `@mcp-native/a2ui` into a trusted render plan and mounts it with components supplied by the host application. Servers provide data and declared actions—not JavaScript modules, component implementations, or arbitrary component names.

The renderer implements the native portion of the documented A2UI v1 Candidate profile. The v1 adapter converts the complete pinned basic catalog, including bounded dynamic lists and policy-gated media, into the host-owned `NativeElement` boundary. Exactly negotiated local host extensions use a separate closed registration boundary. The custom `0.1` surface remains available through migration APIs. See the [feature-scoped A2UI profile](https://github.com/pablospaniard/mcp-native/blob/main/docs/a2ui-v1-conformance.md) for exact coverage.

## Install

```bash
npm install @mcp-native/react-native react react-native
```

`@mcp-native/a2ui` and `@mcp-native/core` are installed as dependencies. React is a peer dependency. React Native `>=0.87.0 <1` is an optional peer because the renderer does not import it or choose a platform implementation; a native host supplies its locally bundled components.

## Start with the A2UI v1 renderer

New integrations mount `A2uiV1NativeSurface` with an explicit catalog policy and locally bundled
components. Continue with the [v1 render-plan adapter](#a2ui-v1-render-plan-adapter) for the complete
host flow, catalog mapping, local state, validation, actions, media, and extension support.

## Legacy custom `0.1` migration

Use the explicit legacy subpaths during `0.9.x`. These APIs leave package roots at `1.0.0`; the
subpaths remain frozen for migration and security fixes.

```tsx
import { parseA2uiSurface } from "@mcp-native/a2ui/legacy";
import type { McpNativeRuntime } from "@mcp-native/core";
import { McpNativeSurface, useMcpNativeActionDispatcher } from "@mcp-native/react-native/legacy";
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

This example uses deprecated custom `0.1` APIs. The application host decides how each name maps to a locally bundled component and how declared button actions reach `McpNativeRuntime`. `onBindingChange` reports a validated binding name and the next text value for that legacy surface. New hosts should use `A2uiV1NativeSurface`.

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

The adapter maps `Row`, `Column`, static or dynamic `List`, and `Card` to `View`; `Text` to `Text`; `Button` with a `Text` child to `Button`; and `TextField` to `TextInput`. Optional host slots implement `Image`, `Icon`, `Divider`, `CheckBox`, `ChoicePicker`, `Slider`, `DateTimeInput`, `Tabs`, and `Modal`. Dynamic lists expand one validated template component per bound array item and remain inside the 1,024-node plan limit. The adapter resolves absolute and item-relative JSON Pointer values; translates relative typed bindings into absolute renderer-local pointers; evaluates bounded formatting, boolean, validation, and `@index` functions; maps supported layout and variants to owned props; and preserves event context and explicit accessibility fields. At the mounted boundary, components receive closed roles and state, hidden controls are excluded, and text scaling stays enabled. Supported checks expose `invalid`/`validationMessages`; invalid buttons cannot resolve or dispatch an event or local URL action. Main-axis `stretch` and negative weight, which React Native flex layout cannot represent faithfully, fail closed.

The complete catalog is exactly `AudioPlayer`, `Button`, `Card`, `CheckBox`, `ChoicePicker`, `Column`, `DateTimeInput`, `Divider`, `Icon`, `Image`, `List`, `Modal`, `Row`, `Slider`, `Tabs`, `Text`, `TextField`, and `Video`. Use `getA2uiV1NativeSupportedComponentNames(catalog, { imagePolicy, mediaPolicy })` when building host capability metadata: the four base primitives imply the seven structural/text/input names, each optional slot adds only its matching A2UI name, `Image` additionally requires the image policy, and both media slots require the media policy. A missing slot or required policy fails closed before mounting.

`Video` and `AudioPlayer` receive only a canonical URL, explicitly selected semantic/accessibility
fields, and a complete host grant for origins, redirects, MIME types, bytes, autoplay, background
playback, external routes, and activation. The installed player must enforce that grant. Expanded
plans allow at most 16 media instances and 2 GiB of total granted transfer bytes. Video posters use
the separate image policy.

Namespaced local components use `createNativeHostExtensionRegistration` plus a negotiated opaque
registry and an exact `hostExtensionPolicy` grant. Advertise their catalog IDs with
`getA2uiV1NativeSupportedHostExtensionCatalogIds` only after the local registration and policy are
installed. See the [media and extension guide](../../docs/media-and-host-extensions.md).

These mappings have automated host-boundary coverage. The [Expo Go integration demonstration
policy](../../docs/native-accessibility-testing.md) defines the shared surface and the independent
app-per-library approach for platform and component-library validation. The [automated robustness gates](../../docs/a2ui-v1-performance.md) define
repeatable Node.js render-plan budgets and fixed-seed generated-input coverage.

For release/platform testing, `npm run native:host:prepare` generates an official temporary React
Native host at the package's exact tested boundaries: current latest `0.87.1` and declared minimum
`0.87.0`. Each host installs local package tarballs and the pinned accessibility,
complete-catalog, media, and Codegen/Fabric extension fixtures.
The [Expo Go integration demonstration policy](../../docs/native-accessibility-testing.md) documents
the open app-level compatibility track. Generated hosts remain the current automated package
fixtures; each future component-library demonstration will record its own exact support evidence.

The Milestone 9 fixture also places this native surface beside an isolated MCP Apps WebView through
the convenience package's host-owned coordinator. It exercises fixed accessibility order,
application state, dynamic type, reduced motion, orientation, keyboard, back handling, process
crash/reload, and teardown without treating the two regions as one protocol or accessibility tree.

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

`createNativeViewAdapter`, `createNativeTextAdapter`, `createNativeTextInputAdapter`, `createNativeImageAdapter`, `createNativeIconAdapter`, `createNativeDividerAdapter`, `createNativeCheckBoxAdapter`, `createNativeChoicePickerAdapter`, `createNativeSliderAdapter`, `createNativeDateTimeInputAdapter`, `createNativeTabsAdapter`, and `createNativeModalAdapter` provide the same typed boundary for the other semantics. This supports wrappers around libraries such as Expo UI or Gluestack without coupling MCP Native to them. These helpers do not create new wire-level components. Mapper functions and target components are trusted application code; server input never selects an import, mapper, or unchecked target prop.

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
    Image: { avatar: AvatarImage, mediumFeature: FeatureImage },
    ChoicePicker: { multipleSelection: MultiSelect, mutuallyExclusive: RadioSelect },
  },
};
```

Each override receives the same explicitly selected primitive props as its base component. Missing
entries fall back to their base component; omitted A2UI hints select their pinned defaults. The renderer consumes structural and style hints while
choosing a local component and never forwards `variant`, a server-provided style object, or an
arbitrary native prop. Hosts can combine variant slots with the typed adapter helpers when a design
system uses a different prop API. Variant slots apply only to `A2uiV1NativeSurface`; the custom `0.1`
`McpNativeSurface` always uses the four base primitives, even when the same host catalog is reused.

Create adapter components and the catalog at module scope, as above, or memoize them with stable dependencies. Each factory call intentionally creates a new React component type; calling one during every host render would remount that catalog entry and discard its component-local state. Generated adapters include descriptive React DevTools display names.

Use `A2uiV1NativeSurface` to mount the installed subset with typed renderer-local state and official action envelopes:

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

Bound `TextField`, `CheckBox`, `ChoicePicker`, `Slider`, and `DateTimeInput` changes update an owned local data model with their exact string, boolean, string-array, number, or date/time-string type and rerender dependent output immediately; they do not call the agent on every edit. Equivalent fresh store snapshots preserve those edits, while accepted agent data-model updates reset them. Repeated template buttons retain a renderer-only instance key, so pressing one resolves its user message, supported renderer functions, `@index`, and context again against the correct item in the latest local model while the official wire `sourceComponentId` remains the catalog component ID. The action is timestamped, reconstructed as finite JSON, and validated against the pinned official renderer-to-agent action schema. The callback receives the local data model only when the surface explicitly sets `sendDataModel: true`; otherwise its second argument is omitted. The host callback owns transport delivery and permission or consent boundaries.

`Image` additionally requires `imagePolicy`. During render-plan construction, the synchronous callback receives an HTTP(S) URL after canonicalization and must return `false` or an exact grant containing allowed redirect origins, maximum redirects, transfer bytes, decoded width, height and pixels, plus `default` or `no-store` cache mode. The renderer validates and freezes that grant, then passes it to the installed image component as `resourcePolicy`. The image component must enforce every field before and during loading; a permissive platform image primitive is not sufficient merely because it accepts a URI. Credentials, non-HTTP(S) schemes, malformed origins, oversized URLs, invalid grants, and denied requests fail closed. One expanded plan permits at most 64 images, 100 MiB of total granted transfer bytes, and 268,435,456 total granted decoded pixels. The image-count check runs before the host policy, preventing a large component graph from amplifying authorization callbacks. Event and `openUrl` reconstruction revalidates server-controlled image URLs but does not invoke image authorization again.

`Icon` accepts only the exported `A2UI_V1_NATIVE_ICON_NAMES` semantic set and requires a host-owned mapping. SVG paths, module or font names, arbitrary glyphs, and platform symbols from the server are rejected. `Tabs` owns only its selected index. `Modal` owns open/closed state and requires a `Button` trigger; activating it opens local content and still resolves the declared Button action. The installed modal owns focus entry/trapping, escape or platform-back dismissal through `onRequestClose`, and restoration to its trigger. Dismissal emits no agent action.

`openUrl` is a local Button action, not an agent event. The host must allow the function name in the catalog policy and provide both `openUrlPolicy` and `onOpenUrl`. The adapter re-resolves the URL against current local state during the originating press, canonicalizes it, rejects non-HTTP(S), relative, credential-bearing, whitespace-containing, control-containing, Unicode-format-containing, or oversized values, and invokes the opener only when the synchronous policy returns exactly `true`. Invalid initial server values reject the surface; temporary invalid renderer-local text edits instead disable the affected Button until the value becomes valid, and strict resolution runs again before an enabled press can reach host policy. No URL handler is imported or called by this package. Each URL is capped at 8,192 UTF-16 code units and one expanded pass is capped at 1,048,576 URL code units.

Renderer functions other than `formatString`, `formatNumber`, `formatCurrency`, `formatDate`, `pluralize`, `required`, `regex`, `length`, `numeric`, `email`, `and`, `or`, `not`, template-scoped `@index`, and local Button action `openUrl`, nested inline catalogs, unnegotiated extensions, and unknown components fail closed. Number and currency formatting uses `Intl.NumberFormat`, date formatting uses `Intl.DateTimeFormat`, and cardinal plural selection uses `Intl.PluralRules` with the required `other` fallback. `required` follows the pinned reference behavior for null, empty strings, and empty arrays. `length` and `numeric` use inclusive, ordered bounds, and `email` uses the pinned basic check with a 320-code-unit input cap. Agent-supplied `regex` is limited to 256 UTF-16 code units, a 4,096-code-unit input, repeats no larger than 4,096, no groups, alternation, backreferences, or Unicode property escapes, and at most one variable repeat; inputs over the cap fail the check, while unsupported or malformed patterns reject the surface. Expanded plans evaluate at most 10,000 renderer checks per pass. Each combined validation accessibility output is capped at 65,536 UTF-16 code units before construction, with at most 1,048,576 such output code units across one expanded pass. `formatDate` accepts finite Unix seconds or milliseconds, their numeric string forms, RFC 3339 timestamps, and strict `yyyy-MM-dd` dates. Absolute numeric magnitudes greater than `10,000,000,000` are milliseconds; all others are seconds. It supports the pinned catalog's `yy`, `yyyy`, `M`, `MM`, `MMM`, `MMMM`, `d`, `dd`, `E`, `EEEE`, `h`, `hh`, `H`, `HH`, `mm`, `ss`, and `a` token subset plus quoted literals; `h` and `hh` require `a`, other pattern letters fail closed, and one pattern may contain at most 128 tokens. The host may supply one validated, runtime-supported BCP 47 `locale` to the mounted surface, render-plan options, event-resolution options, and URL-resolution options, or omit it to use the runtime locale. A date-only `yyyy-MM-dd` value is a calendar date interpreted at midnight in the runtime time zone. An RFC 3339 value is an instant whose declared offset is applied before it is formatted in that runtime time zone. Agent-controlled decimal precision is restricted to an integer from 0 through 100, currency must appear in ISO 4217 List One published 2026-01-01, dynamic values resolve with strict types, formatter construction failures are controlled parse errors, and formatter caches live only for one bounded render, event-resolution, or URL-resolution pass. Expanded plans are capped at 1,024 nodes, 10,000 interpolations, and 1,048,576 formatted UTF-16 code units so repeated references or large bound arrays cannot amplify a small component graph into unbounded work; each formatted result also retains the shared 65,536-code-unit string limit.

## Public API

| Export                                            | Purpose                                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `McpNativeSurface`                                | Mounts a validated surface using the host's component catalog.                                                |
| `A2uiV1NativeSurface`                             | Mounts the supported v1 subset with local bindings and official action-envelope callbacks.                    |
| `useMcpNativeActionDispatcher`                    | Adapts asynchronous runtime dispatch into a stable event callback with required error handling.               |
| `useNativeRenderPlan`                             | Memoizes a trusted render plan for a validated surface identity.                                              |
| `createNativeRenderPlan`                          | Converts a validated `A2uiSurface` into a `NativeElement` tree.                                               |
| `createA2uiV1NativeRenderPlan`                    | Revalidates and adapts the supported v1 subset into a trusted `NativeElement` tree.                           |
| `resolveA2uiV1NativeEvent`                        | Revalidates and resolves one reachable static or template-instance event against the latest local model.      |
| `resolveA2uiV1NativeOpenUrl`                      | Revalidates and resolves one reachable HTTP(S) URL action against the latest local model.                     |
| `A2UI_V1_NATIVE_COMPONENT_NAMES`                  | Exact basic-catalog component names implemented by the current native adapter.                                |
| `getA2uiV1NativeSupportedComponentNames`          | Exact advertisable intersection derived from installed and policy-ready basic-catalog slots.                  |
| `getA2uiV1NativeSupportedHostExtensionCatalogIds` | Exact extension catalogs backed by an opaque registry, local registration, and policy.                        |
| `A2UI_V1_NATIVE_ICON_NAMES`                       | Pinned semantic names accepted by the native icon boundary.                                                   |
| `A2UI_V1_NATIVE_MAX_RENDER_NODES`                 | Bound on expanded v1 render-plan nodes.                                                                       |
| `A2UI_V1_NATIVE_MAX_OPEN_URL_LENGTH`              | Per-action bound on canonical HTTP(S) URL length.                                                             |
| `A2UI_V1_NATIVE_MAX_IMAGE_URL_LENGTH`             | Per-image bound on canonical HTTP(S) URL length.                                                              |
| `A2UI_V1_NATIVE_MAX_IMAGES`                       | Surface-wide bound on reachable expanded image instances.                                                     |
| `A2UI_V1_NATIVE_MAX_TOTAL_IMAGE_BYTES`            | Surface-wide bound on the sum of granted image transfer-byte budgets.                                         |
| `A2UI_V1_NATIVE_MAX_TOTAL_IMAGE_PIXELS`           | Surface-wide bound on the sum of granted decoded-pixel budgets.                                               |
| `A2UI_V1_NATIVE_MAX_MEDIA`                        | Surface-wide bound on reachable expanded media instances.                                                     |
| `A2UI_V1_NATIVE_MAX_TOTAL_MEDIA_BYTES`            | Surface-wide bound on the sum of granted media transfer-byte budgets.                                         |
| `A2uiV1NativeEventDescriptor`                     | Resolved trusted-plan event data used by mounted dispatch or custom hosts.                                    |
| `A2uiV1NativeOpenUrlDescriptor`                   | Canonical URL plus surface, component, and optional template-instance identity.                               |
| `A2uiV1NativeRenderPlanOptions`                   | Optional local model/locale plus required-when-used image, media, and extension policies.                     |
| `A2uiV1NativeEventResolutionOptions`              | Optional template instance key and matching host-owned BCP 47 locale.                                         |
| `A2uiV1NativeOpenUrlResolutionOptions`            | Optional template instance key and matching host-owned BCP 47 locale for URL resolution.                      |
| `A2uiV1NativeActionHandler`                       | Host callback receiving the validated action envelope and, when opted in, the local data model.               |
| `A2uiV1NativeOpenUrlPolicy`                       | Synchronous host predicate authorizing one canonical URL during its Button press.                             |
| `A2uiV1NativeOpenUrlHandler`                      | Host-owned callback that opens an authorized URL through a platform API.                                      |
| `A2uiV1NativeImagePolicy` / `Grant`               | Deny-by-default image authorization callback and exact resource budgets.                                      |
| `A2uiV1NativeMediaPolicy` / `Grant`               | Deny-by-default media authorization callback and exact resource/playback budgets.                             |
| `A2uiV1NativeHostExtensionPolicy`                 | Exact resource/permission grant for one validated local extension instance.                                   |
| `createNativeHostExtensionRegistration`           | Opaque binding from one parsed local manifest to one locally imported component and prop mapper.              |
| `NativeComponentCatalog`                          | Four required base primitives, optional closed basic-catalog slots, and opaque local extension registrations. |
| `NativeComponentVariants`                         | Optional overrides for supported structure and pinned style hints, with base fallbacks.                       |
| `Native*Variant` types                            | Closed view, text, button, text-input, image, and choice-picker variant keys.                                 |
| `NativeAccessibilityRole`                         | Renderer-derived closed role union for supported semantics.                                                   |
| `NativeAccessibilityState`                        | Renderer-derived checked, disabled, expanded, and selected state subset.                                      |
| `createNative*Adapter` helpers                    | Typed mappings from trusted semantic props into locally bundled component-library APIs.                       |
| `NativeComponentPropMapper`                       | Generic mapper type used by all host component adapter helpers.                                               |
| `NativeActionHandler`                             | Synchronous handler for a validated declared action.                                                          |
| `NativeBindingChangeHandler`                      | Handler receiving a validated binding name and the next text value.                                           |
| `McpNativeActionDispatcherOptions`                | Required action error callback and optional result callback.                                                  |
| `NativeElement` / `NativeComponentName`           | Serializable trusted-plan node and its fixed component-name union.                                            |

## Legacy `0.1` mappings

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
