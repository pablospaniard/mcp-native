# Jetpack Compose renderer compatibility and integration

`packages/compose` is the supported direct Android renderer for the pinned A2UI v1 profile. It uses
the platform-neutral `@mcp-native/renderer-core` session in a fixed local JavaScript bundle and maps
only its closed trusted render plan to Kotlin-owned UI.

## Supported boundary

| Boundary             | Supported and tested value                                                              |
| -------------------- | --------------------------------------------------------------------------------------- |
| Android runtime      | API 33 minimum; API 36 Google APIs x86_64 CI image; Android 37.1 locally verified       |
| Compile / target SDK | compile SDK 36; host chooses target SDK                                                 |
| Build tools          | Android build tools 36.0.0, AGP 8.13.2, Gradle 8.14.3, JDK 17                           |
| Kotlin / Compose     | Kotlin and Compose compiler 2.2.20; Compose BOM 2025.10.00                              |
| JavaScript engine    | AndroidX JavaScriptEngine 1.1.0 with all five required provider features                |
| Catalog              | all 16 trusted render-plan components representing the pinned 18-component wire catalog |

Initialization fails closed unless the provider supports message ports, Promise results, isolate
termination, isolate heap limits, and evaluation without Binder's transaction-size return limit. Each
session uses one 64 MiB isolate, a 1 MiB UTF-8 request/response boundary, one request in flight, and a
10-second call deadline. A timeout, malformed bridge response, engine termination, or sequence/token
mismatch closes the session. The bundle is built locally from the same renderer-core bridge source as
SwiftUI; server content is exchanged as data over a message port and is never evaluated as code.

## Native behavior

Compose owns state restoration, focus, font scaling, locale and layout direction. Surface identity is
keyed by surface incarnation rather than every render revision, so data entry does not recreate the
tree. Modal presentation installs Android back handling. The renderer declares no automatic motion,
so reduced-motion users do not receive renderer-created animation. Material controls expose native
semantics; explicit server accessibility labels are bounded and applied after renderer validation.

The renderer covers View/Row/Column/List/Card, text, button and HTTPS navigation, text and date/time
input, checkbox, single/multiple choice, slider, tabs, modal, divider, icon, image, video, audio, and
host extensions. Native date/time input deliberately uses a locale-aware editable field rather than a
platform dialog so the exact A2UI date/time lexical form is retained.

## Host-owned boundaries

- URL navigation requires HTTPS and a fresh asynchronous host authorization on every activation.
- Action delivery always follows a separate host authorization. Cancellation clears pending presses.
- Image and media code is supplied by the app and receives the validated resource grant. The app must
  enforce origins, redirects, MIME types, byte/decode bounds, autoplay, routes, and cleanup.
- Extensions are locally registered Compose content or an explicit `androidViewExtension`; both
  require the exact catalog/component key and negotiated manifest fingerprint. Extension events are
  schema-validated by the shared runtime before reaching the host.
- Lifecycle start requests a current render and lifecycle destruction closes the isolate. The host
  should also close sessions it removes while its lifecycle remains alive.

No API accepts a class name, composable reference from wire data, intent, command, module, or arbitrary
prop spread. Unknown components, events, functions, extension payloads, non-JSON values, excessive
graphs, and stale control tickets reject without dispatch.

## Evidence and exclusions

`npm run android:runtime:build` regenerates the checked-in asset. The Compose workflow checks bundle
drift, builds and lints the library, runs bounded JSON JVM tests, then runs engine, hostile-input,
lifecycle, action, Compose interaction, and accessibility-semantic tests on an API 36 emulator.

The support claim does not cover physical-device performance, OEM WebView providers, app-provided
resource decoders/players, background playback, external routes, or extension implementations. Hosts
must test those choices on their own device and accessibility matrix.
