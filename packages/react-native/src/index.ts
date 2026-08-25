import type { A2uiNode, A2uiSurface } from "@mcp-native/a2ui";

export type NativeComponentName = "Button" | "Text" | "TextInput" | "View";

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

export function createNativeRenderPlan(surface: A2uiSurface): NativeElement {
  return renderNode(surface.root);
}

function renderNode(node: A2uiNode): NativeElement {
  switch (node.type) {
    case "container":
      return {
        key: node.id,
        component: "View",
        props: {},
        children: node.children.map(renderNode),
      };
    case "text":
      return {
        key: node.id,
        component: "Text",
        props: { children: node.text },
      };
    case "button":
      return {
        key: node.id,
        component: "Button",
        props: { title: node.label, action: node.action },
      };
    case "text-input":
      return {
        key: node.id,
        component: "TextInput",
        props: {
          label: node.label,
          ...(node.value === undefined ? {} : { value: node.value }),
          ...(node.binding === undefined ? {} : { binding: node.binding }),
        },
      };
  }
}
