import {
  A2UI_V1_MAX_COMPONENTS,
  A2UI_V1_MAX_SOURCE_LENGTH,
  A2uiParseError,
  evaluateA2uiV1FormatString,
  validateA2uiV1SurfaceState,
} from "@mcp-native/a2ui";
import type {
  A2uiV1Component,
  A2uiV1SurfaceState,
  A2uiV1SurfaceValidationPolicy,
} from "@mcp-native/a2ui";
import {
  JSON_MAX_STRING_LENGTH,
  JSON_MAX_VALUES,
  parseJsonObject,
  parseJsonValue,
} from "@mcp-native/core";
import type { JsonObject, JsonValue } from "@mcp-native/core";

import { ISO_4217_CURRENCY_CODES } from "./iso-4217.js";
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
  /** Identifies one expanded template instance without changing the wire component ID. */
  readonly instanceKey?: string;
  readonly userMessage?: string;
  readonly context: JsonObject;
}

export interface A2uiV1NativeRenderPlanOptions {
  /** Host-owned renderer-local data model used for this render pass. */
  readonly dataModel?: JsonObject;
  /** Host-owned BCP 47 locale for renderer-side localization. Defaults to the runtime locale. */
  readonly locale?: string;
}

export interface A2uiV1NativeEventResolutionOptions {
  /** Required when one template component expands into multiple reachable event sources. */
  readonly instanceKey?: string;
  /** Must match the locale used to render localized event values. */
  readonly locale?: string;
}

interface BindingScope {
  readonly value: JsonValue;
  readonly pointer: string;
  readonly index: number;
}

interface AdapterContext {
  readonly surface: A2uiV1SurfaceState;
  readonly dataModel: JsonObject;
  readonly locale: string | undefined;
  readonly numberFormats: Map<string, Intl.NumberFormat>;
  readonly visiting: Set<string>;
  formatStringExpressionCount: number;
  formattedStringLength: number;
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
  const parsedOptions = parseRenderPlanOptions(options);
  const context = createAdapterContext(
    surface,
    policy,
    parsedOptions.dataModel,
    parsedOptions.locale,
  );
  return adaptComponent("root", "root", context, undefined);
}

/** Resolves one validated event against the latest renderer-local data model. */
export function resolveA2uiV1NativeEvent(
  surface: A2uiV1SurfaceState,
  policy: A2uiV1SurfaceValidationPolicy,
  sourceComponentId: string,
  dataModel: JsonObject,
  options: A2uiV1NativeEventResolutionOptions = {},
): A2uiV1NativeEventDescriptor {
  if (typeof sourceComponentId !== "string" || sourceComponentId.length === 0) {
    throw new A2uiParseError("Expected a non-empty A2UI source component id");
  }
  const parsedOptions = parseEventResolutionOptions(options);
  const context = createAdapterContext(surface, policy, dataModel, parsedOptions.locale);
  const events = findNativeEvents(
    adaptComponent("root", "root", context, undefined),
    sourceComponentId,
    parsedOptions.instanceKey,
  );
  if (events.length === 0) {
    throw new A2uiParseError(
      `A2UI native event source ${JSON.stringify(sourceComponentId)} is not a reachable supported Button`,
    );
  }
  if (events.length > 1) {
    throw new A2uiParseError(
      `A2UI native event source ${JSON.stringify(sourceComponentId)} is ambiguous without its template instance key`,
    );
  }
  return events[0]!;
}

function findNativeEvents(
  element: NativeElement,
  sourceComponentId: string,
  instanceKey: string | undefined,
): readonly A2uiV1NativeEventDescriptor[] {
  const events: A2uiV1NativeEventDescriptor[] = [];
  const event = element.props.event as A2uiV1NativeEventDescriptor | undefined;
  if (
    event?.sourceComponentId === sourceComponentId &&
    (instanceKey === undefined || event.instanceKey === instanceKey)
  ) {
    events.push(event);
  }
  for (const child of element.children ?? []) {
    events.push(...findNativeEvents(child, sourceComponentId, instanceKey));
  }
  return events;
}

