import {
  A2UI_V1_MAX_COMPONENTS,
  A2uiParseError,
  validateA2uiV1SurfaceState,
} from "@mcp-native/a2ui";
import type {
  A2uiV1Component,
  A2uiV1SurfaceState,
  A2uiV1SurfaceValidationPolicy,
} from "@mcp-native/a2ui";
import { parseJsonObject, parseJsonValue } from "@mcp-native/core";
import type { JsonObject, JsonValue } from "@mcp-native/core";

import type { NativeElement } from "./index.js";

export const A2UI_V1_NATIVE_COMPONENT_NAMES = Object.freeze([
  "Button",
  "Card",
  "Column",
  "List",
  "Row",
  "Text",
  "TextField",
]) as readonly string[];

/** Maximum expanded native-plan nodes, including repeated component references. */
export const A2UI_V1_NATIVE_MAX_RENDER_NODES = A2UI_V1_MAX_COMPONENTS;

/** Resolved event data retained in a trusted plan until renderer-to-agent dispatch. */
export interface A2uiV1NativeEventDescriptor {
  readonly name: string;
  readonly surfaceId: string;
  readonly sourceComponentId: string;
  readonly userMessage?: string;
  readonly context: JsonObject;
}

export interface A2uiV1NativeRenderPlanOptions {
  /** Host-owned renderer-local data model used for this render pass. */
  readonly dataModel?: JsonObject;
}

interface AdapterContext {
  readonly surface: A2uiV1SurfaceState;
  readonly dataModel: JsonObject;
  readonly visiting: Set<string>;
  renderNodeCount: number;
}

/**
 * Converts a policy-validated A2UI v1 surface into the existing host-owned
 * native render plan. Unsupported renderer semantics fail closed.
 */
export function createA2uiV1NativeRenderPlan(
  surface: A2uiV1SurfaceState,
  policy: A2uiV1SurfaceValidationPolicy,
  options: A2uiV1NativeRenderPlanOptions = {},
): NativeElement {
  const context = createAdapterContext(surface, policy, options.dataModel);
  return adaptComponent("root", "root", context);
}

/** Resolves one validated event against the latest renderer-local data model. */
export function resolveA2uiV1NativeEvent(
  surface: A2uiV1SurfaceState,
  policy: A2uiV1SurfaceValidationPolicy,
  sourceComponentId: string,
  dataModel: JsonObject,
): A2uiV1NativeEventDescriptor {
  if (typeof sourceComponentId !== "string" || sourceComponentId.length === 0) {
    throw new A2uiParseError("Expected a non-empty A2UI source component id");
  }
  const context = createAdapterContext(surface, policy, dataModel);
  const event = findNativeEvent(adaptComponent("root", "root", context), sourceComponentId);
  if (event === undefined) {
    throw new A2uiParseError(
      `A2UI native event source ${JSON.stringify(sourceComponentId)} is not a reachable supported Button`,
    );
  }
  return event;
}

function findNativeEvent(
  element: NativeElement,
  sourceComponentId: string,
): A2uiV1NativeEventDescriptor | undefined {
  const event = element.props.event as A2uiV1NativeEventDescriptor | undefined;
  if (event?.sourceComponentId === sourceComponentId) {
    return event;
  }
  for (const child of element.children ?? []) {
    const nested = findNativeEvent(child, sourceComponentId);
    if (nested !== undefined) {
      return nested;
    }
  }
  return undefined;
}

function createAdapterContext(
  surface: A2uiV1SurfaceState,
  policy: A2uiV1SurfaceValidationPolicy,
  dataModel: JsonObject | undefined,
): AdapterContext {
  const localDataModel =
    dataModel === undefined
      ? parseJsonObject(surface.dataModel, "surface.dataModel")
      : parseJsonObject(dataModel, "options.dataModel");
  const validated = validateA2uiV1SurfaceState(
    dataModel === undefined ? surface : { ...surface, dataModel: localDataModel },
    policy,
  );
  return {
    surface: validated,
    dataModel: parseJsonObject(validated.dataModel, "surface.dataModel"),
    visiting: new Set<string>(),
    renderNodeCount: 0,
  };
}

