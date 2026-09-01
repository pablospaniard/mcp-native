import {
  A2UI_V1_MAX_COMPONENTS,
  A2UI_V1_MAX_SOURCE_LENGTH,
  A2uiParseError,
  evaluateA2uiV1FormatString,
  validateA2uiV1HostExtensionComponent,
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
import { A2UI_V1_NATIVE_ICON_NAMES } from "./component-adapters.js";
import type {
  NativeHostExtensionCapabilityGrant,
  NativeImageResourcePolicy,
  NativeMediaResourcePolicy,
} from "./component-adapters.js";
import type { NativeElement } from "./index.js";

export const A2UI_V1_NATIVE_COMPONENT_NAMES = Object.freeze([
  "AudioPlayer",
  "Button",
  "Card",
  "CheckBox",
  "ChoicePicker",
  "Column",
  "DateTimeInput",
  "Divider",
  "Icon",
  "Image",
  "List",
  "Modal",
  "Row",
  "Slider",
  "Tabs",
  "Text",
  "TextField",
  "Video",
]) as readonly string[];

/** Maximum expanded native-plan nodes, including repeated component references. */
export const A2UI_V1_NATIVE_MAX_RENDER_NODES = A2UI_V1_MAX_COMPONENTS;

/** Maximum canonical HTTP(S) URL retained for one supported local action. */
export const A2UI_V1_NATIVE_MAX_OPEN_URL_LENGTH = 8_192;

/** Maximum canonical HTTP(S) image URL retained for one image component. */
export const A2UI_V1_NATIVE_MAX_IMAGE_URL_LENGTH = 8_192;

/** Maximum choice options expanded into trusted host props in one render pass. */
export const A2UI_V1_NATIVE_MAX_CHOICE_OPTIONS = 1_024;
export const A2UI_V1_NATIVE_MAX_IMAGE_REDIRECT_ORIGINS = 64;
export const A2UI_V1_NATIVE_MAX_IMAGE_BYTES = 104_857_600;
export const A2UI_V1_NATIVE_MAX_IMAGE_DIMENSION = 16_384;
export const A2UI_V1_NATIVE_MAX_IMAGE_PIXELS = 268_435_456;
export const A2UI_V1_NATIVE_MAX_IMAGE_REDIRECTS = 10;
/** Maximum reachable Image instances in one expanded surface. Checked before host policy calls. */
export const A2UI_V1_NATIVE_MAX_IMAGES = 64;
/** Maximum sum of host-granted transfer bytes across one expanded render plan. */
export const A2UI_V1_NATIVE_MAX_TOTAL_IMAGE_BYTES = A2UI_V1_NATIVE_MAX_IMAGE_BYTES;
/** Maximum sum of host-granted decoded pixels across one expanded render plan. */
export const A2UI_V1_NATIVE_MAX_TOTAL_IMAGE_PIXELS = A2UI_V1_NATIVE_MAX_IMAGE_PIXELS;
export const A2UI_V1_NATIVE_MAX_MEDIA = 16;
export const A2UI_V1_NATIVE_MAX_MEDIA_URL_LENGTH = 8_192;
export const A2UI_V1_NATIVE_MAX_MEDIA_MIME_TYPES = 32;
export const A2UI_V1_NATIVE_MAX_MEDIA_REDIRECT_ORIGINS = 64;
export const A2UI_V1_NATIVE_MAX_MEDIA_REDIRECTS = 10;
export const A2UI_V1_NATIVE_MAX_MEDIA_BYTES = 2_147_483_648;
export const A2UI_V1_NATIVE_MAX_TOTAL_MEDIA_BYTES = 2_147_483_648;

export interface A2uiV1NativeImageRequest {
  readonly url: string;
  readonly surfaceId: string;
  readonly sourceComponentId: string;
  readonly instanceKey: string;
}

export type A2uiV1NativeImageGrant = NativeImageResourcePolicy;

/** Synchronous host authorization for one canonical image URL during plan construction. */
export type A2uiV1NativeImagePolicy = (
  request: A2uiV1NativeImageRequest,
) => A2uiV1NativeImageGrant | false;

export type A2uiV1NativeMediaKind = "audio" | "video";

export interface A2uiV1NativeMediaRequest {
  readonly kind: A2uiV1NativeMediaKind;
  readonly url: string;
  readonly sourceOrigin: string;
  readonly surfaceId: string;
  readonly sourceComponentId: string;
  readonly instanceKey: string;
}

export type A2uiV1NativeMediaGrant = NativeMediaResourcePolicy;
export type A2uiV1NativeMediaPolicy = (
  request: A2uiV1NativeMediaRequest,
) => A2uiV1NativeMediaGrant | false;

export interface A2uiV1NativeHostExtensionRequest {
  readonly extensionId: string;
  readonly catalogId: string;
  readonly schemaVersion: string;
  readonly componentName: string;
  readonly surfaceId: string;
  readonly sourceComponentId: string;
  readonly instanceKey: string;
  readonly platform: "android" | "ios";
  readonly semanticProps: JsonObject;
  readonly permissionNeeds: readonly string[];
  readonly resourceNeeds: readonly string[];
}

export type A2uiV1NativeHostExtensionPolicy = (
  request: A2uiV1NativeHostExtensionRequest,
) => NativeHostExtensionCapabilityGrant | false;

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

/** A validated local URL action that can only be executed by a host press handler. */
export interface A2uiV1NativeOpenUrlDescriptor {
  readonly url: string;
  readonly surfaceId: string;
  readonly sourceComponentId: string;
  /** Identifies one expanded template instance without changing the wire component ID. */
  readonly instanceKey?: string;
}

export interface A2uiV1NativeRenderPlanOptions {
  /** Host-owned renderer-local data model used for this render pass. */
  readonly dataModel?: JsonObject;
  /** Host-owned BCP 47 locale for renderer-side localization. Defaults to the runtime locale. */
  readonly locale?: string;
  /** Required when the reachable surface contains an Image component. */
  readonly imagePolicy?: A2uiV1NativeImagePolicy;
  /** Required when the reachable surface contains Video or AudioPlayer. */
  readonly mediaPolicy?: A2uiV1NativeMediaPolicy;
  /** Required when the reachable surface contains a negotiated host extension. */
  readonly hostExtensionPolicy?: A2uiV1NativeHostExtensionPolicy;
}

export interface A2uiV1NativeEventResolutionOptions {
  /** Required when one template component expands into multiple reachable event sources. */
  readonly instanceKey?: string;
  /** Must match the locale used to render localized event values. */
  readonly locale?: string;
}

export interface A2uiV1NativeOpenUrlResolutionOptions {
  /** Required when one template component expands into multiple reachable URL sources. */
  readonly instanceKey?: string;
  /** Must match the locale used to resolve any localized URL value. */
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
  readonly dateFormats: Map<string, Intl.DateTimeFormat>;
  readonly numberFormats: Map<string, Intl.NumberFormat>;
  readonly pluralRules: Map<string, Intl.PluralRules>;
  readonly visiting: Set<string>;
  readonly tolerateInvalidLocalOpenUrls: boolean;
  readonly imagePolicy: A2uiV1NativeImagePolicy | undefined;
  readonly mediaPolicy: A2uiV1NativeMediaPolicy | undefined;
  readonly hostExtensionPolicy: A2uiV1NativeHostExtensionPolicy | undefined;
  readonly hostExtensions: A2uiV1SurfaceValidationPolicy["hostExtensions"];
  readonly authorizeResources: boolean;
  choiceOptionCount: number;
  choiceOptionOutputLength: number;
  formatStringExpressionCount: number;
  formattedStringLength: number;
  openUrlLength: number;
  imageUrlLength: number;
  imageCount: number;
  imageMaximumBytes: number;
  imageMaximumDecodedPixels: number;
  imageRedirectOriginCount: number;
  imageResourcePolicyOutputLength: number;
  mediaCount: number;
  mediaUrlLength: number;
  mediaMaximumBytes: number;
  mediaMimeTypeCount: number;
  mediaRedirectOriginCount: number;
  mediaPolicyOutputLength: number;
  hostExtensionCounts: Map<string, number>;
  renderNodeCount: number;
  validationCheckCount: number;
  validationOutputLength: number;
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
  return createNativeRenderPlan(surface, policy, options, false);
}

/** Internal mounted-surface path that keeps temporary renderer-local URL edits non-dispatchable. */
export function createA2uiV1NativeRenderPlanForLocalEdits(
  surface: A2uiV1SurfaceState,
  policy: A2uiV1SurfaceValidationPolicy,
  options: A2uiV1NativeRenderPlanOptions = {},
): NativeElement {
  return createNativeRenderPlan(surface, policy, options, true);
}

function createNativeRenderPlan(
  surface: A2uiV1SurfaceState,
  policy: A2uiV1SurfaceValidationPolicy,
  options: A2uiV1NativeRenderPlanOptions,
  tolerateInvalidLocalOpenUrls: boolean,
): NativeElement {
  const parsedOptions = parseRenderPlanOptions(options);
  const context = createAdapterContext(
    surface,
    policy,
    parsedOptions.dataModel,
    parsedOptions.locale,
    tolerateInvalidLocalOpenUrls,
    parsedOptions.imagePolicy,
    parsedOptions.mediaPolicy,
    parsedOptions.hostExtensionPolicy,
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
  const context = createAdapterContext(
    surface,
    policy,
    dataModel,
    parsedOptions.locale,
    false,
    undefined,
    undefined,
    undefined,
    false,
  );
  const plan = adaptComponent("root", "root", context, undefined);
  const events = findNativeEvents(plan, sourceComponentId, parsedOptions.instanceKey);
  if (events.length === 0) {
    const disabledEvents = findNativeEvents(
      plan,
      sourceComponentId,
      parsedOptions.instanceKey,
      true,
    );
    if (disabledEvents.length > 0) {
      throw new A2uiParseError(
        `A2UI native event source ${JSON.stringify(sourceComponentId)} is disabled by failed renderer checks`,
      );
    }
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

/** Resolves one supported local URL action against the latest renderer-local data model. */
export function resolveA2uiV1NativeOpenUrl(
  surface: A2uiV1SurfaceState,
  policy: A2uiV1SurfaceValidationPolicy,
  sourceComponentId: string,
  dataModel: JsonObject,
  options: A2uiV1NativeOpenUrlResolutionOptions = {},
): A2uiV1NativeOpenUrlDescriptor {
  if (typeof sourceComponentId !== "string" || sourceComponentId.length === 0) {
    throw new A2uiParseError("Expected a non-empty A2UI openUrl source component id");
  }
  const parsedOptions = parseOpenUrlResolutionOptions(options);
  const context = createAdapterContext(
    surface,
    policy,
    dataModel,
    parsedOptions.locale,
    false,
    undefined,
    undefined,
    undefined,
    false,
  );
  const plan = adaptComponent("root", "root", context, undefined);
  const openUrls = findNativeOpenUrls(plan, sourceComponentId, parsedOptions.instanceKey);
  if (openUrls.length === 0) {
    const disabledOpenUrls = findNativeOpenUrls(
      plan,
      sourceComponentId,
      parsedOptions.instanceKey,
      true,
    );
    if (disabledOpenUrls.length > 0) {
      throw new A2uiParseError(
        `A2UI native openUrl source ${JSON.stringify(sourceComponentId)} is disabled by failed renderer checks`,
      );
    }
    throw new A2uiParseError(
      `A2UI native openUrl source ${JSON.stringify(sourceComponentId)} is not a reachable supported Button`,
    );
  }
  if (openUrls.length > 1) {
    throw new A2uiParseError(
      `A2UI native openUrl source ${JSON.stringify(sourceComponentId)} is ambiguous without its template instance key`,
    );
  }
  return openUrls[0]!;
}

function findNativeEvents(
  element: NativeElement,
  sourceComponentId: string,
  instanceKey: string | undefined,
  includeDisabled = false,
): readonly A2uiV1NativeEventDescriptor[] {
  const events: A2uiV1NativeEventDescriptor[] = [];
  const event = element.props.event as A2uiV1NativeEventDescriptor | undefined;
  if (
    event?.sourceComponentId === sourceComponentId &&
    (includeDisabled || element.props.disabled !== true) &&
    (instanceKey === undefined || event.instanceKey === instanceKey)
  ) {
    events.push(event);
  }
  for (const child of element.children ?? []) {
    events.push(...findNativeEvents(child, sourceComponentId, instanceKey, includeDisabled));
  }
  return events;
}

function findNativeOpenUrls(
  element: NativeElement,
  sourceComponentId: string,
  instanceKey: string | undefined,
  includeDisabled = false,
): readonly A2uiV1NativeOpenUrlDescriptor[] {
  const openUrls: A2uiV1NativeOpenUrlDescriptor[] = [];
  const openUrl = element.props.openUrl as A2uiV1NativeOpenUrlDescriptor | undefined;
  if (
    openUrl?.sourceComponentId === sourceComponentId &&
    (includeDisabled || element.props.disabled !== true) &&
    (instanceKey === undefined || openUrl.instanceKey === instanceKey)
  ) {
    openUrls.push(openUrl);
  }
  for (const child of element.children ?? []) {
    openUrls.push(...findNativeOpenUrls(child, sourceComponentId, instanceKey, includeDisabled));
  }
  return openUrls;
}

function createAdapterContext(
  surface: A2uiV1SurfaceState,
  policy: A2uiV1SurfaceValidationPolicy,
  dataModel: JsonObject | undefined,
  locale: string | undefined,
  tolerateInvalidLocalOpenUrls = false,
  imagePolicy?: A2uiV1NativeImagePolicy,
  mediaPolicy?: A2uiV1NativeMediaPolicy,
  hostExtensionPolicy?: A2uiV1NativeHostExtensionPolicy,
  authorizeResources = true,
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
    dateFormats: new Map<string, Intl.DateTimeFormat>(),
    numberFormats: new Map<string, Intl.NumberFormat>(),
    pluralRules: new Map<string, Intl.PluralRules>(),
    visiting: new Set<string>(),
    tolerateInvalidLocalOpenUrls,
    imagePolicy,
    mediaPolicy,
    hostExtensionPolicy,
    hostExtensions: policy.hostExtensions,
    authorizeResources,
    choiceOptionCount: 0,
    choiceOptionOutputLength: 0,
    formatStringExpressionCount: 0,
    formattedStringLength: 0,
    openUrlLength: 0,
    imageUrlLength: 0,
    imageCount: 0,
    imageMaximumBytes: 0,
    imageMaximumDecodedPixels: 0,
    imageRedirectOriginCount: 0,
    imageResourcePolicyOutputLength: 0,
    mediaCount: 0,
    mediaUrlLength: 0,
    mediaMaximumBytes: 0,
    mediaMimeTypeCount: 0,
    mediaRedirectOriginCount: 0,
    mediaPolicyOutputLength: 0,
    hostExtensionCounts: new Map<string, number>(),
    renderNodeCount: 0,
    validationCheckCount: 0,
    validationOutputLength: 0,
  };
}

function parseRenderPlanOptions(options: unknown): A2uiV1NativeRenderPlanOptions {
  const parsed = parseOptionsObject(options, "A2UI native render plan options", [
    "dataModel",
    "hostExtensionPolicy",
    "imagePolicy",
    "locale",
    "mediaPolicy",
  ]);
  const imagePolicy = parseOptionalImagePolicy(parsed.imagePolicy, "options.imagePolicy");
  const mediaPolicy = parseOptionalPolicy<A2uiV1NativeMediaPolicy>(
    parsed.mediaPolicy,
    "options.mediaPolicy",
  );
  const hostExtensionPolicy = parseOptionalPolicy<A2uiV1NativeHostExtensionPolicy>(
    parsed.hostExtensionPolicy,
    "options.hostExtensionPolicy",
  );
  return {
    ...(parsed.dataModel === undefined
      ? {}
      : { dataModel: parseJsonObject(parsed.dataModel, "options.dataModel") }),
    ...(parsed.locale === undefined
      ? {}
      : { locale: parseLocale(parsed.locale, "options.locale") }),
    ...(imagePolicy === undefined ? {} : { imagePolicy }),
    ...(mediaPolicy === undefined ? {} : { mediaPolicy }),
    ...(hostExtensionPolicy === undefined ? {} : { hostExtensionPolicy }),
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

function parseOpenUrlResolutionOptions(options: unknown): A2uiV1NativeOpenUrlResolutionOptions {
  const parsed = parseOptionsObject(options, "A2UI native openUrl resolution options", [
    "instanceKey",
    "locale",
  ]);
  if (
    parsed.instanceKey !== undefined &&
    (typeof parsed.instanceKey !== "string" || parsed.instanceKey.length === 0)
  ) {
    throw new A2uiParseError("Expected a non-empty A2UI native openUrl instance key");
  }
  return {
    ...(parsed.instanceKey === undefined ? {} : { instanceKey: parsed.instanceKey }),
    ...(parsed.locale === undefined
      ? {}
      : { locale: parseLocale(parsed.locale, "options.locale") }),
  };
}

function parseOptionalImagePolicy(
  value: unknown,
  path: string,
): A2uiV1NativeImagePolicy | undefined {
  if (value !== undefined && typeof value !== "function") {
    throw new A2uiParseError(`Expected a function at ${path}`);
  }
  return value as A2uiV1NativeImagePolicy | undefined;
}

function parseOptionalPolicy<Policy>(value: unknown, path: string): Policy | undefined {
  if (value !== undefined && typeof value !== "function") {
    throw new A2uiParseError(`Expected a function at ${path}`);
  }
  return value as Policy | undefined;
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
    const canonicalLocale = Intl.getCanonicalLocales(value)[0]!;
    if (
      Intl.NumberFormat.supportedLocalesOf(canonicalLocale, { localeMatcher: "lookup" }).length ===
      0
    ) {
      throw new A2uiParseError(`Unsupported BCP 47 locale ${JSON.stringify(value)} at ${path}`);
    }
    return canonicalLocale;
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
      case "Image":
        return adaptImage(component, key, context, scope);
      case "Video":
        return adaptMedia(component, key, "video", context, scope);
      case "AudioPlayer":
        return adaptMedia(component, key, "audio", context, scope);
      case "Icon":
        return adaptIcon(component, key, context, scope);
      case "Divider":
        return adaptDivider(component, key, context, scope);
      case "Button":
        return adaptButton(component, key, context, scope);
      case "TextField":
        return adaptTextField(component, key, context, scope);
      case "CheckBox":
        return adaptCheckBox(component, key, context, scope);
      case "ChoicePicker":
        return adaptChoicePicker(component, key, context, scope);
      case "Slider":
        return adaptSlider(component, key, context, scope);
      case "DateTimeInput":
        return adaptDateTimeInput(component, key, context, scope);
      case "Tabs":
        return adaptTabs(component, key, context, scope);
      case "Modal":
        return adaptModal(component, key, context, scope);
      default:
        return adaptHostExtension(component, key, context, scope);
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

function adaptImage(
  component: A2uiV1Component,
  key: string,
  context: AdapterContext,
  scope: BindingScope | undefined,
): NativeElement {
  context.imageCount += 1;
  if (context.imageCount > A2UI_V1_NATIVE_MAX_IMAGES) {
    throw new A2uiParseError(
      `Expanded A2UI native plan exceeds maximum of ${A2UI_V1_NATIVE_MAX_IMAGES} images`,
    );
  }
  const path = `components.${component.id}.url`;
  const url = normalizeHttpUrl(
    resolveDynamicString(component.url, path, context, scope),
    path,
    "image",
    A2UI_V1_NATIVE_MAX_IMAGE_URL_LENGTH,
  );
  context.imageUrlLength += url.length;
  if (context.imageUrlLength > A2UI_V1_MAX_SOURCE_LENGTH) {
    throw new A2uiParseError(
      `Expanded A2UI native plan exceeds maximum image URL length of ${A2UI_V1_MAX_SOURCE_LENGTH} at ${path}`,
    );
  }
  const props: Record<string, unknown> = {
    uri: url,
    fit: component.fit ?? "fill",
    variant: component.variant ?? "mediumFeature",
  };
  if (context.authorizeResources) {
    props.resourcePolicy = authorizeImageResource(
      component.id,
      key,
      url,
      `components.${component.id}.imagePolicy`,
      context,
    );
  }
  if (component.description !== undefined) {
    props.description = resolveDynamicString(
      component.description,
      `components.${component.id}.description`,
      context,
      scope,
    );
  }
  addCommonProps(component, props, context, scope);
  if (props.accessibilityLabel === undefined && props.description !== undefined) {
    props.accessibilityLabel = props.description;
  }
  return { key, component: "Image", props };
}

function authorizeImageResource(
  componentId: string,
  key: string,
  url: string,
  path: string,
  context: AdapterContext,
): NativeImageResourcePolicy {
  const request: A2uiV1NativeImageRequest = {
    url,
    surfaceId: context.surface.surfaceId,
    sourceComponentId: componentId,
    instanceKey: key,
  };
  if (context.imagePolicy === undefined) {
    throw new A2uiParseError(
      `A2UI image resource ${JSON.stringify(componentId)} requires an explicit host image policy`,
    );
  }
  let decision: A2uiV1NativeImageGrant | false;
  try {
    decision = context.imagePolicy(request);
  } catch (cause) {
    throw new A2uiParseError(
      `A2UI image resource ${JSON.stringify(componentId)} host policy failed`,
      { cause },
    );
  }
  if (decision === false) {
    throw new A2uiParseError(
      `A2UI image resource ${JSON.stringify(componentId)} URL is denied by host policy`,
    );
  }
  const resourcePolicy = parseImageResourcePolicy(decision, path, context);
  context.imageMaximumBytes += resourcePolicy.maximumBytes;
  if (context.imageMaximumBytes > A2UI_V1_NATIVE_MAX_TOTAL_IMAGE_BYTES) {
    throw new A2uiParseError(
      `Expanded A2UI native plan exceeds maximum total image transfer budget of ${A2UI_V1_NATIVE_MAX_TOTAL_IMAGE_BYTES} bytes`,
    );
  }
  context.imageMaximumDecodedPixels += resourcePolicy.maximumDecodedPixels;
  if (context.imageMaximumDecodedPixels > A2UI_V1_NATIVE_MAX_TOTAL_IMAGE_PIXELS) {
    throw new A2uiParseError(
      `Expanded A2UI native plan exceeds maximum total decoded image budget of ${A2UI_V1_NATIVE_MAX_TOTAL_IMAGE_PIXELS} pixels`,
    );
  }
  return resourcePolicy;
}

function adaptMedia(
  component: A2uiV1Component,
  key: string,
  kind: A2uiV1NativeMediaKind,
  context: AdapterContext,
  scope: BindingScope | undefined,
): NativeElement {
  context.mediaCount += 1;
  if (context.mediaCount > A2UI_V1_NATIVE_MAX_MEDIA) {
    throw new A2uiParseError(
      `Expanded A2UI native plan exceeds maximum of ${A2UI_V1_NATIVE_MAX_MEDIA} media components`,
    );
  }
  const path = `components.${component.id}.url`;
  const url = normalizeHttpUrl(
    resolveDynamicString(component.url, path, context, scope),
    path,
    kind,
    A2UI_V1_NATIVE_MAX_MEDIA_URL_LENGTH,
  );
  context.mediaUrlLength += url.length;
  if (context.mediaUrlLength > A2UI_V1_MAX_SOURCE_LENGTH) {
    throw new A2uiParseError(
      `Expanded A2UI native plan exceeds cumulative media URL length of ${A2UI_V1_MAX_SOURCE_LENGTH}`,
    );
  }
  const props: Record<string, unknown> = { uri: url };
  if (context.authorizeResources) {
    props.resourcePolicy = authorizeMediaResource(component.id, key, kind, url, context);
  }
  if (kind === "video" && component.posterUrl !== undefined) {
    const posterPath = `components.${component.id}.posterUrl`;
    const posterUrl = normalizeHttpUrl(
      resolveDynamicString(component.posterUrl, posterPath, context, scope),
      posterPath,
      "video poster",
      A2UI_V1_NATIVE_MAX_IMAGE_URL_LENGTH,
    );
    context.imageCount += 1;
    if (context.imageCount > A2UI_V1_NATIVE_MAX_IMAGES) {
      throw new A2uiParseError(
        `Expanded A2UI native plan exceeds maximum of ${A2UI_V1_NATIVE_MAX_IMAGES} image resources`,
      );
    }
    context.imageUrlLength += posterUrl.length;
    if (context.imageUrlLength > A2UI_V1_MAX_SOURCE_LENGTH) {
      throw new A2uiParseError(
        `Expanded A2UI native plan exceeds cumulative image URL length of ${A2UI_V1_MAX_SOURCE_LENGTH}`,
      );
    }
    props.posterUri = posterUrl;
    if (context.authorizeResources) {
      props.posterResourcePolicy = authorizeImageResource(
        component.id,
        `${key}:poster`,
        posterUrl,
        `components.${component.id}.posterPolicy`,
        context,
      );
    }
  }
  if (kind === "audio" && component.description !== undefined) {
    props.description = resolveDynamicString(
      component.description,
      `components.${component.id}.description`,
      context,
      scope,
    );
  }
  addCommonProps(component, props, context, scope);
  if (props.accessibilityLabel === undefined) {
    props.accessibilityLabel =
      kind === "audio" && typeof props.description === "string"
        ? props.description
        : kind === "audio"
          ? "Audio"
          : "Video";
  }
  return { key, component: kind === "video" ? "Video" : "AudioPlayer", props };
}

function authorizeMediaResource(
  componentId: string,
  key: string,
  kind: A2uiV1NativeMediaKind,
  url: string,
  context: AdapterContext,
): NativeMediaResourcePolicy {
  if (context.mediaPolicy === undefined) {
    throw new A2uiParseError(
      `A2UI ${kind} ${JSON.stringify(componentId)} requires an explicit host media policy`,
    );
  }
  const sourceOrigin = parseHttpUrlOrigin(url, `components.${componentId}.url`);
  const request: A2uiV1NativeMediaRequest = {
    kind,
    url,
    sourceOrigin,
    surfaceId: context.surface.surfaceId,
    sourceComponentId: componentId,
    instanceKey: key,
  };
  let decision: A2uiV1NativeMediaGrant | false;
  try {
    decision = context.mediaPolicy(request);
  } catch (cause) {
    throw new A2uiParseError(`A2UI ${kind} ${JSON.stringify(componentId)} host policy failed`, {
      cause,
    });
  }
  if (decision === false) {
    throw new A2uiParseError(
      `A2UI ${kind} ${JSON.stringify(componentId)} URL is denied by host policy`,
    );
  }
  const resourcePolicy = parseMediaResourcePolicy(
    decision,
    request,
    `components.${componentId}.mediaPolicy`,
    context,
  );
  context.mediaMaximumBytes += resourcePolicy.maximumBytes;
  if (context.mediaMaximumBytes > A2UI_V1_NATIVE_MAX_TOTAL_MEDIA_BYTES) {
    throw new A2uiParseError(
      `Expanded A2UI native plan exceeds maximum total media transfer budget of ${A2UI_V1_NATIVE_MAX_TOTAL_MEDIA_BYTES} bytes`,
    );
  }
  return resourcePolicy;
}

function adaptHostExtension(
  component: A2uiV1Component,
  key: string,
  context: AdapterContext,
  scope: BindingScope | undefined,
): NativeElement {
  const hostExtensions = context.hostExtensions;
  if (hostExtensions === undefined) {
    throw new A2uiParseError(
      `A2UI component ${JSON.stringify(component.id)} uses an unavailable host extension`,
    );
  }
  const validated = validateA2uiV1HostExtensionComponent(
    hostExtensions,
    component,
    `components.${component.id}`,
  );
  const manifest = validated.manifest;
  const countKey = `${manifest.catalogId}\u0000${manifest.componentName}`;
  const count = (context.hostExtensionCounts.get(countKey) ?? 0) + 1;
  if (count > manifest.limits.maximumInstances) {
    throw new A2uiParseError(
      `Expanded A2UI native plan exceeds maximum of ${manifest.limits.maximumInstances} instances for ${JSON.stringify(manifest.componentName)}`,
    );
  }
  context.hostExtensionCounts.set(countKey, count);
  const props: Record<string, unknown> = {
    extensionId: manifest.extensionId,
    catalogId: manifest.catalogId,
    schemaVersion: manifest.schemaVersion,
    componentName: manifest.componentName,
    manifestFingerprint: validated.manifestFingerprint,
    semanticProps: validated.props,
    sourceComponentId: component.id,
    surfaceId: context.surface.surfaceId,
  };
  if (context.authorizeResources) {
    if (context.hostExtensionPolicy === undefined) {
      throw new A2uiParseError(
        `Host extension ${JSON.stringify(manifest.componentName)} requires an explicit capability policy`,
      );
    }
    const request: A2uiV1NativeHostExtensionRequest = {
      extensionId: manifest.extensionId,
      catalogId: manifest.catalogId,
      schemaVersion: manifest.schemaVersion,
      componentName: manifest.componentName,
      surfaceId: context.surface.surfaceId,
      sourceComponentId: component.id,
      instanceKey: key,
      platform: hostExtensions.platform,
      semanticProps: validated.props,
      permissionNeeds: manifest.permissionNeeds,
      resourceNeeds: manifest.resourceNeeds,
    };
    let decision: NativeHostExtensionCapabilityGrant | false;
    try {
      decision = context.hostExtensionPolicy(request);
    } catch (cause) {
      throw new A2uiParseError(
        `Host extension ${JSON.stringify(manifest.componentName)} capability policy failed`,
        { cause },
      );
    }
    if (decision === false) {
      throw new A2uiParseError(
        `Host extension ${JSON.stringify(manifest.componentName)} is denied by capability policy`,
      );
    }
    props.capabilityGrant = parseHostExtensionCapabilityGrant(
      decision,
      manifest.permissionNeeds,
      manifest.resourceNeeds,
      `components.${component.id}.hostExtensionPolicy`,
    );
  }
  addCommonProps(component, props, context, scope);
  if (manifest.accessibility.requiresLabel && props.accessibilityLabel === undefined) {
    throw new A2uiParseError(
      `Host extension ${JSON.stringify(manifest.componentName)} requires an accessibility label`,
    );
  }
  return { key, component: "HostExtension", props };
}

function adaptIcon(
  component: A2uiV1Component,
  key: string,
  context: AdapterContext,
  scope: BindingScope | undefined,
): NativeElement {
  const path = `components.${component.id}.name`;
  if (
    component.name !== null &&
    typeof component.name === "object" &&
    !Array.isArray(component.name) &&
    Object.hasOwn(component.name, "svgPath")
  ) {
    throw new A2uiParseError(
      `A2UI native Icon ${JSON.stringify(component.id)} requires a pinned semantic icon name at ${path}; svgPath is not supported`,
    );
  }
  const name = resolveDynamicString(component.name, path, context, scope);
  if (!(A2UI_V1_NATIVE_ICON_NAMES as readonly string[]).includes(name)) {
    throw new A2uiParseError(
      `A2UI native Icon ${JSON.stringify(component.id)} requires a pinned semantic icon name at ${path}; svgPath is not supported`,
    );
  }
  const props: Record<string, unknown> = { name };
  addCommonProps(component, props, context, scope);
  return { key, component: "Icon", props };
}

function adaptDivider(
  component: A2uiV1Component,
  key: string,
  context: AdapterContext,
  scope: BindingScope | undefined,
): NativeElement {
  const props: Record<string, unknown> = { axis: component.axis ?? "horizontal" };
  addCommonProps(component, props, context, scope);
  return { key, component: "Divider", props };
}

function adaptButton(
  component: A2uiV1Component,
  key: string,
  context: AdapterContext,
  scope: BindingScope | undefined,
): NativeElement {
  const childId = expectString(component.child, `components.${component.id}.child`);
  const child = context.surface.components.get(childId);
  if (child?.component !== "Text") {
    throw new A2uiParseError(
      `A2UI native Button ${JSON.stringify(component.id)} requires a Text child`,
    );
  }
  const props: Record<string, unknown> = {
    title: resolveDynamicString(child.text, `components.${child.id}.text`, context, scope),
    // Validate action input even while checks disable dispatch, so inactive state cannot conceal
    // malformed or host-denied dynamic semantics.
    ...resolveButtonAction(component, key, context, scope),
  };
  if (component.variant !== undefined) {
    props.variant = component.variant;
  }
  addCommonProps(component, props, context, scope);
  addValidationProps(component, props, context, scope, "button");
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
  addValidationProps(component, props, context, scope, "input");
  if (props.accessibilityLabel === undefined) {
    props.accessibilityLabel = label;
  }
  return { key, component: "TextInput", props };
}

function adaptCheckBox(
  component: A2uiV1Component,
  key: string,
  context: AdapterContext,
  scope: BindingScope | undefined,
): NativeElement {
  const componentPath = `components.${component.id}`;
  const label = resolveDynamicString(component.label, `${componentPath}.label`, context, scope);
  const props: Record<string, unknown> = {
    label,
    value: resolveDynamicBoolean(component.value, `${componentPath}.value`, context, scope),
  };
  addBindingProp(component.value, `${componentPath}.value`, props, scope);
  addCommonProps(component, props, context, scope);
  addValidationProps(component, props, context, scope, "input");
  if (props.accessibilityLabel === undefined) {
    props.accessibilityLabel = label;
  }
  return { key, component: "CheckBox", props };
}

function adaptChoicePicker(
  component: A2uiV1Component,
  key: string,
  context: AdapterContext,
  scope: BindingScope | undefined,
): NativeElement {
  const componentPath = `components.${component.id}`;
  if (!Array.isArray(component.options)) {
    throw new A2uiParseError(`Expected an array at ${componentPath}.options`);
  }
  context.choiceOptionCount += component.options.length;
  if (context.choiceOptionCount > A2UI_V1_NATIVE_MAX_CHOICE_OPTIONS) {
    throw new A2uiParseError(
      `Expanded A2UI native plan exceeds maximum of ${A2UI_V1_NATIVE_MAX_CHOICE_OPTIONS} choice options`,
    );
  }
  const optionValues = new Set<string>();
  const options = component.options.map((value, index) => {
    const option = expectObject(value, `${componentPath}.options[${index}]`);
    const label = resolveDynamicString(
      option.label,
      `${componentPath}.options[${index}].label`,
      context,
      scope,
    );
    const optionValue = expectString(option.value, `${componentPath}.options[${index}].value`);
    if (optionValues.has(optionValue)) {
      throw new A2uiParseError(
        `A2UI ChoicePicker ${JSON.stringify(component.id)} contains duplicate option value ${JSON.stringify(optionValue)}`,
      );
    }
    optionValues.add(optionValue);
    context.choiceOptionOutputLength += label.length + optionValue.length;
    if (context.choiceOptionOutputLength > A2UI_V1_MAX_SOURCE_LENGTH) {
      throw new A2uiParseError(
        `Expanded A2UI native plan exceeds maximum choice-option output length of ${A2UI_V1_MAX_SOURCE_LENGTH}`,
      );
    }
    return Object.freeze({ label, value: optionValue });
  });
  const selected = resolveDynamicStringList(
    component.value,
    `${componentPath}.value`,
    context,
    scope,
  );
  if (new Set(selected).size !== selected.length) {
    throw new A2uiParseError(
      `A2UI ChoicePicker ${JSON.stringify(component.id)} contains duplicate selected values`,
    );
  }
  for (const value of selected) {
    if (!optionValues.has(value)) {
      throw new A2uiParseError(
        `A2UI ChoicePicker ${JSON.stringify(component.id)} selects unknown value ${JSON.stringify(value)}`,
      );
    }
  }
  const variant = component.variant ?? "mutuallyExclusive";
  if (variant === "mutuallyExclusive" && selected.length > 1) {
    throw new A2uiParseError(
      `A2UI ChoicePicker ${JSON.stringify(component.id)} allows at most one selected value`,
    );
  }
  const props: Record<string, unknown> = {
    options: Object.freeze(options),
    value: Object.freeze(selected),
    variant,
    displayStyle: component.displayStyle ?? "checkbox",
    filterable: component.filterable ?? false,
  };
  if (component.label !== undefined) {
    props.label = resolveDynamicString(component.label, `${componentPath}.label`, context, scope);
  }
  addBindingProp(component.value, `${componentPath}.value`, props, scope);
  addCommonProps(component, props, context, scope);
  addValidationProps(component, props, context, scope, "input");
  if (props.accessibilityLabel === undefined) {
    if (props.label === undefined) {
      throw new A2uiParseError(
        `A2UI native ChoicePicker ${JSON.stringify(component.id)} requires label or accessibility.label`,
      );
    }
    props.accessibilityLabel = props.label;
  }
  return { key, component: "ChoicePicker", props };
}

function adaptSlider(
  component: A2uiV1Component,
  key: string,
  context: AdapterContext,
  scope: BindingScope | undefined,
): NativeElement {
  const componentPath = `components.${component.id}`;
  const minimum =
    component.min === undefined ? 0 : expectFiniteNumber(component.min, `${componentPath}.min`);
  const maximum = expectFiniteNumber(component.max, `${componentPath}.max`);
  if (minimum >= maximum) {
    throw new A2uiParseError(`Expected ${componentPath}.min to be less than max`);
  }
  const value = resolveDynamicNumber(component.value, `${componentPath}.value`, context, scope);
  if (value < minimum || value > maximum) {
    throw new A2uiParseError(`Expected ${componentPath}.value to be within min and max`);
  }
  let step: number | undefined;
  if (component.steps !== undefined) {
    const steps = expectFiniteNumber(component.steps, `${componentPath}.steps`);
    if (!Number.isInteger(steps) || steps < 1 || steps > JSON_MAX_VALUES) {
      throw new A2uiParseError(
        `Expected ${componentPath}.steps to be an integer from 1 through ${JSON_MAX_VALUES}`,
      );
    }
    step = (maximum - minimum) / steps;
    if (!Number.isFinite(step) || step <= 0) {
      throw new A2uiParseError(`A2UI Slider ${JSON.stringify(component.id)} has invalid range`);
    }
    if (!isSliderStepValue(value, minimum, step)) {
      throw new A2uiParseError(
        `A2UI Slider ${JSON.stringify(component.id)} value does not align with its steps`,
      );
    }
  }
  const props: Record<string, unknown> = {
    value,
    minimum,
    maximum,
    ...(step === undefined ? {} : { step }),
  };
  if (component.label !== undefined) {
    props.label = resolveDynamicString(component.label, `${componentPath}.label`, context, scope);
  }
  addBindingProp(component.value, `${componentPath}.value`, props, scope);
  addCommonProps(component, props, context, scope);
  addValidationProps(component, props, context, scope, "input");
  if (props.accessibilityLabel === undefined) {
    if (props.label === undefined) {
      throw new A2uiParseError(
        `A2UI native Slider ${JSON.stringify(component.id)} requires label or accessibility.label`,
      );
    }
    props.accessibilityLabel = props.label;
  }
  return { key, component: "Slider", props };
}

function isSliderStepValue(value: number, minimum: number, step: number): boolean {
  const offset = (value - minimum) / step;
  return (
    Math.abs(offset - Math.round(offset)) <= Number.EPSILON * Math.max(1, Math.abs(offset)) * 8
  );
}

function adaptDateTimeInput(
  component: A2uiV1Component,
  key: string,
  context: AdapterContext,
  scope: BindingScope | undefined,
): NativeElement {
  const componentPath = `components.${component.id}`;
  const enableDate = component.enableDate === true;
  const enableTime = component.enableTime === true;
  if (!enableDate && !enableTime) {
    throw new A2uiParseError(
      `A2UI DateTimeInput ${JSON.stringify(component.id)} must enable date, time, or both`,
    );
  }
  const value = resolveDynamicString(component.value, `${componentPath}.value`, context, scope);
  validateDateTimeInputValue(value, enableDate, enableTime, `${componentPath}.value`, true);
  const minimum =
    component.min === undefined
      ? undefined
      : resolveDynamicString(component.min, `${componentPath}.min`, context, scope);
  const maximum =
    component.max === undefined
      ? undefined
      : resolveDynamicString(component.max, `${componentPath}.max`, context, scope);
  if (minimum !== undefined) {
    validateDateTimeInputValue(minimum, enableDate, enableTime, `${componentPath}.min`, false);
  }
  if (maximum !== undefined) {
    validateDateTimeInputValue(maximum, enableDate, enableTime, `${componentPath}.max`, false);
  }
  if (
    minimum !== undefined &&
    maximum !== undefined &&
    dateTimeInputSortValue(minimum, enableDate, enableTime, `${componentPath}.min`) >
      dateTimeInputSortValue(maximum, enableDate, enableTime, `${componentPath}.max`)
  ) {
    throw new A2uiParseError(`Expected ${componentPath}.min not to exceed max`);
  }
  const valueSort =
    value.length === 0
      ? undefined
      : dateTimeInputSortValue(value, enableDate, enableTime, `${componentPath}.value`);
  if (
    valueSort !== undefined &&
    minimum !== undefined &&
    valueSort < dateTimeInputSortValue(minimum, enableDate, enableTime, `${componentPath}.min`)
  ) {
    throw new A2uiParseError(`Expected ${componentPath}.value not to be earlier than min`);
  }
  if (
    valueSort !== undefined &&
    maximum !== undefined &&
    valueSort > dateTimeInputSortValue(maximum, enableDate, enableTime, `${componentPath}.max`)
  ) {
    throw new A2uiParseError(`Expected ${componentPath}.value not to be later than max`);
  }
  const props: Record<string, unknown> = {
    value,
    enableDate,
    enableTime,
    ...(minimum === undefined ? {} : { minimum }),
    ...(maximum === undefined ? {} : { maximum }),
  };
  if (component.label !== undefined) {
    props.label = resolveDynamicString(component.label, `${componentPath}.label`, context, scope);
  }
  addBindingProp(component.value, `${componentPath}.value`, props, scope);
  addCommonProps(component, props, context, scope);
  addValidationProps(component, props, context, scope, "input");
  if (props.accessibilityLabel === undefined) {
    if (props.label === undefined) {
      throw new A2uiParseError(
        `A2UI native DateTimeInput ${JSON.stringify(component.id)} requires label or accessibility.label`,
      );
    }
    props.accessibilityLabel = props.label;
  }
  return { key, component: "DateTimeInput", props };
}

function adaptTabs(
  component: A2uiV1Component,
  key: string,
  context: AdapterContext,
  scope: BindingScope | undefined,
): NativeElement {
  const componentPath = `components.${component.id}`;
  if (!Array.isArray(component.tabs) || component.tabs.length === 0) {
    throw new A2uiParseError(`Expected a non-empty array at ${componentPath}.tabs`);
  }
  const tabs = component.tabs.map((value, index) => {
    const tab = expectObject(value, `${componentPath}.tabs[${index}]`);
    return Object.freeze({
      title: resolveDynamicString(
        tab.title,
        `${componentPath}.tabs[${index}].title`,
        context,
        scope,
      ),
    });
  });
  const props: Record<string, unknown> = { tabs: Object.freeze(tabs) };
  addCommonProps(component, props, context, scope);
  return {
    key,
    component: "Tabs",
    props,
    children: component.tabs.map((value, index) => {
      const tab = expectObject(value, `${componentPath}.tabs[${index}]`);
      const childId = expectString(tab.child, `${componentPath}.tabs[${index}].child`);
      return adaptComponent(childId, appendInstanceKey(key, childId, index), context, scope);
    }),
  };
}

function adaptModal(
  component: A2uiV1Component,
  key: string,
  context: AdapterContext,
  scope: BindingScope | undefined,
): NativeElement {
  const componentPath = `components.${component.id}`;
  const triggerId = expectString(component.trigger, `${componentPath}.trigger`);
  const contentId = expectString(component.content, `${componentPath}.content`);
  if (context.surface.components.get(triggerId)?.component !== "Button") {
    throw new A2uiParseError(
      `A2UI native Modal ${JSON.stringify(component.id)} requires a Button trigger`,
    );
  }
  const props: Record<string, unknown> = {};
  addCommonProps(component, props, context, scope);
  return {
    key,
    component: "Modal",
    props,
    children: [
      adaptComponent(triggerId, appendInstanceKey(key, triggerId, 0), context, scope),
      adaptComponent(contentId, appendInstanceKey(key, contentId, 1), context, scope),
    ],
  };
}

function addBindingProp(
  value: JsonValue | undefined,
  path: string,
  props: Record<string, unknown>,
  scope: BindingScope | undefined,
): void {
  if (value !== undefined && isBinding(value)) {
    props.binding = resolveBindingPointer(value.path, `${path}.path`, scope);
  }
}

function resolveDynamicStringList(
  value: JsonValue | undefined,
  path: string,
  context: AdapterContext,
  scope: BindingScope | undefined,
): string[] {
  const resolved = resolveDynamicValue(value, path, context, scope);
  if (!Array.isArray(resolved) || resolved.some((item) => typeof item !== "string")) {
    throw new A2uiParseError(`Expected an array of strings at ${path}`);
  }
  return [...(resolved as string[])];
}

function addValidationProps(
  component: A2uiV1Component,
  props: Record<string, unknown>,
  context: AdapterContext,
  scope: BindingScope | undefined,
  target: "button" | "input",
): void {
  if (component.checks === undefined) {
    return;
  }
  if (!Array.isArray(component.checks)) {
    throw new A2uiParseError(`Expected an array at components.${component.id}.checks`);
  }
  const messages: string[] = [];
  let valid = true;
  for (const [index, value] of component.checks.entries()) {
    context.validationCheckCount += 1;
    if (context.validationCheckCount > JSON_MAX_VALUES) {
      throw new A2uiParseError(
        `Expanded A2UI native plan exceeds maximum of ${JSON_MAX_VALUES} renderer checks`,
      );
    }
    const path = `components.${component.id}.checks[${index}]`;
    const check = expectObject(value, path);
    // The pinned Candidate's CheckRule prose says ValidationResult object, but its Checkable
    // contract and reference implementation use a boolean. Follow that executable contract.
    if (!resolveDynamicBoolean(check.condition, `${path}.condition`, context, scope)) {
      valid = false;
      if (check.message !== undefined) {
        messages.push(expectString(check.message, `${path}.message`));
      }
    }
  }
  if (valid) {
    return;
  }
  props[target === "button" ? "disabled" : "invalid"] = true;
  if (messages.length === 0) {
    return;
  }
  const existingHint =
    typeof props.accessibilityHint === "string" ? props.accessibilityHint : undefined;
  const validationHintLength = messages.reduce(
    (length, message, index) => length + message.length + (index === 0 ? 0 : 1),
    0,
  );
  const outputLength =
    validationHintLength + (existingHint === undefined ? 0 : existingHint.length + 1);
  if (outputLength > JSON_MAX_STRING_LENGTH) {
    throw new A2uiParseError(
      `A2UI validation output at components.${component.id}.checks exceeds maximum length of ${JSON_MAX_STRING_LENGTH}`,
    );
  }
  context.validationOutputLength += outputLength;
  if (context.validationOutputLength > A2UI_V1_MAX_SOURCE_LENGTH) {
    throw new A2uiParseError(
      `Expanded A2UI native plan exceeds maximum validation-output length of ${A2UI_V1_MAX_SOURCE_LENGTH}`,
    );
  }
  props.validationMessages = Object.freeze(messages);
  const validationHint = messages.join(" ");
  props.accessibilityHint =
    existingHint === undefined ? validationHint : `${existingHint} ${validationHint}`;
}

const VALIDATION_FUNCTION_NAMES: ReadonlySet<string> = new Set([
  "required",
  "regex",
  "length",
  "numeric",
  "email",
]);
const A2UI_V1_MAX_REGEX_PATTERN_LENGTH = 256;
const A2UI_V1_MAX_REGEX_INPUT_LENGTH = 4_096;
const A2UI_V1_MAX_REGEX_REPEAT = 4_096;
const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function resolveValidationFunction(
  call: JsonObject & { readonly call: string },
  path: string,
  context: AdapterContext,
  scope: BindingScope | undefined,
): boolean {
  const args = expectObject(call.args, `${path}.args`);
  if (call.call === "required") {
    const value = resolveDynamicValue(args.value, `${path}.args.value`, context, scope);
    return !(
      value === null ||
      (typeof value === "string" && value.length === 0) ||
      (Array.isArray(value) && value.length === 0)
    );
  }
  if (call.call === "regex") {
    const value = resolveDynamicString(args.value, `${path}.args.value`, context, scope);
    const pattern = expectString(args.pattern, `${path}.args.pattern`);
    if (value.length > A2UI_V1_MAX_REGEX_INPUT_LENGTH) {
      return false;
    }
    return compileValidationRegex(pattern, path).test(value);
  }
  if (call.call === "length") {
    const value = resolveDynamicString(args.value, `${path}.args.value`, context, scope);
    const bounds = parseValidationBounds(args, path, true);
    return (
      (bounds.min === undefined || value.length >= bounds.min) &&
      (bounds.max === undefined || value.length <= bounds.max)
    );
  }
  if (call.call === "numeric") {
    const value = resolveDynamicNumber(args.value, `${path}.args.value`, context, scope);
    const bounds = parseValidationBounds(args, path, false);
    return (
      (bounds.min === undefined || value >= bounds.min) &&
      (bounds.max === undefined || value <= bounds.max)
    );
  }
  const value = resolveDynamicString(args.value, `${path}.args.value`, context, scope);
  return value.length <= 320 && EMAIL_PATTERN.test(value);
}

function parseValidationBounds(
  args: JsonObject,
  path: string,
  integer: boolean,
): { readonly min: number | undefined; readonly max: number | undefined } {
  const parseBound = (name: "min" | "max"): number | undefined => {
    if (args[name] === undefined) {
      return undefined;
    }
    const value = expectFiniteNumber(args[name]!, `${path}.args.${name}`);
    if (integer && (!Number.isSafeInteger(value) || value < 0)) {
      throw new A2uiParseError(`Expected a non-negative safe integer at ${path}.args.${name}`);
    }
    return value;
  };
  const min = parseBound("min");
  const max = parseBound("max");
  if (min === undefined && max === undefined) {
    throw new A2uiParseError(`Expected min or max at ${path}.args`);
  }
  if (min !== undefined && max !== undefined && min > max) {
    throw new A2uiParseError(`Expected min not to exceed max at ${path}.args`);
  }
  return { min, max };
}

function compileValidationRegex(pattern: string, path: string): RegExp {
  if (pattern.length > A2UI_V1_MAX_REGEX_PATTERN_LENGTH) {
    throw new A2uiParseError(
      `A2UI regex pattern at ${path}.args.pattern exceeds maximum length of ${A2UI_V1_MAX_REGEX_PATTERN_LENGTH}`,
    );
  }
  let escaped = false;
  let inCharacterClass = false;
  let variableRepeatCount = 0;
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]!;
    if (escaped) {
      if (/[1-9kPp]/.test(character)) {
        throwUnsupportedValidationRegex(pattern, path);
      }
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (inCharacterClass) {
      if (character === "]") {
        inCharacterClass = false;
      }
      continue;
    }
    if (character === "[") {
      inCharacterClass = true;
      continue;
    }
    if (character === "(" || character === ")" || character === "|") {
      throwUnsupportedValidationRegex(pattern, path);
    }
    if (character === "*" || character === "+" || character === "?") {
      variableRepeatCount += 1;
      continue;
    }
    if (character === "{") {
      const repeat = /^\{(0|[1-9][0-9]*)(?:,(0|[1-9][0-9]*)?)?\}/.exec(pattern.slice(index));
      if (repeat === null) {
        throwUnsupportedValidationRegex(pattern, path);
      }
      const min = Number(repeat[1]);
      const max = repeat[2] === undefined || repeat[2] === "" ? undefined : Number(repeat[2]);
      if (
        min > A2UI_V1_MAX_REGEX_REPEAT ||
        (max !== undefined && (max < min || max > A2UI_V1_MAX_REGEX_REPEAT))
      ) {
        throwUnsupportedValidationRegex(pattern, path);
      }
      if (repeat[0].includes(",") && max !== min) {
        variableRepeatCount += 1;
      }
      index += repeat[0].length - 1;
      continue;
    }
    if (character === "}") {
      throwUnsupportedValidationRegex(pattern, path);
    }
  }
  if (variableRepeatCount > 1) {
    throwUnsupportedValidationRegex(pattern, path);
  }
  try {
    return new RegExp(pattern);
  } catch (cause) {
    throw new A2uiParseError(`Invalid regex pattern at ${path}.args.pattern`, { cause });
  }
}

function throwUnsupportedValidationRegex(pattern: string, path: string): never {
  throw new A2uiParseError(
    `Unsupported potentially expensive regex pattern ${JSON.stringify(pattern)} at ${path}.args.pattern`,
  );
}

function resolveButtonAction(
  component: A2uiV1Component,
  key: string,
  context: AdapterContext,
  scope: BindingScope | undefined,
):
  | { readonly event: A2uiV1NativeEventDescriptor }
  | { readonly openUrl: A2uiV1NativeOpenUrlDescriptor }
  | {
      readonly disabled: true;
      readonly invalidLocalOpenUrl: {
        readonly surfaceId: string;
        readonly sourceComponentId: string;
        readonly instanceKey: string;
      };
    } {
  const action = expectObject(component.action, `components.${component.id}.action`);
  if (Object.hasOwn(action, "functionCall")) {
    const call = expectObject(
      action.functionCall,
      `components.${component.id}.action.functionCall`,
    );
    const name = expectString(call.call, `components.${component.id}.action.functionCall.call`);
    if (name !== "openUrl") {
      throw new A2uiParseError(
        `A2UI native Button ${JSON.stringify(component.id)} does not support local function ${JSON.stringify(name)}`,
      );
    }
    const args = expectObject(call.args, `components.${component.id}.action.functionCall.args`);
    const path = `components.${component.id}.action.functionCall.args.url`;
    const resolvedUrl = resolveDynamicString(args.url, path, context, scope);
    let normalizedUrl: string;
    try {
      normalizedUrl = normalizeOpenUrl(resolvedUrl, path);
    } catch (error) {
      if (!context.tolerateInvalidLocalOpenUrls || !(error instanceof A2uiParseError)) {
        throw error;
      }
      return {
        disabled: true,
        invalidLocalOpenUrl: {
          surfaceId: context.surface.surfaceId,
          sourceComponentId: component.id,
          instanceKey: key,
        },
      };
    }
    const url = recordOpenUrl(normalizedUrl, path, context);
    return {
      openUrl: {
        url,
        surfaceId: context.surface.surfaceId,
        sourceComponentId: component.id,
        instanceKey: key,
      },
    };
  }
  if (!Object.hasOwn(action, "event")) {
    throw new A2uiParseError(
      `A2UI native Button ${JSON.stringify(component.id)} requires an event or supported local function action`,
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
    event: {
      name: eventName,
      surfaceId: context.surface.surfaceId,
      sourceComponentId: component.id,
      instanceKey: key,
      ...(userMessage === undefined ? {} : { userMessage }),
      context: parseJsonObject(resolvedContext, `components.${component.id}.action.event.context`),
    },
  };
}

interface UrlLike {
  readonly href: string;
  readonly origin: string;
  readonly password: string;
  readonly protocol: string;
  readonly username: string;
}

interface UrlConstructorLike {
  new (url: string): UrlLike;
}

function normalizeOpenUrl(value: string, path: string): string {
  return normalizeHttpUrl(value, path, "openUrl", A2UI_V1_NATIVE_MAX_OPEN_URL_LENGTH);
}

function normalizeHttpUrl(
  value: string,
  path: string,
  label: string,
  maximumLength: number,
): string {
  if (value.length === 0 || value.length > maximumLength) {
    throw new A2uiParseError(
      `Expected an HTTP(S) URL up to ${maximumLength} characters at ${path}`,
    );
  }
  if (/\s|\p{Cf}/u.test(value) || hasAsciiControlCharacter(value)) {
    throw new A2uiParseError(
      `Expected an HTTP(S) URL without whitespace, control, or Unicode format characters at ${path}`,
    );
  }
  const UrlConstructor = (globalThis as unknown as { readonly URL?: UrlConstructorLike }).URL;
  if (UrlConstructor === undefined) {
    throw new A2uiParseError(`The host runtime cannot validate an ${label} value at ${path}`);
  }
  let parsed: UrlLike;
  try {
    parsed = new UrlConstructor(value);
  } catch (cause) {
    throw new A2uiParseError(`Expected an absolute HTTP(S) URL at ${path}`, { cause });
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new A2uiParseError(`Expected an HTTP(S) URL at ${path}`);
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw new A2uiParseError(`A2UI ${label} does not allow URL credentials at ${path}`);
  }
  if (parsed.href.length > maximumLength) {
    throw new A2uiParseError(
      `Canonical A2UI ${label} at ${path} exceeds maximum length of ${maximumLength}`,
    );
  }
  return parsed.href;
}

function parseImageResourcePolicy(
  value: unknown,
  path: string,
  context: AdapterContext,
): NativeImageResourcePolicy {
  const policy = parseJsonObject(value, path);
  const allowedKeys = new Set([
    "allowedRedirectOrigins",
    "cacheMode",
    "maximumBytes",
    "maximumDecodedHeight",
    "maximumDecodedPixels",
    "maximumDecodedWidth",
    "maximumRedirects",
  ]);
  for (const key of Object.keys(policy)) {
    if (!allowedKeys.has(key)) {
      throw new A2uiParseError(`Unexpected field ${JSON.stringify(key)} at ${path}`);
    }
  }
  if (
    !Array.isArray(policy.allowedRedirectOrigins) ||
    policy.allowedRedirectOrigins.length > A2UI_V1_NATIVE_MAX_IMAGE_REDIRECT_ORIGINS
  ) {
    throw new A2uiParseError(
      `Expected at most ${A2UI_V1_NATIVE_MAX_IMAGE_REDIRECT_ORIGINS} redirect origins at ${path}.allowedRedirectOrigins`,
    );
  }
  context.imageRedirectOriginCount += policy.allowedRedirectOrigins.length;
  if (context.imageRedirectOriginCount > JSON_MAX_VALUES) {
    throw new A2uiParseError(
      `Expanded A2UI native plan exceeds maximum of ${JSON_MAX_VALUES} image redirect origins`,
    );
  }
  const origins = policy.allowedRedirectOrigins.map((origin, index) =>
    parseExactHttpOrigin(origin, `${path}.allowedRedirectOrigins[${index}]`),
  );
  if (new Set(origins).size !== origins.length) {
    throw new A2uiParseError(`Expected unique redirect origins at ${path}.allowedRedirectOrigins`);
  }
  context.imageResourcePolicyOutputLength += origins.reduce(
    (length, origin) => length + origin.length,
    0,
  );
  if (context.imageResourcePolicyOutputLength > A2UI_V1_MAX_SOURCE_LENGTH) {
    throw new A2uiParseError(
      `Expanded A2UI native plan exceeds maximum image-policy output length of ${A2UI_V1_MAX_SOURCE_LENGTH}`,
    );
  }
  const cacheMode = policy.cacheMode;
  if (cacheMode !== "default" && cacheMode !== "no-store") {
    throw new A2uiParseError(`Expected a closed cache mode at ${path}.cacheMode`);
  }
  const maximumBytes = parseBoundedPositiveInteger(
    policy.maximumBytes,
    A2UI_V1_NATIVE_MAX_IMAGE_BYTES,
    `${path}.maximumBytes`,
  );
  const maximumDecodedWidth = parseBoundedPositiveInteger(
    policy.maximumDecodedWidth,
    A2UI_V1_NATIVE_MAX_IMAGE_DIMENSION,
    `${path}.maximumDecodedWidth`,
  );
  const maximumDecodedHeight = parseBoundedPositiveInteger(
    policy.maximumDecodedHeight,
    A2UI_V1_NATIVE_MAX_IMAGE_DIMENSION,
    `${path}.maximumDecodedHeight`,
  );
  const maximumDecodedPixels = parseBoundedPositiveInteger(
    policy.maximumDecodedPixels,
    A2UI_V1_NATIVE_MAX_IMAGE_PIXELS,
    `${path}.maximumDecodedPixels`,
  );
  if (maximumDecodedPixels > maximumDecodedWidth * maximumDecodedHeight) {
    throw new A2uiParseError(
      `Expected ${path}.maximumDecodedPixels not to exceed the declared dimensions`,
    );
  }
  const maximumRedirects = parseBoundedNonNegativeInteger(
    policy.maximumRedirects,
    A2UI_V1_NATIVE_MAX_IMAGE_REDIRECTS,
    `${path}.maximumRedirects`,
  );
  return Object.freeze({
    allowedRedirectOrigins: Object.freeze(origins),
    cacheMode,
    maximumBytes,
    maximumDecodedHeight,
    maximumDecodedPixels,
    maximumDecodedWidth,
    maximumRedirects,
  });
}

function parseMediaResourcePolicy(
  value: unknown,
  request: A2uiV1NativeMediaRequest,
  path: string,
  context: AdapterContext,
): NativeMediaResourcePolicy {
  const policy = parseJsonObject(value, path);
  const allowedKeys = new Set([
    "allowedMimeTypes",
    "allowedRedirectOrigins",
    "allowsAutoplay",
    "allowsBackgroundPlayback",
    "allowsExternalRoutes",
    "maximumBytes",
    "maximumRedirects",
    "requiresUserActivation",
    "sourceOrigin",
  ]);
  for (const key of Object.keys(policy)) {
    if (!allowedKeys.has(key)) {
      throw new A2uiParseError(`Unexpected field ${JSON.stringify(key)} at ${path}`);
    }
  }
  const sourceOrigin = parseExactHttpOrigin(policy.sourceOrigin, `${path}.sourceOrigin`);
  if (sourceOrigin !== request.sourceOrigin) {
    throw new A2uiParseError(`Expected ${path}.sourceOrigin to match the requested media origin`);
  }
  if (
    !Array.isArray(policy.allowedRedirectOrigins) ||
    policy.allowedRedirectOrigins.length > A2UI_V1_NATIVE_MAX_MEDIA_REDIRECT_ORIGINS
  ) {
    throw new A2uiParseError(
      `Expected at most ${A2UI_V1_NATIVE_MAX_MEDIA_REDIRECT_ORIGINS} redirect origins at ${path}.allowedRedirectOrigins`,
    );
  }
  context.mediaRedirectOriginCount += policy.allowedRedirectOrigins.length;
  if (context.mediaRedirectOriginCount > JSON_MAX_VALUES) {
    throw new A2uiParseError(
      `Expanded A2UI native plan exceeds maximum of ${JSON_MAX_VALUES} media redirect origins`,
    );
  }
  const allowedRedirectOrigins = policy.allowedRedirectOrigins.map((origin, index) =>
    parseExactHttpOrigin(origin, `${path}.allowedRedirectOrigins[${index}]`),
  );
  if (new Set(allowedRedirectOrigins).size !== allowedRedirectOrigins.length) {
    throw new A2uiParseError(`Expected unique redirect origins at ${path}.allowedRedirectOrigins`);
  }
  if (
    !Array.isArray(policy.allowedMimeTypes) ||
    policy.allowedMimeTypes.length === 0 ||
    policy.allowedMimeTypes.length > A2UI_V1_NATIVE_MAX_MEDIA_MIME_TYPES
  ) {
    throw new A2uiParseError(
      `Expected one through ${A2UI_V1_NATIVE_MAX_MEDIA_MIME_TYPES} MIME types at ${path}.allowedMimeTypes`,
    );
  }
  context.mediaMimeTypeCount += policy.allowedMimeTypes.length;
  if (context.mediaMimeTypeCount > JSON_MAX_VALUES) {
    throw new A2uiParseError(
      `Expanded A2UI native plan exceeds maximum of ${JSON_MAX_VALUES} media MIME types`,
    );
  }
  const mimePrefix = request.kind === "video" ? "video/" : "audio/";
  const allowedMimeTypes = policy.allowedMimeTypes.map((mimeType, index) => {
    const parsed = expectString(mimeType, `${path}.allowedMimeTypes[${index}]`);
    if (
      parsed !== parsed.toLowerCase() ||
      !parsed.startsWith(mimePrefix) ||
      !/^(?:audio|video)\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(parsed)
    ) {
      throw new A2uiParseError(
        `Expected an exact lower-case ${request.kind} MIME type at ${path}.allowedMimeTypes[${index}]`,
      );
    }
    return parsed;
  });
  if (new Set(allowedMimeTypes).size !== allowedMimeTypes.length) {
    throw new A2uiParseError(`Expected unique MIME types at ${path}.allowedMimeTypes`);
  }
  context.mediaPolicyOutputLength +=
    sourceOrigin.length +
    allowedRedirectOrigins.reduce((total, origin) => total + origin.length, 0) +
    allowedMimeTypes.reduce((total, mimeType) => total + mimeType.length, 0);
  if (context.mediaPolicyOutputLength > A2UI_V1_MAX_SOURCE_LENGTH) {
    throw new A2uiParseError(
      `Expanded A2UI native plan exceeds media-policy output length of ${A2UI_V1_MAX_SOURCE_LENGTH}`,
    );
  }
  const maximumBytes = parseBoundedPositiveInteger(
    policy.maximumBytes,
    A2UI_V1_NATIVE_MAX_MEDIA_BYTES,
    `${path}.maximumBytes`,
  );
  const maximumRedirects = parseBoundedNonNegativeInteger(
    policy.maximumRedirects,
    A2UI_V1_NATIVE_MAX_MEDIA_REDIRECTS,
    `${path}.maximumRedirects`,
  );
  const allowsAutoplay = parsePolicyBoolean(policy.allowsAutoplay, `${path}.allowsAutoplay`);
  const allowsBackgroundPlayback = parsePolicyBoolean(
    policy.allowsBackgroundPlayback,
    `${path}.allowsBackgroundPlayback`,
  );
  const allowsExternalRoutes = parsePolicyBoolean(
    policy.allowsExternalRoutes,
    `${path}.allowsExternalRoutes`,
  );
  const requiresUserActivation = parsePolicyBoolean(
    policy.requiresUserActivation,
    `${path}.requiresUserActivation`,
  );
  if (allowsAutoplay && requiresUserActivation) {
    throw new A2uiParseError(
      `A2UI media policy cannot allow autoplay while requiring user activation at ${path}`,
    );
  }
  return Object.freeze({
    sourceOrigin,
    allowedRedirectOrigins: Object.freeze(allowedRedirectOrigins),
    allowedMimeTypes: Object.freeze(allowedMimeTypes),
    maximumBytes,
    maximumRedirects,
    allowsAutoplay,
    allowsBackgroundPlayback,
    allowsExternalRoutes,
    requiresUserActivation,
  });
}

function parseHostExtensionCapabilityGrant(
  value: unknown,
  permissionNeeds: readonly string[],
  resourceNeeds: readonly string[],
  path: string,
): NativeHostExtensionCapabilityGrant {
  const grant = parseJsonObject(value, path);
  const keys = Object.keys(grant);
  if (keys.some((key) => key !== "permissions" && key !== "resources")) {
    throw new A2uiParseError(`Unexpected host-extension capability grant field at ${path}`);
  }
  const permissions = parseExactGrantNames(
    grant.permissions,
    permissionNeeds,
    `${path}.permissions`,
  );
  const resources = parseExactGrantNames(grant.resources, resourceNeeds, `${path}.resources`);
  return Object.freeze({ permissions, resources });
}

function parseExactGrantNames(
  value: JsonValue | undefined,
  expected: readonly string[],
  path: string,
): readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new A2uiParseError(`Expected an array of capability identifiers at ${path}`);
  }
  const names = value as readonly string[];
  if (new Set(names).size !== names.length) {
    throw new A2uiParseError(`Expected unique capability identifiers at ${path}`);
  }
  const actualSet = new Set(names);
  if (actualSet.size !== expected.length || expected.some((name) => !actualSet.has(name))) {
    throw new A2uiParseError(`Expected ${path} to exactly grant the manifest-declared needs`);
  }
  return Object.freeze([...expected]);
}

function parsePolicyBoolean(value: JsonValue | undefined, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new A2uiParseError(`Expected a boolean at ${path}`);
  }
  return value;
}

function parseHttpUrlOrigin(value: string, path: string): string {
  const UrlConstructor = (globalThis as unknown as { readonly URL?: UrlConstructorLike }).URL;
  if (UrlConstructor === undefined) {
    throw new A2uiParseError(`The host runtime cannot validate a media origin at ${path}`);
  }
  try {
    return new UrlConstructor(value).origin;
  } catch (cause) {
    throw new A2uiParseError(`Expected an HTTP(S) media URL at ${path}`, { cause });
  }
}

function parseExactHttpOrigin(value: JsonValue | undefined, path: string): string {
  const origin = expectString(value, path);
  if (/\s|\p{Cf}/u.test(origin) || hasAsciiControlCharacter(origin)) {
    throw new A2uiParseError(`Expected an exact HTTP(S) origin at ${path}`);
  }
  const UrlConstructor = (globalThis as unknown as { readonly URL?: UrlConstructorLike }).URL;
  if (UrlConstructor === undefined) {
    throw new A2uiParseError(`The host runtime cannot validate a resource origin at ${path}`);
  }
  let parsed: UrlLike;
  try {
    parsed = new UrlConstructor(origin);
  } catch (cause) {
    throw new A2uiParseError(`Expected an exact HTTP(S) origin at ${path}`, { cause });
  }
  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.origin !== origin
  ) {
    throw new A2uiParseError(`Expected an exact HTTP(S) origin at ${path}`);
  }
  return parsed.origin;
}

function parseBoundedPositiveInteger(
  value: JsonValue | undefined,
  maximum: number,
  path: string,
): number {
  const result = expectFiniteNumber(value, path);
  if (!Number.isInteger(result) || result < 1 || result > maximum) {
    throw new A2uiParseError(`Expected an integer from 1 through ${maximum} at ${path}`);
  }
  return result;
}

function parseBoundedNonNegativeInteger(
  value: JsonValue | undefined,
  maximum: number,
  path: string,
): number {
  const result = expectFiniteNumber(value, path);
  if (!Number.isInteger(result) || result < 0 || result > maximum) {
    throw new A2uiParseError(`Expected an integer from 0 through ${maximum} at ${path}`);
  }
  return result;
}

function hasAsciiControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) {
      return true;
    }
  }
  return false;
}

