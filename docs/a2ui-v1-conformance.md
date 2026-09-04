# A2UI v1 Candidate conformance profile

This document is the feature-scoped conformance report for MCP Native's implemented A2UI adapter
profile.

## Pinned baseline

- Protocol: A2UI v1.0 Candidate
- Upstream revision: `7541f953050cd58b80f0bf5d85fe2d63192af305`
- Schemas: the checksum-verified bundle in `packages/a2ui/src/v1/vendor`
- Catalog used for schema resolution: the basic catalog from that same revision

Updating the Candidate revision, schemas, or catalog is a reviewed protocol change. Hosts must not
advertise the complete basic catalog merely because MCP Native can validate it: catalog capability
advertising is limited to a host's complete implementation.

## Envelope and lifecycle profile

| Direction         | Message                    | Support boundary                                                                     |
| ----------------- | -------------------------- | ------------------------------------------------------------------------------------ |
| Agent to renderer | `createSurface`            | Schema-validated and applied to bounded ordered state.                               |
| Agent to renderer | `updateComponents`         | Schema-validated and applied atomically.                                             |
| Agent to renderer | `updateDataModel`          | Schema-validated and applied as a bounded RFC 6901 update.                           |
| Agent to renderer | `deleteSurface`            | Schema-validated and applied to ordered state.                                       |
| Renderer to agent | `action`                   | Parsed, and constructed from resolved host-owned event input.                        |
| Renderer to agent | `callAgentFunction`        | Parsed as owned data against the pinned schema. No execution or delivery is implied. |
| Renderer to agent | `rendererFunctionResponse` | Parsed as owned data against the pinned schema. No transport is selected.            |
| Renderer to agent | `error`                    | Parsed as owned data against the pinned schema. It is not trusted as a host error.   |

Every accepted renderer-to-agent envelope has exactly `version: "v1.0"` and exactly one known
message field. Strings and JSON graphs are bounded. Unknown versions, kinds, functions, fields on
closed messages, non-JSON values, and malformed identifiers fail closed. Generic `error` fields
that the pinned schema explicitly leaves open are preserved as bounded inert JSON.

The project-owned [A2UI-over-MCP binding](a2ui-mcp-binding.md) defines JSONL transport only for the
ordered agent-to-renderer lifecycle. `createActionDeliveryHandler` provides a fail-closed,
serialized authorization boundary for action delivery, but the actual renderer-to-agent transport
and the MCP placement of A2UI capability objects remain host-owned.

## Native renderer subset

The React Native adapter implements these basic-catalog components:

- `Row`, `Column`, static and dynamic `List`, `Card`, `Text`, `Image`, `Icon`, `Divider`, `Button`,
  `TextField`, `CheckBox`, `ChoicePicker`, `Slider`, `DateTimeInput`, `Tabs`, `Modal`, `Video`, and
  `AudioPlayer`;
- absolute and dynamic-list-relative string, boolean, number, and string-array bindings with
  renderer-local updates;
- bounded template expansion and template-scoped `@index`;
- closed structural, style-variant, accessibility, event, and check fields documented by the
  package APIs.

A host must advertise only the intersection returned by
`getSupportedComponentNames(catalog, { imagePolicy, mediaPolicy })` for its installed
and policy-ready catalog. Optional slots remain optional at the TypeScript catalog boundary; a
surface using an omitted slot or required resource policy fails before that component can mount.
`createHost` now derives this intersection and the corresponding validation policy from
one frozen registration. Its explicit mount inspection expands the same bounded plan and reports
stable host diagnostics before React; this changes no Candidate schema or catalog interpretation.

The component-specific native interpretations are closed:

