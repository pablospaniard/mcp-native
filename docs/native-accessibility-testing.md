# Expo Go React Native integration demonstrations

Status: policy defined; implementation track open. No Expo Go app is currently committed.

## Scope

Add small Expo Go apps to demonstrate how `@mcp-native/react-native` maps the same validated A2UI
surface into commonly used React Native component libraries. Maintain one app for the React Native
primitives baseline and one separate app for each selected Expo Go-compatible library. Do not combine
libraries in one app: independent dependency trees make installation and compatibility failures
clear.

The maintained library set should reflect current community use, active maintenance, and Expo Go
compatibility. Each demonstration names its exact Expo SDK, React Native, library, MCP Native, iOS, and
Android versions. A library that requires native code absent from Expo Go is outside this matrix
until it provides an Expo Go-compatible path.

Each result provides compatibility evidence for its exact library and version set. Automated unit,
integration, conformance, performance, and package-smoke tests remain the repository release gates.

## Shared surface

Every app should exercise the same representative fixture, including:

- primitive, typed-adapter, and closed-variant catalog paths;
- static and dynamic-list content;
- enabled and disabled actions with observable single dispatch;
- valid, invalid, multiline, numeric, and obscured text fields;
- image allow/deny and failure-placeholder behavior, pinned icons, decorative dividers, checkboxes,
  single and multiple choices, sliders, date/time input, tabs, and modal dismissal;
- renderer-local edits that do not emit network actions;
- visible and hidden text, labels, descriptions, live regions, and validation messages; and
- portrait and landscape layouts at normal and large system text sizes.

The server remains unable to choose native roles, accessibility state, font-scaling policy,
component implementations, arbitrary props, or imported modules. Each adapter explicitly maps the
trusted semantic props into its local component library. Image demonstrations must not advertise
`Image` unless their loader enforces the supplied resource grant. A mapping that drops required behavior is
reported as a limitation of that demonstration and fixed in the local adapter or component.

## App structure

Keep each demonstration deliberately small:

1. create a standard Expo app that opens in Expo Go;
2. install one selected component library and the local or published MCP Native packages;
3. hand-author only the catalog adapters, fixture screen, and a compact result view;
4. run the shared interaction and accessibility scenarios on iOS and Android; and
5. record the exact versions, known limitations, and reproduction steps in that app's README.

Extend the existing app when coverage for a library grows. Use one demonstration per library, and
keep package-level regression tests as the automated source of repeatable behavior coverage.
