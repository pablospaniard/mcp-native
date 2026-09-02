# Expo Go native integration proof

Status: implemented in [`examples/expo-go-todolist`](../examples/expo-go-todolist/README.md).

## What it demonstrates

The maintained Expo Go app turns a validated A2UI v1 lifecycle into a complete native todo
workflow using `@mcp-native/a2ui` and `@mcp-native/react-native`. It is intentionally built from
React Native primitives already available in Expo Go, so anyone can clone the repository, scan a QR
code, and try the package boundary without creating a custom development client.

The app covers:

- a host-owned component catalog with closed variants;
- static content and a bounded dynamic todo list;
- add, edit, complete/reactivate, filter, delete, clear-completed, and reset workflows;
- official schema-validated action envelopes returned to the host;
- renderer-local text, checkbox, and choice bindings reconciled through validated host state;
- field validation, disabled actions, empty states, and live task counts;
- strict persisted-state parsing through Expo SQLite;
- VoiceOver/TalkBack labels, roles, checked/disabled state, font scaling, and native touch targets;
  and
- an orientation-aware scrolling layout, with the same Expo project configured for portrait and
  landscape on iOS and Android.

The example pins Expo SDK 57 and React Native 0.86.3. Those pins make the proof reproducible; they do
not narrow the package support policy of React Native `>=0.86.0 <1`.

## Run it

```bash
npm ci
npm run build
cd examples/expo-go-todolist
npm ci
npm start
```

Scan the QR code with Expo Go or use the terminal shortcuts for an emulator or simulator. See the
[example walkthrough](../examples/expo-go-todolist/README.md) for screenshots, package-specific
code, expected behavior, and troubleshooting.

## Trust boundary

The example follows the same boundary expected from a production host:

- MCP/server input is data and is validated before rendering;
- the host explicitly allowlists component, action, and pure-function names;
- the server cannot select an imported component, arbitrary native prop, module, or executable
  code;
- renderer-local changes are checked against known todo IDs and application size limits;
- action envelopes are validated before the host callback receives them; and
- the host owns persistence and would also own MCP transport, authorization, consent, and device
  permissions.

The app does not advertise image, media, WebView, or custom native-module capabilities because they
are not needed for this proof. Hosts can add those through the documented policy-gated catalog and
MCP Apps APIs.

## Repeatable checks

From the example directory:

```bash
npm run check
npm run bundle:ios
npm run bundle:android
```

The focused tests cover lifecycle/schema validation, trusted render-plan expansion, every todo
operation, persistence parsing, forged renderer input, and list/title bounds. Repository CI also
builds the React Native 0.86.0 minimum host; the Expo app is complementary, runnable evidence rather
than a version-certification matrix.

When the screen or catalog changes, keep exactly three current screenshots in
`examples/expo-go-todolist/docs/screenshots`: the all-tasks surface, completed filter, and empty
state. Check both normal and large system text locally before updating them.
