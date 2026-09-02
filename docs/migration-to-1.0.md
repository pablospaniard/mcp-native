# Migration from `0.9.x` to `1.0.0`

Milestone 9 establishes the release-candidate API and one deliberate cleanup: the deprecated custom
A2UI `0.1` model will no longer appear in package root exports at `1.0.0`.

## Move legacy imports now

During `0.9.x`, existing root imports continue to work, and explicit migration-only subpaths are
available:

```ts
import { parseA2uiSurface } from "@mcp-native/a2ui/legacy";
import { McpNativeSurface } from "@mcp-native/react-native/legacy";

// Or, when using the convenience package:
import { McpNativeSurface, parseA2uiSurface } from "mcp-native/legacy";
```

Change imports before upgrading even if the application cannot yet migrate its stored documents.
The legacy subpaths preserve the custom `version: "0.1"` meaning; they never reinterpret that input
as A2UI v1.

At `1.0.0`, deprecated legacy aliases are removed from package roots. The explicit `/legacy`
subpaths remain isolated, frozen, and eligible only for security and critical correctness fixes.
They receive no new A2UI v1 components, functions, capabilities, extensions, or renderer behavior.

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

Any additional release-candidate correction discovered by independent review will be documented here with
clear upgrade guidance before the stable tag.
