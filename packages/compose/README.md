# MCPNativeCompose

`MCPNativeCompose` is the direct Android renderer for MCP Native's pinned A2UI profile. It embeds the
same generated renderer-core session used by the SwiftUI package and maps its trusted render plan to
Jetpack Compose. Server input cannot select Kotlin classes, composable functions, activities,
fragments, intents, modules, or commands.

During development, the package is source-consumable from `packages/compose` as an included Gradle
build. Tagged releases are published to Maven Central:

```kotlin
dependencies {
  implementation("io.github.pablospaniard:mcp-native-compose:<version>")
}
```

Use the same coordinated version as the repository's npm packages and GitHub release.

```kotlin
val session = RendererSession.create(
  context = applicationContext,
  policy = RendererPolicy(
    allowedComponentNames = listOf("Column", "Text", "Button"),
    allowedEventNames = listOf("submit"),
    locale = "en-US",
  ),
  authorize = { proposal -> confirmWithUser(proposal) },
  deliver = { proposal -> sendToServer(proposal.envelope) },
  authorizeOpenUrl = { uri -> uri.host == "docs.example.com" },
  openUrl = { uri -> appNavigator.open(uri) },
)

setContent { MaterialTheme { Surface(session) } }
```

Application-owned images, media, Compose extensions, and Android Views are registered in
`HostCatalog`. Registration keys and manifest fingerprints must match the negotiated local manifest;
there is no reflection or arbitrary component lookup. Resource implementations receive the validated
grant and remain responsible for redirect, MIME, byte, decode-size, autoplay, routing, and lifecycle
enforcement.

See [the Android compatibility and integration contract](../../docs/compose.md) before shipping.
