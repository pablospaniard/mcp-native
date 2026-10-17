# MCPNativeSwiftUI

`MCPNativeSwiftUI` is the first-class Apple renderer for MCP Native's pinned A2UI profile. It is a
Swift Package containing SwiftUI views and a fixed, app-bundled JavaScriptCore semantic runtime. It
never downloads or evaluates server JavaScript and never resolves a server-selected native type.

Add the repository URL as a Swift Package dependency in Xcode, or declare it in `Package.swift`:

```swift
dependencies: [
  .package(url: "https://github.com/pablospaniard/mcp-native.git", branch: "main")
],
targets: [
  .target(
    name: "YourApp",
    dependencies: [
      .product(name: "MCPNativeSwiftUI", package: "mcp-native")
    ]
  )
]
```

The repository-root manifest is the supported remote entry point. The manifest in this directory
provides the same product for focused local development. Until the first release containing the
root manifest is tagged, use the `main` branch or pin an exact commit; released applications should
move to that release's version requirement once available.

```swift
import MCPNativeSwiftUI

let policy = RendererPolicy(
  allowedComponentNames: ["Column", "Text", "TextField", "Button"],
  allowedEventNames: ["submit"]
)
let session = try RendererSession(
  policy: policy,
  authorize: { proposal in await appPolicy.allows(proposal) },
  deliver: { proposal in try await transport.send(proposal) },
  authorizeOpenURL: { url in await appPolicy.allowsNavigation(to: url) },
  openURL: { url in await navigator.openApprovedURL(url) }
)

session.apply(data: toolResultData)
Surface(session: session)
```

The host must provide explicit action, navigation, image, media, and extension policies. Image and
media nodes do not fetch by default; registered host views receive the validated URL and complete
bounded `ResourceGrant`. Host extensions are keyed by exact `catalogId#componentName`, negotiated
from a local manifest, schema-validated in the shared runtime, and mapped only to locally compiled
closures whose registered manifest fingerprint matches the rendered plan.

Call `close()` when the owning view/controller context is torn down. `RendererSession` is main-actor
isolated and preserves revisioned callback tickets, at-most-once action delivery, and fail-closed
handling of stale callbacks. See [the Apple renderer guide](../../docs/swiftui.md) for compatibility,
security boundaries, and integration details.
