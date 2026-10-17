# Migration to `1.1.0`

`1.1.0` is a compatible minor release of all seven MCP Native packages. Existing `1.0.x`
integrations need no code changes: root exports, controller declarations, closed result/action/error
unions, default authorization policies, and MCP/A2UI/MCP Apps pins are preserved.
All seven packages are [published on npm](releasing.md#110-release-preparation).

## Upgrade packages together

Update every MCP Native package your application directly depends on to `1.1.0`. For the
high-level host path:

```bash
npm install @mcp-native/host@1.1.0
```

For the convenience package:

```bash
npm install mcp-native@1.1.0
```

The convenience package does not re-export the new contract APIs. Install `@mcp-native/host@1.1.0`
directly to use them. Internal package dependency ranges are coordinated at `^1.1.0`.
React and MCP SDK peer requirements are unchanged; see the [support matrix](support-matrix.md).

## Adopt contracts explicitly

The new APIs are separate entry points:

- `@mcp-native/host/contracts`: local adapters, exact negotiation, maintained standard inventory,
  reviewed inline profiles, controller lifecycle, and contract action authorization.
- `@mcp-native/host/contracts/react-native`: compiled renderer registration, provider lifecycle,
  current-result mounting, and schema-validated native events.
- `@mcp-native/host/contracts/authoring`: canonical schema bundles and bounded adapter fixtures for
  build/test environments.

Use the separate `ContractResult` union to handle `contract-data` and `contract-error` alongside
the existing result kinds. Existing host views do not render contract data. Register local schemas
and renderers, advertise the registry on the actual connection, and provide an explicit event policy
and delivery callback. Follow the [custom contract guide](custom-contracts.md),
[standard inventory](standard-contracts.md), [reviewed adapter guide](reviewed-standard-adapters.md),
and [authoring guide](contract-authoring.md).

This release supports inline JSON contracts. Linked custom resources, streaming updates, arbitrary
standard wire grammars, and additional platform renderers remain outside its scope. Exact existing
MCP, A2UI, and MCP Apps pins are unchanged; adopting contracts does not require a standard-pin migration.

## Earlier Milestone 11 source checkouts

The native renderer uses `createRenderBudget()` instead of the unpublished shared `consume` prop.
Create one fresh budget inside each render invocation and share it across that render's complete
traversal. See the [source-checkout migration](custom-contracts.md#unreleased-renderer-migration-after-review).
Preparation's `context.consume()` is unchanged.

A timed-out or unmounted event retains its same-result single-flight gate until the actual review
or delivery callback settles. A timeout interrupts waiting and aborts the signal; it cannot guarantee
that an external effect stopped. Delivery code owns cancellation and any idempotency needed for later
user actions.

Adopting canonical schema bundles for an existing hand-hashed source integration requires updating
installed and peer-advertised digests together. Existing hand-hashed adapters remain runtime-valid.
Neither correction changes APIs that were published in `1.0.x`.
