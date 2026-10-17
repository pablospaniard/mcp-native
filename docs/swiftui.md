# SwiftUI and Apple renderer

The `packages/swiftui` Swift Package is the supported direct Apple renderer for the pinned A2UI
profile. SwiftUI owns view lifecycle and native controls; the fixed local JavaScriptCore bundle uses
the same `@mcp-native/renderer-core` session as React Native. JSON is the only semantic boundary.
Native objects and functions never cross into JavaScriptCore.

## Compatibility

| Boundary     | Supported floor | Continuous evidence                                     |
| ------------ | --------------- | ------------------------------------------------------- |
| Swift        | 6 language mode | Swift Package build and tests                           |
| Xcode        | 16.0 or newer   | exact Xcode 16.4 CI lane; Xcode 27.1 local verification |
| iOS / iPadOS | 18.0            | generic iOS Simulator build                             |
| macOS        | 15.0            | native Swift Package tests                              |
| tvOS         | 18.0            | generic tvOS Simulator build                            |
| visionOS     | 2.0             | generic visionOS Simulator build                        |

watchOS is excluded because JavaScriptCore is not an available application framework there. UIKit,
AppKit, and SwiftUI views can be wrapped behind the same local `AnyView` catalog seam; their own OS
requirements remain the application's responsibility.

The package implements all 18 pinned basic-catalog component names. Text and standard controls use
SwiftUI's Dynamic Type, localization environment, bidirectional layout, focus behavior, and native
accessibility defaults. The root reacts to Reduce Motion by suppressing renderer animations. Tabs,
modal presentation, bindings, validation state, and app-owned URL navigation are retained by stable
surface/revision identity.

## Security and host ownership

- Only `Resources/runtime.js`, generated from `Runtime/bridge.ts`, is evaluated. Server input is
  always passed as a JSON string argument and is never interpolated into source.
- Requests and responses have byte, depth, value, string, operation, component, resource, and
  action budgets. A malformed bridge response closes the session.
- Action authorization and delivery are separate asynchronous phases. Updates, deletion, or close
  invalidate pending work before delivery.
- Navigation is restricted to HTTPS, denied by default, and handed to the application only after
  its `authorizeOpenURL` callback approves the exact canonical URL. The server cannot select a
  route, controller, class, selector, module, command, Swift type, or arbitrary property.
- Images and media are inert unless the application installs a local renderer for them and grants
  the exact canonical URL. The local renderer receives the complete transfer/redirect/decoded-image
  policy and is responsible for enforcing it.
- Host extensions require an exact locally supplied manifest and negotiation match. The local view
  registration must match the plan's manifest fingerprint. Props and events are schema-validated,
  capability grants are closed subsets, and the server never supplies a view implementation.

Regenerate the checked-in runtime with `npm run apple:runtime:build`; test it with
`npm run apple:test`. Runtime bundle changes must be reviewed together with their TypeScript source.
