import {
  getA2uiV1HostExtensionManifestFingerprint,
  parseA2uiV1HostExtensionManifest,
} from "@mcp-native/a2ui";
import type {
  NativeAccessibilityProps,
  NativeAudioPlayerComponentProps,
  NativeButtonComponentProps,
  NativeButtonVariant,
  NativeCheckBoxComponentProps,
  NativeChoicePickerComponentProps,
  NativeChoicePickerVariant,
  NativeDateTimeInputComponentProps,
  NativeDividerComponentProps,
  NativeHostExtensionComponentProps,
  NativeHostExtensionRegistration,
  NativeIconComponentProps,
  NativeImageComponentProps,
  NativeImageVariant,
  NativeSliderComponentProps,
  NativeTextComponentProps,
  NativeTextInputComponentProps,
  NativeTextInputVariant,
  NativeTextVariant,
  NativeVideoComponentProps,
  NativeViewStyle,
  NativeViewVariant,
} from "@mcp-native/renderer-core";
import { createElement, type ComponentType, type ReactElement, type ReactNode } from "react";

export interface NativeViewComponentProps extends NativeAccessibilityProps {
  readonly children?: ReactNode;
  readonly style?: NativeViewStyle;
}

export interface NativeTabItem {
  readonly content: ReactNode;
  readonly title: string;
}

export interface NativeTabsComponentProps extends NativeAccessibilityProps {
  readonly accessible: boolean;
  readonly onSelect: (index: number) => void;
  readonly selectedIndex: number;
  readonly tabs: readonly NativeTabItem[];
}

export interface NativeModalComponentProps extends NativeAccessibilityProps {
  readonly content: ReactNode;
  readonly onRequestClose: () => void;
  readonly open: boolean;
  readonly trigger: ReactNode;
}

/**
 * Optional locally bundled component overrides for the pinned A2UI style hints.
 * The renderer selects only these closed keys and still supplies primitive props.
 */
export interface NativeComponentVariants {
  readonly View?: Partial<Record<NativeViewVariant, ComponentType<NativeViewComponentProps>>>;
  readonly Text?: Partial<Record<NativeTextVariant, ComponentType<NativeTextComponentProps>>>;
  readonly Button?: Partial<Record<NativeButtonVariant, ComponentType<NativeButtonComponentProps>>>;
  readonly TextInput?: Partial<
    Record<NativeTextInputVariant, ComponentType<NativeTextInputComponentProps>>
  >;
  readonly Image?: Partial<Record<NativeImageVariant, ComponentType<NativeImageComponentProps>>>;
  readonly ChoicePicker?: Partial<
    Record<NativeChoicePickerVariant, ComponentType<NativeChoicePickerComponentProps>>
  >;
}

/** Locally bundled components chosen by the host application. */
export interface NativeComponentCatalog {
  readonly View: ComponentType<NativeViewComponentProps>;
  readonly Text: ComponentType<NativeTextComponentProps>;
  readonly Button: ComponentType<NativeButtonComponentProps>;
  readonly TextInput: ComponentType<NativeTextInputComponentProps>;
  readonly Image?: ComponentType<NativeImageComponentProps>;
  readonly Icon?: ComponentType<NativeIconComponentProps>;
  readonly Divider?: ComponentType<NativeDividerComponentProps>;
  readonly CheckBox?: ComponentType<NativeCheckBoxComponentProps>;
  readonly ChoicePicker?: ComponentType<NativeChoicePickerComponentProps>;
  readonly Slider?: ComponentType<NativeSliderComponentProps>;
  readonly DateTimeInput?: ComponentType<NativeDateTimeInputComponentProps>;
  readonly Tabs?: ComponentType<NativeTabsComponentProps>;
  readonly Modal?: ComponentType<NativeModalComponentProps>;
  readonly Video?: ComponentType<NativeVideoComponentProps>;
  readonly AudioPlayer?: ComponentType<NativeAudioPlayerComponentProps>;
  /** Locally compiled semantic extensions created only by the registration helper below. */
  readonly hostExtensions?: readonly NativeHostExtensionRegistration[];
  /** Optional semantic/style variants; omitted entries fall back to the base primitive. */
  readonly variants?: NativeComponentVariants;
}

interface NativeHostExtensionRegistrationState {
  readonly render: (props: NativeHostExtensionComponentProps, key: string) => ReactElement;
}

