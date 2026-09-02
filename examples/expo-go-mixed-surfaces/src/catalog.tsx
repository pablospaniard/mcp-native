import { Pressable, StyleSheet, Text, TextInput, View, type ViewStyle } from "react-native";
import type {
  NativeButtonComponentProps,
  NativeChoicePickerComponentProps,
  NativeComponentCatalog,
  NativeDividerComponentProps,
  NativeTextComponentProps,
  NativeTextInputComponentProps,
  NativeViewComponentProps,
} from "@mcp-native/react-native";

export const cityPalette = {
  canvas: "#0D0B17",
  panel: "#171326",
  panelRaised: "#211B35",
  border: "#39304F",
  ink: "#FFF9ED",
  muted: "#B7ADCA",
  coral: "#FF8066",
  lemon: "#F5D76E",
  lavender: "#9D8CFF",
  mint: "#79E7C4",
} as const;

function BaseView({
  accessibilityElementsHidden,
  accessibilityHint,
  accessibilityLabel,
  children,
  importantForAccessibility,
  style,
}: NativeViewComponentProps) {
  return (
    <View
      accessibilityElementsHidden={accessibilityElementsHidden}
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      importantForAccessibility={importantForAccessibility}
      style={style as ViewStyle}
    >
      {children}
    </View>
  );
}

function SurfaceCard(props: NativeViewComponentProps) {
  return <BaseView {...props} style={{ ...props.style, ...styles.card }} />;
}

function SurfaceColumn(props: NativeViewComponentProps) {
  return <BaseView {...props} style={{ ...props.style, ...styles.column }} />;
}

function SurfaceRow(props: NativeViewComponentProps) {
  return <BaseView {...props} style={{ ...props.style, ...styles.row }} />;
}

function SurfaceText({
  accessibilityElementsHidden,
  accessibilityHint,
  accessibilityLabel,
  accessibilityLiveRegion,
  accessible,
  allowFontScaling,
  children,
  importantForAccessibility,
}: NativeTextComponentProps) {
  return (
    <Text
      accessibilityElementsHidden={accessibilityElementsHidden}
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityLiveRegion={accessibilityLiveRegion}
      accessible={accessible}
      allowFontScaling={allowFontScaling}
      importantForAccessibility={importantForAccessibility}
      style={styles.body}
    >
      {children}
    </Text>
  );
}

function CaptionText(props: NativeTextComponentProps) {
  return (
    <Text
      accessibilityElementsHidden={props.accessibilityElementsHidden}
      accessibilityHint={props.accessibilityHint}
      accessibilityLabel={props.accessibilityLabel}
      accessibilityLiveRegion={props.accessibilityLiveRegion}
      accessible={props.accessible}
      allowFontScaling={props.allowFontScaling}
      importantForAccessibility={props.importantForAccessibility}
      style={styles.caption}
    >
      {props.children}
    </Text>
  );
}

