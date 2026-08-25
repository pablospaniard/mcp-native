import type { A2uiNode, A2uiSurface } from "@mcp-native/a2ui";
import { parseMcpNativeAction } from "@mcp-native/core";
import type { McpNativeAction, McpToolCallResult } from "@mcp-native/core";
import {
  createElement,
  useCallback,
  useMemo,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from "react";

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

export interface NativeViewComponentProps {
  readonly children?: ReactNode;
}

export interface NativeTextComponentProps {
  readonly children: string;
}

export interface NativeButtonComponentProps {
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
  readonly title: string;
}

export interface NativeTextInputComponentProps {
  readonly accessibilityLabel: string;
  readonly onChangeText?: (value: string) => void;
  readonly placeholder: string;
  readonly value?: string;
}

/** Locally bundled components chosen by the host application. */
export interface NativeComponentCatalog {
  readonly View: ComponentType<NativeViewComponentProps>;
  readonly Text: ComponentType<NativeTextComponentProps>;
  readonly Button: ComponentType<NativeButtonComponentProps>;
  readonly TextInput: ComponentType<NativeTextInputComponentProps>;
}

export type NativeActionHandler = (action: McpNativeAction) => void;

export type NativeBindingChangeHandler = (binding: string, value: string) => void;

export interface McpNativeSurfaceProps {
  readonly surface: A2uiSurface;
  readonly components: NativeComponentCatalog;
  readonly onAction: NativeActionHandler;
  readonly onBindingChange?: NativeBindingChangeHandler;
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
  return renderElement(plan, components, onAction, onBindingChange);
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

function renderElement(
  element: NativeElement,
  components: NativeComponentCatalog,
  onAction: NativeActionHandler,
  onBindingChange: NativeBindingChangeHandler | undefined,
): ReactElement {
  switch (element.component) {
    case "View":
      return createElement(
        components.View,
        { key: element.key },
        element.children?.map((child) =>
          renderElement(child, components, onAction, onBindingChange),
        ),
      );
    case "Text":
      return createElement(components.Text, {
        key: element.key,
        children: expectStringProp(element, "children"),
      });
    case "Button": {
      const title = expectStringProp(element, "title");
      const action = expectActionProp(element);
      return createElement(components.Button, {
        key: element.key,
        title,
        accessibilityLabel: title,
        onPress: () => onAction(action),
      });
    }
    case "TextInput": {
      const label = expectStringProp(element, "label");
      const value = optionalStringProp(element, "value");
      const binding = optionalStringProp(element, "binding");
      return createElement(components.TextInput, {
        key: element.key,
        accessibilityLabel: label,
        placeholder: label,
        ...(value === undefined ? {} : { value }),
        ...(binding === undefined || onBindingChange === undefined
          ? {}
          : { onChangeText: (nextValue: string) => onBindingChange(binding, nextValue) }),
      });
    }
  }
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
