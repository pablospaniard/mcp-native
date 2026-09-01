/**
 * Frozen custom A2UI `0.1` proof surface.
 *
 * @deprecated Migrate to the pinned A2UI v1 Candidate APIs from `@mcp-native/a2ui`.
 * These explicit legacy exports remain available after their deprecated root aliases are removed
 * at `1.0.0`; they receive security fixes only and never gain v1 semantics.
 */
export {
  A2UI_MAX_DEPTH,
  A2UI_MAX_NODES,
  A2UI_MAX_SOURCE_LENGTH,
  A2UI_MAX_STRING_LENGTH,
  A2UI_MIME_TYPE,
  A2UI_VERSION,
  A2uiParseError,
  A2uiResourceError,
  parseA2uiSurface,
  resolveA2uiResourceFromToolResult,
} from "./index.js";
export type {
  A2uiButtonNode,
  A2uiContainerNode,
  A2uiNode,
  A2uiResourceReader,
  A2uiSurface,
  A2uiTextInputNode,
  A2uiTextNode,
  ResolvedA2uiResource,
} from "./index.js";
