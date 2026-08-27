# React Native integration PoC

This folder will contain the React Native integration's single small end-to-end PoC: MCP connection,
A2UI resource resolution, native rendering, and action dispatch back to MCP.

Keep the PoC to the hand-authored integration flow and the minimum documentation needed to embed it
in a consumer-owned React Native application. Do not bootstrap or commit a complete generated React
Native project, Android/iOS scaffold, independent dependency lockfile, vendored dependencies, or
build output here.

Package and integration tests must prove the runtime, validation, renderer-local state,
host-callback seams, and end-to-end action flow. A lightweight smoke check must exercise the PoC
itself. Platform-specific behavior remains subject to the supported host test matrix; when a native
build is required, CI should generate a temporary host rather than turn this directory into a
second application project.

Future React Native integration scenarios should extend this PoC instead of adding another React
Native example.
