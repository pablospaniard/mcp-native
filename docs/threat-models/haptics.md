# Haptics capability threat model

## Boundary

The haptics reference provider allows one locally compiled callback to perform one enumerated impact
effect. It does not expose vibration duration, waveform arrays, audio, raw Android vibration
attributes, UIKit selectors, reflection, native module names, intents, or commands. The server never
receives a native object or error.

## Threats and controls

| Threat                                | Control and test evidence                                                                                                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Permission or consent bypass          | The broker requires a fresh policy decision and permission-boundary decision after schema validation. The manifest also requires current user activation and foreground state. Denial tests prove the callback is not invoked. |
| Confused deputy / forged authority    | Invocation requires an opaque grant tied to the exact registry. Structural copies, unknown versions, schema revisions, providers, platforms, and unadvertised identities fail closed.                                          |
| Sensitive-data disclosure             | The request is one fixed effect enum; the result is one boolean; events are disabled. Redacted audit records contain no payload or native exception.                                                                           |
| Replay                                | Each broker retains bounded request IDs and rejects reuse before invoking policy or native code. A new broker is a new host-owned session.                                                                                     |
| Background execution                  | The manifest is foreground-only and requires user activation. Both facts are checked again for every invocation.                                                                                                               |
| Resource amplification                | One call is active at a time; events are disabled; duration, cleanup, calls, JSON values, strings, and work have per-call and cumulative ceilings.                                                                             |
| Cancellation                          | Abort, timeout, and broker close suppress late results. The local adapter receives the abort signal; result suppression remains authoritative if the native API cannot cancel an already-issued pulse. Cleanup runs once.      |
| Process death                         | The provider retains no capability payload or resumable operation. Process restart requires a new registry, negotiation grant, policy decision, permission check, and request ID.                                              |
| Unavailable or revoked platform state | The exact OS matrix filters unavailable registrations. Adapter rejection becomes a redacted provider failure; it cannot fall through to another native mechanism.                                                              |

## Residual host responsibilities

The app must bind `impact` directly to an audited platform API, avoid logging request correlation with
user data, correctly report foreground and activation state, and close the broker with its owning
connection/session. Adding richer vibration patterns requires a separate manifest version, schema
digest, threat-model update, matrix evidence, and review.