function adaptComponent(id: string, key: string, context: AdapterContext): NativeElement {
  context.renderNodeCount += 1;
  if (context.renderNodeCount > A2UI_V1_NATIVE_MAX_RENDER_NODES) {
    throw new A2uiParseError(
      `Expanded A2UI native plan exceeds maximum of ${A2UI_V1_NATIVE_MAX_RENDER_NODES} nodes`,
    );
  }
  if (context.visiting.has(id)) {
    throw new A2uiParseError(`A2UI native adapter encountered a cycle at ${JSON.stringify(id)}`);
  }
  const component = context.surface.components.get(id);
  if (component === undefined) {
    throw new A2uiParseError(`A2UI native adapter cannot find component ${JSON.stringify(id)}`);
  }

  context.visiting.add(id);
  try {
    switch (component.component) {
      case "Row":
        return adaptContainer(component, key, "row", undefined, context);
      case "Column":
        return adaptContainer(component, key, "column", undefined, context);
      case "List":
        return adaptList(component, key, context);
      case "Card":
        return adaptCard(component, key, context);
      case "Text":
        return adaptText(component, key, context);
      case "Button":
        return adaptButton(component, key, context);
      case "TextField":
        return adaptTextField(component, key, context);
      default:
        throw new A2uiParseError(
          `A2UI component ${JSON.stringify(id)} uses ${JSON.stringify(component.component)}, which the native adapter does not support`,
        );
    }
  } finally {
    context.visiting.delete(id);
  }
}

function adaptContainer(
  component: A2uiV1Component,
  key: string,
  layout: "column" | "row",
  variant: "list" | undefined,
  context: AdapterContext,
): NativeElement {
  if (!Array.isArray(component.children)) {
    throw new A2uiParseError(
      `A2UI native adapter does not yet support dynamic children at components.${component.id}.children`,
    );
  }
  const props: Record<string, unknown> = { layout };
  if (variant !== undefined) {
    props.variant = variant;
  }
  if (component.justify !== undefined) {
    const justify = expectString(component.justify, `components.${component.id}.justify`);
    if (justify === "stretch") {
      throw new A2uiParseError(
        `A2UI native adapter does not support main-axis stretch at components.${component.id}.justify`,
      );
    }
    props.justify = justify;
  }
  if (component.align !== undefined) {
    props.align = expectString(component.align, `components.${component.id}.align`);
  }
  addCommonProps(component, props, context);
  return {
    key,
    component: "View",
    props,
    children: component.children.map((childId, index) =>
      adaptComponent(childId as string, `${key}/${childId as string}:${index}`, context),
    ),
  };
}

function adaptList(
  component: A2uiV1Component,
  key: string,
  context: AdapterContext,
): NativeElement {
  return adaptContainer(
    component,
    key,
    component.direction === "horizontal" ? "row" : "column",
    "list",
    context,
  );
}

function adaptCard(
  component: A2uiV1Component,
  key: string,
  context: AdapterContext,
): NativeElement {
  const childId = expectString(component.child, `components.${component.id}.child`);
  const props: Record<string, unknown> = { layout: "column", variant: "card" };
  addCommonProps(component, props, context);
  return {
    key,
    component: "View",
    props,
    children: [adaptComponent(childId, `${key}/${childId}:0`, context)],
  };
}

function adaptText(
  component: A2uiV1Component,
  key: string,
  context: AdapterContext,
): NativeElement {
  const props: Record<string, unknown> = {
    children: resolveDynamicString(component.text, `components.${component.id}.text`, context),
  };
  if (component.variant !== undefined) {
    props.variant = component.variant;
  }
  addCommonProps(component, props, context);
  return { key, component: "Text", props };
}

function adaptButton(
  component: A2uiV1Component,
  key: string,
  context: AdapterContext,
): NativeElement {
  rejectUnsupportedChecks(component);
  const childId = expectString(component.child, `components.${component.id}.child`);
  const child = context.surface.components.get(childId);
  if (child?.component !== "Text") {
    throw new A2uiParseError(
      `A2UI native Button ${JSON.stringify(component.id)} requires a Text child`,
    );
  }
  const props: Record<string, unknown> = {
    title: resolveDynamicString(child.text, `components.${child.id}.text`, context),
    event: resolveButtonEvent(component, context),
  };
  if (component.variant !== undefined) {
    props.variant = component.variant;
  }
  addCommonProps(component, props, context);
  if (props.accessibilityLabel === undefined) {
    props.accessibilityLabel = props.title;
  }
  return { key, component: "Button", props };
}

