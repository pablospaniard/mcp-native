# MCPNativeSwiftUI

`MCPNativeSwiftUI` is the first-class Apple renderer for MCP Native's pinned A2UI profile. It is a
Swift Package containing SwiftUI views and a fixed, app-bundled JavaScriptCore semantic runtime. It
never downloads or evaluates server JavaScript and never resolves a server-selected native type.

## Pre-release installation for evaluation

No tagged release contains the repository-root manifest yet. For evaluation only, add the
repository URL on the moving `main` branch in Xcode or declare it in `Package.swift`:

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

For reproducible evaluation, pin an exact commit instead of `main`. Released applications should
use a version requirement after the first release containing the root manifest is tagged. The
repository-root manifest is the supported remote entry point; the manifest in this directory
provides the same product for focused local development. Do not add both forms to one dependency
graph: they intentionally expose the same `MCPNativeSwiftUI` product and module.

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
