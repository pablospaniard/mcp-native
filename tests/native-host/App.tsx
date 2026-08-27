import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text as ReactNativeText,
  TextInput as ReactNativeTextInput,
  View as ReactNativeView,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { A2uiSurfaceStore, createA2uiV1BasicCatalogPolicy } from "@mcp-native/a2ui";
import {
  A2UI_V1_NATIVE_COMPONENT_NAMES,
  A2uiV1NativeSurface,
  createNativeButtonAdapter,
  createNativeTextAdapter,
  createNativeTextInputAdapter,
  createNativeViewAdapter,
} from "@mcp-native/react-native";
import type {
  NativeButtonComponentProps,
  NativeComponentCatalog,
  NativeTextComponentProps,
  NativeTextInputComponentProps,
  NativeViewComponentProps,
} from "@mcp-native/react-native";

import accessibilityFixture from "./accessibility-surface.json";

type CatalogMode = "adapters" | "primitives" | "variants";

const policy = createA2uiV1BasicCatalogPolicy({
  allowedComponentNames: A2UI_V1_NATIVE_COMPONENT_NAMES,
  allowedEventNames: ["activate", "choose_item", "submit"],
  allowedFunctionNames: ["@index", "email", "required"],
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

const primitiveCatalog: NativeComponentCatalog = {
  View: PrimitiveView,
  Text: PrimitiveText,
  Button: PrimitiveButton,
  TextInput: PrimitiveTextInput,
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
      disabled: disabled === true || accessibilityState.disabled,
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
            MCP Native 0.4.0 platform fixture
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
  primaryButton: { backgroundColor: "#174EA6", borderColor: "#174EA6" },
  primaryButtonLabel: { color: "#FFFFFF" },
  row: { flexDirection: "row", gap: 12 },
  safeArea: { backgroundColor: "#F5F7FA", flex: 1 },
  screen: { backgroundColor: "#F5F7FA", gap: 16, padding: 20 },
  selectedModeButton: { backgroundColor: "#D9EAFD", borderWidth: 2 },
  status: { color: "#243B53", fontSize: 16, fontWeight: "600" },
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
});
