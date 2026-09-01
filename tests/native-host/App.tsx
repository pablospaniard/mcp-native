import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Modal as ReactNativeModal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as ReactNativeText,
  TextInput as ReactNativeTextInput,
  View as ReactNativeView,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import {
  A2uiSurfaceStore,
  createA2uiV1BasicCatalogPolicy,
  createA2uiV1HostExtensionCapabilitySettings,
  createA2uiV1HostExtensionRegistry,
  negotiateA2uiV1HostExtensions,
  parseA2uiV1HostExtensionManifest,
} from "@mcp-native/a2ui";
import {
  A2UI_V1_NATIVE_COMPONENT_NAMES,
  A2uiV1NativeSurface,
  createNativeHostExtensionRegistration,
  createNativeButtonAdapter,
  createNativeTextAdapter,
  createNativeTextInputAdapter,
  createNativeViewAdapter,
} from "@mcp-native/react-native";
import type {
  NativeButtonComponentProps,
  NativeAudioPlayerComponentProps,
  NativeCheckBoxComponentProps,
  NativeChoicePickerComponentProps,
  NativeComponentCatalog,
  NativeDateTimeInputComponentProps,
  NativeDividerComponentProps,
  NativeIconComponentProps,
  NativeImageComponentProps,
  NativeModalComponentProps,
  NativeSliderComponentProps,
  NativeTabsComponentProps,
  NativeTextComponentProps,
  NativeTextInputComponentProps,
  NativeVideoComponentProps,
  NativeViewComponentProps,
} from "@mcp-native/react-native";

import accessibilityFixture from "./accessibility-surface.json";
import milestone7Fixture from "./milestone-7-surface.json";
import milestone8Fixture from "./milestone-8-surface.json";
import NativeStatusBadge from "./specs/McpNativeStatusBadgeNativeComponent";
import statusBadgeManifestInput from "./status-badge-extension-manifest.json";

type CatalogMode = "adapters" | "primitives" | "variants";

const nativePlatform = Platform.OS === "android" ? "android" : "ios";
const statusBadgeManifest = parseA2uiV1HostExtensionManifest(statusBadgeManifestInput);
const hostExtensionSettings = createA2uiV1HostExtensionCapabilitySettings(
  [statusBadgeManifest],
  nativePlatform,
);
const hostExtensionNegotiation = negotiateA2uiV1HostExtensions(
  hostExtensionSettings,
  hostExtensionSettings,
);
const hostExtensionRegistry = createA2uiV1HostExtensionRegistry({
  platform: nativePlatform,
  manifests: [statusBadgeManifest],
  negotiation: hostExtensionNegotiation,
});

const policy = createA2uiV1BasicCatalogPolicy({
  allowedComponentNames: A2UI_V1_NATIVE_COMPONENT_NAMES,
  allowedHostExtensionComponentNames: [statusBadgeManifest.componentName],
  allowedEventNames: ["activate", "choose_item", "open_details", "submit"],
  allowedFunctionNames: ["@index", "email", "required"],
  hostExtensions: hostExtensionRegistry,
});

const fixtureStore = new A2uiSurfaceStore();
fixtureStore.apply(accessibilityFixture);
function requireFixtureSurface() {
  const surface = fixtureStore.get("native-accessibility");
  if (surface === undefined) {
    throw new Error("The native accessibility fixture did not create its declared surface");
  }
  return surface;
}
const fixtureSurface = requireFixtureSurface();

const milestone7Store = new A2uiSurfaceStore();
milestone7Store.apply(milestone7Fixture);
function requireMilestone7Surface() {
  const surface = milestone7Store.get("milestone-7");
  if (surface === undefined) {
    throw new Error("The milestone 7 fixture did not create its declared surface");
  }
  return surface;
}
const milestone7Surface = requireMilestone7Surface();

const milestone8Store = new A2uiSurfaceStore({ hostExtensions: hostExtensionRegistry });
milestone8Store.apply(milestone8Fixture);
function requireMilestone8Surface() {
  const surface = milestone8Store.get("milestone-8");
  if (surface === undefined) {
    throw new Error("The milestone 8 fixture did not create its declared surface");
  }
  return surface;
}
const milestone8Surface = requireMilestone8Surface();

