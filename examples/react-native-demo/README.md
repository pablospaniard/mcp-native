# React Native integration PoC policy

React Native integration demonstrations are maintained as separate Expo Go apps: one primitives
baseline and one app for each selected common, Expo Go-compatible component library. Every app uses
the same end-to-end flow: MCP connection, A2UI resource resolution, native rendering, and action
dispatch back to MCP.

Keep each app focused on its library adapter and the minimum code needed to run in Expo Go. Pin the
Expo SDK, React Native, component library, and MCP Native versions in that app and document known
limitations without generalizing them to other libraries.

Package and integration tests must prove the runtime, validation, renderer-local state, and
host-callback seams. PoC observations are informative compatibility demonstrations; they do not
block releases or replace automated package coverage.

Future scenarios for an existing library should extend that library's app. Add a new app only when
covering another commonly used Expo Go-compatible library.
