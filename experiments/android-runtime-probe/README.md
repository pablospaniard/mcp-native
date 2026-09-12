# Android runtime feasibility probe

Temporary evidence for RFC-0002 and milestone 12. This runs the **same JavaScript bundle and 20-case
corpus as the iOS experiment** through AndroidX JavaScriptEngine 1.1.0. A small Java host checks JSON,
session admission and action authorization. There is no Compose renderer, independent Kotlin
interpreter, application UI, MCP transport, or public Android SDK in this directory.

The exact wire baseline stays A2UI `v1.0` Candidate
`8ff4651232ab0e02b0123730b502711170637a3a`. No production package, export, version or schema changes.

## Run

Requires Node 22.12+, JDK 17, Android SDK platform 36 and build-tools 36.0.0, and a connected emulator
with a compatible WebView provider. Set `JAVA_HOME` and `ANDROID_HOME` for your installation, and put
`adb` on `PATH`. The wrapper pins Gradle 8.14.3 with its official SHA-256; Android Gradle Plugin 8.13.2,
JavaScriptEngine 1.1.0 and resolved debug dependencies are pinned. The Java host uses API 33+ APIs;
only the environment in [RESULTS.md](RESULTS.md) has been exercised.

```sh
npm ci
npm run experiment:android -- emulator-5554
# Native static analysis:
cd experiments/android-runtime-probe
./gradlew lintDebug --no-daemon
```

The command builds the shared bundle, strips expected observations from the input fixtures, builds
and installs a debug instrumentation APK, runs the probe and independently compares every recorded
observation with the original corpus in Node. It selects a device automatically only when exactly
one is connected. The command accepts emulator serials; physical-device performance is deferred.
Each invocation verifies a fresh report UUID and the bundle SHA-256, so a stale report or another
bundle cannot pass. Generated assets, APKs, reports, logs and Gradle state are ignored. The emulator
keeps the debug APK for inspection; `adb -s emulator-5554 uninstall dev.mcpnative.androidprobe`
removes this experiment app.

This probe has a manual native command. Its report-comparator regression test runs in normal
`npm test`. The existing iOS workflow remains scoped to the iOS experiment.

## Engine choice and boundary

[AndroidX JavaScriptEngine](https://developer.android.com/develop/ui/views/layout/webapps/jsengine)
executes JavaScript in an isolated service without constructing a WebView. Its implementation comes
from the installed WebView provider, so Android API level alone cannot establish support. The
probe records the provider name/version and requires these features before creating sessions:

- Message ports and promise results.
- Isolate termination and configurable isolate heap limits.
- Evaluation/result transport beyond the Binder transaction limit.

The [1.1.0 release](https://developer.android.com/jetpack/androidx/releases/javascriptengine)
provides a message-port API. Only fixed, locally built APK assets are evaluated. Server values cross
the port as JSON strings; they are never interpolated into JavaScript source. The boot script installs
one fixed handler that invokes the existing experiment exchange function. There is one request in
flight per session; concurrent calls reject. No native function lookup, remote script loading,
WebView instance, network permission or device capability is exposed. Separate fixed hostile test
scripts exercise the bridge and engine; server input cannot select them.

Native code owns the host allowlist, session generation, input/press admission and simulated action
delivery. It checks action names, source identifiers, timestamp, context and optional data model
before recording an authorized delivery. Denied actions remain undelivered. The shared JavaScript
store, validator, planner and action builder retain semantic ownership; this is not a Java port of
the wire validator or a second implementation of form semantics.

The bundle is built by `../ios-runtime-comparison/build-bundle.mjs` and retains the same URL polyfill.
This deliberate temporary dependency keeps the experiment on exactly one bundle without extracting
another package or moving the iOS code. JavaScriptCore and Android both lack a raw global `URL` in the
tested environments; the bundled implementation supplies the validator's requirement.

## Bounds and failure checks

Requests are limited to 1 MiB, 64 JSON container levels, 10,000 values, 65,536 UTF-16 units per string
and 1,048,576 cumulative string units. Strict streaming decoding rejects duplicate keys, invalid
JSON syntax and non-finite numbers. Response decoding permits 132 container levels for the common
64-component graph path; other budgets remain bounded. The experiment retains the shared planner's
1024-node expansion limit, counts Button text children in graph paths, and limits host sessions to
64 steps. Report accumulation is capped at 8 MiB. Host interaction labels/source identifiers remain
bounded ASCII; JSON keys and string values preserve Java's exact UTF-16 equality.

Isolates request a 64 MiB JavaScript heap limit and a 1 MiB evaluation/message-result limit. These
are configured safeguards, not measurements of process memory or performance budgets. Blocking
host waits have ten-second test deadlines; they close failed sessions and are not latency scores.
Closing releases the message port and isolate and rejects a pending request. A termination callback
also fails pending requests when the isolate dies. The native host API here runs on an instrumentation
worker; production main-thread dispatch and application lifecycle integration remain undesigned.

Alongside the shared corpus, ten checks cover malformed envelopes with retained edits, inert Unicode
and code-like text, unknown MIME rejection, closed/stale tickets, strict JSON/depth boundaries,
complete nested layouts, failed-response teardown, concurrent admission/pending-close behavior,
termination of a loop that has signalled it started, and a fresh session after termination.

The [isolate API](https://developer.android.com/reference/androidx/javascriptengine/JavaScriptIsolate)
documents that `close()` does not wait for resource reclamation. This probe verifies request/engine
termination and fresh-session behavior. It does not prove immediate memory reclamation, heap-limit
exhaustion behavior, physical-device performance, all provider versions, or full hostile-input parity.

## Temporary lifecycle

The runtime decision PR records the disposition of this probe and the iOS comparison. Before
`feature/native-platforms` is promoted to `main`, even if the decision is deferred:

- Preserve findings under `docs/` with the tested revision and reproduction instructions; retain
  the shared language-neutral corpus.
- Move selected code into reviewed platform implementation only after production acceptance.
- Remove this directory, its Gradle wrapper/locks and debug APK tooling, the `experiment:android`
  root script and `tests/android-runtime-probe.test.mjs`.
- Clean up the iOS experiment and its workflow/scripts/tests at the same time, since this probe
  consumes its temporary bundle builder. Remove unused esbuild/core-js development dependencies
  and repair documentation links.

Milestone 12/13 maintainers own this review. Git history retains discarded implementations.