const nativeHostExtensionRegistrationStates = new WeakMap<
  NativeHostExtensionRegistration,
  NativeHostExtensionRegistrationState
>();

/** Maps renderer-selected primitive props into one locally bundled host component. */
export type NativeComponentPropMapper<TrustedProps extends object, HostProps extends object> = (
  props: TrustedProps,
) => HostProps;

function createComponentAdapter<TrustedProps extends object, HostProps extends object>(
  primitiveName:
    | "AudioPlayer"
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
    | "Video"
    | "View",
  component: ComponentType<HostProps>,
  mapProps: NativeComponentPropMapper<TrustedProps, HostProps>,
): ComponentType<TrustedProps> {
  function NativeComponentAdapter(props: TrustedProps) {
    return createElement(component, mapProps(props));
  }
  const componentName = component.displayName ?? component.name ?? "Component";
  NativeComponentAdapter.displayName = `McpNative${primitiveName}Adapter(${componentName})`;
  return NativeComponentAdapter;
}

/** Adapts trusted MCP Native view props to a host design-system component. */
export function createNativeViewAdapter<HostProps extends object>(
  component: ComponentType<HostProps>,
  mapProps: NativeComponentPropMapper<NativeViewComponentProps, HostProps>,
): ComponentType<NativeViewComponentProps> {
  return createComponentAdapter("View", component, mapProps);
}

/** Adapts trusted MCP Native text props to a host design-system component. */
export function createNativeTextAdapter<HostProps extends object>(
  component: ComponentType<HostProps>,
  mapProps: NativeComponentPropMapper<NativeTextComponentProps, HostProps>,
): ComponentType<NativeTextComponentProps> {
  return createComponentAdapter("Text", component, mapProps);
}

/** Adapts trusted MCP Native button props to a host design-system component. */
export function createNativeButtonAdapter<HostProps extends object>(
  component: ComponentType<HostProps>,
  mapProps: NativeComponentPropMapper<NativeButtonComponentProps, HostProps>,
): ComponentType<NativeButtonComponentProps> {
  return createComponentAdapter("Button", component, mapProps);
}

/** Adapts trusted MCP Native text-input props to a host design-system component. */
export function createNativeTextInputAdapter<HostProps extends object>(
  component: ComponentType<HostProps>,
  mapProps: NativeComponentPropMapper<NativeTextInputComponentProps, HostProps>,
): ComponentType<NativeTextInputComponentProps> {
  return createComponentAdapter("TextInput", component, mapProps);
}

/** Adapts trusted MCP Native image props to a host image component. */
export function createNativeImageAdapter<HostProps extends object>(
  component: ComponentType<HostProps>,
  mapProps: NativeComponentPropMapper<NativeImageComponentProps, HostProps>,
): ComponentType<NativeImageComponentProps> {
  return createComponentAdapter("Image", component, mapProps);
}

/** Adapts a complete, policy-bearing video source to one local media component. */
export function createNativeVideoAdapter<HostProps extends object>(
  component: ComponentType<HostProps>,
  mapProps: NativeComponentPropMapper<NativeVideoComponentProps, HostProps>,
): ComponentType<NativeVideoComponentProps> {
  return createComponentAdapter("Video", component, mapProps);
}

/** Adapts a complete, policy-bearing audio source to one local media component. */
export function createNativeAudioPlayerAdapter<HostProps extends object>(
  component: ComponentType<HostProps>,
  mapProps: NativeComponentPropMapper<NativeAudioPlayerComponentProps, HostProps>,
): ComponentType<NativeAudioPlayerComponentProps> {
  return createComponentAdapter("AudioPlayer", component, mapProps);
}

/**
 * Registers one locally imported semantic native component. The mapper receives only validated
 * semantic props, a closed capability grant, accessibility fields, and a validated event seam.
 */
