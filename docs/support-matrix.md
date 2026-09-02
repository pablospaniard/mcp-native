# `0.9.x` support policy

MCP Native supports React Native `>=0.86.0 <1`. Pull requests build a generated host at 0.86.0 so
the minimum stays real. Newer React Native 0.x versions are included in the supported range; the
table shows the automated baseline, not a closed list of usable versions.

| Surface          | Supported range or profile                                                          | Automated baseline                                             |
| ---------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Node.js          | repository and package tooling `>=22.12`                                            | Ubuntu and macOS workflows                                     |
| TypeScript       | emitted declarations built with `7.0.2`                                             | monorepo build plus generated-host typecheck                   |
| React            | peer `>=18.3.1 <20`; version supplied by the host's React Native release            | clean generated consumer                                       |
| React Native     | peer `>=0.86.0 <1`                                                                  | `0.86.0`, the declared minimum, with the default Hermes engine |
| Architecture     | React Native New Architecture                                                       | generated Codegen/Fabric host on iOS and Android               |
| MCP Apps WebView | host-supplied compatible `react-native-webview`; `14.0.1` in the reference fixture  | safe-prop adapter, bridge, bundle, and native builds           |
| Android          | min SDK 24; compile/target SDK supplied by the React Native template                | x86_64 debug APK, Java 17, Android 37/build tools 37           |
| iOS              | minimum and SDK inherited from the React Native template                            | unsigned simulator app on `macos-latest`                       |
| MCP SDK          | `@modelcontextprotocol/client ^2.0.0`                                               | package integration and conformance tests                      |
| A2UI             | exact Candidate revision `7541f953050cd58b80f0bf5d85fe2d63192af305`                 | vendored schema checksums and declared profile tests           |
| MCP Apps         | stable `2026-01-26`, official schema package `@modelcontextprotocol/ext-apps@1.7.5` | interoperability and hostile-message tests                     |

The runnable [Expo Go todo app](../examples/expo-go-todolist/README.md) adds application-level
evidence for the primitives catalog without turning one pinned app version into a package
compatibility ceiling. Direct SwiftUI and Compose renderers begin after `1.0.0` and will receive
their own support policies.
