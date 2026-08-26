import type { McpReadResourceResult } from "@mcp-native/core";

export const A2UI_MIME_TYPE = "application/a2ui+json" as const;

export interface A2uiResourceReader {
  readResource(uri: string): Promise<McpReadResourceResult>;
}
