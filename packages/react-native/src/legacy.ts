import type { A2uiNode, A2uiSurface } from "@mcp-native/a2ui/legacy";
import { parseMcpNativeAction } from "@mcp-native/core";
import type { McpNativeAction, McpToolCallResult } from "@mcp-native/core";
import { createElement, useCallback, useMemo, type ReactElement } from "react";

import type { NativeComponentCatalog } from "./component-adapters.js";
import type { NativeElement } from "./index.js";

export type { NativeComponentName, NativeElement } from "./index.js";

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

/** @deprecated Use an application-owned A2UI v1 action transport. */
export interface McpNativeDispatcher {
  dispatch(action: McpNativeAction): Promise<McpToolCallResult>;
}

/** @deprecated Use an application-owned A2UI v1 action transport. */
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

/** @deprecated Use an application-owned A2UI v1 action transport. */
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
      return { key: node.id, component: "Text", props: { children: node.text } };
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
        accessible: true,
        accessibilityRole: "text",
        allowFontScaling: true,
      });
    case "Button": {
      const title = expectStringProp(element, "title");
      const action = expectActionProp(element);
      return createElement(components.Button, {
        key: element.key,
        title,
        accessibilityLabel: title,
        accessible: true,
        accessibilityRole: "button",
        accessibilityState: { disabled: false },
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
        accessible: true,
        allowFontScaling: true,
        placeholder: label,
        ...(value === undefined ? {} : { value }),
        ...(binding === undefined || onBindingChange === undefined
          ? {}
          : { onChangeText: (nextValue: string) => onBindingChange(binding, nextValue) }),
      });
    }
    default:
      throw new TypeError(
        `Unsupported legacy component ${JSON.stringify(element.component)} at native element ${element.key}`,
      );
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
  const path = `native element ${element.key}.action`;
  try {
    return parseMcpNativeAction(element.props.action, path);
  } catch (error) {
    const message = error instanceof Error ? error.message : `Expected a tool action at ${path}`;
    throw new TypeError(message, { cause: error });
  }
}
