import { createA2uiV1ActionEnvelope, validateA2uiV1SurfaceState } from "@mcp-native/a2ui";
import type {
  A2uiNode,
  A2uiSurface,
  A2uiV1ActionEnvelope,
  A2uiV1SurfaceState,
  A2uiV1SurfaceValidationPolicy,
} from "@mcp-native/a2ui";
import { parseJsonObject, parseJsonValue, parseMcpNativeAction } from "@mcp-native/core";
import type { JsonObject, JsonValue, McpNativeAction, McpToolCallResult } from "@mcp-native/core";
import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactElement,
} from "react";

import type {
  NativeAccessibilityProps,
  NativeButtonComponentProps,
  NativeChoicePickerComponentProps,
  NativeChoicePickerOption,
  NativeComponentCatalog,
  NativeIconComponentProps,
  NativeImageComponentProps,
  NativeImageResourcePolicy,
  NativeImageVariant,
  NativeTextComponentProps,
  NativeTextInputComponentProps,
  NativeViewComponentProps,
  NativeViewStyle,
  NativeViewVariant,
} from "./component-adapters.js";
import { A2UI_V1_NATIVE_ICON_NAMES } from "./component-adapters.js";

import {
  A2UI_V1_NATIVE_COMPONENT_NAMES,
  createA2uiV1NativeRenderPlan,
  createA2uiV1NativeRenderPlanForLocalEdits,
  parseA2uiV1NativeOpenUrlDescriptor,
  resolveA2uiV1NativeEvent,
  resolveA2uiV1NativeOpenUrl,
  validateA2uiV1NativeDateTimeInputChange,
  type A2uiV1NativeEventDescriptor,
  type A2uiV1NativeImagePolicy,
  type A2uiV1NativeOpenUrlDescriptor,
} from "./v1.js";

export {
  A2UI_V1_NATIVE_ICON_NAMES,
  createNativeButtonAdapter,
  createNativeCheckBoxAdapter,
  createNativeChoicePickerAdapter,
  createNativeDateTimeInputAdapter,
  createNativeDividerAdapter,
  createNativeIconAdapter,
  createNativeImageAdapter,
  createNativeModalAdapter,
  createNativeSliderAdapter,
  createNativeTabsAdapter,
  createNativeTextAdapter,
  createNativeTextInputAdapter,
  createNativeViewAdapter,
} from "./component-adapters.js";
export type { NativeComponentPropMapper } from "./component-adapters.js";
export type {
  NativeAccessibilityProps,
  NativeAccessibilityRole,
  NativeAccessibilityState,
  NativeButtonComponentProps,
  NativeButtonVariant,
  NativeCheckBoxComponentProps,
  NativeChoicePickerComponentProps,
  NativeChoicePickerDisplayStyle,
  NativeChoicePickerOption,
  NativeChoicePickerVariant,
  NativeComponentCatalog,
  NativeComponentVariants,
  NativeDateTimeInputComponentProps,
  NativeDividerComponentProps,
  NativeIconComponentProps,
  NativeIconName,
  NativeImageComponentProps,
  NativeImageFit,
  NativeImageResourcePolicy,
  NativeImageVariant,
  NativeModalComponentProps,
  NativeSliderComponentProps,
  NativeTabItem,
  NativeTabsComponentProps,
  NativeTextComponentProps,
  NativeTextInputComponentProps,
  NativeTextInputVariant,
  NativeTextVariant,
  NativeViewComponentProps,
  NativeViewStyle,
  NativeViewVariant,
} from "./component-adapters.js";

export type NativeComponentName =
  | "Button"
  | "CheckBox"
  | "ChoicePicker"
  | "DateTimeInput"
  | "Divider"
  | "Icon"
  | "Image"
  | "Modal"
  | "Slider"
  | "Tabs"
  | "Text"
  | "TextInput"
  | "View";

const A2UI_V1_NATIVE_BASE_COMPONENT_NAMES = Object.freeze([
  "Button",
  "Card",
  "Column",
  "List",
  "Row",
  "Text",
  "TextField",
] as const);

const A2UI_V1_NATIVE_OPTIONAL_COMPONENT_SLOTS = Object.freeze([
  "CheckBox",
  "ChoicePicker",
  "DateTimeInput",
  "Divider",
  "Icon",
  "Image",
  "Modal",
  "Slider",
  "Tabs",
] as const);

