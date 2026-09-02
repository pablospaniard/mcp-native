# `0.9.0` support matrix

This matrix distinguishes package peer support from the exact generated-host lanes used as release
evidence. A range is supported only while its minimum and current-latest boundary both pass CI. If
the minimum becomes incompatible, it is raised explicitly instead of retaining a false claim.

| Surface           | Declared or tested range                                                                          | Release-candidate evidence                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Node.js           | repository and package tooling `>=22.12`; native host CI `22.14.0`                                | Ubuntu and macOS workflows                                                                |
| TypeScript        | emitted declarations built with `7.0.2`; generated RN host template currently resolves `6.0.3`    | monorepo build plus generated-host typecheck                                              |
| React             | peer `>=18.3.1 <20`; version paired by each pinned RN template                                    | clean generated consumer                                                                  |
| React Native      | peer `>=0.87.0 <1`; exact boundaries `0.87.0` and `0.87.1`                                        | both boundaries typecheck, bundle, and natively build                                     |
| Architecture      | React Native New Architecture                                                                     | generated Codegen/Fabric host on iOS and Android                                          |
| JavaScript engine | Hermes and community JavaScriptCore                                                               | full RN-version × engine matrix                                                           |
| Community JSC     | `@react-native-community/javascriptcore@0.2.0` in the JSC fixture                                 | Android runtime factory; iOS ReactJSC factory with RN core/dependencies built from source |
| MCP Apps WebView  | `react-native-webview@14.0.1` in the reference fixture                                            | safe-prop adapter, bridge, bundle, and native builds                                      |
| Android           | min SDK 24; compile/target SDK supplied by pinned template, CI installs Android 37/build tools 37 | x86_64 debug APK, Java 17                                                                 |
| iOS               | minimum and SDK inherited from the pinned RN template                                             | unsigned simulator app on `macos-latest`; exact Xcode/SDK retained in each CI run         |
| MCP SDK           | `@modelcontextprotocol/client ^2.0.0`, verified with `2.0.0`                                      | package and conformance tests                                                             |
| A2UI              | exact Candidate revision `7541f953050cd58b80f0bf5d85fe2d63192af305`                               | vendored schema checksums and declared profile tests                                      |
| MCP Apps          | stable `2026-01-26`, official schema package `@modelcontextprotocol/ext-apps@1.7.5`               | interoperability and hostile-message tests                                                |

Expo Go library demonstrations remain informative and outside the release gate. Devices, OEM
WebViews, accessibility services, and design-system implementations still require application-level
testing. Direct SwiftUI and Compose renderers are post-`1.0.0` deliverables and are not part of this
matrix.

The minimum was raised from React Native `0.86.0` because its runtime-factory API is incompatible
with the pinned community JSC integration. On iOS, the JSC lanes intentionally disable React
Native's prebuilt core and dependency artifacts: those artifacts are Hermes-oriented and do not
provide a link-compatible JSC build. Hermes lanes continue to use the standard prebuilt path.