function recordOpenUrl(value: string, path: string, context: AdapterContext): string {
  context.openUrlLength += value.length;
  if (context.openUrlLength > A2UI_V1_MAX_SOURCE_LENGTH) {
    throw new A2uiParseError(
      `Expanded A2UI native plan exceeds maximum openUrl length of ${A2UI_V1_MAX_SOURCE_LENGTH} at ${path}`,
    );
  }
  return value;
}

/** Revalidates an untrusted URL descriptor before it crosses into a host component callback. */
export function parseA2uiV1NativeOpenUrlDescriptor(
  value: unknown,
  path: string,
): A2uiV1NativeOpenUrlDescriptor {
  const descriptor = parseJsonObject(value, path);
  const allowedKeys = new Set(["instanceKey", "sourceComponentId", "surfaceId", "url"]);
  for (const key of Object.keys(descriptor)) {
    if (!allowedKeys.has(key)) {
      throw new A2uiParseError(`Unexpected field ${JSON.stringify(key)} at ${path}`);
    }
  }
  const instanceKey = descriptor.instanceKey;
  if (instanceKey !== undefined && (typeof instanceKey !== "string" || instanceKey.length === 0)) {
    throw new A2uiParseError(`Expected a non-empty string at ${path}.instanceKey`);
  }
  return {
    url: normalizeOpenUrl(expectString(descriptor.url, `${path}.url`), `${path}.url`),
    surfaceId: expectNonEmptyString(descriptor.surfaceId, `${path}.surfaceId`),
    sourceComponentId: expectNonEmptyString(
      descriptor.sourceComponentId,
      `${path}.sourceComponentId`,
    ),
    ...(instanceKey === undefined ? {} : { instanceKey }),
  };
}