function SurfaceButton({
  accessibilityHint,
  accessibilityLabel,
  accessibilityState,
  accessible,
  disabled,
  onPress,
  title,
  treatment = "default",
}: NativeButtonComponentProps & {
  readonly treatment?: "borderless" | "default" | "primary";
}) {
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      accessible={accessible}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        treatment === "primary" && styles.primaryButton,
        treatment === "borderless" && styles.borderlessButton,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text
        allowFontScaling
        style={[
          styles.buttonText,
          treatment === "primary" && styles.primaryButtonText,
          treatment === "borderless" && styles.borderlessButtonText,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

function DefaultButton(props: NativeButtonComponentProps) {
  return <SurfaceButton {...props} />;
}

function PrimaryButton(props: NativeButtonComponentProps) {
  return <SurfaceButton {...props} treatment="primary" />;
}

function BorderlessButton(props: NativeButtonComponentProps) {
  return <SurfaceButton {...props} treatment="borderless" />;
}

function SurfaceInput({
  accessibilityHint,
  accessibilityLabel,
  allowFontScaling,
  invalid,
  keyboardType,
  multiline,
  onChangeText,
  placeholder,
  secureTextEntry,
  value,
}: NativeTextInputComponentProps) {
  return (
    <TextInput
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      allowFontScaling={allowFontScaling}
      keyboardType={keyboardType}
      multiline={multiline}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={cityPalette.muted}
      secureTextEntry={secureTextEntry}
      style={[styles.input, invalid && styles.invalidInput]}
      value={value}
    />
  );
}

function SurfaceChoicePicker({
  accessibilityLabel,
  label,
  onValueChange,
  options,
  value,
}: NativeChoicePickerComponentProps) {
  return (
    <View accessibilityLabel={accessibilityLabel} style={styles.choiceGroup}>
      {label === undefined ? null : (
        <Text allowFontScaling style={styles.choiceLabel}>
          {label}
        </Text>
      )}
      <View style={styles.chipRow}>
        {options.map((option) => {
          const selected = value.includes(option.value);
          return (
            <Pressable
              accessibilityLabel={option.label}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              key={option.value}
              onPress={() => onValueChange?.([option.value])}
              style={({ pressed }) => [
                styles.chip,
                selected && styles.selectedChip,
                pressed && styles.pressed,
              ]}
            >
              <Text allowFontScaling style={[styles.chipText, selected && styles.selectedChipText]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SurfaceDivider({ axis }: NativeDividerComponentProps) {
  return <View style={axis === "horizontal" ? styles.horizontalRule : styles.verticalRule} />;
}

export const cityCatalog: NativeComponentCatalog = {
  View: BaseView,
  Text: SurfaceText,
  Button: DefaultButton,
  TextInput: SurfaceInput,
  ChoicePicker: SurfaceChoicePicker,
  Divider: SurfaceDivider,
  variants: {
    View: { card: SurfaceCard, column: SurfaceColumn, row: SurfaceRow },
    Text: { body: SurfaceText, caption: CaptionText },
    Button: {
      borderless: BorderlessButton,
      default: DefaultButton,
      primary: PrimaryButton,
    },
    TextInput: {
      longText: SurfaceInput,
      number: SurfaceInput,
      obscured: SurfaceInput,
      shortText: SurfaceInput,
    },
  },
};

const styles = StyleSheet.create({
  body: { color: cityPalette.ink, fontSize: 16, lineHeight: 24 },
  button: {
    alignItems: "center",
    backgroundColor: cityPalette.panelRaised,
    borderColor: cityPalette.border,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  buttonText: { color: cityPalette.ink, fontSize: 15, fontWeight: "800" },
  borderlessButton: { backgroundColor: "transparent", borderWidth: 0, minHeight: 44 },
  borderlessButtonText: { color: cityPalette.mint },
  caption: {
    color: cityPalette.muted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.7,
    lineHeight: 18,
    textTransform: "uppercase",
  },
  card: {
    backgroundColor: cityPalette.panel,
    borderColor: cityPalette.border,
    borderRadius: 28,
    borderWidth: 1,
    overflow: "hidden",
    padding: 20,
  },
  chip: {
    alignItems: "center",
    backgroundColor: cityPalette.panelRaised,
    borderColor: cityPalette.border,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 42,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chipText: { color: cityPalette.muted, fontSize: 14, fontWeight: "700" },
  choiceGroup: { gap: 10 },
  choiceLabel: { color: cityPalette.ink, fontSize: 14, fontWeight: "800" },
  column: { gap: 14 },
  disabled: { opacity: 0.45 },
  horizontalRule: { backgroundColor: cityPalette.border, height: 1, width: "100%" },
  input: {
    backgroundColor: cityPalette.panelRaised,
    borderColor: cityPalette.border,
    borderRadius: 14,
    borderWidth: 1,
    color: cityPalette.ink,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  invalidInput: { borderColor: cityPalette.coral },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  primaryButton: { backgroundColor: cityPalette.lemon, borderColor: cityPalette.lemon },
  primaryButtonText: { color: "#21180A" },
  row: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 10 },
  selectedChip: { backgroundColor: cityPalette.lavender, borderColor: cityPalette.lavender },
  selectedChipText: { color: "#130E26" },
  verticalRule: { alignSelf: "stretch", backgroundColor: cityPalette.border, width: 1 },
});