export interface A2uiV1NativeCatalogCapabilities {
  /** Required before Image can be advertised as an installed capability. */
  readonly imagePolicy?: A2uiV1NativeImagePolicy;
}

/** Returns the exact A2UI subset backed by one locally installed and policy-ready host catalog. */
export function getA2uiV1NativeSupportedComponentNames(
  components: NativeComponentCatalog,
  capabilities: A2uiV1NativeCatalogCapabilities = {},
): readonly string[] {
  const installed = new Set<string>(A2UI_V1_NATIVE_BASE_COMPONENT_NAMES);
  for (const name of A2UI_V1_NATIVE_OPTIONAL_COMPONENT_SLOTS) {
    if (
      components[name] !== undefined &&
      (name !== "Image" || capabilities.imagePolicy !== undefined)
    ) {
      installed.add(name);
    }
  }
  return Object.freeze(A2UI_V1_NATIVE_COMPONENT_NAMES.filter((name) => installed.has(name)));
}

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

/** @deprecated Use `A2uiV1NativeSurface` and its official action envelope handler. */
export type NativeActionHandler = (action: McpNativeAction) => void;

/** @deprecated Use `A2uiV1NativeSurface` renderer-local data-model handling. */
export type NativeBindingChangeHandler = (binding: string, value: string) => void;

/** @deprecated Use `A2uiV1NativeSurfaceProps`. */
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
  /** Required when the reachable surface contains an Image component. */
  readonly imagePolicy?: A2uiV1NativeImagePolicy;
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

/** @deprecated Use `createA2uiV1NativeRenderPlan`. */
export function createNativeRenderPlan(surface: A2uiSurface): NativeElement {
  return renderNode(surface.root);
}

/** @deprecated Use `A2uiV1NativeSurface`. */
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