function expectNonEmptyString(value: JsonValue | undefined, path: string): string {
  const result = expectString(value, path);
  if (result.length === 0) {
    throw new A2uiParseError(`Expected a non-empty string at ${path}`);
  }
  return result;
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
    if (VALIDATION_FUNCTION_NAMES.has(value.call)) {
      return resolveValidationFunction(value, path, context, scope);
    }
    if (value.call === "formatNumber" || value.call === "formatCurrency") {
      return resolveNumberFormat(value, path, context, scope);
    }
    if (value.call === "formatDate") {
      return resolveDateFormat(value, path, context, scope);
    }
    if (value.call === "pluralize") {
      return resolvePluralize(value, path, context, scope);
    }
    if (value.call === "and" || value.call === "or") {
      return resolveBooleanList(value, path, context, scope);
    }
    if (value.call === "not") {
      const args = expectObject(value.args, `${path}.args`);
      return !resolveDynamicBoolean(args.value, `${path}.args.value`, context, scope);
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

const DATE_NUMBER = /^[+-]?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_ONLY = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|([+-])(\d{2}):(\d{2}))?$/;
const RFC_3339_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/;
const A2UI_V1_MAX_DATE_PATTERN_TOKENS = 128;

const DATE_PATTERN_TOKENS = Object.freeze([
  "MMMM",
  "EEEE",
  "yyyy",
  "MMM",
  "MM",
  "dd",
  "hh",
  "HH",
  "mm",
  "ss",
  "yy",
  "M",
  "d",
  "E",
  "h",
  "H",
  "a",
] as const);
const DATE_PATTERN_TOKEN_SET: ReadonlySet<string> = new Set(DATE_PATTERN_TOKENS);

type DatePatternToken = (typeof DATE_PATTERN_TOKENS)[number];
type DatePatternPart =
  | { readonly kind: "literal"; readonly value: string }
  | { readonly kind: "token"; readonly value: DatePatternToken };

function validateDateTimeInputValue(
  value: string,
  enableDate: boolean,
  enableTime: boolean,
  path: string,
  allowEmpty: boolean,
): void {
  if (allowEmpty && value.length === 0) {
    return;
  }
  if (enableDate && enableTime) {
    parseDateValue(value, path);
    if (RFC_3339_TIMESTAMP.exec(value) === null) {
      throw new A2uiParseError(`Expected an RFC 3339 date-time at ${path}`);
    }
    return;
  }
  if (enableDate) {
    const match = DATE_ONLY.exec(value);
    if (match === null) {
      throw new A2uiParseError(`Expected a yyyy-MM-dd date at ${path}`);
    }
    validateCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]), path);
    return;
  }
  parseTimeOnly(value, path);
}

