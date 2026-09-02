import { Pressable, StyleSheet, Text, TextInput, View, type ViewStyle } from "react-native";
import type {
  NativeButtonComponentProps,
  NativeCheckBoxComponentProps,
  NativeChoicePickerComponentProps,
  NativeComponentCatalog,
  NativeDividerComponentProps,
  NativeTextComponentProps,
  NativeTextInputComponentProps,
  NativeViewComponentProps,
} from "@mcp-native/react-native";

const palette = {
  canvas: "#F4F7F5",
  card: "#FFFFFF",
  border: "#D9E3DD",
  ink: "#183028",
  muted: "#64756E",
  primary: "#176B4D",
  primarySoft: "#DDF3E8",
  danger: "#A13732",
  invalid: "#C23B35",
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

function SurfaceList(props: NativeViewComponentProps) {
  return <BaseView {...props} style={{ ...props.style, ...styles.list }} />;
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
  return <SurfaceText {...props} />;
}

function SurfaceButton({
  accessibilityHint,
  accessibilityLabel,
  accessibilityState,
  accessible,
  disabled,
  onPress,
  title,
  variant = "default",
}: NativeButtonComponentProps & { readonly variant?: "borderless" | "default" | "primary" }) {
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
        variant === "primary" && styles.primaryButton,
        variant === "borderless" && styles.borderlessButton,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text
        allowFontScaling
        style={[
          styles.buttonText,
          variant === "primary" && styles.primaryButtonText,
          variant === "borderless" && styles.borderlessButtonText,
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
  return <SurfaceButton {...props} variant="primary" />;
}

function BorderlessButton(props: NativeButtonComponentProps) {
  return <SurfaceButton {...props} variant="borderless" />;
}

function SurfaceInput({
  accessibilityElementsHidden,
  accessibilityHint,
  accessibilityLabel,
  accessible,
  allowFontScaling,
  importantForAccessibility,
  invalid,
  keyboardType,
  multiline,
  onChangeText,
  placeholder,
  secureTextEntry,
  value,
}: NativeTextInputComponentProps) {
  return (
    <View style={styles.inputGroup}>
      <Text allowFontScaling style={styles.inputLabel}>
        {accessibilityLabel}
      </Text>
      <TextInput
        accessibilityElementsHidden={accessibilityElementsHidden}
        accessibilityHint={accessibilityHint}
        accessibilityLabel={accessibilityLabel}
        accessible={accessible}
        allowFontScaling={allowFontScaling}
        importantForAccessibility={importantForAccessibility}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.muted}
        secureTextEntry={secureTextEntry}
        style={[styles.input, multiline && styles.multilineInput, invalid && styles.invalidInput]}
        value={value}
      />
    </View>
  );
}

function SurfaceCheckBox({
  accessibilityHint,
  accessibilityLabel,
  accessibilityState,
  accessible,
  label,
  onValueChange,
  value,
}: NativeCheckBoxComponentProps) {
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="checkbox"
      accessibilityState={accessibilityState}
      accessible={accessible}
      onPress={() => onValueChange?.(!value)}
      style={({ pressed }) => [styles.checkRow, pressed && styles.pressed]}
    >
      <View style={[styles.checkBox, value && styles.checkedBox]}>
        <Text allowFontScaling style={styles.checkMark}>
          {value ? "✓" : ""}
        </Text>
      </View>
      <Text allowFontScaling style={[styles.todoLabel, value && styles.completedLabel]}>
        {label}
      </Text>
    </Pressable>
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
    <View accessibilityLabel={accessibilityLabel} style={styles.filterGroup}>
      {label === undefined ? null : (
        <Text allowFontScaling style={styles.inputLabel}>
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

export const todoCatalog: NativeComponentCatalog = {
  View: BaseView,
  Text: SurfaceText,
  Button: DefaultButton,
  TextInput: SurfaceInput,
  CheckBox: SurfaceCheckBox,
  ChoicePicker: SurfaceChoicePicker,
  Divider: SurfaceDivider,
  variants: {
    View: { card: SurfaceCard, column: SurfaceColumn, list: SurfaceList, row: SurfaceRow },
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

export const appStyles = StyleSheet.create({
  app: { backgroundColor: palette.canvas, flex: 1 },
  content: { paddingBottom: 48, paddingHorizontal: 18, paddingTop: 18 },
  eyebrow: {
    color: palette.primary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  header: { color: palette.ink, fontSize: 32, fontWeight: "800", letterSpacing: -0.8 },
  headerRow: { alignItems: "flex-start", flexDirection: "row", gap: 12, marginBottom: 20 },
  headerText: { flex: 1 },
  resetButton: {
    borderColor: palette.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  resetText: { color: palette.primary, fontSize: 13, fontWeight: "700" },
  status: { color: palette.muted, fontSize: 13, marginBottom: 12 },
  subtitle: { color: palette.muted, fontSize: 15, lineHeight: 22, marginTop: 7 },
});

const styles = StyleSheet.create({
  body: { color: palette.ink, fontSize: 15, lineHeight: 21 },
  borderlessButton: { borderColor: "transparent", paddingHorizontal: 4, paddingVertical: 8 },
  borderlessButtonText: { color: palette.danger },
  button: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: palette.card,
    borderColor: palette.border,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  buttonText: { color: palette.ink, fontSize: 15, fontWeight: "700" },
  card: {
    backgroundColor: palette.card,
    borderColor: palette.border,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    shadowColor: "#153B2D",
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
  },
  checkBox: {
    alignItems: "center",
    borderColor: palette.primary,
    borderRadius: 7,
    borderWidth: 2,
    height: 25,
    justifyContent: "center",
    width: 25,
  },
  checkMark: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  checkRow: { alignItems: "center", flexDirection: "row", gap: 11, minHeight: 44 },
  checkedBox: { backgroundColor: palette.primary },
  chip: {
    borderColor: palette.border,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 40,
    paddingHorizontal: 15,
    paddingVertical: 9,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chipText: { color: palette.muted, fontSize: 14, fontWeight: "700" },
  column: { gap: 12 },
  completedLabel: { color: palette.muted, textDecorationLine: "line-through" },
  disabled: { opacity: 0.42 },
  filterGroup: { gap: 8 },
  horizontalRule: {
    backgroundColor: palette.border,
    height: StyleSheet.hairlineWidth,
    width: "100%",
  },
  input: {
    backgroundColor: "#FAFCFB",
    borderColor: palette.border,
    borderRadius: 12,
    borderWidth: 1,
    color: palette.ink,
    fontSize: 15,
    minHeight: 46,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  inputGroup: { gap: 6, minWidth: 150, width: "100%" },
  inputLabel: { color: palette.muted, fontSize: 12, fontWeight: "700" },
  invalidInput: { borderColor: palette.invalid, borderWidth: 2 },
  list: { gap: 12 },
  multilineInput: { minHeight: 100, textAlignVertical: "top" },
  pressed: { opacity: 0.68 },
  primaryButton: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
    transform: [{ translateY: 20 }],
  },
  primaryButtonText: { color: "#FFFFFF" },
  row: { alignItems: "flex-end", flexDirection: "row", flexWrap: "wrap", gap: 10 },
  selectedChip: { backgroundColor: palette.primarySoft, borderColor: palette.primary },
  selectedChipText: { color: palette.primary },
  todoLabel: { color: palette.ink, flex: 1, fontSize: 16, fontWeight: "700" },
  verticalRule: {
    alignSelf: "stretch",
    backgroundColor: palette.border,
    width: StyleSheet.hairlineWidth,
  },
});