/** @deprecated Use `A2uiV1NativeSurface`. */
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
  imagePolicy,
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
        ...(imagePolicy === undefined ? {} : { imagePolicy }),
      }),
    [dataModel, imagePolicy, locale, policy, tolerateInvalidLocalOpenUrls, validatedSurface],
  );
  const handleBindingChange = useCallback(
    (binding: string, value: JsonValue) => {
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
    useComponentVariants: true,
    onV1BindingChange: handleBindingChange,
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
  /** A2UI v1-only selection of pinned semantic/style variants. */
  readonly useComponentVariants?: boolean;
  readonly onAction?: NativeActionHandler;
  readonly onBindingChange?: NativeBindingChangeHandler;
  readonly onV1BindingChange?: (binding: string, value: JsonValue) => void;
  readonly onV1Event?: (event: A2uiV1NativeEventDescriptor) => void;
  readonly onV1OpenUrl?: (request: A2uiV1NativeOpenUrlDescriptor) => void;
  readonly onElementActivate?: (key: string) => void;
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
        selectViewComponent(element, components, handlers.useComponentVariants === true),
        {
          key: element.key,
          ...accessibilityProps,
          ...(style === undefined ? {} : { style }),
        },
        element.children?.map((child) => renderChildElement(child, components, handlers)),
      );
    }
    case "Text":
      return createElement(
        selectTextComponent(element, components, handlers.useComponentVariants === true),
        {
          key: element.key,
          children: expectStringProp(element, "children"),
          ...accessibilityProps,
          accessible: accessibilityProps.accessibilityElementsHidden !== true,
          accessibilityRole: "text",
          allowFontScaling: true,
        },
      );
    case "Button": {
      const title = expectStringProp(element, "title");
      const disabled = optionalBooleanProp(element, "disabled");
      const validationMessages = optionalStringArrayProp(element, "validationMessages");
      const onPress = createButtonPressHandler(element, handlers);
      return createElement(
        selectButtonComponent(element, components, handlers.useComponentVariants === true),
        {
          key: element.key,
          title,
          accessibilityLabel: accessibilityProps.accessibilityLabel ?? title,
          ...accessibilityProps,
          accessible: accessibilityProps.accessibilityElementsHidden !== true,
          accessibilityRole: "button",
          accessibilityState: { disabled: disabled === true },
          ...(disabled === undefined ? {} : { disabled }),
          ...(validationMessages === undefined ? {} : { validationMessages }),
          onPress,
        },
      );
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
      return createElement(
        selectTextInputComponent(element, components, handlers.useComponentVariants === true),
        {
          key: element.key,
          accessibilityLabel: accessibilityProps.accessibilityLabel ?? label,
          ...accessibilityProps,
          accessible: accessibilityProps.accessibilityElementsHidden !== true,
          allowFontScaling: true,
          ...behaviorProps,
          placeholder,
          ...(invalid === undefined ? {} : { invalid }),
          ...(validationMessages === undefined ? {} : { validationMessages }),
          ...(value === undefined ? {} : { value }),
          ...(binding === undefined ||
          (handlers.onBindingChange === undefined && handlers.onV1BindingChange === undefined)
            ? {}
            : {
                onChangeText: (nextValue: string) => {
                  if (handlers.onV1BindingChange !== undefined) {
                    handlers.onV1BindingChange(binding, nextValue);
                  } else {
                    handlers.onBindingChange?.(binding, nextValue);
                  }
                },
              }),
        },
      );
    }
    case "Image": {
      const uri = expectStringProp(element, "uri");
      const fit = selectClosedStringProp(element, "fit", [
        "contain",
        "cover",
        "fill",
        "none",
        "scaleDown",
      ] as const);
      const variant = selectClosedStringProp(element, "variant", [
        "avatar",
        "header",
        "icon",
        "largeFeature",
        "mediumFeature",
        "smallFeature",
      ] as const);
      const accessible =
        accessibilityProps.accessibilityLabel !== undefined &&
        accessibilityProps.accessibilityElementsHidden !== true;
      return createElement(
        selectImageComponent(element, components, handlers.useComponentVariants === true, variant),
        {
          key: element.key,
          uri,
          fit,
          resourcePolicy: expectImageResourcePolicy(element),
          ...accessibilityProps,
          accessible,
          accessibilityRole: "image",
        },
      );
    }
    case "Icon": {
      const name = expectStringProp(element, "name");
      if (!(A2UI_V1_NATIVE_ICON_NAMES as readonly string[]).includes(name)) {
        throw new TypeError(`Unsupported icon name at native element ${element.key}.name`);
      }
      const accessible =
        accessibilityProps.accessibilityLabel !== undefined &&
        accessibilityProps.accessibilityElementsHidden !== true;
      return createElement(requireHostComponent(components.Icon, "Icon", element.key), {
        key: element.key,
        name: name as NativeIconComponentProps["name"],
        ...accessibilityProps,
        accessible,
        accessibilityRole: "image",
      });
    }
    case "Divider":
      return createElement(requireHostComponent(components.Divider, "Divider", element.key), {
        key: element.key,
        axis: selectClosedStringProp(element, "axis", ["horizontal", "vertical"] as const),
        ...accessibilityProps,
        accessible: false,
      });
    case "CheckBox": {
      const label = expectStringProp(element, "label");
      const value = expectBooleanProp(element, "value");
      const binding = optionalStringProp(element, "binding");
      const invalid = optionalBooleanProp(element, "invalid");
      const validationMessages = optionalStringArrayProp(element, "validationMessages");
      return createElement(requireHostComponent(components.CheckBox, "CheckBox", element.key), {
        key: element.key,
        label,
        value,
        ...accessibilityProps,
        accessible: accessibilityProps.accessibilityElementsHidden !== true,
        accessibilityLabel: accessibilityProps.accessibilityLabel ?? label,
        accessibilityRole: "checkbox",
        accessibilityState: { checked: value },
        ...(invalid === undefined ? {} : { invalid }),
        ...(validationMessages === undefined ? {} : { validationMessages }),
        ...(binding === undefined || handlers.onV1BindingChange === undefined
          ? {}
          : {
              onValueChange: (nextValue: boolean) => {
                if (typeof nextValue !== "boolean") {
                  throw new TypeError(
                    `Expected a boolean checkbox value at native element ${element.key}`,
                  );
                }
                handlers.onV1BindingChange?.(binding, nextValue);
              },
            }),
      });
    }
    case "ChoicePicker": {
      const options = expectChoicePickerOptions(element);
      const value = expectStringArrayProp(element, "value");
      const variant = selectClosedStringProp(element, "variant", [
        "multipleSelection",
        "mutuallyExclusive",
      ] as const);
      const displayStyle = selectClosedStringProp(element, "displayStyle", [
        "checkbox",
        "chips",
      ] as const);
      const filterable = expectBooleanProp(element, "filterable");
      const label = optionalStringProp(element, "label");
      const accessibilityLabel = expectStringProp(element, "accessibilityLabel");
      const binding = optionalStringProp(element, "binding");
      const invalid = optionalBooleanProp(element, "invalid");
      const validationMessages = optionalStringArrayProp(element, "validationMessages");
      return createElement(selectChoicePickerComponent(components, variant, element.key), {
        key: element.key,
        options,
        value,
        variant,
        displayStyle,
        filterable,
        ...accessibilityProps,
        accessible: accessibilityProps.accessibilityElementsHidden !== true,
        accessibilityLabel,
        ...(label === undefined ? {} : { label }),
        ...(invalid === undefined ? {} : { invalid }),
        ...(validationMessages === undefined ? {} : { validationMessages }),
        ...(binding === undefined || handlers.onV1BindingChange === undefined
          ? {}
          : {
              onValueChange: (nextValue: readonly string[]) => {
                const parsed = validateChoicePickerChange(nextValue, options, variant, element.key);
                handlers.onV1BindingChange?.(binding, parsed);
              },
            }),
      });
    }
    case "Slider": {
      const value = expectFiniteNumberProp(element, "value");
      const minimumValue = expectFiniteNumberProp(element, "minimum");
      const maximumValue = expectFiniteNumberProp(element, "maximum");
      const step = optionalFiniteNumberProp(element, "step");
      const label = optionalStringProp(element, "label");
      const accessibilityLabel = expectStringProp(element, "accessibilityLabel");
      const binding = optionalStringProp(element, "binding");
      const invalid = optionalBooleanProp(element, "invalid");
      const validationMessages = optionalStringArrayProp(element, "validationMessages");
      return createElement(requireHostComponent(components.Slider, "Slider", element.key), {
        key: element.key,
        value,
        minimumValue,
        maximumValue,
        ...accessibilityProps,
        accessible: accessibilityProps.accessibilityElementsHidden !== true,
        accessibilityLabel,
        accessibilityRole: "adjustable",
        ...(label === undefined ? {} : { label }),
        ...(step === undefined ? {} : { step }),
        ...(invalid === undefined ? {} : { invalid }),
        ...(validationMessages === undefined ? {} : { validationMessages }),
        ...(binding === undefined || handlers.onV1BindingChange === undefined
          ? {}
          : {
              onValueChange: (nextValue: number) => {
                if (
                  typeof nextValue !== "number" ||
                  !Number.isFinite(nextValue) ||
                  nextValue < minimumValue ||
                  nextValue > maximumValue ||
                  (step !== undefined && !isSliderStepValue(nextValue, minimumValue, step))
                ) {
                  throw new TypeError(
                    `Expected an in-range finite slider value at native element ${element.key}`,
                  );
                }
                handlers.onV1BindingChange?.(binding, nextValue);
              },
            }),
      });
    }
    case "DateTimeInput": {
      const value = expectStringProp(element, "value");
      const enableDate = expectBooleanProp(element, "enableDate");
      const enableTime = expectBooleanProp(element, "enableTime");
      const minimum = optionalStringProp(element, "minimum");
      const maximum = optionalStringProp(element, "maximum");
      const label = optionalStringProp(element, "label");
      const accessibilityLabel = expectStringProp(element, "accessibilityLabel");
      const binding = optionalStringProp(element, "binding");
      const invalid = optionalBooleanProp(element, "invalid");
      const validationMessages = optionalStringArrayProp(element, "validationMessages");
      return createElement(
        requireHostComponent(components.DateTimeInput, "DateTimeInput", element.key),
        {
          key: element.key,
          value,
          enableDate,
          enableTime,
          ...accessibilityProps,
          accessible: accessibilityProps.accessibilityElementsHidden !== true,
          accessibilityLabel,
          ...(label === undefined ? {} : { label }),
          ...(minimum === undefined ? {} : { minimum }),
          ...(maximum === undefined ? {} : { maximum }),
          ...(invalid === undefined ? {} : { invalid }),
          ...(validationMessages === undefined ? {} : { validationMessages }),
          ...(binding === undefined || handlers.onV1BindingChange === undefined
            ? {}
            : {
                onValueChange: (nextValue: string) => {
                  if (typeof nextValue !== "string") {
                    throw new TypeError(
                      `Expected a string date/time value at native element ${element.key}`,
                    );
                  }
                  try {
                    validateA2uiV1NativeDateTimeInputChange(
                      nextValue,
                      enableDate,
                      enableTime,
                      minimum,
                      maximum,
                      `native element ${element.key}`,
                    );
                  } catch (error) {
                    const message =
                      error instanceof Error
                        ? error.message
                        : `Expected a valid date/time value at native element ${element.key}`;
                    throw new TypeError(message, { cause: error });
                  }
                  handlers.onV1BindingChange?.(binding, nextValue);
                },
              }),
        },
      );
    }
    case "Tabs":
      return createElement(NativeTabsRenderer, {
        key: element.key,
        element,
        components,
        handlers,
      });
    case "Modal":
      return createElement(NativeModalRenderer, {
        key: element.key,
        element,
        components,
        handlers,
      });
  }
}