/** Internal mounted-renderer guard for values emitted by a trusted host date/time component. */
export function validateA2uiV1NativeDateTimeInputChange(
  value: string,
  enableDate: boolean,
  enableTime: boolean,
  minimum: string | undefined,
  maximum: string | undefined,
  path: string,
): void {
  if (!enableDate && !enableTime) {
    throw new A2uiParseError(`A2UI DateTimeInput at ${path} must enable date, time, or both`);
  }
  validateDateTimeInputValue(value, enableDate, enableTime, `${path}.value`, true);
  if (minimum !== undefined) {
    validateDateTimeInputValue(minimum, enableDate, enableTime, `${path}.minimum`, false);
  }
  if (maximum !== undefined) {
    validateDateTimeInputValue(maximum, enableDate, enableTime, `${path}.maximum`, false);
  }
  const minimumSort =
    minimum === undefined
      ? undefined
      : dateTimeInputSortValue(minimum, enableDate, enableTime, `${path}.minimum`);
  const maximumSort =
    maximum === undefined
      ? undefined
      : dateTimeInputSortValue(maximum, enableDate, enableTime, `${path}.maximum`);
  if (minimumSort !== undefined && maximumSort !== undefined && minimumSort > maximumSort) {
    throw new A2uiParseError(`Expected ${path}.minimum not to exceed maximum`);
  }
  if (value.length === 0) {
    return;
  }
  const valueSort = dateTimeInputSortValue(value, enableDate, enableTime, `${path}.value`);
  if (minimumSort !== undefined && valueSort < minimumSort) {
    throw new A2uiParseError(`Expected ${path}.value not to be earlier than minimum`);
  }
  if (maximumSort !== undefined && valueSort > maximumSort) {
    throw new A2uiParseError(`Expected ${path}.value not to be later than maximum`);
  }
}

