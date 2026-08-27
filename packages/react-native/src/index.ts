import { createA2uiV1ActionEnvelope, validateA2uiV1SurfaceState } from "@mcp-native/a2ui";
import type {
  A2uiNode,
  A2uiSurface,
  A2uiV1ActionEnvelope,
  A2uiV1SurfaceState,
  A2uiV1SurfaceValidationPolicy,
} from "@mcp-native/a2ui";
import { parseJsonObject, parseMcpNativeAction } from "@mcp-native/core";
import type { JsonObject, JsonValue, McpNativeAction, McpToolCallResult } from "@mcp-native/core";
import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";

import type {
  NativeAccessibilityProps,
  NativeComponentCatalog,
  NativeTextInputComponentProps,
  NativeViewStyle,
} from "./component-adapters.js";

import {
  createA2uiV1NativeRenderPlan,
  createA2uiV1NativeRenderPlanForLocalEdits,
  parseA2uiV1NativeOpenUrlDescriptor,
  resolveA2uiV1NativeEvent,
  resolveA2uiV1NativeOpenUrl,
  type A2uiV1NativeEventDescriptor,
  type A2uiV1NativeOpenUrlDescriptor,
} from "./v1.js";

export {
  createNativeButtonAdapter,
  createNativeTextAdapter,
  createNativeTextInputAdapter,
  createNativeViewAdapter,
} from "./component-adapters.js";
export type { NativeComponentPropMapper } from "./component-adapters.js";
export type {
  NativeAccessibilityProps,
  NativeButtonComponentProps,
  NativeComponentCatalog,
  NativeTextComponentProps,
  NativeTextInputComponentProps,
  NativeViewComponentProps,
  NativeViewStyle,
} from "./component-adapters.js";

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

export type NativeActionHandler = (action: McpNativeAction) => void;

export type NativeBindingChangeHandler = (binding: string, value: string) => void;

export interface McpNativeSurfaceProps {
  readonly surface: A2uiSurface;
  readonly components: NativeComponentCatalog;
  readonly onAction: NativeActionHandler;
  readonly onBindingChange?: NativeBindingChangeHandler;
}

export type A2uiV1NativeActionHandler = (
  envelope: A2uiV1ActionEnvelope,
  dataModel?: JsonObject,
) => void;

/** Synchronous host authorization checked during the originating Button press. */
export type A2uiV1NativeOpenUrlPolicy = (request: A2uiV1NativeOpenUrlDescriptor) => boolean;

/** Host-owned platform opener. The library never invokes a browser or URL handler directly. */
export type A2uiV1NativeOpenUrlHandler = (request: A2uiV1NativeOpenUrlDescriptor) => void;

export interface A2uiV1NativeSurfaceProps {
  readonly surface: A2uiV1SurfaceState;
  readonly policy: A2uiV1SurfaceValidationPolicy;
  readonly components: NativeComponentCatalog;
  /** Receives an official envelope and, only after explicit surface opt-in, the local model. */
  readonly onAction: A2uiV1NativeActionHandler;
  /** Required with `onOpenUrl` when this surface is allowed to use the local `openUrl` function. */
  readonly openUrlPolicy?: A2uiV1NativeOpenUrlPolicy;
  /** Executes an authorized URL while the originating Button press is still active. */
  readonly onOpenUrl?: A2uiV1NativeOpenUrlHandler;
  /** Observes renderer-local state changes without turning keystrokes into network calls. */
  readonly onDataModelChange?: (dataModel: JsonObject) => void;
  readonly actionMetadata?: JsonObject;
  /** Host-selected BCP 47 locale for renderer-side number, currency, date, and plural formatting. */
  readonly locale?: string;
  /** Injectable RFC 3339 timestamp source for host clocks and deterministic tests. */
  readonly now?: () => string;
}

export interface McpNativeDispatcher {
  dispatch(action: McpNativeAction): Promise<McpToolCallResult>;
}