function isSliderStepValue(value: number, minimum: number, step: number): boolean {
  const offset = (value - minimum) / step;
  return (
    Math.abs(offset - Math.round(offset)) <= Number.EPSILON * Math.max(1, Math.abs(offset)) * 8
  );
}

interface NativeCompositeRendererProps {
  readonly element: NativeElement;
  readonly components: NativeComponentCatalog;
  readonly handlers: NativeRenderHandlers;
}

function NativeTabsRenderer({
  element,
  components,
  handlers,
}: NativeCompositeRendererProps): ReactElement {
  const tabDefinitions = expectTabDefinitions(element);
  const children = element.children ?? [];
  if (tabDefinitions.length !== children.length || tabDefinitions.length === 0) {
    throw new TypeError(
      `Expected matching non-empty tabs and children at native element ${element.key}`,
    );
  }
  const [selectedIndex, setSelectedIndex] = useState(0);
  const currentIndex = selectedIndex < tabDefinitions.length ? selectedIndex : 0;
  useEffect(() => {
    if (selectedIndex >= tabDefinitions.length) {
      setSelectedIndex(0);
    }
  }, [selectedIndex, tabDefinitions.length]);
  const accessibilityProps = selectAccessibilityProps(element);
  return createElement(requireHostComponent(components.Tabs, "Tabs", element.key), {
    tabs: tabDefinitions.map((tab, index) => ({
      title: tab.title,
      content: renderChildElement(children[index]!, components, handlers),
    })),
    selectedIndex: currentIndex,
    onSelect: (index: number) => {
      if (!Number.isInteger(index) || index < 0 || index >= tabDefinitions.length) {
        throw new TypeError(`Expected an in-range tab index at native element ${element.key}`);
      }
      setSelectedIndex(index);
    },
    ...accessibilityProps,
    accessible: accessibilityProps.accessibilityElementsHidden !== true,
  });
}

