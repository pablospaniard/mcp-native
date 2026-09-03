# `0.9.x` host requirements and verified integrations

React `>=18.1.0` is the only peer dependency of the native renderer, high-level host, and convenience
package. Native components, platform integrations, and application frameworks are supplied by the
host. MCP Native does not depend on Expo or import React Native, so their versions are not package
compatibility boundaries.

| Surface          | Package requirement or profile                                                      | Automated evidence                                   |
| ---------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Node.js          | repository and package tooling `>=22.12`                                            | exact `22.12.0` floor in primary CI; macOS native CI |
| TypeScript       | emitted declarations built with `7.0.2`                                             | monorepo build plus generated-host typecheck         |
| React            | peer `>=18.1.0`; supplied by the host                                               | exact peer-floor and current-workspace consumers     |
| Native host      | host-supplied components and platform integration; no framework peer                | pinned generated host on iOS and Android             |
| Architecture     | selected and owned by the host                                                      | generated Codegen/Fabric integration fixture         |
| MCP Apps WebView | host-supplied compatible `react-native-webview`                                     | safe-prop adapter, bridge, bundle, and native builds |
| Android          | platform requirements inherited from the host                                       | generated x86_64 debug application                   |
| iOS              | platform requirements inherited from the host                                       | generated unsigned simulator application             |
| MCP SDK          | `@modelcontextprotocol/client ^2.0.0`                                               | package integration and conformance tests            |
| A2UI             | exact Candidate revision `7541f953050cd58b80f0bf5d85fe2d63192af305`                 | vendored schema checksums and declared profile tests |
| MCP Apps         | stable `2026-01-26`, official schema package `@modelcontextprotocol/ext-apps@1.7.5` | interoperability and hostile-message tests           |

The runnable example applications add end-to-end evidence for the primitives catalog and mixed
surfaces. Their pinned application dependencies keep each fixture reproducible; they do not create
package dependencies or framework version guarantees. Direct SwiftUI and Compose renderers begin
after `1.0.0` and will receive their own integration requirements.

`tests/support-matrix.test.mjs` makes the Node and TypeScript toolchain, React and MCP SDK peers,
official schema package pin, and absence of Expo or React Native package dependencies part of the
normal CI gate. `npm run package:smoke` separately verifies the packed artifacts and upgrade path.
