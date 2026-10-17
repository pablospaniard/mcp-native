// swift-tools-version: 6.0
import PackageDescription

// This root manifest is the remote SwiftPM entry point. Keep its product, platform, and target
// settings aligned with packages/swiftui/Package.swift, which supports focused local development.
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
      path: "packages/swiftui/Sources/MCPNativeSwiftUI",
      resources: [.process("Resources")],
      linkerSettings: [.linkedFramework("JavaScriptCore")]
    ),
    .testTarget(
      name: "MCPNativeSwiftUITests",
      dependencies: ["MCPNativeSwiftUI"],
      path: "packages/swiftui/Tests/MCPNativeSwiftUITests"
    ),
  ]
)
