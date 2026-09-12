# Initial Android engine findings

Date: 2026-09-12. Integration baseline: `b03dd0e`, following the iOS comparison. Wire pin:
A2UI `v1.0` Candidate `8ff4651232ab0e02b0123730b502711170637a3a`.

## Evidence

Tested on the Android 37 emulator (`arm64-v8a`, Android 17), with
`com.google.android.webview` **151.0.7922.202**, AndroidX JavaScriptEngine **1.1.0**, JDK 17.0.9,
Gradle 8.14.3, AGP 8.13.2, compile/target SDK 36 and build-tools 36.0.0. The debug probe requires API
33+, which is a build restriction rather than evidence for all devices at that API level.

| Check                                                    | Result                                                                                         |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Exact shared JavaScript bundle                           | 335,625 bytes; SHA-256 `2f299bea87d6c7d59068b07891963fdbfc2914115c2ab90db6ef2dd53e252ff1`      |
| Shared form corpus                                       | 21/21 cases; all observations independently compared in Node                                   |
| Message ports, promises, termination, heap/return limits | Required provider feature flags present                                                        |
| `Intl`                                                   | DateTimeFormat, NumberFormat and PluralRules present; fixed outputs and corpus formatting pass |
| Raw URL / TextEncoder / structuredClone                  | Absent; the existing bundled URL polyfill satisfies the selected runtime path                  |
| Native boundary checks                                   | All ten pass, including Unicode, invalid input, nesting, stale state and pending close         |
| Already-running JavaScript                               | Isolate close rejects the active evaluation after its start signal                             |
| Fresh session after termination                          | Passes in the same sandbox                                                                     |
| Compose, independent Kotlin semantics, accessibility     | Not exercised                                                                                  |
| Physical-device timing and memory                        | Deferred and unscored                                                                          |

`npm run experiment:android -- emulator-5554` regenerates the ignored report. Expected observations
are not placed in APK assets or passed to the engine. The comparator checks the invocation UUID and
bundle hash as well as exact cases and observations. The native host records authorized/denied
deliveries. Malformed observation/action contracts close the host, and lexical rejection probes
cover invalid escapes, raw controls and uppercase JSON literals. This probe has no network dispatch
or interactive screen.

## Assessment

Shared JavaScript now has behavioral evidence in both Apple's engine and one Android provider.
The exact bundle works without a second validator or another public package. The small Android host
adds transport, native policy and lifecycle handling; it does not duplicate form semantics.

Android has a useful lifecycle result beyond the iOS admission-cancellation proof: an already-running
loop can be stopped by closing its isolate. This is not a cross-platform cancellation guarantee or
a measurement of how quickly memory is reclaimed. The APIs and successful local probe support
continuing the shared-runtime approach, while the iOS lifecycle gap still needs an explicit design.

The main Android-specific dependency is the **installed WebView provider**, including support for
message ports introduced in AndroidX 1.1.0. This environment is feasible; older providers, provider
updates and unsupported devices need an explicit support/fallback policy. A bare minimum Android API
level is insufficient. No silent WebView-rendering or alternate-engine fallback is implemented.

Next, review a single session contract for server revisions, retained edits, input events, host action
authorization, one-request admission, cancellation, teardown and bounded output. Use that contract
to design a scoped native preview and resolve the remaining iOS lifecycle and Android provider-policy
questions. Leave the final runtime decision, public renderer-core packaging, broad catalog parity,
Compose work and device-performance acceptance open. The experiment's cleanup deadline remains
before promotion to `main`; durable findings survive under `docs/`.