function createAdapterContext(
  surface: A2uiV1SurfaceState,
  policy: A2uiV1SurfaceValidationPolicy,
  dataModel: JsonObject | undefined,
  locale: string | undefined,
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
    locale,
    numberFormats: new Map<string, Intl.NumberFormat>(),
    visiting: new Set<string>(),
    formatStringExpressionCount: 0,
    formattedStringLength: 0,
    renderNodeCount: 0,
  };
}

function parseRenderPlanOptions(options: unknown): A2uiV1NativeRenderPlanOptions {
  const parsed = parseOptionsObject(options, "A2UI native render plan options", [
    "dataModel",
    "locale",
  ]);
  return {
    ...(parsed.dataModel === undefined
      ? {}
      : { dataModel: parseJsonObject(parsed.dataModel, "options.dataModel") }),
    ...(parsed.locale === undefined
      ? {}
      : { locale: parseLocale(parsed.locale, "options.locale") }),
  };
}

function parseEventResolutionOptions(options: unknown): A2uiV1NativeEventResolutionOptions {
  const parsed = parseOptionsObject(options, "A2UI native event resolution options", [
    "instanceKey",
    "locale",
  ]);
  if (
    parsed.instanceKey !== undefined &&
    (typeof parsed.instanceKey !== "string" || parsed.instanceKey.length === 0)
  ) {
    throw new A2uiParseError("Expected a non-empty A2UI native event instance key");
  }
  return {
    ...(parsed.instanceKey === undefined ? {} : { instanceKey: parsed.instanceKey }),
    ...(parsed.locale === undefined
      ? {}
      : { locale: parseLocale(parsed.locale, "options.locale") }),
  };
}