| Component       | Implemented semantic boundary                                                                                                                                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Image`         | Canonical HTTP(S) URL plus a required synchronous host grant for exact redirect origins, redirect count, bytes, decoded width/height/pixels, and cache mode. Per-image grants are also bounded by surface-wide image-count, transfer-byte, and decoded-pixel totals. The installed loader must enforce that grant. |
| `Icon`          | One pinned semantic name mapped by the host; `svgPath`, font names, imports, platform symbol strings, and arbitrary glyph payloads are rejected.                                                                                                                                                                   |
| `Divider`       | Horizontal or vertical decorative separator, excluded from accessibility focus.                                                                                                                                                                                                                                    |
| `CheckBox`      | Boolean value/binding, label, checks, and checkbox accessibility state.                                                                                                                                                                                                                                            |
| `ChoicePicker`  | Unique closed options, valid string-array selection, single/multiple semantics, checks, and cumulative option/output limits.                                                                                                                                                                                       |
| `Slider`        | Finite bounded number, optional finite step partition, checks, and adjustable accessibility role.                                                                                                                                                                                                                  |
| `DateTimeInput` | Strict date-only, time-only, or RFC 3339/date-time string according to enabled fields, with compatible bounds and checks.                                                                                                                                                                                          |
| `Tabs`          | Non-empty titled tabs and renderer-local selected index; only the selected host-owned content is presented.                                                                                                                                                                                                        |
| `Modal`         | A required `Button` trigger plus content and renderer-local open state; the host component owns focus trapping, platform escape/back dismissal, and focus restoration through `onRequestClose`.                                                                                                                    |
| `Video`         | Canonical HTTP(S) source plus exact host grant for source/redirect origins, MIME types, redirects, bytes, autoplay, background playback, external routes, and user activation. An optional poster independently requires the image grant.                                                                          |
| `AudioPlayer`   | The same closed media grant as `Video`, restricted to exact audio MIME types and an optional semantic description.                                                                                                                                                                                                 |

Hosts may map these semantics through typed adapters and closed `Image` or `ChoicePicker` variant
slots. No raw React Native style, arbitrary native prop, component class, import, executable code,
or imperative native command crosses the wire boundary. Media grants are additionally limited to
16 instances and 2 GiB of cumulative granted transfer bytes per expanded plan; the installed
player must enforce each grant.

The project-owned host-extension profile is an explicitly negotiated extension to this pinned
basic-catalog profile, not an upstream basic-catalog claim. It keeps inline catalogs disabled and
admits only an exact namespaced extension/catalog/schema/component tuple from an opaque negotiated
registry. Each locally authored manifest has closed prop and event schemas, platform,
accessibility, resource/permission, complexity, fallback, and compatibility declarations.
Extension components are leaves; arbitrary children, props, styles, modules, classes, commands,
and executable code are rejected. See the [host-extension profile](media-and-host-extensions.md).

The executable function subset is:

- `formatString`, `formatNumber`, `formatCurrency`, `formatDate`, and `pluralize`;
- `and`, `or`, and `not`;
- `required`, `regex`, `length`, `numeric`, and `email`;
- template-scoped `@index`;
- user-activated HTTP(S) `openUrl`, only through both a synchronous host policy and host opener.

All component, event, and function names additionally require an explicit host allowlist. The
declared component and function profile is closed, and all other server-controlled inputs fail
closed.

The [automated robustness gates](a2ui-v1-performance.md) cover bounded Node.js performance and
generated-input behavior. The runnable [Expo Go todo app](../examples/expo-go-todolist/README.md)
adds complementary application-level evidence; the package gates above verify the declared
protocol profile.

The `@mcp-native/react-native/testing` entry point supplies fresh canonical adapter surfaces for
the semantics most likely to vary across design systems. Those fixtures and local layout contracts
test host implementations; they are not additional wire-level components or conformance claims.

## Candidate interpretations

- The pinned `CheckRule` prose describes a `ValidationResult` object, while `Checkable` and the
  pinned reference implementation use a boolean. MCP Native follows the executable boolean form.
- Validation-error `path` is an RFC 6901 JSON Pointer; the empty pointer is accepted for the root.
- Additional fields on generic renderer `error` messages are preserved because the pinned schema
  explicitly permits them. They remain inert and cannot grant host behavior.
- Successful parsing is never authorization for function execution, tools, URLs, transport,
  device capabilities, or permissions.
- The pinned `Modal` shape has a `Button` trigger but does not define whether opening replaces the
  trigger's declared action. MCP Native opens the local modal and also resolves the trigger action;
  host action policy remains authoritative. Dismissal never emits an agent action.
- The pinned `Image` shape names a URL but does not define native network/decode policy. MCP Native
  requires a separate host grant and passes its exact budgets to the installed image component. A
  grant authorizes a constrained load; it does not prove the component enforced it. URLs are
  canonicalized before authorization. Dispatch-time event and `openUrl` reconstruction revalidates
  their server-controlled values without invoking unrelated image authorization callbacks again.
  One expanded plan is limited to 64 images, 100 MiB of total granted transfer bytes, and
  268,435,456 total granted decoded pixels; image count fails before another policy call.
- The pinned media shapes name sources but do not define a native loader or complete playback
  security policy. MCP Native requires a synchronous host grant before plan construction and passes
  the exact grant to the installed component. A grant is not proof that a third-party player
  enforced it.
- The pinned agent capabilities JSON Schema does not itself mark `supportedCatalogIds` as required.
  The package-root `parseAgentCapabilities` boundary enforces it as required beyond the schema and
  fails closed when it is absent, because capability negotiation
  (`negotiateCapabilities`) is meaningless without an explicit agent-declared catalog set to
  intersect against. This is a deliberate stricter-than-schema deviation, not a parser defect.
- `callRendererFunction` and `agentFunctionResponse` are recognized but explicitly unsupported
  message kinds (`packages/a2ui/src/v1/parse.ts`'s `UNSUPPORTED_KEYS`): envelopes containing either
  key are rejected outright rather than silently ignored. They are out of scope for this profile,
  not a gap in the [envelope and lifecycle profile](#envelope-and-lifecycle-profile) table above.

## Verification coverage

- Vendored schema integrity is checked by `npm run schemas:verify`.
- Upstream agent-to-renderer examples and incremental lifecycle fixtures exercise parsing and
  ordered state.
- `tests/fixtures/a2ui-v1/renderer-to-agent-messages.json` covers every pinned renderer-to-agent
  message kind.
- `tests/fixtures/a2ui-v1/milestone-7-surface.json` covers all nine non-media catalog additions in
  generated React Native iOS and Android hosts.
- `tests/fixtures/a2ui-v1/milestone-8-surface.json` covers both media components and one locally
  compiled extension; the generated host includes a Codegen spec, UIKit implementation, and Android
  View implementation through Fabric.
- Negative tests cover unknown versions and kinds, ambiguous envelopes, unsupported functions,
  malformed JSON Pointers, conflicting response/error forms, non-JSON input, and complexity limits.
- Fixed-seed generated tests cover both envelope directions, ordered lifecycle state, bounded dynamic
  lists, and hostile graph/component/binding/function mutations.
- `npm run test:performance` enforces documented parse, update, render-plan, and retained-heap
  regression ceilings for the maximum supported component count.
- `npm run check` is the repository conformance gate; `npm run package:smoke` verifies published
  exports and declarations.

## Custom `0.1` migration

The custom `A2UI_VERSION = "0.1"` surface is not an A2UI protocol version. Its parser, resolver,
node types, limits, `McpNativeSurface`, and legacy render-plan helpers are deprecated and frozen to
security and correctness fixes. They are exported only from the explicit `/legacy` entry points.

Migrate as follows:

1. Negotiate the project-owned A2UI-over-MCP binding instead of inferring support from a MIME type.
2. Replace `resolveA2uiResourceFromToolResult` or `parseA2uiSurface` with
   `resolveJsonlFromToolResult`, `parseJsonl`, or `parseEnvelope`.
3. Apply lifecycle messages through `SurfaceStore` and call `getValidated` with an explicit
   host policy before rendering.
4. Replace `McpNativeSurface` with `Surface`; deliver validated action envelopes through
   an application-owned transport. High-level hosts can install
   `actionAuthorization.authorizeA2uiAction` from a configured
   `createMcpNativeHostActionAuthorization({ authorize })` instance in the A2UI delivery handler so
   the same application decision callback also reviews MCP Apps tool calls.
5. Install only the optional native component slots your host implements completely, derive the
   advertised list with `getSupportedComponentNames(catalog, { imagePolicy })`, and supply an enforcing image
   policy/loader before advertising `Image`.

There is no automatic conversion: the custom nested node tree and official component graph have
different wire contracts. Legacy inputs never receive failed v1 streams as fallback.
