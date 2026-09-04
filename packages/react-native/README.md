<div align="center">

# @mcp-native/react-native

### Trusted native render plans for validated MCP surfaces

[![npm](https://img.shields.io/npm/v/@mcp-native/react-native)](https://www.npmjs.com/package/@mcp-native/react-native)
[![downloads](https://img.shields.io/npm/dm/@mcp-native/react-native)](https://www.npmjs.com/package/@mcp-native/react-native)
[![license](https://img.shields.io/npm/l/@mcp-native/react-native)](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)

[GitHub](https://github.com/pablospaniard/mcp-native) · [Architecture](https://github.com/pablospaniard/mcp-native/blob/main/docs/RFC-0001-architecture.md) · [Standards status](https://github.com/pablospaniard/mcp-native/blob/main/docs/standards-compatibility.md) · [Security](https://github.com/pablospaniard/mcp-native/blob/main/SECURITY.md)

</div>

`@mcp-native/react-native` turns a surface validated by `@mcp-native/a2ui` into native UI using
components supplied by your application. It supports the complete pinned A2UI basic catalog,
policy-gated media, and locally compiled host extensions. Your app keeps control of the component
implementations, visual design, and action delivery.

The renderer implements the native portion of the documented A2UI v1 Candidate profile. The v1 adapter converts the complete pinned basic catalog, including bounded dynamic lists and policy-gated media, into the host-owned `NativeElement` boundary. Exactly negotiated local host extensions use a separate closed registration boundary. See the [feature-scoped A2UI profile](https://github.com/pablospaniard/mcp-native/blob/main/docs/a2ui-v1-conformance.md) for exact coverage.

## Install

Until the stable `1.0.0` release, select the beta package explicitly:

```bash
npm install @mcp-native/react-native@beta react
```

`@mcp-native/a2ui` and `@mcp-native/core` are installed as dependencies. React `>=18.1.0` is the
only peer dependency. The renderer does not depend on Expo or import React Native; a native host
supplies its locally bundled components and platform integrations.

The package root is the namespace for the current native renderer profile, so public names are
concise (`Surface`, `HostSurface`, `createHost`). Exact A2UI `"v1.0"` wire values and schema pins do
not change. Earlier prefixed exports remain compatible aliases throughout `1.x`; see the
[migration guide](https://github.com/pablospaniard/mcp-native/blob/main/docs/migration-to-1.0.md).

## Start with the A2UI v1 renderer

New integrations mount `Surface` with an explicit catalog policy and locally bundled
components. Continue with the [v1 render-plan adapter](#a2ui-v1-render-plan-adapter) for the complete
host flow, catalog mapping, local state, validation, actions, media, and extension support.

## A2UI v1 render-plan adapter

Prefer one immutable native-host registration so catalog slots, resource policies, validation, and
advertised capabilities cannot drift:

```tsx
import { HostSurface, createHost } from "@mcp-native/react-native";
import { Button, Text, TextInput, View } from "react-native";

const nativeHost = createHost({
  components: { Button, Text, TextInput, View },
  allowedEventNames: ["save_profile"],
  allowedFunctionNames: [],
});

const surface = store.get("profile");
const mounted = surface && (
  <HostSurface
    host={nativeHost}
    surface={surface}
    onAction={deliverAction}
    onRenderError={reportLocalError}
    fallback={<Text>Result unavailable</Text>}
  />
);
```

`inspectMount` and `assertMount` can run at ingestion time, before React,
and report stable `component-not-allowed`, `surface-invalid`, `render-plan-rejected`, `missing-component`,
`missing-extension-registration`, or `layout-incompatible` diagnostics. The registered surface
runs structural/layout preflight without repeating resource authorization, then contains
component-library render failures and throwing or rejected error observers behind a reusable
`SurfaceBoundary`. The older
`Surface` plus separately constructed policy remains available as the manual low-level
path. Its default recovery key tracks the host, effective parent layout, component graph, and data
model so a corrected mount-affecting input retries automatically.

The adapter maps `Row`, `Column`, static or dynamic `List`, and `Card` to `View`; `Text` to `Text`; `Button` with a `Text` child to `Button`; and `TextField` to `TextInput`. Optional host slots implement `Image`, `Icon`, `Divider`, `CheckBox`, `ChoicePicker`, `Slider`, `DateTimeInput`, `Tabs`, and `Modal`. Dynamic lists expand one validated template component per bound array item and remain inside the 1,024-node plan limit. The adapter resolves absolute and item-relative JSON Pointer values; translates relative typed bindings into absolute renderer-local pointers; evaluates bounded formatting, boolean, validation, and `@index` functions; maps supported layout and variants to owned props; and preserves event context and explicit accessibility fields. At the mounted boundary, components receive closed roles and state, hidden controls are excluded, and text scaling stays enabled. Supported checks expose `invalid`/`validationMessages`; invalid buttons cannot resolve or dispatch an event or local URL action. Main-axis `stretch` and negative weight, which React Native flex layout cannot represent faithfully, fail closed.

The complete catalog is exactly `AudioPlayer`, `Button`, `Card`, `CheckBox`, `ChoicePicker`, `Column`, `DateTimeInput`, `Divider`, `Icon`, `Image`, `List`, `Modal`, `Row`, `Slider`, `Tabs`, `Text`, `TextField`, and `Video`. `createHost` derives the exact supported intersection and rejects any allowlist entry that lacks its slot or required policy. Low-level callers can still use `getSupportedComponentNames(catalog, { imagePolicy, mediaPolicy })` directly. A surface requesting anything outside that intersection fails during validation or explicit mount preflight, before catalog rendering.

`Video` and `AudioPlayer` receive only a canonical URL, explicitly selected semantic/accessibility
fields, and a complete host grant for origins, redirects, MIME types, bytes, autoplay, background
playback, external routes, and activation. The installed player must enforce that grant. Expanded
plans allow at most 16 media instances and 2 GiB of total granted transfer bytes. Video posters use
the separate image policy.

Namespaced local components use `createNativeHostExtensionRegistration` plus a negotiated opaque
registry and an exact `hostExtensionPolicy` grant. Advertise their catalog IDs with
`getSupportedHostExtensionCatalogIds` only after the local registration and policy are
installed. See the [media and extension guide](https://github.com/pablospaniard/mcp-native/blob/main/docs/media-and-host-extensions.md).

Host adapters may declare verified layout contracts with `allowedParents`, `sizing`, optional
overlay presentation, and scroll ownership. Pass the shell's `bounded`, `scroll`, or `unbounded`
parent category to preflight or `HostSurface`; an incompatible component is rejected
instead of being mounted into a layout where it can collapse or obscure siblings. Keep catalogs and
adapter factories at module scope so local component state remains stable.

The `@mcp-native/react-native/testing` subpath provides fresh Divider, ChoicePicker, Slider, Tabs,
and Modal conformance surfaces with expected semantic behaviors. Render every installed adapter in
the application's own native test stack, including its supported parent-layout categories.

These mappings have automated host-boundary coverage. The runnable [Expo Go todo
app](https://github.com/pablospaniard/mcp-native/tree/main/examples/expo-go-todolist) demonstrates
the lifecycle, catalog, bindings, actions, persistence, and accessibility boundary in a complete
native workflow. The [automated robustness gates](https://github.com/pablospaniard/mcp-native/blob/main/docs/a2ui-v1-performance.md) define repeatable Node.js render-plan budgets
and fixed-seed generated-input coverage.

For release/platform testing, `npm run native:host:prepare` generates a pinned temporary native
host. It installs local package tarballs and the accessibility, complete-catalog, media, and
Codegen/Fabric extension fixtures. This is reproducible integration evidence, not a package peer or
native-framework version boundary.
The [Expo Go integration proof](https://github.com/pablospaniard/mcp-native/blob/main/docs/native-accessibility-testing.md) documents the runnable
app-level evidence. Generated hosts remain the automated package fixtures; the Expo app complements
them with a workflow users can launch and inspect directly.

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

When a host uses `@mcp-native/host`'s result-state renderer, its text adapter must forward the
optional `accessibilityState` field so loading's `busy` state reaches the accessible status text.
Layout containers remain `accessible: false` to keep nested controls independently discoverable.

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
system uses a different prop API.

Create adapter components and the catalog at module scope, as above, or memoize them with stable dependencies. Each factory call intentionally creates a new React component type; calling one during every host render would remount that catalog entry and discard its component-local state. Generated adapters include descriptive React DevTools display names.

Use `Surface` to mount the installed subset with typed renderer-local state and official action envelopes:

```tsx
import { Surface } from "@mcp-native/react-native";
import { Linking } from "react-native";

<Surface
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

`Icon` accepts only the exported `ICON_NAMES` semantic set and requires a host-owned mapping. SVG paths, module or font names, arbitrary glyphs, and platform symbols from the server are rejected. `Tabs` owns only its selected index. `Modal` owns open/closed state and requires a `Button` trigger; activating it opens local content and still resolves the declared Button action. The installed modal owns focus entry/trapping, escape or platform-back dismissal through `onRequestClose`, and restoration to its trigger. Dismissal emits no agent action.

`openUrl` is a local Button action, not an agent event. The host must allow the function name in the catalog policy and provide both `openUrlPolicy` and `onOpenUrl`. The adapter re-resolves the URL against current local state during the originating press, canonicalizes it, rejects non-HTTP(S), relative, credential-bearing, whitespace-containing, control-containing, Unicode-format-containing, or oversized values, and invokes the opener only when the synchronous policy returns exactly `true`. Invalid initial server values reject the surface; temporary invalid renderer-local text edits instead disable the affected Button until the value becomes valid, and strict resolution runs again before an enabled press can reach host policy. No URL handler is imported or called by this package. Each URL is capped at 8,192 UTF-16 code units and one expanded pass is capped at 1,048,576 URL code units.

Renderer functions other than `formatString`, `formatNumber`, `formatCurrency`, `formatDate`, `pluralize`, `required`, `regex`, `length`, `numeric`, `email`, `and`, `or`, `not`, template-scoped `@index`, and local Button action `openUrl`, nested inline catalogs, unnegotiated extensions, and unknown components fail closed. Number and currency formatting uses `Intl.NumberFormat`, date formatting uses `Intl.DateTimeFormat`, and cardinal plural selection uses `Intl.PluralRules` with the required `other` fallback. `required` follows the pinned reference behavior for null, empty strings, and empty arrays. `length` and `numeric` use inclusive, ordered bounds, and `email` uses the pinned basic check with a 320-code-unit input cap. Agent-supplied `regex` is limited to 256 UTF-16 code units, a 4,096-code-unit input, repeats no larger than 4,096, no groups, alternation, backreferences, or Unicode property escapes, and at most one variable repeat; inputs over the cap fail the check, while unsupported or malformed patterns reject the surface. Expanded plans evaluate at most 10,000 renderer checks per pass. Each combined validation accessibility output is capped at 65,536 UTF-16 code units before construction, with at most 1,048,576 such output code units across one expanded pass. `formatDate` accepts finite Unix seconds or milliseconds, their numeric string forms, RFC 3339 timestamps, and strict `yyyy-MM-dd` dates. Absolute numeric magnitudes greater than `10,000,000,000` are milliseconds; all others are seconds. It supports the pinned catalog's `yy`, `yyyy`, `M`, `MM`, `MMM`, `MMMM`, `d`, `dd`, `E`, `EEEE`, `h`, `hh`, `H`, `HH`, `mm`, `ss`, and `a` token subset plus quoted literals; `h` and `hh` require `a`, other pattern letters fail closed, and one pattern may contain at most 128 tokens. The host may supply one validated, runtime-supported BCP 47 `locale` to the mounted surface, render-plan options, event-resolution options, and URL-resolution options, or omit it to use the runtime locale. A date-only `yyyy-MM-dd` value is a calendar date interpreted at midnight in the runtime time zone. An RFC 3339 value is an instant whose declared offset is applied before it is formatted in that runtime time zone. Agent-controlled decimal precision is restricted to an integer from 0 through 100, currency must appear in ISO 4217 List One published 2026-01-01, dynamic values resolve with strict types, formatter construction failures are controlled parse errors, and formatter caches live only for one bounded render, event-resolution, or URL-resolution pass. Expanded plans are capped at 1,024 nodes, 10,000 interpolations, and 1,048,576 formatted UTF-16 code units so repeated references or large bound arrays cannot amplify a small component graph into unbounded work; each formatted result also retains the shared 65,536-code-unit string limit.

## Public API

| Export                                  | Purpose                                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `createHost`                            | Freezes catalog, policies, capabilities, extensions, and layout declarations into one owner.                  |
| `inspectMount`                          | Returns stable pre-React diagnostics and required native slots for one expanded surface.                      |
| `assertMount`                           | Throws `MountError` when the explicit mount inspection is not accepted.                                       |
| `HostSurface`                           | Preflights and mounts through a registered host with surface-wide render containment.                         |
| `SurfaceBoundary`                       | Reusable redacted and resettable error boundary for direct low-level integrations.                            |
| `Surface`                               | Mounts the supported v1 subset with local bindings and official action-envelope callbacks.                    |
| `createRenderPlan`                      | Revalidates and adapts the supported v1 subset into a trusted `NativeElement` tree.                           |
| `resolveEvent`                          | Revalidates and resolves one reachable static or template-instance event against the latest local model.      |
| `resolveOpenUrl`                        | Revalidates and resolves one reachable HTTP(S) URL action against the latest local model.                     |
| `COMPONENT_NAMES`                       | Exact basic-catalog component names implemented by the current native adapter.                                |
| `getSupportedComponentNames`            | Exact advertisable intersection derived from installed and policy-ready basic-catalog slots.                  |
| `getSupportedHostExtensionCatalogIds`   | Exact extension catalogs backed by an opaque registry, local registration, and policy.                        |
| `@mcp-native/react-native/testing`      | Fresh canonical surfaces and expected behaviors for application-owned adapter conformance tests.              |
| `ICON_NAMES`                            | Pinned semantic names accepted by the native icon boundary.                                                   |
| `MAX_RENDER_NODES`                      | Bound on expanded current-profile render-plan nodes.                                                          |
| `MAX_OPEN_URL_LENGTH`                   | Per-action bound on canonical HTTP(S) URL length.                                                             |
| `MAX_IMAGE_URL_LENGTH`                  | Per-image bound on canonical HTTP(S) URL length.                                                              |
| `MAX_IMAGES`                            | Surface-wide bound on reachable expanded image instances.                                                     |
| `MAX_TOTAL_IMAGE_BYTES`                 | Surface-wide bound on the sum of granted image transfer-byte budgets.                                         |
| `MAX_TOTAL_IMAGE_PIXELS`                | Surface-wide bound on the sum of granted decoded-pixel budgets.                                               |
| `MAX_MEDIA`                             | Surface-wide bound on reachable expanded media instances.                                                     |
| `MAX_TOTAL_MEDIA_BYTES`                 | Surface-wide bound on the sum of granted media transfer-byte budgets.                                         |
| `EventDescriptor`                       | Resolved trusted-plan event data used by mounted dispatch or custom hosts.                                    |
| `OpenUrlDescriptor`                     | Canonical URL plus surface, component, and optional template-instance identity.                               |
| `RenderPlanOptions`                     | Optional local model/locale plus required-when-used image, media, and extension policies.                     |
| `EventResolutionOptions`                | Optional template instance key and matching host-owned BCP 47 locale.                                         |
| `OpenUrlResolutionOptions`              | Optional template instance key and matching host-owned BCP 47 locale for URL resolution.                      |
| `ActionHandler`                         | Host callback receiving the validated action envelope and, when opted in, the local data model.               |
| `OpenUrlPolicy`                         | Synchronous host predicate authorizing one canonical URL during its Button press.                             |
| `OpenUrlHandler`                        | Host-owned callback that opens an authorized URL through a platform API.                                      |
| `ImagePolicy` / `Grant`                 | Deny-by-default image authorization callback and exact resource budgets.                                      |
| `MediaPolicy` / `Grant`                 | Deny-by-default media authorization callback and exact resource/playback budgets.                             |
| `HostExtensionPolicy`                   | Exact resource/permission grant for one validated local extension instance.                                   |
| `createNativeHostExtensionRegistration` | Opaque binding from one parsed local manifest to one locally imported component and prop mapper.              |
| `NativeComponentCatalog`                | Four required base primitives, optional closed basic-catalog slots, and opaque local extension registrations. |
| `NativeComponentVariants`               | Optional overrides for supported structure and pinned style hints, with base fallbacks.                       |
| `Native*Variant` types                  | Closed view, text, button, text-input, image, and choice-picker variant keys.                                 |
| `NativeAccessibilityRole`               | Renderer-derived closed role union for supported semantics.                                                   |
| `NativeAccessibilityState`              | Renderer-derived checked, disabled, expanded, and selected state subset.                                      |
| `createNative*Adapter` helpers          | Typed mappings from trusted semantic props into locally bundled component-library APIs.                       |
| `NativeComponentPropMapper`             | Generic mapper type used by all host component adapter helpers.                                               |
| `NativeElement` / `NativeComponentName` | Serializable trusted-plan node and its fixed component-name union.                                            |

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
- Styling variants preserve pinned allowlists and never spread unchecked server props; future component expansion must retain the same boundary.

See [`@mcp-native/a2ui`](https://www.npmjs.com/package/@mcp-native/a2ui) for parsing and [`@mcp-native/core`](https://www.npmjs.com/package/@mcp-native/core) for action dispatch. Install [`mcp-native`](https://www.npmjs.com/package/mcp-native) for the combined runtime and UI APIs.

## License

[MIT](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)