function NativeModalRenderer({
  element,
  components,
  handlers,
}: NativeCompositeRendererProps): ReactElement {
  const children = element.children ?? [];
  if (children.length !== 2 || children[0]?.component !== "Button") {
    throw new TypeError(`Expected a Button trigger and content at native element ${element.key}`);
  }
  const [open, setOpen] = useState(false);
  const trigger = children[0];
  const content = children[1]!;
  const outerActivation = handlers.onElementActivate;
  const triggerElement = renderElement(trigger, components, {
    ...handlers,
    onElementActivate: (key) => {
      if (key === trigger.key) {
        setOpen(true);
      }
      outerActivation?.(key);
    },
  });
  const contentElement = renderElement(content, components, handlers);
  return createElement(requireHostComponent(components.Modal, "Modal", element.key), {
    trigger: triggerElement,
    content: contentElement,
    open,
    onRequestClose: () => setOpen(false),
    ...selectAccessibilityProps(element),
  });
}

function requireHostComponent<Props extends object>(
  component: ComponentType<Props> | undefined,
  name: string,
  key: string,
): ComponentType<Props> {
  if (component === undefined) {
    throw new TypeError(`Missing host component ${JSON.stringify(name)} for native element ${key}`);
  }
  return component;
}

function selectImageComponent(
  element: NativeElement,
  components: NativeComponentCatalog,
  useComponentVariants: boolean,
  variant: NativeImageVariant,
): ComponentType<NativeImageComponentProps> {
  const base = requireHostComponent(components.Image, "Image", element.key);
  if (!useComponentVariants) {
    return base;
  }
  return components.variants?.Image?.[variant] ?? base;
}

