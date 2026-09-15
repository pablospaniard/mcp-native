# Maintained standard contracts

Included in `1.1.0`; see [publication status](releasing.md#110-release-preparation). `@mcp-native/host/contracts` exposes a closed inventory
of the three existing maintained implementations. Separately packaged inline profiles use the
[reviewed standard adapter interface](reviewed-standard-adapters.md); they do not replace these
maintained registrations or inherit their conformance claims.

```ts
import { createContractRegistry, createA2uiStandardContract } from "@mcp-native/host/contracts";

const registry = createContractRegistry([], {
  standards: [createA2uiStandardContract()],
});
// registry.standards: ordinary MCP fallback, then A2UI.
// Advertise registry.extensionSettings on the actual connection.
```

The optional second argument also applies to `createContractNativeRegistry`. Omitting `standards`
retains all three entries and the existing default extension map. `standards: []` retains only inert
ordinary MCP fallback plus explicitly installed custom contracts. Ordinary fallback is always
included. Factories return frozen registrations; duplicates, forged objects, unknown options, and
lists longer than three fail with `invalid-registry`. Inventory order is deterministic: ordinary,
A2UI, Apps. Changing selection requires a new registry and connection.

| Factory                         | Profile identity                   | Exact baseline                                                                                                           | Qualified conformance                                   |
| ------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `createMcpOrdinaryContract`     | `io.modelcontextprotocol/ordinary` | MCP `2026-07-28`                                                                                                         | Selected scenarios at the bounded client boundary       |
| `createA2uiStandardContract`    | `org.a2ui/native`                  | v1.0 Candidate, schema `8ff4651232ab0e02b0123730b502711170637a3a`, binding `0.1`                                         | Pinned schema fixtures                                  |
| `createMcpAppsStandardContract` | `io.modelcontextprotocol/apps`     | `2026-01-26`, official package `@modelcontextprotocol/ext-apps@1.7.5`, source `92f46a574568a3ddac7600343b7d3c4c4ed7b588` | Official schema interoperability for the native profile |

Each immutable `StandardContractProfile` records manifest version `"1"`, exact profile and schema
revisions, MIME types, extension settings, selected entry-point limits, compatibility/conformance
status, responsibility descriptions, evidence references, and exclusions. These manifests summarize
existing implementation authority; consult [MCP support](protocol-support.md),
[A2UI binding](a2ui-mcp-binding.md), and [Apps compatibility](mcp-apps-compatibility.md) for complete
limits and supported behavior. The MCP compatibility lane `2025-11-25` remains separately documented.
The Apps source commit is a manually verified source pin. No entry claims full upstream certification.

Selection controls advertisements and resolver eligibility. A connection advertising an excluded
A2UI or Apps extension fails with `contract-error` / `invalid-standard-settings` before resource
reads or preparation. Peer-only advertisements cannot enable an excluded profile. Unnegotiated
claims retain existing inert fallback behavior. Selected parse failures stay invalid, multiple
negotiated standard claims stay ambiguous, and reserved standard/custom conflicts remain rejected
even when the standard is disabled. No failed standard is retried through a custom adapter.

Factories grant no renderer, catalog, sandbox, action, or device authority. Existing protocol
packages retain validation and resource handling. Applications still supply local A2UI catalogs,
isolated Apps WebViews, and explicit action policies. `ContractNativeResultView` mounts custom data;
a combined view for registered standard and custom results remains future work. Existing v1 root
exports, result/action unions, protocol pins, and default behavior are unchanged.