function PrimitiveView({ children, style, ...accessibility }: NativeViewComponentProps) {
  return (
    <ReactNativeView {...accessibility} style={style}>
      {children}
    </ReactNativeView>
  );
}

function PrimitiveText({ children, ...props }: NativeTextComponentProps) {
  return <ReactNativeText {...props}>{children}</ReactNativeText>;
}

function PrimitiveButton({
  title,
  validationMessages: _validationMessages,
  ...props
}: NativeButtonComponentProps) {
  return (
    <Pressable
      {...props}
      style={({ pressed }) => [styles.button, pressed && !props.disabled && styles.buttonPressed]}
    >
      <ReactNativeText allowFontScaling style={styles.buttonLabel}>
        {title}
      </ReactNativeText>
    </Pressable>
  );
}

function PrimitiveTextInput({
  invalid,
  validationMessages: _validationMessages,
  ...props
}: NativeTextInputComponentProps) {
  return (
    <ReactNativeTextInput
      {...props}
      style={[styles.input, invalid === true && styles.invalidInput]}
    />
  );
}

function PrimitiveImage({ accessibilityLabel, fit, uri }: NativeImageComponentProps) {
  return (
    <ReactNativeView
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      accessible
      style={styles.imagePlaceholder}
    >
      <ReactNativeText allowFontScaling style={styles.imagePlaceholderTitle}>
        Remote image policy fixture
      </ReactNativeText>
      <ReactNativeText allowFontScaling style={styles.caption}>
        {`${fit}: ${uri}`}
      </ReactNativeText>
      <ReactNativeText allowFontScaling style={styles.caption}>
        Network loading is intentionally disabled in this generated host. Install a loader that
        enforces the supplied resource policy before advertising Image in production.
      </ReactNativeText>
    </ReactNativeView>
  );
}

function PrimitiveVideo({ accessibilityLabel, uri }: NativeVideoComponentProps) {
  return (
    <ReactNativeView
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      accessible
      style={styles.mediaPlaceholder}
    >
      <ReactNativeText allowFontScaling style={styles.imagePlaceholderTitle}>
        Video host adapter fixture
      </ReactNativeText>
      <ReactNativeText allowFontScaling style={styles.caption}>
        {uri}
      </ReactNativeText>
      <ReactNativeText allowFontScaling style={styles.caption}>
        Playback is intentionally disabled. A production host must enforce the supplied media grant
        before loading bytes or enabling a playback route.
      </ReactNativeText>
    </ReactNativeView>
  );
}

function PrimitiveAudioPlayer({
  accessibilityLabel,
  description,
  uri,
}: NativeAudioPlayerComponentProps) {
  return (
    <ReactNativeView
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="summary"
      accessible
      style={styles.mediaPlaceholder}
    >
      <ReactNativeText allowFontScaling style={styles.imagePlaceholderTitle}>
        Audio host adapter fixture
      </ReactNativeText>
      <ReactNativeText allowFontScaling style={styles.caption}>
        {description ?? uri}
      </ReactNativeText>
    </ReactNativeView>
  );
}

function PrimitiveIcon({ accessibilityLabel, name }: NativeIconComponentProps) {
  return (
    <ReactNativeText
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      accessible
      allowFontScaling
      style={styles.icon}
    >
      {`[${name}]`}
    </ReactNativeText>
  );
}

function PrimitiveDivider({ axis }: NativeDividerComponentProps) {
  return (
    <ReactNativeView
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={axis === "vertical" ? styles.verticalDivider : styles.horizontalDivider}
    />
  );
}

function PrimitiveCheckBox({ label, onValueChange, value }: NativeCheckBoxComponentProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      onPress={() => onValueChange?.(!value)}
      style={({ pressed }) => [styles.choice, pressed && styles.buttonPressed]}
    >
      <ReactNativeText allowFontScaling style={styles.body}>
        {`${value ? "☑" : "☐"} ${label}`}
      </ReactNativeText>
    </Pressable>
  );
}

