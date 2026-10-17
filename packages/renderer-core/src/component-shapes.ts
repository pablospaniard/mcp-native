import type { A2uiV1HostExtensionManifest } from "@mcp-native/a2ui";
import type { JsonObject } from "@mcp-native/core";

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
  readonly accessibilityState?: NativeAccessibilityState;
  readonly importantForAccessibility?: "auto" | "no-hide-descendants";
}

/** Platform-neutral flex-inspired layout vocabulary; not a React Native API. */
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

export type NativeViewVariant = "card" | "column" | "list" | "row";

export type NativeTextVariant = "body" | "caption";

export type NativeButtonVariant = "borderless" | "default" | "primary";

export type NativeTextInputVariant = "longText" | "number" | "obscured" | "shortText";

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
