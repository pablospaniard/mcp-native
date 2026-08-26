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

The renderer is an internal platform layer, not proof of complete A2UI v1.0 conformance. The custom `0.1` surface remains supported, and the separate v1.0 adapter now converts a strict static subset into the same host-owned `NativeElement` boundary.

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

The adapter maps `Row`, `Column`, static `List`, and `Card` to `View`; `Text` to `Text`; `Button` with a `Text` child to `Button`; and `TextField` to `TextInput`. It resolves absolute JSON Pointer values, maps supported container direction and alignment to owned React Native flex styles, maps `TextField` variants to explicit native input behavior (including `secureTextEntry` for `obscured`), and preserves event context and explicit accessibility fields. Main-axis `stretch`, which React Native flex layout cannot represent, fails closed.

Use `A2uiV1NativeSurface` to mount that subset with renderer-local string state and official action envelopes:

```tsx
import { A2uiV1NativeSurface } from "@mcp-native/react-native";

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
/>;
```

Bound `TextField` changes update an owned local data model and rerender other absolute bindings immediately; they do not call the agent on each keystroke. Equivalent fresh store snapshots preserve those edits, while accepted agent data-model updates reset them. When a button is pressed, its user message and context are resolved again against the latest local model, timestamped, reconstructed as finite JSON, and validated against the pinned official renderer-to-agent action schema. The callback receives the local data model only when the surface explicitly sets `sendDataModel: true`; otherwise its second argument is omitted. The host callback owns transport delivery and permission or consent boundaries.

Dynamic list templates, relative bindings, renderer functions, renderer-side checks, local function actions, and every other basic-catalog component fail closed. Expanded plans are capped at 1,024 nodes so repeated references cannot amplify a small component graph into unbounded work.

## Public API

| Export                                  | Purpose                                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `McpNativeSurface`                      | Mounts a validated surface using the host's component catalog.                                  |
| `A2uiV1NativeSurface`                   | Mounts the supported v1 subset with local bindings and official action-envelope callbacks.      |
| `useMcpNativeActionDispatcher`          | Adapts asynchronous runtime dispatch into a stable event callback with required error handling. |
| `useNativeRenderPlan`                   | Memoizes a trusted render plan for a validated surface identity.                                |
| `createNativeRenderPlan`                | Converts a validated `A2uiSurface` into a `NativeElement` tree.                                 |
| `createA2uiV1NativeRenderPlan`          | Revalidates and adapts the supported v1 subset into a trusted `NativeElement` tree.             |
| `resolveA2uiV1NativeEvent`              | Revalidates and resolves one reachable button event against the latest local model.             |
| `A2UI_V1_NATIVE_COMPONENT_NAMES`        | Exact basic-catalog component names implemented by the current native adapter.                  |
| `A2UI_V1_NATIVE_MAX_RENDER_NODES`       | Bound on expanded v1 render-plan nodes.                                                         |
| `A2uiV1NativeEventDescriptor`           | Resolved trusted-plan event data used by mounted dispatch or custom hosts.                      |
| `A2uiV1NativeActionHandler`             | Host callback receiving the validated action envelope and, when opted in, the local data model. |
| `NativeComponentCatalog`                | Contract for locally bundled `View`, `Text`, `Button`, and `TextInput` implementations.         |
| `NativeActionHandler`                   | Synchronous handler for a validated declared action.                                            |
| `NativeBindingChangeHandler`            | Handler receiving a validated binding name and the next text value.                             |
| `McpNativeActionDispatcherOptions`      | Required action error callback and optional result callback.                                    |
| `NativeElement` / `NativeComponentName` | Serializable trusted-plan node and its fixed component-name union.                              |

## Current mappings

| Surface node | Native component | Host props and event behavior                                                              |
| ------------ | ---------------- | ------------------------------------------------------------------------------------------ |
| `container`  | `View`           | Nested trusted children                                                                    |
| `text`       | `Text`           | Validated text as `children`                                                               |
| `button`     | `Button`         | `title`, matching `accessibilityLabel`, and an `onPress` callback for its validated action |
| `text-input` | `TextInput`      | Label as placeholder/accessibility label, optional value, and binding-aware `onChangeText` |

## Trust boundary

- The server cannot select components outside the catalog.
- The server cannot send executable React Native code.
- Render plans should only be created from a successfully validated surface.
- The v1 adapter performs policy validation again at its public boundary.
- The mounted v1 surface owns local binding state and revalidates action context at dispatch time.
- Unsupported v1 components, dynamic templates, and executable functions fail closed.
- Declared actions and their complete JSON arguments are validated again immediately before emission.
- Rendered component props are selected explicitly; unchecked server props are never spread into host components.
- The host must explicitly map components, enforce permissions, and choose the renderer-to-agent transport; emitting an envelope does not grant network or device access.
- Asynchronous action failures cannot become unhandled rejections because `useMcpNativeActionDispatcher` requires an error callback.
- Future styling and component expansion must preserve allowlists rather than spreading unchecked server props.

See [`@mcp-native/a2ui`](https://www.npmjs.com/package/@mcp-native/a2ui) for parsing and [`@mcp-native/core`](https://www.npmjs.com/package/@mcp-native/core) for action dispatch. Install [`mcp-native`](https://www.npmjs.com/package/mcp-native) for the combined runtime and UI APIs.

## License

[MIT](https://github.com/pablospaniard/mcp-native/blob/main/LICENSE)
