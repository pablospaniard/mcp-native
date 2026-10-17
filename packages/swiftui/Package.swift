// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "MCPNativeSwiftUI",
  platforms: [
    .iOS(.v18),
    .macOS(.v15),
    .tvOS(.v18),
    .visionOS(.v2),
  ],
  products: [
    .library(name: "MCPNativeSwiftUI", targets: ["MCPNativeSwiftUI"]),
  ],
  targets: [
    .target(
      name: "MCPNativeSwiftUI",
      resources: [.process("Resources")],
      linkerSettings: [.linkedFramework("JavaScriptCore")]
    ),
    .testTarget(
      name: "MCPNativeSwiftUITests",
      dependencies: ["MCPNativeSwiftUI"]
    ),
  ]
)
