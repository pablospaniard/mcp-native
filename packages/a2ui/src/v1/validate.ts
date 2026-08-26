import type { JsonValue } from "@mcp-native/core";

import { A2uiParseError } from "../errors.js";
import basicCatalog from "./vendor/catalog.json" with { type: "json" };
import type { A2uiV1Component, A2uiV1SurfaceState } from "./types.js";

export const A2UI_V1_BASIC_CATALOG_ID =
  "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json" as const;

export const A2UI_V1_BASIC_COMPONENT_NAMES = Object.freeze(
  Object.keys(basicCatalog.components),
) as readonly string[];

export const A2UI_V1_BASIC_FUNCTION_NAMES = Object.freeze(
  Object.keys(basicCatalog.functions),
) as readonly string[];

export const A2UI_V1_SYSTEM_FUNCTION_NAMES = Object.freeze(["@index"]) as readonly string[];

const A2UI_V1_KNOWN_FUNCTION_NAMES = new Set([
  ...A2UI_V1_BASIC_FUNCTION_NAMES,
  ...A2UI_V1_SYSTEM_FUNCTION_NAMES,
]);

export interface A2uiV1SurfaceValidationPolicy {
  /** Host-bundled basic-catalog components that this surface may instantiate. */
  readonly allowedComponentNames: readonly string[];
  /** Agent event names the host is prepared to route after renderer adaptation. */
  readonly allowedEventNames?: readonly string[];
  /** Locally registered basic-catalog function names. Empty means deny all functions. */
  readonly allowedFunctionNames?: readonly string[];
}

export interface A2uiV1BasicCatalogPolicyOptions {
  readonly allowedComponentNames: readonly string[];
  readonly allowedEventNames?: readonly string[];
  readonly allowedFunctionNames?: readonly string[];
}

/** Creates an explicit host policy for the pinned basic catalog. */
export function createA2uiV1BasicCatalogPolicy(
  options: A2uiV1BasicCatalogPolicyOptions,
): A2uiV1SurfaceValidationPolicy {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new A2uiParseError("Expected A2UI basic catalog policy options to be an object");
  }
  return Object.freeze({
    allowedComponentNames: freezeStrings(options.allowedComponentNames, "allowedComponentNames"),
    allowedEventNames: freezeStrings(options.allowedEventNames ?? []),
    allowedFunctionNames: freezeStrings(options.allowedFunctionNames ?? []),
  });
}

/**
 * Validates a complete surface snapshot before it crosses into a renderer.
 * Store snapshots may remain incomplete while ordered lifecycle messages arrive.
 */
export function validateA2uiV1SurfaceState(
  surface: A2uiV1SurfaceState,
  policy: A2uiV1SurfaceValidationPolicy,
): A2uiV1SurfaceState {
  if (policy === null || typeof policy !== "object" || Array.isArray(policy)) {
    throw new A2uiParseError("Expected A2UI surface validation policy to be an object");
  }
  const allowedComponents = parseAllowedNames(
    policy.allowedComponentNames,
    "policy.allowedComponentNames",
    new Set(A2UI_V1_BASIC_COMPONENT_NAMES),
  );
  const allowedEvents = parseAllowedNames(
    policy.allowedEventNames ?? [],
    "policy.allowedEventNames",
  );
  const allowedFunctions = parseAllowedNames(
    policy.allowedFunctionNames ?? [],
    "policy.allowedFunctionNames",
    A2UI_V1_KNOWN_FUNCTION_NAMES,
  );

  validateCatalogId(surface.catalogId, "surface.catalogId");
  if (!surface.components.has("root")) {
    throw new A2uiParseError('A complete A2UI surface must define component "root"');
  }

  const edges = new Map<string, readonly ComponentEdge[]>();
  for (const [id, component] of surface.components) {
    if (component.id !== id) {
      throw new A2uiParseError(
        `A2UI component map key ${JSON.stringify(id)} does not match component id ${JSON.stringify(component.id)}`,
      );
    }
    if (!allowedComponents.has(component.component)) {
      throw new A2uiParseError(
        `A2UI component ${JSON.stringify(id)} uses host-denied component ${JSON.stringify(component.component)}`,
      );
    }
    validateCatalogId(component.catalogId, `components.${id}.catalogId`);
    edges.set(id, getComponentEdges(component));
  }

  rejectGraphCycles(edges);
  const contexts = collectComponentContexts(edges);
  for (const [parentId, references] of edges) {
    if (!contexts.has(parentId)) {
      continue;
    }
    for (const reference of references) {
      if (!surface.components.has(reference.id)) {
        throw new A2uiParseError(
          `A2UI component ${JSON.stringify(parentId)} references missing child ${JSON.stringify(reference.id)}`,
        );
      }
    }
  }
  validateComponentPlacement(surface.components, edges, contexts);

  const semanticsPolicy: SemanticsPolicy = {
    allowedEvents,
    allowedFunctions,
  };
  for (const [id, component] of surface.components) {
    const componentContexts = contexts.get(id);
    if (componentContexts === undefined) {
      continue;
    }
    validateComponentAction(component, id, semanticsPolicy);
    for (const context of componentContexts) {
      validateSemanticValue(component, `components.${id}`, context, semanticsPolicy);
    }
  }

  return surface;
}

