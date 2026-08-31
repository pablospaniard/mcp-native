# Expo Go React Native integration PoCs

Status: maintained independently from package releases and milestone gates.

## Scope

Use small Expo Go apps to demonstrate how `@mcp-native/react-native` maps the same validated A2UI
surface into commonly used React Native component libraries. Maintain one app for the React Native
primitives baseline and one separate app for each selected Expo Go-compatible library. Do not combine
libraries in one app: independent dependency trees make installation and compatibility failures
clear.

The maintained library set should reflect current community use, active maintenance, and Expo Go
compatibility. Each PoC must name its exact Expo SDK, React Native, library, MCP Native, iOS, and
Android versions. A library that requires native code absent from Expo Go is outside this matrix
until it provides an Expo Go-compatible path.

PoC results are informative compatibility demonstrations. They do not block releases, milestone
completion, or protocol claims, and a result for one library must not be generalized to another.
Automated unit, integration, conformance, performance, and package-smoke tests remain the repository
gates.

## Shared surface

Every app should exercise the same representative fixture, including:

- primitive, typed-adapter, and closed-variant catalog paths;
- static and dynamic-list content;
- enabled and disabled actions with observable single dispatch;
- valid, invalid, multiline, numeric, and obscured text fields;
- renderer-local edits that do not emit network actions;
- visible and hidden text, labels, descriptions, live regions, and validation messages; and
- portrait and landscape layouts at normal and large system text sizes.

The server remains unable to choose native roles, accessibility state, font-scaling policy,
component implementations, arbitrary props, or imported modules. Each adapter explicitly maps the
trusted primitive props into its local component library. A mapping that drops required behavior is
reported as a limitation of that PoC, not worked around by expanding the wire catalog.

## App structure

Keep each PoC deliberately small:

1. create a standard Expo app that opens in Expo Go;
2. install one selected component library and the local or published MCP Native packages;
3. hand-author only the catalog adapters, fixture screen, and a compact result view;
4. run the shared interaction and accessibility scenarios on iOS and Android; and
5. record the exact versions, known limitations, and reproduction steps in that PoC's README.

Extend the existing app when coverage for a library grows. Do not add multiple PoCs for the same
library or treat screenshots and manual observations as substitutes for package-level regression
tests.