export function createNativeHostExtensionRegistration<HostProps extends object>(
  manifestInput: unknown,
  component: ComponentType<HostProps>,
  mapProps: NativeComponentPropMapper<NativeHostExtensionComponentProps, HostProps>,
): NativeHostExtensionRegistration {
  const runtimeComponent: unknown = component;
  if (
    typeof runtimeComponent !== "function" &&
    (runtimeComponent === null || typeof runtimeComponent !== "object")
  ) {
    throw new TypeError("Expected a locally imported host-extension component");
  }
  if (typeof mapProps !== "function") {
    throw new TypeError("Expected a host-extension prop mapper");
  }
  const manifest = parseA2uiV1HostExtensionManifest(manifestInput);
  const registration = Object.freeze({
    manifest,
    manifestFingerprint: getA2uiV1HostExtensionManifestFingerprint(manifest),
  });
  nativeHostExtensionRegistrationStates.set(registration, {
    render: (props, key) => createElement(component, { ...mapProps(props), key }),
  });
  return registration;
}

export function isNativeHostExtensionRegistration(
  value: unknown,
): value is NativeHostExtensionRegistration {
  return (
    value !== null &&
    typeof value === "object" &&
    nativeHostExtensionRegistrationStates.has(value as NativeHostExtensionRegistration)
  );
}

/** Internal renderer seam for an opaque, helper-created local registration. */
export function renderNativeHostExtensionRegistration(
  registration: NativeHostExtensionRegistration,
  props: NativeHostExtensionComponentProps,
  key: string,
): ReactElement {
  const state = nativeHostExtensionRegistrationStates.get(registration);
  if (state === undefined) {
    throw new TypeError("Expected an opaque host-extension registration created by this package");
  }
  return state.render(props, key);
}

/** Adapts a pinned semantic icon name to a host icon component. */
export function createNativeIconAdapter<HostProps extends object>(
  component: ComponentType<HostProps>,
  mapProps: NativeComponentPropMapper<NativeIconComponentProps, HostProps>,
): ComponentType<NativeIconComponentProps> {
  return createComponentAdapter("Icon", component, mapProps);
}

/** Adapts a trusted divider axis to a host divider component. */
export function createNativeDividerAdapter<HostProps extends object>(
  component: ComponentType<HostProps>,
  mapProps: NativeComponentPropMapper<NativeDividerComponentProps, HostProps>,
): ComponentType<NativeDividerComponentProps> {
  return createComponentAdapter("Divider", component, mapProps);
}

/** Adapts trusted checkbox props to a host checkbox component. */
export function createNativeCheckBoxAdapter<HostProps extends object>(
  component: ComponentType<HostProps>,
  mapProps: NativeComponentPropMapper<NativeCheckBoxComponentProps, HostProps>,
): ComponentType<NativeCheckBoxComponentProps> {
  return createComponentAdapter("CheckBox", component, mapProps);
}

/** Adapts trusted choice-picker props to a host selection component. */
export function createNativeChoicePickerAdapter<HostProps extends object>(
  component: ComponentType<HostProps>,
  mapProps: NativeComponentPropMapper<NativeChoicePickerComponentProps, HostProps>,
): ComponentType<NativeChoicePickerComponentProps> {
  return createComponentAdapter("ChoicePicker", component, mapProps);
}

/** Adapts trusted bounded slider props to a host slider component. */
export function createNativeSliderAdapter<HostProps extends object>(
  component: ComponentType<HostProps>,
  mapProps: NativeComponentPropMapper<NativeSliderComponentProps, HostProps>,
): ComponentType<NativeSliderComponentProps> {
  return createComponentAdapter("Slider", component, mapProps);
}

/** Adapts trusted ISO date/time props to a host date/time component. */
export function createNativeDateTimeInputAdapter<HostProps extends object>(
  component: ComponentType<HostProps>,
  mapProps: NativeComponentPropMapper<NativeDateTimeInputComponentProps, HostProps>,
): ComponentType<NativeDateTimeInputComponentProps> {
  return createComponentAdapter("DateTimeInput", component, mapProps);
}

/** Adapts trusted tab titles and rendered content to a host tabs component. */
export function createNativeTabsAdapter<HostProps extends object>(
  component: ComponentType<HostProps>,
  mapProps: NativeComponentPropMapper<NativeTabsComponentProps, HostProps>,
): ComponentType<NativeTabsComponentProps> {
  return createComponentAdapter("Tabs", component, mapProps);
}

/** Adapts trusted modal state and rendered regions to a host modal component. */
export function createNativeModalAdapter<HostProps extends object>(
  component: ComponentType<HostProps>,
  mapProps: NativeComponentPropMapper<NativeModalComponentProps, HostProps>,
): ComponentType<NativeModalComponentProps> {
  return createComponentAdapter("Modal", component, mapProps);
}
