# Separately packaged inline standard adapters

Status: implemented in source, unreleased. `createReviewedStandardAdapter` from
`@mcp-native/host/contracts` installs a host-reviewed inline JSON profile without changes to the
host package. It uses exact extension settings and result metadata, closed schemas, and the existing
bounded preparation, compiled native rendering, authorization, and lifecycle controls.

This is a local review attestation. The factory validates the definition and enforces the supported
interface; it does not certify a standard, validate the truth of review evidence, or audit trusted
JavaScript. Library-maintained [MCP, A2UI, and Apps profiles](standard-contracts.md) retain their
existing pins and implementations. Server metadata cannot create a registration or confer reviewed
status.

## Package and install a profile

A separate package can export a factory that calls `createReviewedStandardAdapter` with these local
options:

```ts
import { createReviewedStandardAdapter } from "@mcp-native/host/contracts";

export function createReceiptStandard() {
  return createReviewedStandardAdapter({
    descriptor: receiptDescriptor,
    inputSchema: receiptInputSchema,
    modelSchema: receiptModelSchema,
    eventSchema: receiptEventSchema,
    binding: {
      extensionId: "com.example/receipt-standard",
      settings: { version: "2026-09-14", profile: "inline" },
      resultMetaKey: "com.example/receipt-standard",
      resultMeta: { version: "2026-09-14" },
    },
    evidence: {
      specification: "docs/receipt-standard.md",
      revision: "2026-09-14",
      review: "reviews/receipt-2026-09-14.md",
      fixtures: "fixtures/receipt-v1",
      exclusions: ["No linked resources or streaming"],
    },
    prepare: prepareReceipt,
  });
}
```

The names and revision above are illustrative, not an upstream standard claim. The descriptor,
schemas, and preparation callback are reviewed local package values. The descriptor uses the
existing exact local adapter identity, semantic version, SHA-256 schema digest, `structured-content`
transport, and vendor JSON MIME grammar. Its local version is separate from the pinned upstream
revision. Generate/check the digest with the [authoring helper](contract-authoring.md).

The host explicitly installs the package's returned adapter in `createContractRegistry([adapter])`,
or binds it to a compiled component with `createContractNativeRegistration` and passes that
registration to `createContractNativeRegistry`. Both paths accept custom and reviewed adapters;
private factory identity assigns their lanes. `.contracts` lists custom descriptors,
`.reviewedStandards` lists separately installed profile manifests, and `.standards` lists selected
library-maintained profiles. Reviewed profiles advertise only their own extension settings and never
enter the project-owned custom extension. The controller advertises the combined immutable map on
each fresh connection.

The separate package should use the host as a peer dependency so registration and mounting share one
installed host module instance. Duplicate host installations produce distinct private identities
and fail registry validation. The [synthetic fixture package](../tests/fixtures/reviewed-standard-package/index.mjs)
is installed as a separate tarball by `npm run package:smoke`; it demonstrates the package boundary
without making an upstream conformance claim.

## Closed interface and review evidence

The factory accepts the existing schema/preparation options plus exactly `binding` and `evidence`.
It rejects executable recognizers, wildcard matching, resource loaders, policy callbacks, unknown
fields, and forged registrations. Input/model/event schemas retain their strict grammar and bounds.

Bindings contain exactly `extensionId`, `settings`, `resultMetaKey`, and `resultMeta`. Identifiers
use the bounded namespaced descriptor grammar and cannot use reserved built-in/project namespaces.
Settings and result markers are nonempty JSON objects. Matching requires full structural equality:
object key order is immaterial; array order and every value are significant. No subset matching,
range negotiation, MIME-only activation, or implicit schema/version alias is supported.