type BindingContext = "surface" | "template";

interface ComponentEdge {
  readonly id: string;
  readonly template: boolean;
}

interface SemanticsPolicy {
  readonly allowedEvents: ReadonlySet<string>;
  readonly allowedFunctions: ReadonlySet<string>;
}

function getComponentEdges(component: A2uiV1Component): readonly ComponentEdge[] {
  switch (component.component) {
    case "Row":
    case "Column":
    case "List":
      return getChildListEdges(component.children);
    case "Card":
    case "Button":
      return [{ id: component.child as string, template: false }];
    case "Tabs":
      return (component.tabs as readonly { readonly child: string }[]).map(({ child }) => ({
        id: child,
        template: false,
      }));
    case "Modal":
      return [
        { id: component.trigger as string, template: false },
        { id: component.content as string, template: false },
      ];
    default:
      return [];
  }
}

function getChildListEdges(value: JsonValue | undefined): readonly ComponentEdge[] {
  if (Array.isArray(value)) {
    return value.map((id) => ({ id: id as string, template: false }));
  }
  const template = value as { readonly componentId: string };
  return [{ id: template.componentId, template: true }];
}

function rejectGraphCycles(edges: ReadonlyMap<string, readonly ComponentEdge[]>): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string): void => {
    if (visiting.has(id)) {
      throw new A2uiParseError(`A2UI component graph contains a cycle at ${JSON.stringify(id)}`);
    }
    if (visited.has(id)) {
      return;
    }
    visiting.add(id);
    for (const edge of edges.get(id) ?? []) {
      visit(edge.id);
    }
    visiting.delete(id);
    visited.add(id);
  };

  visit("root");
}

function collectComponentContexts(
  edges: ReadonlyMap<string, readonly ComponentEdge[]>,
): ReadonlyMap<string, ReadonlySet<BindingContext>> {
  const contexts = new Map<string, Set<BindingContext>>();
  const queue: { readonly id: string; readonly context: BindingContext }[] = [
    { id: "root", context: "surface" },
  ];

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    const existing = contexts.get(current.id) ?? new Set<BindingContext>();
    if (existing.has(current.context)) {
      continue;
    }
    existing.add(current.context);
    contexts.set(current.id, existing);
    for (const edge of edges.get(current.id) ?? []) {
      queue.push({
        id: edge.id,
        context: current.context === "template" || edge.template ? "template" : "surface",
      });
    }
  }
  return contexts;
}

function validateSemanticValue(
  value: JsonValue,
  path: string,
  context: BindingContext,
  policy: SemanticsPolicy,
): void {
  if (value === null || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    for (const [index, child] of value.entries()) {
      validateSemanticValue(child, `${path}[${index}]`, context, policy);
    }
    return;
  }

  const object = value as Record<string, JsonValue>;
  if (Object.hasOwn(object, "call")) {
    const functionName = object.call as string;
    if (Object.hasOwn(object, "catalogId")) {
      validateCatalogId(object.catalogId, `${path}.catalogId`);
    }
    if (!policy.allowedFunctions.has(functionName)) {
      throw new A2uiParseError(
        `A2UI function ${JSON.stringify(functionName)} at ${path}.call is not allowed by the host`,
      );
    }
    if (functionName === "formatString") {
      throw new A2uiParseError(
        `A2UI function "formatString" at ${path}.call is unsupported until every interpolation expression can be validated`,
      );
    }
    if (functionName === "@index" && context !== "template") {
      throw new A2uiParseError(
        `A2UI system function "@index" at ${path}.call is only valid inside a dynamic-list template`,
      );
    }
  }
  if (Object.hasOwn(object, "path")) {
    const bindingPath = object.path as string;
    const isTemplateList = Object.hasOwn(object, "componentId");
    validateBindingPath(bindingPath, path, isTemplateList ? "surface" : context);
  }

  for (const [key, child] of Object.entries(object)) {
    if (key === "metadata") {
      continue;
    }
    validateSemanticValue(child, `${path}.${key}`, context, policy);
  }
}