function selectChoicePickerComponent(
  components: NativeComponentCatalog,
  variant: "multipleSelection" | "mutuallyExclusive",
  key: string,
): ComponentType<NativeChoicePickerComponentProps> {
  return (
    components.variants?.ChoicePicker?.[variant] ??
    requireHostComponent(components.ChoicePicker, "ChoicePicker", key)
  );
}

function expectChoicePickerOptions(element: NativeElement): readonly NativeChoicePickerOption[] {
  const value = element.props.options;
  if (!Array.isArray(value)) {
    throw new TypeError(`Expected choice options at native element ${element.key}.options`);
  }
  const seen = new Set<string>();
  return Object.freeze(
    value.map((entry, index) => {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        throw new TypeError(
          `Expected a choice option at native element ${element.key}.options[${index}]`,
        );
      }
      const option = entry as Record<string, unknown>;
      const unknown = Object.keys(option).find((name) => name !== "label" && name !== "value");
      if (
        unknown !== undefined ||
        typeof option.label !== "string" ||
        typeof option.value !== "string"
      ) {
        throw new TypeError(
          `Expected a closed choice option at native element ${element.key}.options[${index}]`,
        );
      }
      if (seen.has(option.value)) {
        throw new TypeError(
          `Duplicate choice option at native element ${element.key}.options[${index}]`,
        );
      }
      seen.add(option.value);
      return Object.freeze({ label: option.label, value: option.value });
    }),
  );
}

function expectImageResourcePolicy(element: NativeElement): NativeImageResourcePolicy {
  const path = `native element ${element.key}.resourcePolicy`;
  const value = parseJsonObject(element.props.resourcePolicy, path);
  rejectObjectKeys(
    value,
    [
      "allowedRedirectOrigins",
      "cacheMode",
      "maximumBytes",
      "maximumDecodedHeight",
      "maximumDecodedPixels",
      "maximumDecodedWidth",
      "maximumRedirects",
    ],
    path,
  );
  const origins = value.allowedRedirectOrigins;
  if (!Array.isArray(origins) || origins.some((origin) => typeof origin !== "string")) {
    throw new TypeError(`Expected redirect origins at ${path}.allowedRedirectOrigins`);
  }
  if (value.cacheMode !== "default" && value.cacheMode !== "no-store") {
    throw new TypeError(`Expected a closed cache mode at ${path}.cacheMode`);
  }
  const maximumBytes = expectObjectPositiveInteger(value, "maximumBytes", path);
  const maximumDecodedHeight = expectObjectPositiveInteger(value, "maximumDecodedHeight", path);
  const maximumDecodedPixels = expectObjectPositiveInteger(value, "maximumDecodedPixels", path);
  const maximumDecodedWidth = expectObjectPositiveInteger(value, "maximumDecodedWidth", path);
  const maximumRedirects = value.maximumRedirects;
  if (
    typeof maximumRedirects !== "number" ||
    !Number.isInteger(maximumRedirects) ||
    maximumRedirects < 0
  ) {
    throw new TypeError(`Expected a non-negative integer at ${path}.maximumRedirects`);
  }
  return Object.freeze({
    allowedRedirectOrigins: Object.freeze([...origins] as string[]),
    cacheMode: value.cacheMode,
    maximumBytes,
    maximumDecodedHeight,
    maximumDecodedPixels,
    maximumDecodedWidth,
    maximumRedirects,
  });
}

function expectObjectPositiveInteger(value: JsonObject, name: string, path: string): number {
  const field = value[name];
  if (typeof field !== "number" || !Number.isInteger(field) || field < 1) {
    throw new TypeError(`Expected a positive integer at ${path}.${name}`);
  }
  return field;
}

function validateChoicePickerChange(
  value: readonly string[],
  options: readonly NativeChoicePickerOption[],
  variant: "multipleSelection" | "mutuallyExclusive",
  key: string,
): readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new TypeError(`Expected an array of choice values at native element ${key}`);
  }
  if (new Set(value).size !== value.length) {
    throw new TypeError(`Expected unique choice values at native element ${key}`);
  }
  if (variant === "mutuallyExclusive" && value.length > 1) {
    throw new TypeError(`Expected at most one choice value at native element ${key}`);
  }
  const allowed = new Set(options.map((option) => option.value));
  if (value.some((entry) => !allowed.has(entry))) {
    throw new TypeError(`Expected known choice values at native element ${key}`);
  }
  return Object.freeze([...value]);
}

