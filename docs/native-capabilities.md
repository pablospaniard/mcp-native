# Native capability providers

`@mcp-native/host/capabilities` is the host-owned boundary for device behavior that is not part of
declarative rendering. It lets an application install audited providers without exposing a generic
native invocation API. It does not add a protocol-independent dependency to `@mcp-native/core`, and
it does not let a server select a class, selector, intent, command, module, JavaScript function, or
downloaded implementation.

## Contract

Every provider is created locally with a manifest whose `manifestVersion` is exactly `1`. The
manifest has a namespaced semantic identity and exact version/schema digest; closed request, result,
event, and error schemas; explicit OS/provider ranges; permission and entitlement declarations;
activation, consent, foreground/background, sensitivity, cancellation, cleanup, fallback, and
numeric limits; and a repository-local threat-model reference. Unknown fields and values fail
registration.

Applications create an immutable registry for one exact platform and OS version. Its settings are
advertised under `io.github.pablospaniard/mcp-native-capabilities`. A server requests an exact subset
using the same binding version and descriptors. `negotiateCapabilities` returns an opaque grant only
when every requested identity, semantic version, and schema digest is installed and advertised by
that registry. An extension-looking metadata field, MIME type, or structural copy of a grant has no
authority. The binding version is currently `0.1`; this is a project-owned placement pending a
reviewed interoperable standard.

For each invocation the broker:

1. verifies the opaque grant, exact descriptor, unique bounded request ID, activation, foreground
   state, concurrency, and session call allowance;
2. reconstructs owned JSON and validates it against the local request schema;
3. asks the application policy for a fresh decision and then asks the platform permission boundary;
4. invokes only the locally registered provider with a bounded work charger and abort signal;
5. validates each event and the final result or declared provider error before releasing it; and
6. runs bounded cleanup and emits redacted lifecycle audit records.

Audit records contain only phase, local capability identity/version, a broker-generated operation
number, and a stable local error category. They never contain the server request ID, request, event,
result, native exception, permission response, or sensitive values. A provider result arriving after
abort, timeout, or broker close is suppressed.

Policy and permission callbacks are both mandatory. A server declaration cannot satisfy either one.
The broker does not retain consent between calls. App-defined providers use the same closed manifest,
opaque registry, negotiation, broker, limits, and audit path as built-ins; reserved project and
standards namespaces cannot be claimed by application providers.

## Built-in policy profiles and reference provider

`CAPABILITY_RISK_PROFILES` supplies conservative minimum policy floors for all Milestone 15 families:
media, files/sharing, location/maps, proximity/sensors, biometrics/secrets, contacts/calendar,
communication, payments/wallets, and background work. These profiles advertise no device API. Each
concrete provider still needs an exact manifest, threat model, platform implementation, and matrix
entry.

The first reference provider is `createHapticsProvider`. It binds a host-supplied `impact` callback
to the fixed `HAPTICS_CAPABILITY_MANIFEST`; the callback receives only the closed effect enum and an
abort signal. The profile requires a current user activation, fresh policy approval, foreground
execution, zero events, one concurrent invocation, and bounded duration/cleanup. It declares no OS
permission or entitlement. See [its threat model](threat-models/haptics.md).

```ts
import {
  CAPABILITY_EXTENSION_ID,
  createCapabilityBroker,
  createCapabilityRegistry,
  createHapticsProvider,
  negotiateCapabilities,
} from "@mcp-native/host/capabilities";

const haptics = createHapticsProvider({
  impact: (effect, signal) => appHaptics.impact(effect, signal),
});
const registry = createCapabilityRegistry([haptics], {
  platform: "ios",
  osVersion: "18.1",
});

// Advertise registry.extensionSettings at CAPABILITY_EXTENSION_ID on this connection.
const grant = negotiateCapabilities(registry, serverExtensions[CAPABILITY_EXTENSION_ID]);

if (grant.kind === "negotiated") {
  const broker = createCapabilityBroker({
    registry,
    authorize: (request) => appPolicy.review(request),
    ensurePermissions: (request) => appPermissions.ensure(request),
    audit: (event) => appAudit.record(event),
  });
  await broker.invoke({
    grant,
    requestId: crypto.randomUUID(),
    capability: haptics.manifest.descriptor,
    request: { effect: "light" },
    userActivated: true,
    foreground: true,
  });
}
```

## Exact provider matrix

The package version remains `1.1.0`; this additive API is unreleased source and requires a future
coordinated package release. “Adapter contract” means the app supplies and audits the native call;
the package contains no generic native module lookup.

| Renderer / host path                                    | Platform range                                                                                                                                                                 | Provider                                         | Status in current source                | Evidence                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | --------------------------------------- | --------------------------------------------------------------- |
| React Native host using `@mcp-native/host/capabilities` | iOS 13+                                                                                                                                                                        | `ui-feedback-generator` haptics adapter contract | Available when installed by the app     | Node hostile/lifecycle tests; native callback remains app-owned |
| React Native host using `@mcp-native/host/capabilities` | Android API 26+                                                                                                                                                                | `android-vibrator` haptics adapter contract      | Available when installed by the app     | Node hostile/lifecycle tests; native callback remains app-owned |
| `MCPNativeSwiftUI` direct host                          | Apple platforms                                                                                                                                                                | none                                             | Not integrated                          | No capability claim                                             |
| `MCPNativeCompose` direct host                          | Android                                                                                                                                                                        | none                                             | Not integrated                          | No capability claim                                             |
| Any renderer                                            | media, files/sharing, location/maps, sensors/Bluetooth/NFC, biometrics/secrets, contacts/calendar/notifications/communication, payments/wallets, background/system integration | none                                             | Risk profile only; no built-in provider | No capability claim                                             |

Adding a row requires an exact package source/release, renderer or host path, OS range, provider
identity, permissions/entitlements, threat model, and positive plus hostile platform evidence. A
risk-profile entry alone is never advertised.