function validateComponentAction(
  component: A2uiV1Component,
  id: string,
  policy: SemanticsPolicy,
): void {
  if (!Object.hasOwn(component, "action")) {
    return;
  }
  const action = component.action as Record<string, JsonValue>;
  if (!Object.hasOwn(action, "event")) {
    return;
  }
  const event = action.event as Record<string, JsonValue>;
  const eventName = event.name as string;
  if (eventName.length === 0 || !policy.allowedEvents.has(eventName)) {
    throw new A2uiParseError(
      `A2UI event ${JSON.stringify(eventName)} at components.${id}.action.event.name is not allowed by the host`,
    );
  }
}

function validateBindingPath(path: string, location: string, context: BindingContext): void {
  if (path.length === 0) {
    return;
  }
  if (path.startsWith("/")) {
    for (const token of path.slice(1).split("/")) {
      validatePointerToken(token, path, location);
    }
    return;
  }
  if (context !== "template") {
    throw new A2uiParseError(
      `Relative A2UI binding ${JSON.stringify(path)} at ${location}.path is only valid inside a dynamic-list template`,
    );
  }
  for (const token of path.split("/")) {
    if (token.length === 0) {
      throw new A2uiParseError(
        `Invalid relative A2UI binding ${JSON.stringify(path)} at ${location}.path`,
      );
    }
    validatePointerToken(token, path, location);
  }
}

function validatePointerToken(token: string, path: string, location: string): void {
  for (let index = 0; index < token.length; index += 1) {
    if (token[index] !== "~") {
      continue;
    }
    const escaped = token[index + 1];
    if (escaped !== "0" && escaped !== "1") {
      throw new A2uiParseError(
        `Invalid JSON Pointer escape in A2UI binding ${JSON.stringify(path)} at ${location}.path`,
      );
    }
    index += 1;
  }
}

function validateCatalogId(value: JsonValue | undefined, path: string): void {
  if (value !== undefined && value !== A2UI_V1_BASIC_CATALOG_ID) {
    throw new A2uiParseError(
      `Unsupported A2UI catalog ${JSON.stringify(value)} at ${path}; only the pinned basic catalog is available`,
    );
  }
}

function parseAllowedNames(
  value: readonly string[],
  path: string,
  knownNames?: ReadonlySet<string>,
): ReadonlySet<string> {
  if (!Array.isArray(value)) {
    throw new A2uiParseError(`Expected an array at ${path}`);
  }
  const names = new Set<string>();
  for (const [index, name] of value.entries()) {
    if (typeof name !== "string" || name.length === 0) {
      throw new A2uiParseError(`Expected a non-empty string at ${path}[${index}]`);
    }
    if (knownNames !== undefined && !knownNames.has(name)) {
      throw new A2uiParseError(`Unknown pinned-catalog name ${JSON.stringify(name)} at ${path}`);
    }
    names.add(name);
  }
  return names;
}

function freezeStrings(value: readonly string[], path = "policy option"): readonly string[] {
  if (!Array.isArray(value)) {
    throw new A2uiParseError(`Expected an array at ${path}`);
  }
  for (const [index, name] of value.entries()) {
    if (typeof name !== "string" || name.length === 0) {
      throw new A2uiParseError(`Expected a non-empty string at ${path}[${index}]`);
    }
  }
  return Object.freeze([...value]);
}

function validateComponentPlacement(
  components: ReadonlyMap<string, A2uiV1Component>,
  edges: ReadonlyMap<string, readonly ComponentEdge[]>,
  contexts: ReadonlyMap<string, ReadonlySet<BindingContext>>,
): void {
  const parents = new Map<string, string[]>();
  for (const [parentId, children] of edges) {
    if (!contexts.has(parentId)) {
      continue;
    }
    for (const child of children) {
      const childParents = parents.get(child.id) ?? [];
      childParents.push(parentId);
      parents.set(child.id, childParents);
    }
  }
  for (const [id, component] of components) {
    if (!contexts.has(id) || !Object.hasOwn(component, "weight")) {
      continue;
    }
    const componentParents = parents.get(id) ?? [];
    if (
      componentParents.length === 0 ||
      componentParents.some((parentId) => {
        const parentName = components.get(parentId)?.component;
        return parentName !== "Row" && parentName !== "Column";
      })
    ) {
      throw new A2uiParseError(
        `A2UI component ${JSON.stringify(id)} may use weight only as a direct child of Row or Column`,
      );
    }
  }
}