function PrimitiveChoicePicker({
  label,
  onValueChange,
  options,
  value,
  variant,
}: NativeChoicePickerComponentProps) {
  return (
    <ReactNativeView style={styles.controlGroup}>
      {label === undefined ? null : (
        <ReactNativeText allowFontScaling style={styles.controlLabel}>
          {label}
        </ReactNativeText>
      )}
      <ReactNativeView style={styles.choiceRow}>
        {options.map((option) => {
          const selected = value.includes(option.value);
          return (
            <Pressable
              accessibilityLabel={option.label}
              accessibilityRole={variant === "mutuallyExclusive" ? "radio" : "checkbox"}
              accessibilityState={{ checked: selected }}
              key={option.value}
              onPress={() => {
                const next =
                  variant === "mutuallyExclusive"
                    ? [option.value]
                    : selected
                      ? value.filter((candidate) => candidate !== option.value)
                      : [...value, option.value];
                onValueChange?.(next);
              }}
              style={[styles.choice, selected && styles.selectedChoice]}
            >
              <ReactNativeText allowFontScaling style={styles.body}>
                {option.label}
              </ReactNativeText>
            </Pressable>
          );
        })}
      </ReactNativeView>
    </ReactNativeView>
  );
}

function PrimitiveSlider({
  accessibilityLabel,
  maximumValue,
  minimumValue,
  onValueChange,
  step = 1,
  value,
}: NativeSliderComponentProps) {
  const update = (direction: -1 | 1) =>
    onValueChange?.(Math.min(maximumValue, Math.max(minimumValue, value + direction * step)));
  return (
    <Pressable
      accessibilityActions={[{ name: "decrement" }, { name: "increment" }]}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="adjustable"
      accessibilityValue={{ max: maximumValue, min: minimumValue, now: value }}
      onAccessibilityAction={(event) =>
        update(event.nativeEvent.actionName === "decrement" ? -1 : 1)
      }
      onPress={() => update(1)}
      style={styles.choice}
    >
      <ReactNativeText allowFontScaling style={styles.body}>
        {`${accessibilityLabel}: ${value}. Activate to increase.`}
      </ReactNativeText>
    </Pressable>
  );
}

function PrimitiveDateTimeInput({
  accessibilityLabel,
  onValueChange,
  value,
}: NativeDateTimeInputComponentProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={() => onValueChange?.(value === "2026-09-01" ? "2026-09-02" : "2026-09-01")}
      style={styles.choice}
    >
      <ReactNativeText allowFontScaling style={styles.body}>
        {`${accessibilityLabel}: ${value}. Activate to change the fixture date.`}
      </ReactNativeText>
    </Pressable>
  );
}

function PrimitiveTabs({ onSelect, selectedIndex, tabs }: NativeTabsComponentProps) {
  return (
    <ReactNativeView style={styles.controlGroup}>
      <ReactNativeView style={styles.choiceRow}>
        {tabs.map((tab, index) => (
          <Pressable
            accessibilityLabel={tab.title}
            accessibilityRole="tab"
            accessibilityState={{ selected: index === selectedIndex }}
            key={`${index}:${tab.title}`}
            onPress={() => onSelect(index)}
            style={[styles.choice, index === selectedIndex && styles.selectedChoice]}
          >
            <ReactNativeText allowFontScaling style={styles.body}>
              {tab.title}
            </ReactNativeText>
          </Pressable>
        ))}
      </ReactNativeView>
      {tabs[selectedIndex]?.content}
    </ReactNativeView>
  );
}