export interface McpNativeActionDispatcherOptions {
  readonly onError: (error: unknown) => void;
  readonly onResult?: (result: McpToolCallResult) => void;
}

export function createNativeRenderPlan(surface: A2uiSurface): NativeElement {
  return renderNode(surface.root);
}

/** Memoizes the trusted render plan for a validated surface identity. */
export function useNativeRenderPlan(surface: A2uiSurface): NativeElement {
  return useMemo(() => createNativeRenderPlan(surface), [surface]);
}

/**
 * Creates a stable, synchronous event handler for a runtime's asynchronous
 * action dispatcher. Synchronous throws and promise rejections are always
 * routed to the required error hook.
 */
export function useMcpNativeActionDispatcher(
  dispatcher: McpNativeDispatcher,
  options: McpNativeActionDispatcherOptions,
): NativeActionHandler {
  const { onError, onResult } = options;

  return useCallback(
    (action) => {
      void Promise.resolve()
        .then(() => dispatcher.dispatch(action))
        .then(
          (result) => onResult?.(result),
          (error: unknown) => onError(error),
        );
    },
    [dispatcher, onError, onResult],
  );
}

/** Renders a validated surface with the host's locally bundled components. */
export function McpNativeSurface({
  surface,
  components,
  onAction,
  onBindingChange,
}: McpNativeSurfaceProps): ReactElement {
  const plan = useNativeRenderPlan(surface);
  return renderElement(plan, components, {
    onAction,
    ...(onBindingChange === undefined ? {} : { onBindingChange }),
  });
}

/**
 * Mounts the supported A2UI v1 subset with renderer-local two-way bindings.
 * Agent events are resolved against the latest local model at press time.
 */