function adaptTextField(
  component: A2uiV1Component,
  key: string,
  context: AdapterContext,
): NativeElement {
  rejectUnsupportedChecks(component);
  const componentPath = `components.${component.id}`;
  const label = resolveDynamicString(component.label, `${componentPath}.label`, context);
  const props: Record<string, unknown> = {
    label,
    placeholder:
      component.placeholder === undefined
        ? label
        : resolveDynamicString(component.placeholder, `${componentPath}.placeholder`, context),
  };
  if (component.value !== undefined) {
    props.value = resolveDynamicString(component.value, `${componentPath}.value`, context);
    if (isBinding(component.value)) {
      props.binding = expectAbsoluteBinding(component.value.path, `${componentPath}.value.path`);
    }
  }
  if (component.variant !== undefined) {
    props.variant = component.variant;
  }
  addCommonProps(component, props, context);
  if (props.accessibilityLabel === undefined) {
    props.accessibilityLabel = label;
  }
  return { key, component: "TextInput", props };
}

function rejectUnsupportedChecks(component: A2uiV1Component): void {
  if (component.checks !== undefined) {
    throw new A2uiParseError(
      `A2UI native adapter does not yet support renderer-side checks at components.${component.id}.checks`,
    );
  }
}

function resolveButtonEvent(
  component: A2uiV1Component,
  context: AdapterContext,
): A2uiV1NativeEventDescriptor {
  const action = expectObject(component.action, `components.${component.id}.action`);
  if (!Object.hasOwn(action, "event")) {
    throw new A2uiParseError(
      `A2UI native Button ${JSON.stringify(component.id)} does not support local function actions`,
    );
  }
  const event = expectObject(action.event, `components.${component.id}.action.event`);
  const eventName = expectString(event.name, `components.${component.id}.action.event.name`);
  const eventContext = expectOptionalObject(
    event.context,
    `components.${component.id}.action.event.context`,
  );
  const resolvedContext: Record<string, JsonValue> = {};
  for (const [name, value] of Object.entries(eventContext ?? {})) {
    defineJsonProperty(
      resolvedContext,
      name,
      resolveDynamicValue(
        value,
        `components.${component.id}.action.event.context.${name}`,
        context,
      ),
    );
  }
  const userMessage =
    event.userMessage === undefined
      ? undefined
      : resolveDynamicString(
          event.userMessage,
          `components.${component.id}.action.event.userMessage`,
          context,
        );
  return {
    name: eventName,
    surfaceId: context.surface.surfaceId,
    sourceComponentId: component.id,
    ...(userMessage === undefined ? {} : { userMessage }),
    context: parseJsonObject(resolvedContext, `components.${component.id}.action.event.context`),
  };
}

function addCommonProps(
  component: A2uiV1Component,
  props: Record<string, unknown>,
  context: AdapterContext,
): void {
  if (component.weight !== undefined) {
    const weight = expectFiniteNumber(component.weight, `components.${component.id}.weight`);
    if (weight < 0) {
      throw new A2uiParseError(
        `A2UI native adapter does not support negative weight at components.${component.id}.weight`,
      );
    }
    props.weight = weight;
  }
  if (component.accessibility === undefined) {
    return;
  }
  const accessibility = expectObject(
    component.accessibility,
    `components.${component.id}.accessibility`,
  );
  if (accessibility.label !== undefined) {
    props.accessibilityLabel = resolveDynamicString(
      accessibility.label,
      `components.${component.id}.accessibility.label`,
      context,
    );
  }
  if (accessibility.description !== undefined) {
    props.accessibilityHint = resolveDynamicString(
      accessibility.description,
      `components.${component.id}.accessibility.description`,
      context,
    );
  }
  if (accessibility.live !== undefined) {
    props.accessibilityLive = accessibility.live;
  }
  if (accessibility.hidden !== undefined) {
    props.accessibilityHidden = resolveDynamicBoolean(
      accessibility.hidden,
      `components.${component.id}.accessibility.hidden`,
      context,
    );
  }
}

function resolveDynamicString(
  value: JsonValue | undefined,
  path: string,
  context: AdapterContext,
): string {
  const resolved = resolveDynamicValue(value, path, context);
  return expectString(resolved, path);
}

