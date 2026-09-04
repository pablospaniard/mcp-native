import {
  getA2uiV1HostExtensionManifestFingerprint,
  parseA2uiV1HostExtensionManifest,
} from "@mcp-native/a2ui";
import type { A2uiV1HostExtensionManifest } from "@mcp-native/a2ui";
import type { JsonObject } from "@mcp-native/core";
import { createElement, type ComponentType, type ReactElement, type ReactNode } from "react";

export type NativeAccessibilityRole =
  | "adjustable"
  | "button"
  | "checkbox"
  | "image"
  | "radio"
  | "tab"
  | "text";

export interface NativeAccessibilityState {
  readonly busy?: boolean;
  readonly checked?: boolean;
  readonly disabled?: boolean;
  readonly expanded?: boolean;
  readonly selected?: boolean;
}

export interface NativeAccessibilityProps {
  readonly accessible?: boolean;
  readonly accessibilityElementsHidden?: boolean;
  readonly accessibilityHint?: string;
  readonly accessibilityLabel?: string;
  readonly accessibilityLiveRegion?: "assertive" | "none" | "polite";
  readonly importantForAccessibility?: "auto" | "no-hide-descendants";
}

export interface NativeViewStyle {
  readonly alignItems?: "center" | "flex-end" | "flex-start" | "stretch";
  readonly flexDirection?: "column" | "row";
  readonly flexGrow?: number;
  readonly justifyContent?:
    | "center"
    | "flex-end"
    | "flex-start"
    | "space-around"
    | "space-between"
    | "space-evenly";
}

export interface NativeViewComponentProps extends NativeAccessibilityProps {
  readonly accessibilityState?: NativeAccessibilityState;
  readonly children?: ReactNode;
  readonly style?: NativeViewStyle;
}

export interface NativeTextComponentProps extends NativeAccessibilityProps {
  readonly accessible: boolean;
  readonly accessibilityRole: "text";
  readonly allowFontScaling: true;
  readonly children: string;
}

export interface NativeButtonComponentProps extends NativeAccessibilityProps {
  readonly accessible: boolean;
  readonly accessibilityLabel: string;
  readonly accessibilityRole: "button";
  readonly accessibilityState: NativeAccessibilityState;
  readonly disabled?: boolean;
  readonly onPress: () => void;
  readonly title: string;
  readonly validationMessages?: readonly string[];
}

export interface NativeTextInputComponentProps extends NativeAccessibilityProps {
  readonly accessible: boolean;
  readonly accessibilityLabel: string;
  readonly allowFontScaling: true;
  readonly invalid?: boolean;
  readonly keyboardType?: "numeric";
  readonly multiline?: boolean;
  readonly onChangeText?: (value: string) => void;
  readonly placeholder: string;
  readonly secureTextEntry?: boolean;
  readonly validationMessages?: readonly string[];
  readonly value?: string;
}

export type NativeImageFit = "contain" | "cover" | "fill" | "none" | "scaleDown";

export type NativeImageVariant =
  | "avatar"
  | "header"
  | "icon"
  | "largeFeature"
  | "mediumFeature"
  | "smallFeature";

export interface NativeImageResourcePolicy {
  readonly allowedRedirectOrigins: readonly string[];
  readonly cacheMode: "default" | "no-store";
  readonly maximumBytes: number;
  readonly maximumDecodedHeight: number;
  readonly maximumDecodedPixels: number;
  readonly maximumDecodedWidth: number;
  readonly maximumRedirects: number;
}

export interface NativeImageComponentProps extends NativeAccessibilityProps {
  readonly accessible: boolean;
  readonly accessibilityLabel?: string;
  readonly accessibilityRole: "image";
  readonly fit: NativeImageFit;
  readonly resourcePolicy: NativeImageResourcePolicy;
  readonly uri: string;
}

export interface NativeMediaResourcePolicy {
  readonly sourceOrigin: string;
  readonly allowedRedirectOrigins: readonly string[];
  readonly allowedMimeTypes: readonly string[];
  readonly maximumBytes: number;
  readonly maximumRedirects: number;
  readonly allowsAutoplay: boolean;
  readonly allowsBackgroundPlayback: boolean;
  readonly allowsExternalRoutes: boolean;
  readonly requiresUserActivation: boolean;
}

export interface NativeVideoComponentProps extends NativeAccessibilityProps {
  readonly accessible: boolean;
  readonly accessibilityLabel: string;
  readonly accessibilityRole: "image";
  readonly uri: string;
  readonly posterUri?: string;
  readonly posterResourcePolicy?: NativeImageResourcePolicy;
  readonly resourcePolicy: NativeMediaResourcePolicy;
}

export interface NativeAudioPlayerComponentProps extends NativeAccessibilityProps {
  readonly accessible: boolean;
  readonly accessibilityLabel: string;
  readonly accessibilityRole: "button";
  readonly description?: string;
  readonly uri: string;
  readonly resourcePolicy: NativeMediaResourcePolicy;
}