export function A2uiV1NativeSurface({
  surface,
  policy,
  components,
  onAction,
  openUrlPolicy,
  onOpenUrl,
  onDataModelChange,
  actionMetadata,
  locale,
  now = currentTimestamp,
}: A2uiV1NativeSurfaceProps): ReactElement {
  const validatedSurface = useMemo(
    () => validateA2uiV1SurfaceState(surface, policy),
    [policy, surface],
  );
  const sourceDataModel = validatedSurface.dataModel;
  const sourceDataModelKey = createDataModelSourceKey(validatedSurface);
  const sourceComponentsKey = createComponentSourceKey(validatedSurface);
  const [localState, setLocalState] = useState(() => ({
    sourceDataModelKey,
    sourceComponentsKey,
    dataModel: sourceDataModel,
    hasLocalEdits: false,
  }));
  const hasCurrentLocalState = localState.sourceDataModelKey === sourceDataModelKey;
  const dataModel = hasCurrentLocalState ? localState.dataModel : sourceDataModel;
  const hasLocalEdits = hasCurrentLocalState && localState.hasLocalEdits;
  const tolerateInvalidLocalOpenUrls =
    hasLocalEdits && localState.sourceComponentsKey === sourceComponentsKey;
  const dataModelRef = useRef(dataModel);
  dataModelRef.current = dataModel;

  useEffect(() => {
    setLocalState((current) => {
      if (current.sourceDataModelKey === sourceDataModelKey) {
        return current;
      }
      return {
        sourceDataModelKey,
        sourceComponentsKey,
        dataModel: sourceDataModel,
        hasLocalEdits: false,
      };
    });
  }, [sourceComponentsKey, sourceDataModel, sourceDataModelKey]);

  const plan = useMemo(
    () =>
      (tolerateInvalidLocalOpenUrls
        ? createA2uiV1NativeRenderPlanForLocalEdits
        : createA2uiV1NativeRenderPlan)(validatedSurface, policy, {
        dataModel,
        ...(locale === undefined ? {} : { locale }),
      }),
    [dataModel, locale, policy, tolerateInvalidLocalOpenUrls, validatedSurface],
  );
  const handleBindingChange = useCallback(
    (binding: string, value: string) => {
      const next = updateDataModelBinding(dataModelRef.current, binding, value);
      dataModelRef.current = next;
      setLocalState({
        sourceDataModelKey,
        sourceComponentsKey,
        dataModel: next,
        hasLocalEdits: true,
      });
      onDataModelChange?.(parseJsonObject(next, "renderer data model"));
    },
    [onDataModelChange, sourceComponentsKey, sourceDataModelKey],
  );
  const handleEvent = useCallback(
    (event: A2uiV1NativeEventDescriptor) => {
      const currentDataModel = dataModelRef.current;
      const resolved = resolveA2uiV1NativeEvent(
        validatedSurface,
        policy,
        event.sourceComponentId,
        currentDataModel,
        {
          ...(event.instanceKey === undefined ? {} : { instanceKey: event.instanceKey }),
          ...(locale === undefined ? {} : { locale }),
        },
      );
      const envelope = createA2uiV1ActionEnvelope({
        name: resolved.name,
        surfaceId: resolved.surfaceId,
        sourceComponentId: resolved.sourceComponentId,
        context: resolved.context,
        ...(resolved.userMessage === undefined ? {} : { userMessage: resolved.userMessage }),
        ...(actionMetadata === undefined ? {} : { metadata: actionMetadata }),
        timestamp: now(),
      });
      if (validatedSurface.sendDataModel) {
        onAction(envelope, parseJsonObject(currentDataModel, "renderer data model"));
      } else {
        onAction(envelope);
      }
    },
    [actionMetadata, locale, now, onAction, policy, validatedSurface],
  );
  const handleOpenUrl = useCallback(
    (request: A2uiV1NativeOpenUrlDescriptor) => {
      const resolved = resolveA2uiV1NativeOpenUrl(
        validatedSurface,
        policy,
        request.sourceComponentId,
        dataModelRef.current,
        {
          ...(request.instanceKey === undefined ? {} : { instanceKey: request.instanceKey }),
          ...(locale === undefined ? {} : { locale }),
        },
      );
      if (openUrlPolicy?.(resolved) === true) {
        onOpenUrl?.(resolved);
      }
    },
    [locale, onOpenUrl, openUrlPolicy, policy, validatedSurface],
  );

  return renderElement(plan, components, {
    onBindingChange: handleBindingChange,
    onV1Event: handleEvent,
    ...(openUrlPolicy === undefined || onOpenUrl === undefined
      ? {}
      : { onV1OpenUrl: handleOpenUrl }),
  });
}

function createDataModelSourceKey(surface: A2uiV1SurfaceState): string {
  return canonicalizeJson([
    surface.surfaceId,
    surface.dataModelRevision ?? null,
    surface.dataModel,
  ]);
}

function createComponentSourceKey(surface: A2uiV1SurfaceState): string {
  return canonicalizeJson(
    [...surface.components.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, component]) => [id, component]),
  );
}

