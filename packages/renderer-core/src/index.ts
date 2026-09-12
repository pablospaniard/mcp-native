import type { NativeCatalogComponentName } from "./component-shapes.js";

export * from "./component-shapes.js";
export * from "./v1.js";
export * from "./mount-types.js";

export type NativeComponentName = NativeCatalogComponentName | "HostExtension";

/**
 * A serializable render plan. A React Native host maps these trusted component
 * names to locally bundled components; the MCP server never supplies code.
 */
export interface NativeElement {
  readonly key: string;
  readonly component: NativeComponentName;
  readonly props: Readonly<Record<string, unknown>>;
  readonly children?: readonly NativeElement[];
}
