import type { JsonObject, JsonValue, ToolAction } from "@mcp-native/core";

export const A2UI_VERSION = "0.1" as const;

interface A2uiNodeBase {
  readonly id: string;
}

export interface A2uiContainerNode extends A2uiNodeBase {
  readonly type: "container";
  readonly children: readonly A2uiNode[];
}

export interface A2uiTextNode extends A2uiNodeBase {
  readonly type: "text";
  readonly text: string;
}

export interface A2uiButtonNode extends A2uiNodeBase {
  readonly type: "button";
  readonly label: string;
  readonly action: ToolAction;
}

export interface A2uiTextInputNode extends A2uiNodeBase {
  readonly type: "text-input";
  readonly label: string;
  readonly value?: string;
  readonly binding?: string;
}

export type A2uiNode =
  | A2uiButtonNode
  | A2uiContainerNode
  | A2uiTextInputNode
  | A2uiTextNode;

export interface A2uiSurface {
  readonly version: typeof A2UI_VERSION;
  readonly root: A2uiNode;
}

export class A2uiParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "A2uiParseError";
  }
}

export function parseA2uiSurface(input: string | unknown): A2uiSurface {
  let value: unknown = input;

  if (typeof input === "string") {
    try {
      value = JSON.parse(input) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown JSON error";
      throw new A2uiParseError(`Invalid JSON: ${message}`);
    }
  }

  const surface = expectObject(value, "surface");
  const version = expectString(surface.version, "surface.version");
  if (version !== A2UI_VERSION) {
    throw new A2uiParseError(`Unsupported A2UI version: ${version}`);
  }

  return {
    version: A2UI_VERSION,
    root: parseNode(surface.root, "surface.root"),
  };
}

function parseNode(value: unknown, path: string): A2uiNode {
  const node = expectObject(value, path);
  const id = expectString(node.id, `${path}.id`);
  const type = expectString(node.type, `${path}.type`);

  switch (type) {
    case "container":
      return {
        id,
        type,
        children: expectArray(node.children, `${path}.children`).map((child, index) =>
          parseNode(child, `${path}.children[${index}]`),
        ),
      };
    case "text":
      return { id, type, text: expectString(node.text, `${path}.text`) };
    case "button":
      return {
        id,
        type,
        label: expectString(node.label, `${path}.label`),
        action: parseToolAction(node.action, `${path}.action`),
      };
    case "text-input": {
      const label = expectString(node.label, `${path}.label`);
      const valueField = optionalString(node.value, `${path}.value`);
      const binding = optionalString(node.binding, `${path}.binding`);

      return {
        id,
        type,
        label,
        ...(valueField === undefined ? {} : { value: valueField }),
        ...(binding === undefined ? {} : { binding }),
      };
    }
    default:
      throw new A2uiParseError(`Unsupported node type at ${path}: ${type}`);
  }
}

function parseToolAction(value: unknown, path: string): ToolAction {
  const action = expectObject(value, path);
  const type = expectString(action.type, `${path}.type`);
  if (type !== "tool") {
    throw new A2uiParseError(`Unsupported action type at ${path}: ${type}`);
  }

  const arguments_ = action.arguments;
  return {
    type,
    name: expectString(action.name, `${path}.name`),
    ...(arguments_ === undefined
      ? {}
      : { arguments: expectJsonObject(arguments_, `${path}.arguments`) }),
  };
}

function expectObject(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new A2uiParseError(`Expected an object at ${path}`);
  }
  return value as Record<string, unknown>;
}

function expectArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new A2uiParseError(`Expected an array at ${path}`);
  }
  return value;
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new A2uiParseError(`Expected a string at ${path}`);
  }
  return value;
}

function optionalString(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : expectString(value, path);
}

function expectJsonObject(value: unknown, path: string): JsonObject {
  const object = expectObject(value, path);
  const result: Record<string, JsonValue> = {};

  for (const [key, child] of Object.entries(object)) {
    result[key] = expectJsonValue(child, `${path}.${key}`);
  }

  return result;
}

function expectJsonValue(value: unknown, path: string): JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((child, index) => expectJsonValue(child, `${path}[${index}]`));
  }
  return expectJsonObject(value, path);
}
