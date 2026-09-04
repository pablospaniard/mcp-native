# Migration from `0.9.x` to `1.0.0`

Milestone 9 established the release-candidate API. The current development candidate completes its
deliberate cleanup: the deprecated custom A2UI `0.1` model no longer appears in package root exports.

## Move legacy imports now

Published `0.9.x` packages allowed root imports. Before upgrading to the current candidate, move
those imports to the explicit migration-only subpaths:

```ts
import { parseA2uiSurface } from "@mcp-native/a2ui/legacy";
import { McpNativeSurface } from "@mcp-native/react-native/legacy";

// Or, when using the convenience package:
import { McpNativeSurface, parseA2uiSurface } from "mcp-native/legacy";
```

Change imports before upgrading even if the application cannot yet migrate its stored documents.
The legacy subpaths preserve the custom `version: "0.1"` meaning; they never reinterpret that input
as A2UI v1.

Deprecated legacy aliases are absent from the current candidate's package roots. The explicit
`/legacy` subpaths remain isolated, frozen, and eligible only for security and critical correctness
fixes. They receive no new A2UI v1 components, functions, capabilities, extensions, or renderer
behavior.

## Keep MCP Apps WebView isolation props

The `1.0.0` candidate adds two required literal fields to `McpAppsReactNativeWebViewProps`:

- `cacheEnabled: false` keeps ephemeral storage independent of native prop-application order; and
- `injectedJavaScriptBeforeContentLoadedForMainFrameOnly: true` confines the paired
  `injectedJavaScriptBeforeContentLoaded` bridge bootstrap to the top-level document.

Callers that obtain the object from `createMcpAppsReactNativeWebViewProps()` receive both fields
automatically and need no code change.

If a custom React Native WebView wrapper reconstructs or narrows that exported prop object, update
the wrapper to accept and forward both fields unchanged. Do not make either value configurable or
allow resource metadata or other server input to override it.

## Automated upgrade path

`npm run package:smoke` installs the latest coordinated stable `0.9.x` packages from npm into a
clean consumer and runs modern APIs together with the explicit `/legacy` imports shown above. It
then replaces all seven coordinated dependencies with locally packed
release-candidate artifacts, confirms that npm selected each local tarball, and runs the consumer
again. Mixed `0.9.x` package versions, retained registry dependencies, missing migration entry
points, and stale installed versions fail the gate.

Pull-request CI runs this upgrade smoke test. The final `1.0.0` release commit therefore exercises
the same path with the actual coordinated stable artifacts before publication.

## Move new work to the v1 Candidate profile

New surfaces should negotiate the project-owned A2UI-over-MCP binding, parse `version: "v1.0"`
lifecycle envelopes into `A2uiSurfaceStore`, validate through an explicit host catalog policy, and
mount `A2uiV1NativeSurface`. There is no automatic conversion because the custom tree/action model
and A2UI v1 catalog/data/event model have different semantics.

## Adopt host ownership explicitly

Before `1.0.0`:

- replace open component maps or prop spreading with the typed local catalog and adapters;
- advertise only installed, policy-ready components and exact extension tuples;
- keep application navigation and sensitive permission decisions outside server UI;
- use the MCP Apps sandbox and bridge pair for HTML;
- use the mixed-surface coordinator only for host-created sibling regions, not server-described
  layout;
- run the exact [support matrix](support-matrix.md), `npm run check`, and
  `npm run package:smoke` against the application integration.

Any additional release-candidate correction discovered by independent review will be documented
here with clear upgrade guidance before the stable tag.