function canonicalizeJson(value: JsonValue): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeJson).join(",")}]`;
  }
  const object = value as JsonObject;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalizeJson(object[key]!)}`)
    .join(",")}}`;
}

function currentTimestamp(): string {
  return new Date().toISOString();
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

interface NativeRenderHandlers {
  readonly onAction?: NativeActionHandler;
  readonly onBindingChange?: NativeBindingChangeHandler;
  readonly onV1Event?: (event: A2uiV1NativeEventDescriptor) => void;
  readonly onV1OpenUrl?: (request: A2uiV1NativeOpenUrlDescriptor) => void;
}

function renderElement(
  element: NativeElement,
  components: NativeComponentCatalog,
  handlers: NativeRenderHandlers,
): ReactElement {
  const accessibilityProps = selectAccessibilityProps(element);
  switch (element.component) {
    case "View": {
      const style = selectViewStyle(element);
      return createElement(
        components.View,
        {
          key: element.key,
          ...accessibilityProps,
          ...(style === undefined ? {} : { style }),
        },
        element.children?.map((child) => renderChildElement(child, components, handlers)),
      );
    }
    case "Text":
      return createElement(components.Text, {
        key: element.key,
        children: expectStringProp(element, "children"),
        ...accessibilityProps,
      });
    case "Button": {
      const title = expectStringProp(element, "title");
      const disabled = optionalBooleanProp(element, "disabled");
      const validationMessages = optionalStringArrayProp(element, "validationMessages");
      const onPress = createButtonPressHandler(element, handlers);
      return createElement(components.Button, {
        key: element.key,
        title,
        accessibilityLabel: accessibilityProps.accessibilityLabel ?? title,
        ...accessibilityProps,
        ...(disabled === undefined ? {} : { disabled }),
        ...(validationMessages === undefined ? {} : { validationMessages }),
        onPress,
      });
    }
    case "TextInput": {
      const label =
        optionalStringProp(element, "label") ?? expectStringProp(element, "placeholder");
      const placeholder = optionalStringProp(element, "placeholder") ?? label;
      const value = optionalStringProp(element, "value");
      const binding = optionalStringProp(element, "binding");
      const invalid = optionalBooleanProp(element, "invalid");
      const validationMessages = optionalStringArrayProp(element, "validationMessages");
      const behaviorProps = selectTextInputBehaviorProps(element);
      return createElement(components.TextInput, {
        key: element.key,
        accessibilityLabel: accessibilityProps.accessibilityLabel ?? label,
        ...accessibilityProps,
        ...behaviorProps,
        placeholder,
        ...(invalid === undefined ? {} : { invalid }),
        ...(validationMessages === undefined ? {} : { validationMessages }),
        ...(value === undefined ? {} : { value }),
        ...(binding === undefined || handlers.onBindingChange === undefined
          ? {}
          : {
              onChangeText: (nextValue: string) => handlers.onBindingChange?.(binding, nextValue),
            }),
      });
    }
  }
}

function renderChildElement(
  element: NativeElement,
  components: NativeComponentCatalog,
  handlers: NativeRenderHandlers,
): ReactElement {
  const rendered = renderElement(element, components, handlers);
  const weight = optionalFiniteNumberProp(element, "weight");
  if (weight === undefined) {
    return rendered;
  }
  if (weight < 0) {
    throw new TypeError(`Expected a non-negative weight at native element ${element.key}`);
  }
  return createElement(
    components.View,
    { key: element.key, style: { flexGrow: weight } satisfies NativeViewStyle },
    rendered,
  );
}

function selectViewStyle(element: NativeElement): NativeViewStyle | undefined {
  const layout = optionalStringProp(element, "layout");
  const justify = optionalStringProp(element, "justify");
  const align = optionalStringProp(element, "align");
  if (layout === undefined) {
    if (justify !== undefined || align !== undefined) {
      throw new TypeError(`Missing layout at native element ${element.key}`);
    }
    return undefined;
  }
  if (layout !== "column" && layout !== "row") {
    throw new TypeError(
      `Unsupported layout ${JSON.stringify(layout)} at native element ${element.key}`,
    );
  }
  return {
    flexDirection: layout,
    ...(justify === undefined ? {} : { justifyContent: mapJustifyContent(justify, element.key) }),
    ...(align === undefined ? {} : { alignItems: mapAlignItems(align, element.key) }),
  };
}

function mapJustifyContent(
  value: string,
  elementKey: string,
): NonNullable<NativeViewStyle["justifyContent"]> {
  switch (value) {
    case "start":
      return "flex-start";
    case "end":
      return "flex-end";
    case "center":
      return "center";
    case "spaceAround":
      return "space-around";
    case "spaceBetween":
      return "space-between";
    case "spaceEvenly":
      return "space-evenly";
    default:
      throw new TypeError(
        `Unsupported justify value ${JSON.stringify(value)} at native element ${elementKey}`,
      );
  }
}

function mapAlignItems(
  value: string,
  elementKey: string,
): NonNullable<NativeViewStyle["alignItems"]> {
  switch (value) {
    case "start":
      return "flex-start";
    case "end":
      return "flex-end";
    case "center":
    case "stretch":
      return value;
    default:
      throw new TypeError(
        `Unsupported align value ${JSON.stringify(value)} at native element ${elementKey}`,
      );
  }
}

function selectTextInputBehaviorProps(
  element: NativeElement,
): Pick<NativeTextInputComponentProps, "keyboardType" | "multiline" | "secureTextEntry"> {
  const variant = optionalStringProp(element, "variant");
  switch (variant) {
    case undefined:
    case "shortText":
      return {};
    case "longText":
      return { multiline: true };
    case "number":
      return { keyboardType: "numeric" };
    case "obscured":
      return { secureTextEntry: true };
    default:
      throw new TypeError(
        `Unsupported text input variant ${JSON.stringify(variant)} at native element ${element.key}`,
      );
  }
}

function createButtonPressHandler(
  element: NativeElement,
  handlers: NativeRenderHandlers,
): () => void {
  const disabled = optionalBooleanProp(element, "disabled") === true;
  const hasAction = Object.hasOwn(element.props, "action");
  const hasEvent = Object.hasOwn(element.props, "event");
  const hasOpenUrl = Object.hasOwn(element.props, "openUrl");
  const hasInvalidLocalOpenUrl = Object.hasOwn(element.props, "invalidLocalOpenUrl");
  if (
    Number(hasAction) + Number(hasEvent) + Number(hasOpenUrl) + Number(hasInvalidLocalOpenUrl) !==
    1
  ) {
    throw new TypeError(
      `Expected exactly one action, event, openUrl, or invalid local openUrl at native element ${element.key}`,
    );
  }
  if (hasAction) {
    const action = expectActionProp(element);
    if (handlers.onAction === undefined) {
      throw new TypeError(`Missing native action handler for element ${element.key}`);
    }
    return disabled ? () => undefined : () => handlers.onAction?.(action);
  }
  if (hasEvent) {
    const event = expectV1EventProp(element);
    if (handlers.onV1Event === undefined) {
      throw new TypeError(`Missing A2UI v1 event handler for element ${element.key}`);
    }
    return disabled ? () => undefined : () => handlers.onV1Event?.(event);
  }
  if (hasOpenUrl) {
    const request = expectV1OpenUrlProp(element);
    if (handlers.onV1OpenUrl === undefined) {
      throw new TypeError(`Missing A2UI v1 openUrl policy or handler for element ${element.key}`);
    }
    return disabled ? () => undefined : () => handlers.onV1OpenUrl?.(request);
  }
  expectV1InvalidLocalOpenUrlProp(element);
  if (!disabled) {
    throw new TypeError(`Expected invalid local openUrl element ${element.key} to be disabled`);
  }
  return () => undefined;
}

function selectAccessibilityProps(element: NativeElement): NativeAccessibilityProps {
  const accessibilityLabel = optionalStringProp(element, "accessibilityLabel");
  const accessibilityHint = optionalStringProp(element, "accessibilityHint");
  const live = optionalAccessibilityLiveProp(element);
  const hidden = optionalBooleanProp(element, "accessibilityHidden");
  return {
    ...(accessibilityLabel === undefined ? {} : { accessibilityLabel }),
    ...(accessibilityHint === undefined ? {} : { accessibilityHint }),
    ...(live === undefined
      ? {}
      : { accessibilityLiveRegion: live === "off" ? ("none" as const) : live }),
    ...(hidden === undefined
      ? {}
      : {
          accessibilityElementsHidden: hidden,
          importantForAccessibility: hidden ? ("no-hide-descendants" as const) : ("auto" as const),
        }),
  };
}

function expectStringProp(element: NativeElement, name: string): string {
  const value = element.props[name];
  if (typeof value !== "string") {
    throw new TypeError(`Expected a string at native element ${element.key}.${name}`);
  }
  return value;
}

function optionalStringProp(element: NativeElement, name: string): string | undefined {
  const value = element.props[name];
  return value === undefined ? undefined : expectStringProp(element, name);
}

function optionalStringArrayProp(
  element: NativeElement,
  name: string,
): readonly string[] | undefined {
  const value = element.props[name];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new TypeError(`Expected an array of strings at native element ${element.key}.${name}`);
  }
  return value as readonly string[];
}

function optionalBooleanProp(element: NativeElement, name: string): boolean | undefined {
  const value = element.props[name];
  if (value !== undefined && typeof value !== "boolean") {
    throw new TypeError(`Expected a boolean at native element ${element.key}.${name}`);
  }
  return value;
}

function optionalFiniteNumberProp(element: NativeElement, name: string): number | undefined {
  const value = element.props[name];
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) {
    throw new TypeError(`Expected a finite number at native element ${element.key}.${name}`);
  }
  return value;
}

function optionalAccessibilityLiveProp(
  element: NativeElement,
): "assertive" | "off" | "polite" | undefined {
  const value = element.props.accessibilityLive;
  if (value === undefined || value === "assertive" || value === "off" || value === "polite") {
    return value;
  }
  throw new TypeError(
    `Expected an accessibility live value at native element ${element.key}.accessibilityLive`,
  );
}

function expectActionProp(element: NativeElement): McpNativeAction {
  const value = element.props.action;
  const path = `native element ${element.key}.action`;
  try {
    return parseMcpNativeAction(value, path);
  } catch (error) {
    const message = error instanceof Error ? error.message : `Expected a tool action at ${path}`;
    throw new TypeError(message, { cause: error });
  }
}

function expectV1EventProp(element: NativeElement): A2uiV1NativeEventDescriptor {
  const path = `native element ${element.key}.event`;
  const event = parseJsonObject(element.props.event, path);
  rejectObjectKeys(
    event,
    ["context", "instanceKey", "name", "sourceComponentId", "surfaceId", "userMessage"],
    path,
  );
  const name = expectObjectString(event, "name", path);
  const surfaceId = expectObjectString(event, "surfaceId", path);
  const sourceComponentId = expectObjectString(event, "sourceComponentId", path);
  const context = parseJsonObject(event.context, `${path}.context`);
  const instanceKey = event.instanceKey;
  if (instanceKey !== undefined && (typeof instanceKey !== "string" || instanceKey.length === 0)) {
    throw new TypeError(`Expected a non-empty string at ${path}.instanceKey`);
  }
  const userMessage = event.userMessage;
  if (userMessage !== undefined && typeof userMessage !== "string") {
    throw new TypeError(`Expected a string at ${path}.userMessage`);
  }
  return {
    name,
    surfaceId,
    sourceComponentId,
    ...(instanceKey === undefined ? {} : { instanceKey }),
    context,
    ...(userMessage === undefined ? {} : { userMessage }),
  };
}

function expectV1OpenUrlProp(element: NativeElement): A2uiV1NativeOpenUrlDescriptor {
  const path = `native element ${element.key}.openUrl`;
  try {
    return parseA2uiV1NativeOpenUrlDescriptor(element.props.openUrl, path);
  } catch (error) {
    const message = error instanceof Error ? error.message : `Expected an openUrl at ${path}`;
    throw new TypeError(message, { cause: error });
  }
}

function expectV1InvalidLocalOpenUrlProp(element: NativeElement): void {
  const path = `native element ${element.key}.invalidLocalOpenUrl`;
  const marker = parseJsonObject(element.props.invalidLocalOpenUrl, path);
  rejectObjectKeys(marker, ["instanceKey", "sourceComponentId", "surfaceId"], path);
  expectObjectString(marker, "instanceKey", path);
  expectObjectString(marker, "sourceComponentId", path);
  expectObjectString(marker, "surfaceId", path);
}

function expectObjectString(value: JsonObject, name: string, path: string): string {
  const field = value[name];
  if (typeof field !== "string" || field.length === 0) {
    throw new TypeError(`Expected a non-empty string at ${path}.${name}`);
  }
  return field;
}

function rejectObjectKeys(value: JsonObject, allowed: readonly string[], path: string): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new TypeError(`Unexpected field ${JSON.stringify(key)} at ${path}`);
    }
  }
}

function updateDataModelBinding(dataModel: JsonObject, binding: string, value: string): JsonObject {
  if (typeof binding !== "string" || !binding.startsWith("/") || binding.length === 1) {
    throw new TypeError(
      `Expected a non-root absolute JSON Pointer binding, received ${JSON.stringify(binding)}`,
    );
  }
  if (typeof value !== "string") {
    throw new TypeError("Expected a string renderer binding value");
  }
  const next = parseJsonObject(dataModel, "renderer data model");
  const tokens = binding
    .slice(1)
    .split("/")
    .map((token) => decodePointerToken(token, binding));
  let cursor: JsonValue = next;
  for (const [index, token] of tokens.entries()) {
    const last = index === tokens.length - 1;
    if (Array.isArray(cursor)) {
      if (!/^(0|[1-9][0-9]*)$/.test(token)) {
        throw new TypeError(`Invalid array binding index in ${JSON.stringify(binding)}`);
      }
      const arrayIndex = Number(token);
      if (!Number.isSafeInteger(arrayIndex) || arrayIndex >= cursor.length) {
        throw new TypeError(`Renderer binding ${JSON.stringify(binding)} is missing`);
      }
      if (last) {
        if (typeof cursor[arrayIndex] !== "string") {
          throw new TypeError(
            `Renderer binding ${JSON.stringify(binding)} must reference an existing string value`,
          );
        }
        cursor[arrayIndex] = value;
        break;
      }
      cursor = cursor[arrayIndex]!;
      continue;
    }
    if (cursor === null || typeof cursor !== "object" || !Object.hasOwn(cursor, token)) {
      throw new TypeError(`Renderer binding ${JSON.stringify(binding)} is missing`);
    }
    if (last) {
      if (typeof (cursor as Record<string, JsonValue>)[token] !== "string") {
        throw new TypeError(
          `Renderer binding ${JSON.stringify(binding)} must reference an existing string value`,
        );
      }
      defineJsonProperty(cursor as Record<string, JsonValue>, token, value);
      break;
    }
    cursor = (cursor as Record<string, JsonValue>)[token]!;
  }
  return parseJsonObject(next, "renderer data model");
}

function decodePointerToken(token: string, pointer: string): string {
  for (let index = 0; index < token.length; index += 1) {
    if (token[index] !== "~") {
      continue;
    }
    const escaped = token[index + 1];
    if (escaped !== "0" && escaped !== "1") {
      throw new TypeError(`Invalid JSON Pointer escape in ${JSON.stringify(pointer)}`);
    }
    index += 1;
  }
  return token.replaceAll("~1", "/").replaceAll("~0", "~");
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

export {
  A2UI_V1_NATIVE_COMPONENT_NAMES,
  A2UI_V1_NATIVE_MAX_OPEN_URL_LENGTH,
  A2UI_V1_NATIVE_MAX_RENDER_NODES,
  createA2uiV1NativeRenderPlan,
  resolveA2uiV1NativeEvent,
  resolveA2uiV1NativeOpenUrl,
} from "./v1.js";
export type {
  A2uiV1NativeEventDescriptor,
  A2uiV1NativeEventResolutionOptions,
  A2uiV1NativeOpenUrlDescriptor,
  A2uiV1NativeOpenUrlResolutionOptions,
  A2uiV1NativeRenderPlanOptions,
} from "./v1.js";