function expectTabDefinitions(element: NativeElement): readonly { readonly title: string }[] {
  const value = element.props.tabs;
  if (!Array.isArray(value)) {
    throw new TypeError(`Expected tabs at native element ${element.key}.tabs`);
  }
  return Object.freeze(
    value.map((entry, index) => {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        throw new TypeError(`Expected a tab at native element ${element.key}.tabs[${index}]`);
      }
      const tab = entry as Record<string, unknown>;
      if (Object.keys(tab).some((name) => name !== "title") || typeof tab.title !== "string") {
        throw new TypeError(
          `Expected a closed tab at native element ${element.key}.tabs[${index}]`,
        );
      }
      return Object.freeze({ title: tab.title });
    }),
  );
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

function selectViewComponent(
  element: NativeElement,
  components: NativeComponentCatalog,
  useComponentVariants: boolean,
): ComponentType<NativeViewComponentProps> {
  if (!useComponentVariants) {
    return components.View;
  }
  const layout = optionalStringProp(element, "layout");
  const variant = optionalStringProp(element, "variant");
  let selected: NativeViewVariant | undefined;
  if (variant === "card" || variant === "list") {
    selected = variant;
  } else if (variant !== undefined) {
    throw new TypeError(
      `Unsupported view variant ${JSON.stringify(variant)} at native element ${element.key}`,
    );
  } else if (layout === "column" || layout === "row") {
    selected = layout;
  }
  return (
    (selected === undefined ? undefined : components.variants?.View?.[selected]) ?? components.View
  );
}

function selectTextComponent(
  element: NativeElement,
  components: NativeComponentCatalog,
  useComponentVariants: boolean,
): ComponentType<NativeTextComponentProps> {
  if (!useComponentVariants) {
    return components.Text;
  }
  const variant = selectClosedVariant(
    element,
    "variant",
    ["body", "caption"] as const,
    "body",
    "text",
  );
  return components.variants?.Text?.[variant] ?? components.Text;
}

function selectButtonComponent(
  element: NativeElement,
  components: NativeComponentCatalog,
  useComponentVariants: boolean,
): ComponentType<NativeButtonComponentProps> {
  if (!useComponentVariants) {
    return components.Button;
  }
  const variant = selectClosedVariant(
    element,
    "variant",
    ["borderless", "default", "primary"] as const,
    "default",
    "button",
  );
  return components.variants?.Button?.[variant] ?? components.Button;
}

function selectTextInputComponent(
  element: NativeElement,
  components: NativeComponentCatalog,
  useComponentVariants: boolean,
): ComponentType<NativeTextInputComponentProps> {
  if (!useComponentVariants) {
    return components.TextInput;
  }
  const variant = selectClosedVariant(
    element,
    "variant",
    ["longText", "number", "obscured", "shortText"] as const,
    "shortText",
    "text input",
  );
  return components.variants?.TextInput?.[variant] ?? components.TextInput;
}