function PrimitiveModal({ content, onRequestClose, open, trigger }: NativeModalComponentProps) {
  return (
    <>
      {trigger}
      <ReactNativeModal
        accessibilityViewIsModal
        animationType="fade"
        onRequestClose={onRequestClose}
        transparent
        visible={open}
      >
        <ReactNativeView style={styles.modalBackdrop}>
          <ReactNativeView style={styles.modalPanel}>
            {content}
            <Pressable
              accessibilityLabel="Close modal"
              accessibilityRole="button"
              onPress={onRequestClose}
              style={styles.button}
            >
              <ReactNativeText allowFontScaling style={styles.buttonLabel}>
                Close
              </ReactNativeText>
            </Pressable>
          </ReactNativeView>
        </ReactNativeView>
      </ReactNativeModal>
    </>
  );
}

const milestone7Components = {
  Image: PrimitiveImage,
  Icon: PrimitiveIcon,
  Divider: PrimitiveDivider,
  CheckBox: PrimitiveCheckBox,
  ChoicePicker: PrimitiveChoicePicker,
  Slider: PrimitiveSlider,
  DateTimeInput: PrimitiveDateTimeInput,
  Tabs: PrimitiveTabs,
  Modal: PrimitiveModal,
} satisfies Partial<NativeComponentCatalog>;

const statusBadgeRegistration = createNativeHostExtensionRegistration(
  statusBadgeManifest,
  NativeStatusBadge,
  ({ accessibilityLabel, semanticProps }) => {
    const { label, tone } = semanticProps;
    if (typeof label !== "string" || typeof tone !== "string") {
      throw new Error("The validated status-badge props do not match the local Fabric component");
    }
    return {
      accessibilityLabel,
      label,
      style: styles.statusBadge,
      tone,
    };
  },
);

const milestone8Components = {
  AudioPlayer: PrimitiveAudioPlayer,
  Video: PrimitiveVideo,
  hostExtensions: [statusBadgeRegistration],
} satisfies Partial<NativeComponentCatalog>;

const primitiveCatalog: NativeComponentCatalog = {
  View: PrimitiveView,
  Text: PrimitiveText,
  Button: PrimitiveButton,
  TextInput: PrimitiveTextInput,
  ...milestone7Components,
  ...milestone8Components,
};

interface DesignStackProps {
  readonly assistiveHint?: string;
  readonly assistiveLabel?: string;
  readonly children?: ReactNode;
  readonly hidden?: boolean;
  readonly layout?: NativeViewComponentProps["style"];
}

function DesignStack({
  assistiveHint,
  assistiveLabel,
  children,
  hidden,
  layout,
}: DesignStackProps) {
  return (
    <ReactNativeView
      accessibilityElementsHidden={hidden}
      accessibilityHint={assistiveHint}
      accessibilityLabel={assistiveLabel}
      importantForAccessibility={hidden === true ? "no-hide-descendants" : "auto"}
      style={[styles.adapterContainer, layout]}
    >
      {children}
    </ReactNativeView>
  );
}

interface DesignTextProps {
  readonly assistiveHint?: string;
  readonly assistiveLabel?: string;
  readonly children: string;
  readonly hidden: boolean;
  readonly live?: "assertive" | "none" | "polite";
}

function DesignText({ assistiveHint, assistiveLabel, children, hidden, live }: DesignTextProps) {
  return (
    <ReactNativeText
      accessibilityElementsHidden={hidden}
      accessibilityHint={assistiveHint}
      accessibilityLabel={assistiveLabel}
      accessibilityLiveRegion={live}
      accessibilityRole="text"
      accessible={!hidden}
      allowFontScaling
      importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
      style={styles.adapterText}
    >
      {children}
    </ReactNativeText>
  );
}

interface DesignButtonProps {
  readonly assistiveHint?: string;
  readonly assistiveLabel: string;
  readonly disabled: boolean;
  readonly onActivate: () => void;
  readonly title: string;
}