function dateTimeInputSortValue(
  value: string,
  enableDate: boolean,
  enableTime: boolean,
  path: string,
): number {
  if (enableDate && enableTime) {
    return parseDateValue(value, path).getTime();
  }
  if (enableDate) {
    const match = DATE_ONLY.exec(value);
    if (match === null) {
      throw new A2uiParseError(`Expected a yyyy-MM-dd date at ${path}`);
    }
    validateCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]), path);
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  return parseTimeOnly(value, path);
}

function parseTimeOnly(value: string, path: string): number {
  const match = TIME_ONLY.exec(value);
  if (match === null) {
    throw new A2uiParseError(`Expected an ISO 8601 time at ${path}`);
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? "0");
  if (hour > 23 || minute > 59 || second > 59) {
    throw new A2uiParseError(`Invalid ISO 8601 time at ${path}`);
  }
  const fraction = match[4] ?? "";
  const millisecond = Number(fraction.slice(0, 3).padEnd(3, "0"));
  let result = ((hour * 60 + minute) * 60 + second) * 1_000 + millisecond;
  if (match[5] !== undefined && match[5] !== "Z") {
    const offsetHour = Number(match[7]);
    const offsetMinute = Number(match[8]);
    if (offsetHour > 23 || offsetMinute > 59) {
      throw new A2uiParseError(`Invalid ISO 8601 time offset at ${path}`);
    }
    const direction = match[6] === "+" ? 1 : -1;
    result -= direction * (offsetHour * 60 + offsetMinute) * 60_000;
  }
  return result;
}