function selectClosedVariant<const Variant extends string>(
  element: NativeElement,
  property: string,
  allowed: readonly Variant[],
  fallback: Variant,
  label: string,
): Variant {
  const value = optionalStringProp(element, property);
  if (value === undefined) {
    return fallback;
  }
  if ((allowed as readonly string[]).includes(value)) {
    return value as Variant;
  }
  throw new TypeError(
    `Unsupported ${label} variant ${JSON.stringify(value)} at native element ${element.key}`,
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
    return disabled
      ? () => undefined
      : () => {
          handlers.onElementActivate?.(element.key);
          handlers.onAction?.(action);
        };
  }
  if (hasEvent) {
    const event = expectV1EventProp(element);
    if (handlers.onV1Event === undefined) {
      throw new TypeError(`Missing A2UI v1 event handler for element ${element.key}`);
    }
    return disabled
      ? () => undefined
      : () => {
          handlers.onElementActivate?.(element.key);
          handlers.onV1Event?.(event);
        };
  }
  if (hasOpenUrl) {
    const request = expectV1OpenUrlProp(element);
    if (handlers.onV1OpenUrl === undefined) {
      throw new TypeError(`Missing A2UI v1 openUrl policy or handler for element ${element.key}`);
    }
    return disabled
      ? () => undefined
      : () => {
          handlers.onElementActivate?.(element.key);
          handlers.onV1OpenUrl?.(request);
        };
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

function selectClosedStringProp<const Value extends string>(
  element: NativeElement,
  name: string,
  allowed: readonly Value[],
): Value {
  const value = expectStringProp(element, name);
  if (!(allowed as readonly string[]).includes(value)) {
    throw new TypeError(
      `Unsupported value ${JSON.stringify(value)} at native element ${element.key}.${name}`,
    );
  }
  return value as Value;
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

function expectStringArrayProp(element: NativeElement, name: string): readonly string[] {
  const value = optionalStringArrayProp(element, name);
  if (value === undefined) {
    throw new TypeError(`Expected an array of strings at native element ${element.key}.${name}`);
  }
  return value;
}

function expectBooleanProp(element: NativeElement, name: string): boolean {
  const value = optionalBooleanProp(element, name);
  if (value === undefined) {
    throw new TypeError(`Expected a boolean at native element ${element.key}.${name}`);
  }
  return value;
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

function expectFiniteNumberProp(element: NativeElement, name: string): number {
  const value = optionalFiniteNumberProp(element, name);
  if (value === undefined) {
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

function updateDataModelBinding(
  dataModel: JsonObject,
  binding: string,
  value: JsonValue,
): JsonObject {
  if (typeof binding !== "string" || !binding.startsWith("/") || binding.length === 1) {
    throw new TypeError(
      `Expected a non-root absolute JSON Pointer binding, received ${JSON.stringify(binding)}`,
    );
  }
  const parsedValue = parseJsonValue(value, "renderer binding value");
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
        cursor[arrayIndex] = validateRendererBindingReplacement(
          cursor[arrayIndex]!,
          parsedValue,
          binding,
        );
        break;
      }
      cursor = cursor[arrayIndex]!;
      continue;
    }
    if (cursor === null || typeof cursor !== "object" || !Object.hasOwn(cursor, token)) {
      throw new TypeError(`Renderer binding ${JSON.stringify(binding)} is missing`);
    }
    if (last) {
      defineJsonProperty(
        cursor as Record<string, JsonValue>,
        token,
        validateRendererBindingReplacement(
          (cursor as Record<string, JsonValue>)[token]!,
          parsedValue,
          binding,
        ),
      );
      break;
    }
    cursor = (cursor as Record<string, JsonValue>)[token]!;
  }
  return parseJsonObject(next, "renderer data model");
}

function validateRendererBindingReplacement(
  current: JsonValue,
  next: JsonValue,
  binding: string,
): JsonValue {
  if (
    (typeof current === "string" && typeof next === "string") ||
    (typeof current === "boolean" && typeof next === "boolean") ||
    (typeof current === "number" && typeof next === "number")
  ) {
    return next;
  }
  if (
    Array.isArray(current) &&
    current.every((value) => typeof value === "string") &&
    Array.isArray(next) &&
    next.every((value) => typeof value === "string")
  ) {
    return Object.freeze([...next]);
  }
  throw new TypeError(
    `Renderer binding ${JSON.stringify(binding)} must preserve its string, boolean, number, or string-array value type`,
  );
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
  A2UI_V1_NATIVE_MAX_CHOICE_OPTIONS,
  A2UI_V1_NATIVE_MAX_IMAGE_BYTES,
  A2UI_V1_NATIVE_MAX_IMAGE_DIMENSION,
  A2UI_V1_NATIVE_MAX_IMAGE_PIXELS,
  A2UI_V1_NATIVE_MAX_IMAGE_REDIRECT_ORIGINS,
  A2UI_V1_NATIVE_MAX_IMAGE_REDIRECTS,
  A2UI_V1_NATIVE_MAX_IMAGE_URL_LENGTH,
  A2UI_V1_NATIVE_MAX_OPEN_URL_LENGTH,
  A2UI_V1_NATIVE_MAX_RENDER_NODES,
  createA2uiV1NativeRenderPlan,
  resolveA2uiV1NativeEvent,
  resolveA2uiV1NativeOpenUrl,
} from "./v1.js";
export type {
  A2uiV1NativeEventDescriptor,
  A2uiV1NativeEventResolutionOptions,
  A2uiV1NativeImagePolicy,
  A2uiV1NativeImageGrant,
  A2uiV1NativeImageRequest,
  A2uiV1NativeOpenUrlDescriptor,
  A2uiV1NativeOpenUrlResolutionOptions,
  A2uiV1NativeRenderPlanOptions,
} from "./v1.js";