function DesignButton({
  assistiveHint,
  assistiveLabel,
  disabled,
  onActivate,
  title,
}: DesignButtonProps) {
  return (
    <Pressable
      accessibilityHint={assistiveHint}
      accessibilityLabel={assistiveLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessible
      disabled={disabled}
      onPress={onActivate}
      style={({ pressed }) => [
        styles.adapterButton,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <ReactNativeText allowFontScaling style={styles.adapterButtonLabel}>
        {title}
      </ReactNativeText>
    </Pressable>
  );
}

interface DesignInputProps {
  readonly assistiveHint?: string;
  readonly assistiveLabel: string;
  readonly hidden: boolean;
  readonly invalid: boolean;
  readonly keyboard?: "numeric";
  readonly multiline: boolean;
  readonly onValueChange?: (value: string) => void;
  readonly placeholder: string;
  readonly secure: boolean;
  readonly value?: string;
}

function DesignInput({
  assistiveHint,
  assistiveLabel,
  hidden,
  invalid,
  keyboard,
  multiline,
  onValueChange,
  placeholder,
  secure,
  value,
}: DesignInputProps) {
  return (
    <ReactNativeTextInput
      accessibilityElementsHidden={hidden}
      accessibilityHint={assistiveHint}
      accessibilityLabel={assistiveLabel}
      accessible={!hidden}
      allowFontScaling
      importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
      keyboardType={keyboard}
      multiline={multiline}
      onChangeText={onValueChange}
      placeholder={placeholder}
      secureTextEntry={secure}
      style={[styles.adapterInput, invalid && styles.invalidInput]}
      value={value}
    />
  );
}

const adapterCatalog: NativeComponentCatalog = {
  View: createNativeViewAdapter(
    DesignStack,
    ({ accessibilityElementsHidden, accessibilityHint, accessibilityLabel, children, style }) => ({
      assistiveHint: accessibilityHint,
      assistiveLabel: accessibilityLabel,
      children,
      hidden: accessibilityElementsHidden === true,
      layout: style,
    }),
  ),
  Text: createNativeTextAdapter(
    DesignText,
    ({
      accessibilityElementsHidden,
      accessibilityHint,
      accessibilityLabel,
      accessibilityLiveRegion,
      children,
    }) => ({
      assistiveHint: accessibilityHint,
      assistiveLabel: accessibilityLabel,
      children,
      hidden: accessibilityElementsHidden === true,
      live: accessibilityLiveRegion,
    }),
  ),
  Button: createNativeButtonAdapter(
    DesignButton,
    ({ accessibilityHint, accessibilityLabel, accessibilityState, disabled, onPress, title }) => ({
      assistiveHint: accessibilityHint,
      assistiveLabel: accessibilityLabel,
      disabled: disabled === true || accessibilityState.disabled === true,
      onActivate: onPress,
      title,
    }),
  ),
  TextInput: createNativeTextInputAdapter(
    DesignInput,
    ({
      accessibilityElementsHidden,
      accessibilityHint,
      accessibilityLabel,
      invalid,
      keyboardType,
      multiline,
      onChangeText,
      placeholder,
      secureTextEntry,
      value,
    }) => ({
      assistiveHint: accessibilityHint,
      assistiveLabel: accessibilityLabel,
      hidden: accessibilityElementsHidden === true,
      invalid: invalid === true,
      keyboard: keyboardType,
      multiline: multiline === true,
      onValueChange: onChangeText,
      placeholder,
      secure: secureTextEntry === true,
      value,
    }),
  ),
  ...milestone7Components,
  ...milestone8Components,
};

function CardVariant(props: NativeViewComponentProps) {
  return <ReactNativeView {...props} style={[styles.card, props.style]} />;
}

function ListVariant(props: NativeViewComponentProps) {
  return <ReactNativeView {...props} style={[styles.list, props.style]} />;
}

function RowVariant(props: NativeViewComponentProps) {
  return <ReactNativeView {...props} style={[styles.row, props.style]} />;
}

function ColumnVariant(props: NativeViewComponentProps) {
  return <ReactNativeView {...props} style={[styles.column, props.style]} />;
}

function CaptionVariant(props: NativeTextComponentProps) {
  return <ReactNativeText {...props} style={styles.caption} />;
}

function BodyVariant(props: NativeTextComponentProps) {
  return <ReactNativeText {...props} style={styles.body} />;
}

function PrimaryButtonVariant(props: NativeButtonComponentProps) {
  return <VariantButton {...props} treatment="primary" />;
}

function DefaultButtonVariant(props: NativeButtonComponentProps) {
  return <VariantButton {...props} treatment="default" />;
}

function BorderlessButtonVariant(props: NativeButtonComponentProps) {
  return <VariantButton {...props} treatment="borderless" />;
}

function VariantButton({
  title,
  treatment,
  validationMessages: _validationMessages,
  ...props
}: NativeButtonComponentProps & { readonly treatment: "borderless" | "default" | "primary" }) {
  return (
    <Pressable
      {...props}
      style={({ pressed }) => [
        styles.variantButton,
        treatment === "primary" && styles.primaryButton,
        treatment === "borderless" && styles.borderlessButton,
        props.disabled && styles.disabledButton,
        pressed && !props.disabled && styles.buttonPressed,
      ]}
    >
      <ReactNativeText
        allowFontScaling
        style={[styles.variantButtonLabel, treatment === "primary" && styles.primaryButtonLabel]}
      >
        {title}
      </ReactNativeText>
    </Pressable>
  );
}

function VariantInput(props: NativeTextInputComponentProps) {
  const { invalid, validationMessages: _validationMessages, ...nativeProps } = props;
  return (
    <ReactNativeTextInput
      {...nativeProps}
      style={[
        styles.variantInput,
        props.multiline && styles.multilineInput,
        invalid && styles.invalidInput,
      ]}
    />
  );
}

const variantCatalog: NativeComponentCatalog = {
  ...primitiveCatalog,
  variants: {
    View: { card: CardVariant, column: ColumnVariant, list: ListVariant, row: RowVariant },
    Text: { body: BodyVariant, caption: CaptionVariant },
    Button: {
      borderless: BorderlessButtonVariant,
      default: DefaultButtonVariant,
      primary: PrimaryButtonVariant,
    },
    TextInput: {
      longText: VariantInput,
      number: VariantInput,
      obscured: VariantInput,
      shortText: VariantInput,
    },
  },
};

const catalogs: Readonly<Record<CatalogMode, NativeComponentCatalog>> = {
  adapters: adapterCatalog,
  primitives: primitiveCatalog,
  variants: variantCatalog,
};

export default function App() {
  const [mode, setMode] = useState<CatalogMode>("primitives");
  const actionCallbackCountRef = useRef(0);
  const [actionCallbackCount, setActionCallbackCount] = useState(0);
  const [status, setStatus] = useState("No action dispatched");
  const catalog = useMemo(() => catalogs[mode], [mode]);

  const recordActionCallback = (actionName: string) => {
    const nextCount = actionCallbackCountRef.current + 1;
    actionCallbackCountRef.current = nextCount;
    setActionCallbackCount(nextCount);
    setStatus(`Observed action callback ${nextCount}: ${actionName}`);
  };

  const resetActionCallbackCount = () => {
    actionCallbackCountRef.current = 0;
    setActionCallbackCount(0);
    setStatus("Action callback count reset; activate one renderer control");
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView edges={["top", "right", "bottom", "left"]} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
          <ReactNativeText accessibilityRole="header" allowFontScaling style={styles.heading}>
            MCP Native Milestone 7 platform fixture
          </ReactNativeText>
          <ReactNativeText allowFontScaling style={styles.instructions}>
            Run every catalog path with screen-reader navigation, larger text, both orientations,
            reduced motion, and platform contrast settings.
          </ReactNativeText>
          <ReactNativeView accessibilityLabel="Catalog path" style={styles.modeSelector}>
            {(["primitives", "adapters", "variants"] as const).map((candidate) => (
              <Pressable
                accessibilityLabel={`Use ${candidate} catalog`}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === candidate }}
                key={candidate}
                onPress={() => setMode(candidate)}
                style={[styles.modeButton, mode === candidate && styles.selectedModeButton]}
              >
                <ReactNativeText allowFontScaling style={styles.modeButtonLabel}>
                  {candidate}
                </ReactNativeText>
              </Pressable>
            ))}
          </ReactNativeView>
          <ReactNativeView
            accessibilityLabel="Action callback observation"
            style={styles.counterPanel}
          >
            <ReactNativeText
              accessibilityLiveRegion="polite"
              allowFontScaling
              style={styles.status}
            >
              {`Callbacks since reset: ${actionCallbackCount}. ${status}`}
            </ReactNativeText>
            <Pressable
              accessibilityHint="Use before each test activation so duplicate callbacks are visible"
              accessibilityLabel="Reset action callback count"
              accessibilityRole="button"
              onPress={resetActionCallbackCount}
              style={({ pressed }) => [styles.counterButton, pressed && styles.buttonPressed]}
            >
              <ReactNativeText allowFontScaling style={styles.counterButtonLabel}>
                Reset callback count
              </ReactNativeText>
            </Pressable>
          </ReactNativeView>
          <A2uiV1NativeSurface
            components={catalog}
            key={mode}
            now={() => new Date().toISOString()}
            onAction={(envelope) => recordActionCallback(envelope.action.name)}
            onDataModelChange={() =>
              setStatus("Renderer-local data changed without an agent action")
            }
            policy={policy}
            surface={fixtureSurface}
          />
          <ReactNativeText accessibilityRole="header" allowFontScaling style={styles.subheading}>
            Complete non-media catalog
          </ReactNativeText>
          <A2uiV1NativeSurface
            components={catalog}
            imagePolicy={({ url }) =>
              url === "https://images.example.com/mcp-native-fixture.png"
                ? {
                    allowedRedirectOrigins: [],
                    cacheMode: "no-store",
                    maximumBytes: 1_000_000,
                    maximumDecodedHeight: 2_048,
                    maximumDecodedPixels: 4_194_304,
                    maximumDecodedWidth: 2_048,
                    maximumRedirects: 0,
                  }
                : false
            }
            key={`milestone-7:${mode}`}
            now={() => new Date().toISOString()}
            onAction={(envelope) => recordActionCallback(envelope.action.name)}
            onDataModelChange={() =>
              setStatus("Renderer-local milestone 7 data changed without an agent action")
            }
            policy={policy}
            surface={milestone7Surface}
          />
          <ReactNativeText accessibilityRole="header" allowFontScaling style={styles.subheading}>
            Milestone 8 policy and Fabric fixture
          </ReactNativeText>
          <A2uiV1NativeSurface
            components={catalog}
            hostExtensionPolicy={() => ({ permissions: [], resources: [] })}
            imagePolicy={({ url }) =>
              url === "https://images.example.com/mcp-native-fixture.png"
                ? {
                    allowedRedirectOrigins: [],
                    cacheMode: "no-store",
                    maximumBytes: 1_000_000,
                    maximumDecodedHeight: 2_048,
                    maximumDecodedPixels: 4_194_304,
                    maximumDecodedWidth: 2_048,
                    maximumRedirects: 0,
                  }
                : false
            }
            key={`milestone-8:${mode}`}
            mediaPolicy={({ kind, sourceOrigin }) =>
              sourceOrigin === "https://media.example.com"
                ? {
                    allowedMimeTypes: [kind === "video" ? "video/mp4" : "audio/mpeg"],
                    allowedRedirectOrigins: [],
                    allowsAutoplay: false,
                    allowsBackgroundPlayback: false,
                    allowsExternalRoutes: false,
                    maximumBytes: 25_000_000,
                    maximumRedirects: 0,
                    requiresUserActivation: true,
                    sourceOrigin,
                  }
                : false
            }
            now={() => new Date().toISOString()}
            onAction={(envelope) => recordActionCallback(envelope.action.name)}
            policy={policy}
            surface={milestone8Surface}
          />
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  adapterButton: {
    alignItems: "center",
    backgroundColor: "#E8EEF8",
    borderColor: "#173B6C",
    borderRadius: 8,
    borderWidth: 2,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  adapterButtonLabel: { color: "#102A43", fontSize: 17, fontWeight: "700" },
  adapterContainer: { gap: 12 },
  adapterInput: {
    borderColor: "#486581",
    borderRadius: 6,
    borderWidth: 2,
    color: "#102A43",
    fontSize: 17,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  adapterText: { color: "#102A43", fontSize: 17 },
  body: { color: "#102A43", fontSize: 17 },
  borderlessButton: { borderColor: "transparent" },
  button: {
    alignItems: "center",
    borderColor: "#334E68",
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  buttonLabel: { color: "#102A43", fontSize: 17 },
  buttonPressed: { opacity: 0.72 },
  caption: { color: "#334E68", fontSize: 15 },
  card: {
    backgroundColor: "#FFFFFF",
    borderColor: "#BCCCDC",
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  column: { gap: 12 },
  choice: {
    borderColor: "#486581",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  controlGroup: { gap: 8 },
  controlLabel: { color: "#102A43", fontSize: 17, fontWeight: "600" },
  counterButton: {
    alignItems: "center",
    borderColor: "#486581",
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  counterButtonLabel: { color: "#102A43", fontSize: 16, fontWeight: "600" },
  counterPanel: { gap: 8 },
  disabledButton: { opacity: 0.5 },
  heading: { color: "#102A43", fontSize: 24, fontWeight: "700" },
  input: {
    borderColor: "#486581",
    borderRadius: 6,
    borderWidth: 1,
    color: "#102A43",
    fontSize: 17,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  instructions: { color: "#243B53", fontSize: 17 },
  horizontalDivider: { backgroundColor: "#9FB3C8", height: 1, width: "100%" },
  icon: { color: "#174EA6", fontSize: 18, fontWeight: "700" },
  imagePlaceholder: {
    backgroundColor: "#E8EEF8",
    borderColor: "#486581",
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    minHeight: 120,
    padding: 12,
  },
  imagePlaceholderTitle: { color: "#102A43", fontSize: 17, fontWeight: "700" },
  invalidInput: { borderColor: "#B42318", borderWidth: 2 },
  list: { gap: 16 },
  modeButton: {
    alignItems: "center",
    borderColor: "#486581",
    borderRadius: 6,
    borderWidth: 1,
    flexGrow: 1,
    justifyContent: "center",
    minHeight: 48,
    padding: 8,
  },
  modeButtonLabel: { color: "#102A43", fontSize: 16 },
  modeSelector: { flexDirection: "row", gap: 8 },
  multilineInput: { minHeight: 96, textAlignVertical: "top" },
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  modalPanel: { backgroundColor: "#FFFFFF", borderRadius: 12, gap: 16, padding: 20, width: "100%" },
  mediaPlaceholder: {
    backgroundColor: "#F2F4F7",
    borderColor: "#486581",
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    minHeight: 96,
    padding: 12,
  },
  primaryButton: { backgroundColor: "#174EA6", borderColor: "#174EA6" },
  primaryButtonLabel: { color: "#FFFFFF" },
  row: { flexDirection: "row", gap: 12 },
  safeArea: { backgroundColor: "#F5F7FA", flex: 1 },
  screen: { backgroundColor: "#F5F7FA", gap: 16, padding: 20 },
  selectedModeButton: { backgroundColor: "#D9EAFD", borderWidth: 2 },
  selectedChoice: { backgroundColor: "#D9EAFD", borderWidth: 2 },
  status: { color: "#243B53", fontSize: 16, fontWeight: "600" },
  statusBadge: { minHeight: 48, width: "100%" },
  subheading: { color: "#102A43", fontSize: 20, fontWeight: "700", marginTop: 8 },
  variantButton: {
    alignItems: "center",
    borderColor: "#174EA6",
    borderRadius: 8,
    borderWidth: 2,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  variantButtonLabel: { color: "#174EA6", fontSize: 17, fontWeight: "700" },
  variantInput: {
    borderColor: "#486581",
    borderRadius: 8,
    borderWidth: 2,
    color: "#102A43",
    fontSize: 17,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  verticalDivider: { alignSelf: "stretch", backgroundColor: "#9FB3C8", width: 1 },
});