function resolveDateFormat(
  call: JsonObject,
  path: string,
  context: AdapterContext,
  scope: BindingScope | undefined,
): string {
  const args = expectObject(call.args, `${path}.args`);
  const value = resolveDynamicValue(args.value, `${path}.args.value`, context, scope);
  const pattern = resolveDynamicString(args.format, `${path}.args.format`, context, scope);
  const date = parseDateValue(value, `${path}.args.value`);
  const result = formatDatePattern(date, pattern, path, context);
  return recordFormattedString(result, path, context);
}

function parseDateValue(value: JsonValue, path: string): Date {
  if (typeof value === "number") {
    return dateFromEpoch(value, path);
  }
  if (typeof value !== "string") {
    throw new A2uiParseError(`Expected a date string or finite epoch number at ${path}`);
  }
  if (DATE_NUMBER.test(value)) {
    return dateFromEpoch(Number(value), path);
  }

  const dateOnly = DATE_ONLY.exec(value);
  if (dateOnly !== null) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    validateCalendarDate(year, month, day, path);
    const date = new Date(0);
    date.setFullYear(year, month - 1, day);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  const timestamp = RFC_3339_TIMESTAMP.exec(value);
  if (timestamp === null) {
    throw new A2uiParseError(
      `Expected an RFC 3339 timestamp, yyyy-MM-dd date, or finite epoch number at ${path}`,
    );
  }
  const year = Number(timestamp[1]);
  const month = Number(timestamp[2]);
  const day = Number(timestamp[3]);
  const hour = Number(timestamp[4]);
  const minute = Number(timestamp[5]);
  const second = Number(timestamp[6]);
  validateCalendarDate(year, month, day, path);
  if (hour > 23 || minute > 59 || second > 59) {
    throw new A2uiParseError(`Invalid RFC 3339 time at ${path}`);
  }
  const fraction = timestamp[7] ?? "";
  const millisecond = Number(fraction.slice(0, 3).padEnd(3, "0"));
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, millisecond);
  if (timestamp[8] !== "Z") {
    const offsetHour = Number(timestamp[10]);
    const offsetMinute = Number(timestamp[11]);
    if (offsetHour > 23 || offsetMinute > 59) {
      throw new A2uiParseError(`Invalid RFC 3339 offset at ${path}`);
    }
    const direction = timestamp[9] === "+" ? 1 : -1;
    date.setTime(date.getTime() - direction * (offsetHour * 60 + offsetMinute) * 60_000);
  }
  if (!Number.isFinite(date.getTime())) {
    throw new A2uiParseError(`Date value is outside the supported range at ${path}`);
  }
  return date;
}

