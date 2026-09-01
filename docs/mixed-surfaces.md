# Mixed native and MCP Apps surfaces

`mcp-native` exposes a host-owned coordinator for screens that place validated native A2UI and
isolated MCP Apps WebViews in sibling regions. It coordinates lifecycle; it is not a remotely
described layout engine.

## Ownership model

The host creates each registration with `createMcpNativeMixedA2uiRegion()` or
`createMcpNativeMixedMcpAppsRegion()`, then supplies the fixed ordered list to
`McpNativeMixedSurfaceCoordinator`. Factory results are opaque registrations: copied or server-built
lookalikes are rejected. A2UI registration revalidates and owns its surface snapshot. MCP Apps
registration requires the opaque result of `createMcpAppsNativeSandbox()`, the exact same resource
object used to create that sandbox, and the bridge constructed from that exact pair. A cloned
resource with the same URI is rejected.

There is intentionally no generic region schema, renderer callback, component resolver, WebView
prop bag, URL navigation method, or cross-region message channel. The host's ordinary React Native
tree decides size, placement, stacking, fallback UI, and navigation.

## Lifecycle

Call `start()` after the sibling views are ready to receive host signals. Subscribe with
`useSyncExternalStore` or `subscribe()`/`getSnapshot()` for immutable state. The coordinator
serializes:

- application foreground and background activity;
- per-region visibility and focus transfer;
- reduced motion, dynamic type scale, orientation, and keyboard visibility;
- focused-first back handling;
- cancellation, process crash, explicit recovery, and memory pressure;
- reverse-order disposal and MCP Apps resource teardown.

Callbacks may be asynchronous, must be bounded and idempotent, and should not display raw server
errors. Lifecycle state is committed only after its callback succeeds, so a rejected callback can
be retried without publishing an unapplied transition. A callback failure is wrapped in
`McpNativeMixedSurfaceError`. Start continues initializing
independent siblings, marks the failed region as crashed, publishes the complete snapshot, and then
rejects. The host can call `recover()` for that region. Listener exceptions never corrupt serialized
lifecycle work. Disposal attempts every sibling and closes every Apps bridge even when one teardown
callback fails.

React Native's hardware-back callback is synchronous. A host using asynchronous region callbacks
should synchronously consume the platform event, await `handleBack()`, and invoke its host-owned
navigation fallback only when the result is false. The reference host exits its standalone Android
fixture as that fallback; a real application normally asks its navigator to go back.

## Accessibility and environment

The snapshot records the host-authored sibling order, label, focus, visibility, and whether a region
belongs to the native or isolated-WebView accessibility tree. Use that order in the actual platform
view hierarchy and transfer region focus when user interaction crosses the boundary.

The coordinator distributes environment values so both regions can respond consistently, but it
does not pretend the platform exposes one merged accessibility tree. The host must test screen-reader
order and focus restoration, dynamic text, reduced motion, both orientations, keyboard transitions,
modal behavior, and error/recovery UI on each supported platform.

## Isolation requirements

For every MCP Apps sibling, continue to use `createMcpAppsReactNativeWebViewProps()` and the exact
bridge/sandbox pair. Do not spread server metadata into WebView props. Do not add cross-region raw
messages, shared cookies or persistent storage, arbitrary navigation, downloads, file access,
permission delegates, or external-link handling outside the profile's host policy.

On iOS, report `onContentProcessDidTerminate`; on Android, report `onRenderProcessGone`. Present
host-authored recovery UI and call `recover()` to run the registered reload behavior. Always await
or observe `dispose()` during screen teardown.

The production-shaped generated fixture in `tests/native-host/App.tsx` demonstrates primitive,
design-system adapter, closed variant, Fabric extension, media-policy, and mixed native/Apps paths.
It is release evidence, not a drop-in application shell.
