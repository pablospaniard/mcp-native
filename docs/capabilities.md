# What MCP Native can do

MCP Native lets an MCP server describe an interactive interface while the mobile application keeps
control of the code, visual system, navigation, permissions, and network boundaries.

In human terms, the server asks for a meaningful control such as “a checkbox for notifications” or
“a slider for volume.” The host application validates that request, maps it to a component already
compiled into the app, and renders it. When a person interacts, the renderer updates local form
state immediately. Only a declared action such as pressing Save becomes a validated message back to
the server, and the host still decides whether and how to deliver it.

## Server and host

- The **server** supplies MCP tools/resources and the declarative A2UI messages. It may describe
  content, controls, bindings, validation, and declared events. It never supplies native code.
- The **host** is the installed mobile application. It owns the MCP connection, component catalog,
  design system, navigation shell, image loader, permissions, secrets, action policy, and platform
  lifecycle.

An end-to-end flow is:

1. The host and server explicitly agree on the pinned A2UI profile and the exact catalog they share.
2. The server sends a schema-validated surface description.
3. MCP Native validates names, fields, references, bindings, functions, graph size, and host policy,
   then creates a trusted render plan.
4. The React Native renderer maps semantic components to locally compiled primitives or typed
   design-system adapters. For example, `Button` may become a local Gluestack button and `Card` may
   become the application's own surface component. The server cannot select those imports or pass
   raw style objects.
5. Inputs update renderer-local state. Checks and accessibility output are recomputed within fixed
   limits, without sending every keystroke or toggle to the server.
6. A declared button event is reconstructed from the latest state, validated again, checked by host
   policy, and delivered through the host-owned MCP transport.

## Current native catalog

The React Native renderer covers every component in the pinned A2UI v1.0 Candidate basic catalog:

- layout and content: `Row`, `Column`, `List`, `Card`, `Text`, `Image`, `Icon`, `Divider`;
- controls: `Button`, `TextField`, `CheckBox`, `ChoicePicker`, `Slider`, `DateTimeInput`;
- composition: `Tabs`, `Modal`;
- media: `Video`, `AudioPlayer`.

The renderer also supports bounded dynamic lists, formatting, validation, absolute and repeated-item
bindings, local form state, declared actions, explicit accessibility data, and a policy-gated local
HTTP(S) `openUrl` action.

Support is not automatic merely because a name appears above. A host advertises only the exact
subset for which it installed complete components and policies. Missing optional slots fail closed.
An image-capable host must additionally provide a loader that enforces the exact origin, redirect,
byte, decoded-size, and cache grant supplied with every request. The renderer also caps the complete
surface at 64 images, 100 MiB of granted transfer bytes, and 268,435,456 granted decoded pixels.
A media-capable host must provide a player and policy that enforce the exact origin, redirects,
MIME types, transfer size, autoplay, background playback, external-route, and user-activation grant.
The renderer caps a surface at 16 media instances and 2 GiB of total granted transfer bytes.

Applications may also advertise namespaced, versioned semantic host extensions that were compiled
and registered locally. Their manifests, props, events, platform support, accessibility, needs, and
limits are validated exactly; inline catalogs and server-selected native code remain disabled. See
the [media and host-extension guide](media-and-host-extensions.md).

## Components, libraries, and styling

The host may use React Native primitives, application-owned components, or any locally bundled
component/design-system library that can be mapped through the typed adapter contract. MCP Native
does not accept a library, module path, component class, JavaScript function, native command, SVG
payload, raw React Native prop bag, or raw style object from the server.

Visual design remains local. The server can choose only documented semantic variants such as a
primary button, caption text, card, or multiple-selection picker. The host decides what those
variants mean in its tokens, themes, spacing, typography, motion, dark mode, and platform-specific
implementation. This allows attractive, branded screens without turning styling into a remote-code
or unchecked-prop channel.

## React Native, SwiftUI, and Compose

React Native is the only first-class renderer before `1.0.0`. A React Native host may already use a
locally compiled UIKit, Android View, SwiftUI, or Compose wrapper when the host owns the typed
adapter, but MCP Native does not yet provide direct SwiftUI or Jetpack Compose renderers or promise
cross-renderer parity.

Direct SwiftUI and Jetpack Compose renderers are committed immediately after `1.0.0`. The same
post-`1.0.0` program adds typed, advertised, policy-gated providers for the wider native platform
capability space. “All native capabilities” means an extensible host-provider model, not exposing
arbitrary platform APIs or commands to a server.

## WebViews and mixed screens

HTML MCP Apps use a separate, isolated WebView path. The WebView package validates the stable MCP
Apps profile and supplies a restrictive sandbox/bridge contract, but a native WebView cannot offer
all guarantees of a browser's cross-origin double iframe. The host must enforce origins, navigation,
storage, cookies, downloads, permissions, bridge messages, and teardown.

Native A2UI and WebView rendering use a deliberately host-owned production composition model.
Milestone `0.9.0` adds a coordinator that places factory-created native and isolated WebView regions
as siblings on one screen and serializes their lifecycle. A server cannot create, configure,
navigate, or bridge a WebView from A2UI. See the [mixed-surface guide](mixed-surfaces.md).

## What remains before `1.0.0`

- `0.8.0`: released—policy-gated audio/video and a versioned model for locally compiled native
  extensions;
- `0.9.0`: implementation complete—mixed native/WebView hosting, production-shaped reference host,
  and proposed API freeze; release preparation remains;
- `1.0.0`: compatibility, migration, conformance, release, and long-term support gates.

Expo Go demonstrations remain separate, informative compatibility work. They do not expand the
package's security or conformance claims.