function dateFromEpoch(value: number, path: string): Date {
  if (!Number.isFinite(value)) {
    throw new A2uiParseError(`Expected a date string or finite epoch number at ${path}`);
  }
  const milliseconds = Math.abs(value) > 10_000_000_000 ? value : value * 1_000;
  const date = new Date(milliseconds);
  if (!Number.isFinite(date.getTime())) {
    throw new A2uiParseError(`Epoch value is outside the supported date range at ${path}`);
  }
  return date;
}

function validateCalendarDate(year: number, month: number, day: number, path: string): void {
  const candidate = new Date(0);
  candidate.setUTCFullYear(year, month - 1, day);
  candidate.setUTCHours(0, 0, 0, 0);
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new A2uiParseError(`Invalid calendar date at ${path}`);
  }
}

function formatDatePattern(
  date: Date,
  pattern: string,
  path: string,
  context: AdapterContext,
): string {
  const parts = parseDatePattern(pattern, path);
  const hasDay = parts.some(
    (part) => part.kind === "token" && (part.value === "d" || part.value === "dd"),
  );
  return parts
    .map((part) =>
      part.kind === "literal"
        ? part.value
        : formatDateToken(date, part.value, hasDay, path, context),
    )
    .join("");
}

function parseDatePattern(pattern: string, path: string): readonly DatePatternPart[] {
  const parts: DatePatternPart[] = [];
  let tokenCount = 0;
  for (let index = 0; index < pattern.length;) {
    if (pattern[index] === "'") {
      const literal = readQuotedDateLiteral(pattern, index, path);
      parts.push({ kind: "literal", value: literal.value });
      index = literal.end;
      continue;
    }
    const character = pattern[index]!;
    if (/[A-Za-z]/.test(character)) {
      let end = index + 1;
      while (pattern[end] === character) {
        end += 1;
      }
      const field = pattern.slice(index, end);
      if (!DATE_PATTERN_TOKEN_SET.has(field)) {
        throw new A2uiParseError(
          `Unsupported Unicode date pattern token ${JSON.stringify(field)} at ${path}.args.format`,
        );
      }
      tokenCount += 1;
      if (tokenCount > A2UI_V1_MAX_DATE_PATTERN_TOKENS) {
        throw new A2uiParseError(
          `A2UI date pattern at ${path}.args.format exceeds maximum of ${A2UI_V1_MAX_DATE_PATTERN_TOKENS} tokens`,
        );
      }
      parts.push({ kind: "token", value: field as DatePatternToken });
      index = end;
      continue;
    }
    const previous = parts.at(-1);
    if (previous?.kind === "literal") {
      parts[parts.length - 1] = { kind: "literal", value: previous.value + character };
    } else {
      parts.push({ kind: "literal", value: character });
    }
    index += 1;
  }
  if (
    parts.some((part) => part.kind === "token" && (part.value === "h" || part.value === "hh")) &&
    !parts.some((part) => part.kind === "token" && part.value === "a")
  ) {
    throw new A2uiParseError(
      `A2UI date pattern at ${path}.args.format requires token "a" when using "h" or "hh"`,
    );
  }
  return parts;
}