export const A2UI_V1_NATIVE_ICON_NAMES = Object.freeze([
  "accountCircle",
  "add",
  "arrowBack",
  "arrowForward",
  "attachFile",
  "calendarToday",
  "call",
  "camera",
  "check",
  "close",
  "delete",
  "download",
  "edit",
  "event",
  "error",
  "fastForward",
  "favorite",
  "favoriteOff",
  "folder",
  "help",
  "home",
  "info",
  "locationOn",
  "lock",
  "lockOpen",
  "mail",
  "menu",
  "moreVert",
  "moreHoriz",
  "notificationsOff",
  "notifications",
  "pause",
  "payment",
  "person",
  "phone",
  "photo",
  "play",
  "print",
  "refresh",
  "rewind",
  "search",
  "send",
  "settings",
  "share",
  "shoppingCart",
  "skipNext",
  "skipPrevious",
  "star",
  "starHalf",
  "starOff",
  "stop",
  "upload",
  "visibility",
  "visibilityOff",
  "volumeDown",
  "volumeMute",
  "volumeOff",
  "volumeUp",
  "warning",
] as const);

export type NativeIconName = (typeof A2UI_V1_NATIVE_ICON_NAMES)[number];

export interface NativeIconComponentProps extends NativeAccessibilityProps {
  readonly accessible: boolean;
  readonly accessibilityLabel?: string;
  readonly accessibilityRole: "image";
  readonly name: NativeIconName;
}

export interface NativeDividerComponentProps extends NativeAccessibilityProps {
  readonly accessible: false;
  readonly axis: "horizontal" | "vertical";
}

export interface NativeCheckBoxComponentProps extends NativeAccessibilityProps {
  readonly accessible: boolean;
  readonly accessibilityLabel: string;
  readonly accessibilityRole: "checkbox";
  readonly accessibilityState: NativeAccessibilityState;
  readonly invalid?: boolean;
  readonly label: string;
  readonly onValueChange?: (value: boolean) => void;
  readonly validationMessages?: readonly string[];
  readonly value: boolean;
}

export type NativeChoicePickerVariant = "multipleSelection" | "mutuallyExclusive";
export type NativeChoicePickerDisplayStyle = "checkbox" | "chips";

export interface NativeChoicePickerOption {
  readonly label: string;
  readonly value: string;
}

export interface NativeChoicePickerComponentProps extends NativeAccessibilityProps {
  readonly accessible: boolean;
  readonly accessibilityLabel: string;
  readonly displayStyle: NativeChoicePickerDisplayStyle;
  readonly filterable: boolean;
  readonly invalid?: boolean;
  readonly label?: string;
  readonly onValueChange?: (value: readonly string[]) => void;
  readonly options: readonly NativeChoicePickerOption[];
  readonly validationMessages?: readonly string[];
  readonly value: readonly string[];
  readonly variant: NativeChoicePickerVariant;
}

export interface NativeSliderComponentProps extends NativeAccessibilityProps {
  readonly accessible: boolean;
  readonly accessibilityLabel: string;
  readonly accessibilityRole: "adjustable";
  readonly invalid?: boolean;
  readonly label?: string;
  readonly maximumValue: number;
  readonly minimumValue: number;
  readonly onValueChange?: (value: number) => void;
  readonly step?: number;
  readonly validationMessages?: readonly string[];
  readonly value: number;
}

export interface NativeDateTimeInputComponentProps extends NativeAccessibilityProps {
  readonly accessible: boolean;
  readonly accessibilityLabel: string;
  readonly enableDate: boolean;
  readonly enableTime: boolean;
  readonly invalid?: boolean;
  readonly label?: string;
  readonly maximum?: string;
  readonly minimum?: string;
  readonly onValueChange?: (value: string) => void;
  readonly validationMessages?: readonly string[];
  readonly value: string;
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

export type NativeViewVariant = "card" | "column" | "list" | "row";

export type NativeTextVariant = "body" | "caption";

export type NativeButtonVariant = "borderless" | "default" | "primary";

export type NativeTextInputVariant = "longText" | "number" | "obscured" | "shortText";

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

/** Host-owned parent layout categories used to preflight native component compatibility. */
export type NativeSurfaceParentLayout = "bounded" | "scroll" | "unbounded";

/**
 * Declares layout behavior of one locally installed catalog entry. This metadata is trusted host
 * configuration; it is never selected or modified by an MCP server.
 */
export interface NativeComponentLayoutContract {
  /** Parent layouts in which this implementation has been tested and is supported. */
  readonly allowedParents: readonly NativeSurfaceParentLayout[];
  /** Whether the component measures intrinsically or expects to fill its bounded parent. */
  readonly sizing: "fill" | "intrinsic";
  /** Overlay components should use a host-owned portal rather than parent flow layout. */
  readonly presentation?: "inline" | "overlay";
  /** True when the component owns virtualization or scrolling for its content. */
  readonly ownsScrolling?: boolean;
}

export type NativeCatalogComponentName =
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
  | "View";

export type NativeComponentLayoutContracts = Partial<
  Readonly<Record<NativeCatalogComponentName, NativeComponentLayoutContract>>
>;

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

export interface NativeHostExtensionCapabilityGrant {
  readonly permissions: readonly string[];
  readonly resources: readonly string[];
}

export interface NativeHostExtensionEventOptions {
  readonly userActivated: boolean;
}

export interface NativeHostExtensionComponentProps extends NativeAccessibilityProps {
  readonly semanticProps: JsonObject;
  readonly capabilityGrant: NativeHostExtensionCapabilityGrant;
  readonly onEvent: (
    name: string,
    payload: JsonObject,
    options: NativeHostExtensionEventOptions,
  ) => void;
}

/** Opaque registration for one locally imported React Native or Fabric component. */
export interface NativeHostExtensionRegistration {
  readonly manifest: A2uiV1HostExtensionManifest;
  readonly manifestFingerprint: string;
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