function parseOptionsObject(
  value: unknown,
  label: string,
  allowedKeys: readonly string[],
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new A2uiParseError(`Expected ${label} to be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new A2uiParseError(`Expected plain ${label}`);
  }
  const parsed = value as Record<string, unknown>;
  const unknownKey = Object.keys(parsed).find((key) => !allowedKeys.includes(key));
  if (unknownKey !== undefined) {
    throw new A2uiParseError(`Unexpected ${label.slice(0, -1)} ${JSON.stringify(unknownKey)}`);
  }
  return parsed;
}

function parseLocale(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) {
    throw new A2uiParseError(`Expected a non-empty BCP 47 locale at ${path}`);
  }
  try {
    if (Intl.NumberFormat.supportedLocalesOf(value, { localeMatcher: "lookup" }).length === 0) {
      throw new A2uiParseError(`Unsupported BCP 47 locale ${JSON.stringify(value)} at ${path}`);
    }
    return new Intl.NumberFormat(value).resolvedOptions().locale;
  } catch (cause) {
    if (cause instanceof A2uiParseError) {
      throw cause;
    }
    throw new A2uiParseError(`Invalid BCP 47 locale ${JSON.stringify(value)} at ${path}`, {
      cause,
    });
  }
}

function adaptComponent(
  id: string,
  key: string,
  context: AdapterContext,
  scope: BindingScope | undefined,
): NativeElement {
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
        return adaptContainer(component, key, "row", undefined, context, scope);
      case "Column":
        return adaptContainer(component, key, "column", undefined, context, scope);
      case "List":
        return adaptList(component, key, context, scope);
      case "Card":
        return adaptCard(component, key, context, scope);
      case "Text":
        return adaptText(component, key, context, scope);
      case "Button":
        return adaptButton(component, key, context, scope);
      case "TextField":
        return adaptTextField(component, key, context, scope);
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
  scope: BindingScope | undefined,
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
  addContainerLayoutProps(component, props);
  addCommonProps(component, props, context, scope);
  return {
    key,
    component: "View",
    props,
    children: component.children.map((childId, index) =>
      adaptComponent(
        childId as string,
        appendInstanceKey(key, childId as string, index),
        context,
        scope,
      ),
    ),
  };
}

function addContainerLayoutProps(component: A2uiV1Component, props: Record<string, unknown>): void {
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
}

function adaptList(
  component: A2uiV1Component,
  key: string,
  context: AdapterContext,
  scope: BindingScope | undefined,
): NativeElement {
  if (Array.isArray(component.children)) {
    return adaptContainer(
      component,
      key,
      component.direction === "horizontal" ? "row" : "column",
      "list",
      context,
      scope,
    );
  }

  const template = expectObject(component.children, `components.${component.id}.children`);
  const pointer = expectAbsoluteBinding(template.path, `components.${component.id}.children.path`);
  const componentId = expectString(
    template.componentId,
    `components.${component.id}.children.componentId`,
  );
  const value = parseJsonValue(
    resolveJsonPointer(context.dataModel, pointer, `components.${component.id}.children`),
    `components.${component.id}.children`,
  );
  if (!Array.isArray(value)) {
    throw new A2uiParseError(
      `Expected an array at components.${component.id}.children path ${JSON.stringify(pointer)}`,
    );
  }
  const props: Record<string, unknown> = {
    layout: component.direction === "horizontal" ? "row" : "column",
    variant: "list",
  };
  addContainerLayoutProps(component, props);
  addCommonProps(component, props, context, scope);
  return {
    key,
    component: "View",
    props,
    children: value.map((item, index) =>
      adaptComponent(componentId, appendInstanceKey(key, componentId, index), context, {
        value: item,
        pointer: appendPointerToken(pointer, String(index)),
        index,
      }),
    ),
  };
}

function adaptCard(
  component: A2uiV1Component,
  key: string,
  context: AdapterContext,
  scope: BindingScope | undefined,
): NativeElement {
  const childId = expectString(component.child, `components.${component.id}.child`);
  const props: Record<string, unknown> = { layout: "column", variant: "card" };
  addCommonProps(component, props, context, scope);
  return {
    key,
    component: "View",
    props,
    children: [adaptComponent(childId, appendInstanceKey(key, childId, 0), context, scope)],
  };
}

function adaptText(
  component: A2uiV1Component,
  key: string,
  context: AdapterContext,
  scope: BindingScope | undefined,
): NativeElement {
  const props: Record<string, unknown> = {
    children: resolveDynamicString(
      component.text,
      `components.${component.id}.text`,
      context,
      scope,
    ),
  };
  if (component.variant !== undefined) {
    props.variant = component.variant;
  }
  addCommonProps(component, props, context, scope);
  return { key, component: "Text", props };
}

function adaptButton(
  component: A2uiV1Component,
  key: string,
  context: AdapterContext,
  scope: BindingScope | undefined,
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
    title: resolveDynamicString(child.text, `components.${child.id}.text`, context, scope),
    event: resolveButtonEvent(component, key, context, scope),
  };
  if (component.variant !== undefined) {
    props.variant = component.variant;
  }
  addCommonProps(component, props, context, scope);
  if (props.accessibilityLabel === undefined) {
    props.accessibilityLabel = props.title;
  }
  return { key, component: "Button", props };
}

function adaptTextField(
  component: A2uiV1Component,
  key: string,
  context: AdapterContext,
  scope: BindingScope | undefined,
): NativeElement {
  rejectUnsupportedChecks(component);
  const componentPath = `components.${component.id}`;
  const label = resolveDynamicString(component.label, `${componentPath}.label`, context, scope);
  const props: Record<string, unknown> = {
    label,
    placeholder:
      component.placeholder === undefined
        ? label
        : resolveDynamicString(
            component.placeholder,
            `${componentPath}.placeholder`,
            context,
            scope,
          ),
  };
  if (component.value !== undefined) {
    props.value = resolveDynamicString(component.value, `${componentPath}.value`, context, scope);
    if (isBinding(component.value)) {
      props.binding = resolveBindingPointer(
        component.value.path,
        `${componentPath}.value.path`,
        scope,
      );
    }
  }
  if (component.variant !== undefined) {
    props.variant = component.variant;
  }
  addCommonProps(component, props, context, scope);
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
  key: string,
  context: AdapterContext,
  scope: BindingScope | undefined,
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
        scope,
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
          scope,
        );
  return {
    name: eventName,
    surfaceId: context.surface.surfaceId,
    sourceComponentId: component.id,
    instanceKey: key,
    ...(userMessage === undefined ? {} : { userMessage }),
    context: parseJsonObject(resolvedContext, `components.${component.id}.action.event.context`),
  };
}

function addCommonProps(
  component: A2uiV1Component,
  props: Record<string, unknown>,
  context: AdapterContext,
  scope: BindingScope | undefined,
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
      scope,
    );
  }
  if (accessibility.description !== undefined) {
    props.accessibilityHint = resolveDynamicString(
      accessibility.description,
      `components.${component.id}.accessibility.description`,
      context,
      scope,
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
      scope,
    );
  }
}

function resolveDynamicString(
  value: JsonValue | undefined,
  path: string,
  context: AdapterContext,
  scope: BindingScope | undefined,
): string {
  const resolved = resolveDynamicValue(value, path, context, scope);
  return expectString(resolved, path);
}

function resolveDynamicBoolean(
  value: JsonValue | undefined,
  path: string,
  context: AdapterContext,
  scope: BindingScope | undefined,
): boolean {
  const resolved = resolveDynamicValue(value, path, context, scope);
  if (typeof resolved !== "boolean") {
    throw new A2uiParseError(`Expected a boolean at ${path}`);
  }
  return resolved;
}

function resolveDynamicValue(
  value: JsonValue | undefined,
  path: string,
  context: AdapterContext,
  scope: BindingScope | undefined,
): JsonValue {
  if (value === undefined) {
    throw new A2uiParseError(`Missing dynamic value at ${path}`);
  }
  if (isFunctionCall(value)) {
    if (value.call === "@index") {
      if (scope === undefined) {
        throw new A2uiParseError(
          `A2UI native adapter cannot evaluate @index outside a template at ${path}`,
        );
      }
      const args = value.args === undefined ? undefined : expectObject(value.args, `${path}.args`);
      const offset =
        args?.offset === undefined
          ? 0
          : resolveDynamicNumber(args.offset, `${path}.args.offset`, context, scope);
      return scope.index + offset;
    }
    if (value.call === "formatNumber" || value.call === "formatCurrency") {
      return resolveNumberFormat(value, path, context, scope);
    }
    if (value.call === "formatString") {
      const args = expectObject(value.args, `${path}.args`);
      const source = expectString(args.value, `${path}.args.value`);
      const result = evaluateA2uiV1FormatString(
        source,
        (expression, index) => {
          return resolveDynamicValue(
            expression,
            `${path}.args.value.interpolations[${index}]`,
            context,
            scope,
          );
        },
        `${path}.args.value`,
        (expressionCount) => {
          context.formatStringExpressionCount += expressionCount;
          if (context.formatStringExpressionCount > JSON_MAX_VALUES) {
            throw new A2uiParseError(
              `Expanded A2UI native plan exceeds maximum of ${JSON_MAX_VALUES} formatString expressions`,
            );
          }
        },
      );
      return recordFormattedString(result, path, context);
    }
    throw new A2uiParseError(
      `A2UI native adapter does not execute function ${JSON.stringify(value.call)} at ${path}`,
    );
  }
  if (isBinding(value)) {
    const pointer = expectString(value.path, `${path}.path`);
    if (pointer.startsWith("/") || scope === undefined) {
      const absolutePointer = expectAbsoluteBinding(pointer, `${path}.path`);
      return parseJsonValue(resolveJsonPointer(context.dataModel, absolutePointer, path), path);
    }
    return parseJsonValue(resolveRelativePointer(scope.value, pointer, path), path);
  }
  return parseJsonValue(value, path);
}

function resolveDynamicNumber(
  value: JsonValue | undefined,
  path: string,
  context: AdapterContext,
  scope: BindingScope | undefined,
): number {
  const resolved = resolveDynamicValue(value, path, context, scope);
  if (typeof resolved !== "number" || !Number.isFinite(resolved)) {
    throw new A2uiParseError(`Expected a finite number at ${path}`);
  }
  return resolved;
}

function resolveNumberFormat(
  call: JsonObject & { readonly call: string },
  path: string,
  context: AdapterContext,
  scope: BindingScope | undefined,
): string {
  const args = expectObject(call.args, `${path}.args`);
  const value = resolveDynamicNumber(args.value, `${path}.args.value`, context, scope);
  const decimals =
    args.decimals === undefined
      ? undefined
      : parseDecimalPlaces(
          resolveDynamicNumber(args.decimals, `${path}.args.decimals`, context, scope),
          `${path}.args.decimals`,
        );
  const grouping =
    args.grouping === undefined
      ? true
      : resolveDynamicBoolean(args.grouping, `${path}.args.grouping`, context, scope);
  const currency =
    call.call === "formatCurrency"
      ? parseCurrencyCode(
          resolveDynamicString(args.currency, `${path}.args.currency`, context, scope),
          `${path}.args.currency`,
        )
      : undefined;
  const formatter = getNumberFormat(context, decimals, grouping, currency, path);
  try {
    return recordFormattedString(formatter.format(value), path, context);
  } catch (cause) {
    throw new A2uiParseError(
      `A2UI native adapter could not execute ${JSON.stringify(call.call)} at ${path}`,
      { cause },
    );
  }
}

function parseDecimalPlaces(value: number, path: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 100) {
    throw new A2uiParseError(`Expected decimal places from 0 through 100 at ${path}`);
  }
  return value;
}

function parseCurrencyCode(value: string, path: string): string {
  const currency = value.toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency) || !ISO_4217_CURRENCY_CODES.has(currency)) {
    throw new A2uiParseError(`Expected a current ISO 4217 currency code at ${path}`);
  }
  return currency;
}

function getNumberFormat(
  context: AdapterContext,
  decimals: number | undefined,
  grouping: boolean,
  currency: string | undefined,
  path: string,
): Intl.NumberFormat {
  const key = JSON.stringify([
    context.locale ?? null,
    currency ?? null,
    decimals ?? null,
    grouping,
  ]);
  const cached = context.numberFormats.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const options: Intl.NumberFormatOptions = {
    useGrouping: grouping,
    ...(currency === undefined ? {} : { style: "currency", currency }),
    ...(decimals === undefined
      ? {}
      : { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
  };
  try {
    const formatter = new Intl.NumberFormat(context.locale, options);
    context.numberFormats.set(key, formatter);
    return formatter;
  } catch (cause) {
    throw new A2uiParseError(`Invalid number-format options at ${path}`, { cause });
  }
}

function recordFormattedString(value: string, path: string, context: AdapterContext): string {
  if (value.length > JSON_MAX_STRING_LENGTH) {
    throw new A2uiParseError(
      `A2UI formatted output at ${path} exceeds maximum length of ${JSON_MAX_STRING_LENGTH}`,
    );
  }
  context.formattedStringLength += value.length;
  if (context.formattedStringLength > A2UI_V1_MAX_SOURCE_LENGTH) {
    throw new A2uiParseError(
      `Expanded A2UI native plan exceeds maximum formatted-string length of ${A2UI_V1_MAX_SOURCE_LENGTH}`,
    );
  }
  return value;
}

function resolveJsonPointer(document: JsonValue, pointer: string, path: string): JsonValue {
  if (pointer === "") {
    return document;
  }
  return resolvePointerTokens(document, pointer.slice(1).split("/"), pointer, path);
}

function resolveRelativePointer(document: JsonValue, pointer: string, path: string): JsonValue {
  if (pointer === "") {
    return document;
  }
  return resolvePointerTokens(document, pointer.split("/"), pointer, path);
}

function resolvePointerTokens(
  document: JsonValue,
  encodedTokens: readonly string[],
  pointer: string,
  path: string,
): JsonValue {
  let cursor: JsonValue = document;
  for (const encodedToken of encodedTokens) {
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

function resolveBindingPointer(
  value: JsonValue,
  path: string,
  scope: BindingScope | undefined,
): string {
  const pointer = expectString(value, path);
  if (pointer.startsWith("/") || scope === undefined) {
    return expectAbsoluteBinding(pointer, path);
  }
  return pointer === "" ? scope.pointer : `${scope.pointer}/${pointer}`;
}

function appendPointerToken(pointer: string, encodedToken: string): string {
  return `${pointer}/${encodedToken}`;
}

function appendInstanceKey(parentKey: string, componentId: string, index: number): string {
  // Component IDs are arbitrary strings. Escape every key delimiter, including the escape marker,
  // so distinct component paths cannot collapse to the same renderer-only dispatch identity.
  const encodedId = componentId
    .replaceAll("%", "%25")
    .replaceAll("/", "%2F")
    .replaceAll(":", "%3A");
  return `${parentKey}/${encodedId}:${index}`;
}

function expectAbsoluteBinding(value: JsonValue | undefined, path: string): string {
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
