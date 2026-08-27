import { createElement, type ComponentType, type ReactNode } from "react";

export interface NativeAccessibilityProps {
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
  readonly children?: ReactNode;
  readonly style?: NativeViewStyle;
}

export interface NativeTextComponentProps extends NativeAccessibilityProps {
  readonly children: string;
}

export interface NativeButtonComponentProps extends NativeAccessibilityProps {
  readonly accessibilityLabel: string;
  readonly disabled?: boolean;
  readonly onPress: () => void;
  readonly title: string;
  readonly validationMessages?: readonly string[];
}

export interface NativeTextInputComponentProps extends NativeAccessibilityProps {
  readonly accessibilityLabel: string;
  readonly invalid?: boolean;
  readonly keyboardType?: "numeric";
  readonly multiline?: boolean;
  readonly onChangeText?: (value: string) => void;
  readonly placeholder: string;
  readonly secureTextEntry?: boolean;
  readonly validationMessages?: readonly string[];
  readonly value?: string;
}

/** Locally bundled components chosen by the host application. */
export interface NativeComponentCatalog {
  readonly View: ComponentType<NativeViewComponentProps>;
  readonly Text: ComponentType<NativeTextComponentProps>;
  readonly Button: ComponentType<NativeButtonComponentProps>;
  readonly TextInput: ComponentType<NativeTextInputComponentProps>;
}

/** Maps renderer-selected primitive props into one locally bundled host component. */
export type NativeComponentPropMapper<TrustedProps extends object, HostProps extends object> = (
  props: TrustedProps,
) => HostProps;

function createComponentAdapter<TrustedProps extends object, HostProps extends object>(
  primitiveName: "Button" | "Text" | "TextInput" | "View",
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