function resolveDynamicBoolean(
  value: JsonValue | undefined,
  path: string,
  context: AdapterContext,
): boolean {
  const resolved = resolveDynamicValue(value, path, context);
  if (typeof resolved !== "boolean") {
    throw new A2uiParseError(`Expected a boolean at ${path}`);
  }
  return resolved;
}

function resolveDynamicValue(
  value: JsonValue | undefined,
  path: string,
  context: AdapterContext,
): JsonValue {
  if (value === undefined) {
    throw new A2uiParseError(`Missing dynamic value at ${path}`);
  }
  if (isFunctionCall(value)) {
    throw new A2uiParseError(
      `A2UI native adapter does not execute function ${JSON.stringify(value.call)} at ${path}`,
    );
  }
  if (isBinding(value)) {
    const pointer = expectAbsoluteBinding(value.path, `${path}.path`);
    return parseJsonValue(resolveJsonPointer(context.dataModel, pointer, path), path);
  }
  return parseJsonValue(value, path);
}

function resolveJsonPointer(document: JsonObject, pointer: string, path: string): JsonValue {
  if (pointer === "") {
    return document;
  }
  let cursor: JsonValue = document;
  for (const encodedToken of pointer.slice(1).split("/")) {
    const token = decodePointerToken(encodedToken, pointer);
    if (Array.isArray(cursor)) {
      if (!/^(0|[1-9][0-9]*)$/.test(token)) {
        throw new A2uiParseError(
          `Invalid array binding index in ${JSON.stringify(pointer)} at ${path}`,
        );
      }
      const index = Number(token);
      if (!Number.isSafeInteger(index) || index >= cursor.length) {
        throw new A2uiParseError(`A2UI binding ${JSON.stringify(pointer)} is missing at ${path}`);
      }
      cursor = cursor[index]!;
      continue;
    }
    if (cursor === null || typeof cursor !== "object" || !Object.hasOwn(cursor, token)) {
      throw new A2uiParseError(`A2UI binding ${JSON.stringify(pointer)} is missing at ${path}`);
    }
    cursor = (cursor as Record<string, JsonValue>)[token]!;
  }
  return cursor;
}

function expectAbsoluteBinding(value: JsonValue, path: string): string {
  const pointer = expectString(value, path);
  if (pointer !== "" && !pointer.startsWith("/")) {
    throw new A2uiParseError(
      `A2UI native adapter requires an absolute binding at ${path}; dynamic templates are not supported`,
    );
  }
  return pointer;
}

function decodePointerToken(token: string, pointer: string): string {
  for (let index = 0; index < token.length; index += 1) {
    if (token[index] !== "~") {
      continue;
    }
    const escaped = token[index + 1];
    if (escaped !== "0" && escaped !== "1") {
      throw new A2uiParseError(`Invalid JSON Pointer escape in ${JSON.stringify(pointer)}`);
    }
    index += 1;
  }
  return token.replaceAll("~1", "/").replaceAll("~0", "~");
}

function isBinding(value: JsonValue): value is JsonObject & { readonly path: string } {
  return (
    value !== null &&
    !Array.isArray(value) &&
    typeof value === "object" &&
    Object.hasOwn(value, "path")
  );
}

function isFunctionCall(value: JsonValue): value is JsonObject & { readonly call: string } {
  return (
    value !== null &&
    !Array.isArray(value) &&
    typeof value === "object" &&
    Object.hasOwn(value, "call")
  );
}

function expectObject(value: JsonValue | undefined, path: string): JsonObject {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    throw new A2uiParseError(`Expected an object at ${path}`);
  }
  return value as JsonObject;
}

function expectOptionalObject(value: JsonValue | undefined, path: string): JsonObject | undefined {
  return value === undefined ? undefined : expectObject(value, path);
}

function expectString(value: JsonValue | undefined, path: string): string {
  if (typeof value !== "string") {
    throw new A2uiParseError(`Expected a string at ${path}`);
  }
  return value;
}

function expectFiniteNumber(value: JsonValue, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new A2uiParseError(`Expected a finite number at ${path}`);
  }
  return value;
}

function defineJsonProperty(
  object: Record<string, JsonValue>,
  key: string,
  value: JsonValue,
): void {
  Object.defineProperty(object, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}