Evidence contains exactly `specification`, `revision`, `review`, `fixtures`, and `exclusions`.
References are bounded local text and never fetched, opened, or executed. A revision must be an exact
40-character lowercase source commit, `sha256:` digest, dated `YYYY-MM-DD` revision, or three-part
semantic version with optional `v`. Tags such as `latest` and version ranges are rejected. Reference
fields are 1–512 code units with no control characters; 1–16 nonblank exclusions of at most 512 code
units are required. Binding and evidence together are capped at depth 16, 1,024 values, 8,192 string
code units, and 32,768 work units.

A registry permits at most 32 custom/reviewed adapters combined. It rejects duplicate identity/version
pairs and any reviewed profile sharing an adapter ID, MIME, extension ID, or result marker with an
incompatible installed entry. Aggregate registry budgets include profile evidence and bindings as
well as schemas. The manifest's fixed responsibilities make the implemented interface explicit:

| Responsibility | Owner and behavior                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| Recognition    | Host performs exact result metadata matching after exact connection negotiation                        |
| Validation     | Host validates original inline input, prepared model, and optional events against closed local schemas |
| Resources      | None; no reader or transport is passed to the adapter                                                  |
| Rendering      | Host installs a compiled native component and maps semantic fields explicitly                          |
| Actions        | Existing event-schema validation, serialized host authorization, bounded delivery                      |
| Lifecycle      | Existing connection-owned controller result and private native mount lease                             |
| Fallback       | Missing negotiation stays inert; malformed claims or selected failures stay closed                     |

Trusted local callbacks can perform arbitrary JavaScript and must use cooperative work accounting;
the interface is not a sandbox. Review the specification mapping, preparation expansion, explicit
native prop mapping, consent rules, and abort-aware delivery before calling the factory.

## Selection and failures

For every installed reviewed extension, present client or server settings must equal the pinned
settings. A mismatch is `contract-error` / `invalid-standard-settings` before preparation or resource
reads. An absent side leaves the profile unnegotiated and its well-formed result inert. A missing
marker is unclaimed; an installed marker with a malformed or different value is
`invalid-standard-claim`, including when not negotiated. Errored tool results never prepare models.

Multiple installed markers, custom plus reviewed markers, reviewed plus built-in claims, and claims
for another installed reviewed MIME are `conflicting-contract-claims`. Reserved marker/MIME checks
apply before preparation even without negotiation or with disabled built-in profiles. A reviewed
adapter cannot be replayed through custom descriptor negotiation. Unknown uninstalled metadata
remains inert under ordinary MCP rules and cannot invoke an adapter.

Reviewed selection uses one cumulative budget across all installed peer settings and the selected
marker: depth 32, 10,000 values, 262,144 string code units, and 100,000 work units. Individually valid
profiles can exceed this combined bound. Selected input, preparation, and output use the existing
per-call adapter/host ceilings. Failure never tries another parser, adapter, renderer, or resource
transport. Errors retain closed codes rather than server values or callback exception messages.

A valid result remains `contract-data` with an owned immutable model and the exact installed local
descriptor. Native events retain the existing `kind: "contract"` authorization request; the local
descriptor identifies the reviewed adapter. Review evidence and negotiation grant no event, tool, or
device authority. Clearing/replacing results, reconnecting, unmounting, and failed/stale authorization
retain the existing revocation behavior. The public authoring fixture runner uses the profile's own
binding and still checks its local canonical schema digest before preparation.

## Scope and migration

The new factory, profile inventory, and `invalid-standard-claim` code belong to the unreleased opt-in
API. Existing v1 root exports, result/action unions, declaration compatibility, defaults, schema pins,
and package versions remain unchanged. Existing custom adapters remain custom; adding a profile
property or wire marker cannot promote one. Moving an integration to a reviewed profile requires
explicit local installation and coordinated peer support for its exact binding.

This implements independently packaged adapters for the closed inline-JSON interface. Arbitrary
standard wire grammars, non-vendor MIME identities, linked resources, streaming updates, and a combined
standard/custom result view require separate designs. No additional real upstream profile is claimed
by the synthetic package tests. Milestone 11's bounded implementation is available for review; the
PR remains unreleased and issue #91 remains open for acceptance review.