function readQuotedDateLiteral(
  pattern: string,
  start: number,
  path: string,
): { readonly end: number; readonly value: string } {
  if (pattern[start + 1] === "'") {
    return { end: start + 2, value: "'" };
  }
  let value = "";
  for (let index = start + 1; index < pattern.length; index += 1) {
    if (pattern[index] !== "'") {
      value += pattern[index];
      continue;
    }
    if (pattern[index + 1] === "'") {
      value += "'";
      index += 1;
      continue;
    }
    return { end: index + 1, value };
  }
  throw new A2uiParseError(`Unterminated quoted literal at ${path}.args.format`);
}

function formatDateToken(
  date: Date,
  token: DatePatternToken,
  hasDay: boolean,
  path: string,
  context: AdapterContext,
): string {
  const cacheKey = `${token}:${hasDay ? "day" : "standalone"}`;
  const cached = context.dateFormats.get(cacheKey);
  const formatter = cached ?? createDateTokenFormatter(token, hasDay, path, context.locale);
  context.dateFormats.set(cacheKey, formatter);
  const partType = datePartType(token);
  const part = formatter.formatToParts(date).find((candidate) => candidate.type === partType);
  if (part === undefined) {
    throw new A2uiParseError(`A2UI native adapter could not format token ${token} at ${path}`);
  }
  if (token === "yyyy") {
    return normalizeLocalizedDateNumber(part.value, 4, path, context);
  }
  if (
    token === "MM" ||
    token === "dd" ||
    token === "hh" ||
    token === "HH" ||
    token === "mm" ||
    token === "ss"
  ) {
    return normalizeLocalizedDateNumber(part.value, 2, path, context);
  }
  if (token === "M" || token === "d" || token === "h" || token === "H") {
    return normalizeLocalizedDateNumber(part.value, 1, path, context);
  }
  return part.value;
}

function normalizeLocalizedDateNumber(
  value: string,
  width: number,
  path: string,
  context: AdapterContext,
): string {
  const length = Array.from(value).length;
  if ((width === 1 && length === 1) || (width > 1 && length >= width)) {
    return value;
  }
  const key = JSON.stringify([context.locale ?? null, "date-zero"]);
  let formatter = context.numberFormats.get(key);
  if (formatter === undefined) {
    try {
      formatter = new Intl.NumberFormat(context.locale, { useGrouping: false });
      context.numberFormats.set(key, formatter);
    } catch (cause) {
      throw new A2uiParseError(`Invalid year-format options at ${path}`, { cause });
    }
  }
  const zero = formatter.formatToParts(0).find((part) => part.type === "integer")?.value;
  if (zero === undefined) {
    throw new A2uiParseError(`A2UI native adapter could not localize a padded year at ${path}`);
  }
  if (width === 1) {
    let normalized = value;
    while (Array.from(normalized).length > 1 && normalized.startsWith(zero)) {
      normalized = normalized.slice(zero.length);
    }
    return normalized;
  }
  return `${zero.repeat(width - length)}${value}`;
}

function createDateTokenFormatter(
  token: DatePatternToken,
  hasDay: boolean,
  path: string,
  locale: string | undefined,
): Intl.DateTimeFormat {
  const options: Intl.DateTimeFormatOptions =
    token === "yy"
      ? { year: "2-digit" }
      : token === "yyyy"
        ? { year: "numeric" }
        : token === "M"
          ? { month: "numeric", ...(hasDay ? { day: "numeric" } : {}) }
          : token === "MM"
            ? { month: "2-digit", ...(hasDay ? { day: "numeric" } : {}) }
            : token === "MMM"
              ? { month: "short", ...(hasDay ? { day: "numeric" } : {}) }
              : token === "MMMM"
                ? { month: "long", ...(hasDay ? { day: "numeric" } : {}) }
                : token === "d"
                  ? { day: "numeric" }
                  : token === "dd"
                    ? { day: "2-digit" }
                    : token === "E"
                      ? { weekday: "short" }
                      : token === "EEEE"
                        ? { weekday: "long" }
                        : token === "h" || token === "hh" || token === "a"
                          ? {
                              hour: token === "hh" ? "2-digit" : "numeric",
                              hourCycle: "h12",
                            }
                          : token === "H" || token === "HH"
                            ? {
                                hour: token === "HH" ? "2-digit" : "numeric",
                                hourCycle: "h23",
                              }
                            : token === "mm"
                              ? { minute: "2-digit" }
                              : { second: "2-digit" };
  try {
    return new Intl.DateTimeFormat(locale, options);
  } catch (cause) {
    throw new A2uiParseError(`Invalid date-format options at ${path}`, { cause });
  }
}

function datePartType(token: DatePatternToken): Intl.DateTimeFormatPartTypes {
  if (token === "yy" || token === "yyyy") {
    return "year";
  }
  if (token === "M" || token === "MM" || token === "MMM" || token === "MMMM") {
    return "month";
  }
  if (token === "d" || token === "dd") {
    return "day";
  }
  if (token === "E" || token === "EEEE") {
    return "weekday";
  }
  if (token === "h" || token === "hh" || token === "H" || token === "HH") {
    return "hour";
  }
  if (token === "mm") {
    return "minute";
  }
  if (token === "ss") {
    return "second";
  }
  return "dayPeriod";
}

const PLURAL_CATEGORIES = Object.freeze(["zero", "one", "two", "few", "many", "other"] as const);

function resolvePluralize(
  call: JsonObject,
  path: string,
  context: AdapterContext,
  scope: BindingScope | undefined,
): string {
  const args = expectObject(call.args, `${path}.args`);
  const value = resolveDynamicNumber(args.value, `${path}.args.value`, context, scope);
  const forms = new Map<Intl.LDMLPluralRule, string>();
  for (const category of PLURAL_CATEGORIES) {
    if (args[category] !== undefined) {
      forms.set(
        category,
        resolveDynamicString(args[category], `${path}.args.${category}`, context, scope),
      );
    }
  }
  const other = forms.get("other");
  if (other === undefined) {
    throw new A2uiParseError(`Missing plural fallback at ${path}.args.other`);
  }
  const category = getPluralRules(context, path).select(value);
  return recordFormattedString(forms.get(category) ?? other, path, context);
}

function getPluralRules(context: AdapterContext, path: string): Intl.PluralRules {
  const key = context.locale ?? "";
  const cached = context.pluralRules.get(key);
  if (cached !== undefined) {
    return cached;
  }
  try {
    if (
      context.locale !== undefined &&
      Intl.PluralRules.supportedLocalesOf(context.locale, { localeMatcher: "lookup" }).length === 0
    ) {
      throw new A2uiParseError(
        `Locale ${JSON.stringify(context.locale)} does not support plural rules at ${path}`,
      );
    }
    const rules = new Intl.PluralRules(context.locale, { type: "cardinal" });
    context.pluralRules.set(key, rules);
    return rules;
  } catch (cause) {
    if (cause instanceof A2uiParseError) {
      throw cause;
    }
    throw new A2uiParseError(`A2UI native adapter could not construct plural rules at ${path}`, {
      cause,
    });
  }
}

function resolveBooleanList(
  call: JsonObject & { readonly call: string },
  path: string,
  context: AdapterContext,
  scope: BindingScope | undefined,
): boolean {
  const args = expectObject(call.args, `${path}.args`);
  if (!Array.isArray(args.values) || args.values.length < 2) {
    throw new A2uiParseError(`Expected at least two boolean values at ${path}.args.values`);
  }
  const values = args.values.map((value, index) =>
    resolveDynamicBoolean(value, `${path}.args.values[${index}]`, context, scope),
  );
  return call.call === "and" ? values.every(Boolean) : values.some(Boolean);
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

function expectFiniteNumber(value: JsonValue | undefined, path: string): number {
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
