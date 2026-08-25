# Standards and compatibility

This document separates MCP Native's architectural goals from protocol-conformance claims. Security-oriented design choices can align with a specification without making an implementation wire-compatible with that specification.

## Status snapshot

- Assessed: 2026-08-25
- A2UI baseline: [A2UI Protocol v1.0 Candidate at `7541f953`](https://github.com/a2ui-project/a2ui/blob/7541f953050cd58b80f0bf5d85fe2d63192af305/specification/v1_0/docs/a2ui_protocol.md)
- MCP Apps baseline: [official MCP Apps overview](https://modelcontextprotocol.io/extensions/apps/overview) and [full MCP Apps documentation](https://apps.extensions.modelcontextprotocol.io/)

MCP Native does **not** currently claim A2UI v1.0 conformance or complete MCP Apps host compatibility.

## Compatibility matrix

| Area                | Community contract                                                                                                   | Current implementation                                                                 | Status                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------- |
| Component ownership | A2UI catalogs constrain available components and functions                                                           | The host injects a fixed, locally bundled native catalog                               | Architecturally aligned     |
| Remote code         | Catalog functions are named, registered capabilities rather than downloaded code                                     | Server-provided React Native code and arbitrary component resolution are prohibited    | Architecturally aligned     |
| Validation          | A2UI v1.0 messages and catalogs validate against its JSON Schemas                                                    | MCP Native strictly validates its own `0.1` surface model                              | Safe subset, not conformant |
| Wire envelopes      | `version: "v1.0"` messages use `createSurface`, `updateComponents`, `updateDataModel`, and `deleteSurface` envelopes | One `{ version: "0.1", root }` object                                                  | Not implemented             |
| Component graph     | A2UI uses catalog-defined components and ID references rooted at component ID `root`                                 | Four custom nested node types                                                          | Not implemented             |
| Data model          | Dynamic values use JSON Pointer bindings and renderer-local state                                                    | Optional string bindings are only reported to a host callback                          | Partial concept only        |
| Actions             | Renderer-to-agent action envelopes include surface, source component, timestamp, and resolved context                | Buttons dispatch a custom MCP tool action directly                                     | Not implemented             |
| Streaming lifecycle | Ordered, framed messages progressively create, update, and delete surfaces                                           | A complete resource is read and rendered as one surface                                | Not implemented             |
| Capabilities        | Supported catalogs and inline-catalog support are negotiated through transport metadata or initialization            | The catalog is fixed locally with no protocol negotiation                              | Not implemented             |
| Accessibility       | Explicit accessibility data overrides inferred defaults                                                              | Initial button and input labels are inferred; explicit A2UI attributes are unsupported | Partially aligned           |
| MCP Apps discovery  | Tool `_meta.ui.resourceUri` points to a `ui://` resource                                                             | Tool metadata is not preserved by the current core adapter                             | Not implemented             |
| MCP Apps policy     | Resource metadata carries CSP and requested permissions                                                              | HTML documents have a minimal deny-by-default remote-document policy                   | Partial primitive only      |
| MCP Apps runtime    | A sandboxed host uses the Apps JSON-RPC bridge, including `ui/initialize` and `ui/*` messages                        | No WebView mount, sandbox, AppBridge, or postMessage bridge exists                     | Not implemented             |

## What the current packages mean

### `@mcp-native/a2ui`

The package name expresses the intended protocol integration. Its current `0.1` format is an internal proof-of-concept input model, not an alternative A2UI version and not a compatible implementation of A2UI v1.0.

The `application/a2ui+json` resource convention used by the prototype came from earlier A2UI-over-MCP work. A2UI v1.0 is transport-agnostic and defines a stream of protocol envelopes. Recognizing a media type does not establish v1.0 conformance.

### `@mcp-native/react-native`

The trusted render plan and host-owned renderer are internal layers. They can remain behind a conforming A2UI adapter because the wire protocol does not require a particular platform renderer. The internal model will need enough information to preserve surface IDs, component IDs, resolved accessibility attributes, state bindings, and action context.

### `@mcp-native/webview`

This package currently contains HTML classification and policy primitives. It is not an MCP Apps host. Complete compatibility requires Apps discovery metadata, `ui://` resource loading, CSP and permission enforcement, sandboxed WebView configuration, AppBridge or an equivalent protocol implementation, and schema-validated bidirectional messages.

## Conformance roadmap

### A2UI v1.0 foundation

1. Pin an exact A2UI v1.0 Candidate revision and vendor or verify its official JSON Schema bundle.
2. Parse the official `v1.0` agent-to-renderer and renderer-to-agent envelopes instead of extending the custom `0.1` wire format.
3. Implement an ordered surface store for create, component update, data-model update, and delete messages.
4. Validate catalog IDs, component graphs, dynamic values, JSON Pointers, accessibility attributes, functions, actions, and capabilities.
5. Adapt validated protocol state to the renderer's internal trusted plan.
6. Add official examples, schema fixtures, malformed-message cases, lifecycle tests, and interoperability tests.

### MCP Apps compatibility

1. Preserve and validate tool and resource `_meta.ui` fields in the MCP contracts and SDK adapter.
2. Resolve declared `ui://` resources and enforce their CSP, origin, navigation, and permission policies.
3. Prefer the official AppBridge implementation where it supports the React Native host boundary; otherwise implement the documented JSON-RPC protocol with equivalent validation.
4. Isolate the WebView, expose only explicit host capabilities, and validate every bridge message in both directions.
5. Add interoperability tests against official examples and record differences between browser iframe guarantees and platform WebView guarantees.

The native A2UI renderer and the HTML MCP Apps host are separate compatibility paths. Neither should silently fall back to the other when validation fails.

## Version and claim policy

- Reference a released specification or an exact commit; do not silently track a moving `main` branch in conformance tests.
- Treat a Candidate specification update as a reviewed protocol change.
- Do not label a package or release "A2UI v1.0 compatible" until its required envelopes, schemas, lifecycle, actions, and capability behavior pass documented conformance tests.
- Do not label `@mcp-native/webview` an "MCP Apps host" until discovery, sandboxing, policy metadata, and the Apps bridge are implemented and tested.
- Document partial support by feature and version rather than using an unqualified compatibility claim.
