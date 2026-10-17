# v1 host requirements and verified integrations

React `>=18.1.0` is the only peer dependency of the native renderer, high-level host, and convenience
package. Native components, platform integrations, and application frameworks are supplied by the
host. MCP Native does not depend on Expo or import React Native, so their versions are not package
compatibility boundaries.

| Surface          | Package requirement or profile                                                      | Automated evidence                                         |
| ---------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Node.js          | repository and package tooling `>=22.12`                                            | exact `22.12.0` floor in primary CI; macOS native CI       |
| TypeScript       | emitted declarations built with `7.0.2`                                             | monorepo build plus generated-host typecheck               |
| React            | peer `>=18.1.0`; supplied by the host                                               | exact `18.1.0` peer-floor and `19.2.8` workspace consumers |
| Native host      | host-supplied components and platform integration; no framework peer                | pinned generated host on iOS and Android                   |
| Architecture     | selected and owned by the host                                                      | generated Codegen/Fabric integration fixture               |
| MCP Apps WebView | host-supplied compatible `react-native-webview`                                     | safe-prop adapter, bridge, bundle, and native builds       |
| Android          | platform requirements inherited from the host                                       | generated x86_64 debug application                         |
| iOS              | platform requirements inherited from the host                                       | generated unsigned simulator application                   |
| MCP SDK          | `@modelcontextprotocol/client ^2.0.0`                                               | package integration and conformance tests                  |
| A2UI             | feature-scoped v1.0 Candidate at `8ff4651232ab0e02b0123730b502711170637a3a`         | vendored schema checksums and declared profile tests       |
| MCP Apps         | stable `2026-01-26`, official schema package `@modelcontextprotocol/ext-apps@1.7.5` | interoperability and hostile-message tests                 |

The A2UI row covers only the [implemented profile](a2ui-v1-conformance.md), including its
exclusions. As of 2026-09-07, [upstream A2UI versions](https://a2ui.org/#specification-versions) identify
v1.0 as Candidate and v0.9.1 as the current production release.
Later upstream revisions require an explicit reviewed pin update.

The runnable example applications add end-to-end evidence for the primitives catalog and mixed
surfaces. Their pinned application dependencies keep each fixture reproducible; they do not create
package dependencies or framework version guarantees. Direct SwiftUI and Compose renderers begin
after `1.0.0` and will receive their own integration requirements.

`tests/support-matrix.test.mjs` makes the Node and TypeScript toolchain, React and MCP SDK peers,
official schema package pin, and absence of Expo or React Native package dependencies part of the
normal CI gate. `npm run package:smoke` separately verifies the packed artifacts and upgrade path.

## Contract integration in 1.1

The `1.1.0` `/contracts`, `/contracts/react-native`, and `/contracts/authoring` subpaths retain
the requirements above and do not add Expo, React Native, or WebView dependencies. The authoring
helpers require Web Crypto SHA-256 and `TextEncoder` in the build/test environment; generated schema
bundles and digests can be imported by the mobile runtime without those helpers.

Contract tests cover exact negotiation, closed schemas, native registration, event policy, timeout
single-flight retention across remounts, Strict Mode, and discarded Suspense render attempts.
Package smoke installs a separate synthetic reviewed-adapter tarball and verifies the new typed
consumer alongside published v1 consumers. The todo example uses fresh per-render budgets; its
checks and both mobile bundles pass. These checks demonstrate the declared inline interface, not
conformance of an additional real upstream standard. See the [review record](milestone-11-acceptance.md)
and [renderer migration](custom-contracts.md#unreleased-renderer-migration-after-review).
