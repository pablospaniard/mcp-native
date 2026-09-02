# MCP Native documentation

You do not need to read every document in this folder to use MCP Native. Pick the path that matches
what you are trying to do.

## I want to see it first

Start with one of the Expo Go examples:

- The [todo app](../examples/expo-go-todolist/README.md) is a focused native A2UI workflow with
  three screenshots, local setup instructions, and complete code examples.
- [City Canvas](../examples/expo-go-mixed-surfaces/README.md) is a polished two-screen app showing
  a native A2UI region and isolated MCP Apps WebView working as host-owned siblings.

Then read [What MCP Native does](product-guide.md) for the product model: what the server describes,
what the mobile app owns, and where native A2UI and HTML MCP Apps fit.

## I am integrating a React Native host

1. Use the [host integration checklist](host-integration-checklist.md) to plan the application-owned
   pieces: transport, component catalog, policies, lifecycle, permissions, and error states.
2. Check the [support policy](support-matrix.md) for React Native, React, Node.js, Android, and iOS
   requirements.
3. Follow the package guide for the layer you are using:
   [core](../packages/core/README.md), [MCP SDK adapter](../packages/mcp/README.md),
   [A2UI](../packages/a2ui/README.md), [React Native](../packages/react-native/README.md), or
   [WebView](../packages/webview/README.md).
4. If one screen combines native and HTML regions, continue with
   [mixed surfaces](mixed-surfaces.md).

## I need the exact compatibility contract

- [Capabilities](capabilities.md) lists the native catalog, bindings, media, extensions, and renderer
  boundaries in practical terms.
- [Protocol support](protocol-support.md) records the MCP revisions and operations exercised by the
  SDK adapter.
- [A2UI conformance](a2ui-v1-conformance.md) records the pinned Candidate schemas and supported
  lifecycle, catalog, functions, and renderer messages.
- [MCP Apps compatibility](mcp-apps-compatibility.md) records the stable native host-adapter profile
  and its WebView mapping.
- [Standards and compatibility](standards-compatibility.md) is the combined evidence index.

These pages are deliberately precise. They are reference material for implementation and review,
not required reading for trying the library.

## I am preparing for production or 1.0

- [Security policy](../SECURITY.md) explains the trust boundary and vulnerability-reporting process.
- [Architecture](RFC-0001-architecture.md) records the package boundaries and decisions that changes
  must preserve.
- [Compatibility policy](compatibility-policy.md) defines the API and behavior promised for 1.x.
- [Migration to 1.0](migration-to-1.0.md) covers the custom A2UI 0.1 legacy imports.
- [1.0 readiness](1.0-readiness.md) separates automated evidence from the remaining independent
  reviews and release actions.
- [Roadmap](roadmap.md) keeps the completed milestone history and the post-1.0 direction.

## Current status

The 0.9 line contains the React Native feature set planned for 1.0 and is ready for integration and
evaluation. React Native 0.86 is the supported minimum; newer 0.x releases remain inside the declared
peer range. The final 1.0 work is review, validation, the documented legacy-root migration, and the
long-term compatibility promise—not another foundational implementation milestone.
