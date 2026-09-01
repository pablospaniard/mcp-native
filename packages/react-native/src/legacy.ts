/**
 * Renderer for the frozen custom A2UI `0.1` proof surface.
 *
 * @deprecated Migrate to `A2uiV1NativeSurface`. Root aliases are removed at `1.0.0`; this explicit
 * subpath remains isolated and receives security fixes only.
 */
export {
  McpNativeSurface,
  createNativeRenderPlan,
  useMcpNativeActionDispatcher,
  useNativeRenderPlan,
} from "./index.js";
export type {
  McpNativeActionDispatcherOptions,
  McpNativeDispatcher,
  McpNativeSurfaceProps,
  NativeActionHandler,
  NativeBindingChangeHandler,
  NativeComponentName,
  NativeElement,
} from "./index.js";
