# MCPNativeCompose

`MCPNativeCompose` is the direct Android renderer for MCP Native's pinned A2UI profile. It embeds the
same generated renderer-core session used by the SwiftUI package and maps its trusted render plan to
Jetpack Compose. Server input cannot select Kotlin classes, composable functions, activities,
fragments, intents, modules, or commands.

The package is source-consumable from `packages/compose` during the unreleased development cycle.
Add it as an included Gradle build or copy the `:library` project into an Android workspace. A
coordinated release will publish Maven coordinates; do not depend on a moving Git branch in a
production application.

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
