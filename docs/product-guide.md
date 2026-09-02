# What MCP Native does

> **Status:** MCP Native `0.9.x` is the feature-complete release candidate for the
> documented React Native host scope. The public API is frozen for `1.0.0`, and teams can integrate
> it now. The remaining stable-release work is independent review, final compatibility and release
> validation, and publication of the `1.x` guarantee.

MCP Native lets an application turn a server-described interface into UI that still belongs to the
application. The server can ask for semantic elements such as text, fields, choices, lists, media,
and actions. The host validates that description, decides which capabilities it accepts, and maps
the accepted elements to components already compiled into the app.

This is useful when an MCP experience should look and behave like the rest of a native product,
without downloading React Native code or allowing a server to select arbitrary packages, props, or
styles.

## A good fit for

- native forms, settings, approval flows, and structured tool results that should use the app's
  existing design system;
- interactive MCP experiences that need local input state, validation, accessibility semantics,
  media, or app-owned components;
- host screens that combine native controls with an isolated HTML visualization or MCP App; and
- teams that want explicit capability and action policies at the server-to-device boundary.

## The end-to-end flow

1. The host connects to an MCP server and advertises only the protocol profiles, catalogs, and
   locally installed extensions it is prepared to handle.
2. A tool result points to either declarative A2UI data or an HTML MCP App. Useful ordinary MCP
   content remains the fallback when a richer surface is unavailable.
3. The host reads and validates the resource. Unknown versions, components, actions, functions,
   extensions, and malformed or oversized input are rejected.
4. For A2UI, the package produces trusted semantic props. The host's catalog maps them to React
   Native primitives, its design system, or an exactly registered local Fabric component.
5. For an MCP App, the host creates an isolated WebView from the package's closed sandbox and bridge
   descriptor. The App does not become a native component and receives no native permission by
   implication.
6. The application shell owns placement, navigation, focus, lifecycle, permissions, and error UI.
   Validated user actions return to a host callback, where application policy decides whether and
   how to deliver them.

“Server” therefore means the remote MCP participant that supplies tools, resources, and untrusted
UI descriptions. “Host” means the installed application: it owns the MCP client, the native code,
the component catalog, policy decisions, navigation, storage, permissions, and final pixels.

## Components and styling

The server does not send a React Native component or stylesheet. It sends meaning. A host might map
the same semantic `Button` to a plain React Native `Pressable`, a locally installed design-system
button, or a Fabric-backed native control. The mapping is typed and closed: only names and variants
that the host advertises can be selected.

Any component library can be used by the application if the host writes and tests an adapter for
it. A library is not accepted automatically, and the server cannot import one. Styling follows the
same rule: the app may use StyleSheet, utility classes, tokens, themes, or a design-system styling
framework internally, but raw server-supplied style objects and class names do not cross the trust
boundary.

The implemented renderer is React Native. It covers the pinned A2UI basic catalog and supports
locally compiled Fabric extensions. Direct SwiftUI and Jetpack Compose renderers, followed by the
broader typed native-capability provider program, are explicitly scheduled after `1.0.0`.

## Native and WebView content together

One host screen can contain a native A2UI region beside an isolated MCP Apps WebView region. The
host creates both registrations and fixes their sibling order. It also forwards app activity,
visibility, environment, focus, back, crash, recovery, memory-pressure, and teardown signals through
the mixed-surface coordinator.

This enables a native form or summary next to a rich HTML visualization. Each region keeps its own
security and accessibility tree: the host owns their order and lifecycle, while every WebView keeps
the origin, navigation, bridge, storage, download, external-link, permission, and teardown rules of
the MCP Apps profile.

## Extensions and sensitive capabilities

When the basic catalog is not enough, the app can register a locally compiled extension. The
extension has an exact namespace and version, a closed semantic schema, a host-owned renderer, and
an explicit policy callback. Unknown or unnegotiated extensions fail closed.

Camera, location, files, payments, biometrics, and similar capabilities are not ordinary component
props. They require a typed installed provider, application policy, and any necessary platform and
user approval. The post-`1.0.0` native-capability program expands this model without creating a
generic server-to-device command channel.

## Clear ownership boundaries

- Native UI code, component classes, and styling stay compiled into the application.
- The application owns navigation, screens, permissions, consent, and the surrounding shell.
- Declarative A2UI and HTML MCP Apps use separate native rendering and WebView policy boundaries.
- Compatibility follows the pinned MCP, A2UI, and MCP Apps profiles linked below, so teams can test
  against a precise contract.

For implementation details, continue with the [host integration checklist](host-integration-checklist.md),
[mixed-surface guide](mixed-surfaces.md), [support matrix](support-matrix.md), and
[standards status](standards-compatibility.md).
