import { JSON_MAX_VALUES } from "@mcp-native/core";
import type { JsonValue } from "@mcp-native/core";

import { A2uiParseError } from "../errors.js";
import basicCatalog from "./vendor/catalog.json" with { type: "json" };
import { parseA2uiV1FormatString } from "./format-string.js";
import { parseA2uiV1Envelope } from "./parse.js";
import { formatAjvErrors, getA2uiV1FunctionCallValidator } from "./schemas.js";
import { A2UI_V1_MAX_COMPONENTS, A2UI_V1_MAX_SOURCE_LENGTH } from "./types.js";
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

  const validatedSurface = reconstructSurfaceSnapshot(surface);
  validateCatalogId(validatedSurface.catalogId, "surface.catalogId");
  if (!validatedSurface.components.has("root")) {
    throw new A2uiParseError('A complete A2UI surface must define component "root"');
  }

  const edges = new Map<string, readonly ComponentEdge[]>();
  for (const [id, component] of validatedSurface.components) {
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
      if (!validatedSurface.components.has(reference.id)) {
        throw new A2uiParseError(
          `A2UI component ${JSON.stringify(parentId)} references missing child ${JSON.stringify(reference.id)}`,
        );
      }
    }
  }
  validateComponentPlacement(validatedSurface.components, edges, contexts);

  const semanticsPolicy: SemanticsPolicy = {
    allowedEvents,
    allowedFunctions,
    formatStringExpressionCount: 0,
    formatStringSourceLength: 0,
  };
  for (const [id, component] of validatedSurface.components) {
    const componentContexts = contexts.get(id);
    if (componentContexts === undefined) {
      continue;
    }
    for (const context of componentContexts) {
      validateComponentAction(component, id, context, semanticsPolicy);
      validateSemanticValue(component, `components.${id}`, context, semanticsPolicy);
    }
  }

  return validatedSurface;
}

type BindingContext = "surface" | "template";

interface ComponentEdge {
  readonly id: string;
  readonly template: boolean;
}

interface SemanticsPolicy {
  readonly allowedEvents: ReadonlySet<string>;
  readonly allowedFunctions: ReadonlySet<string>;
  formatStringExpressionCount: number;
  formatStringSourceLength: number;
}

function reconstructSurfaceSnapshot(input: unknown): A2uiV1SurfaceState {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new A2uiParseError("Expected an A2UI surface snapshot object");
  }
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new A2uiParseError("Expected a plain A2UI surface snapshot object");
  }
  const source = input as Record<string, unknown>;
  const allowedKeys = new Set([
    "catalogId",
    "components",
    "dataModel",
    "dataModelRevision",
    "metadata",
    "sendDataModel",
    "surfaceId",
  ]);
  for (const key of Object.keys(source)) {
    if (!allowedKeys.has(key)) {
      throw new A2uiParseError(`Unexpected A2UI surface snapshot field ${JSON.stringify(key)}`);
    }
  }
  if (!(source.components instanceof Map)) {
    throw new A2uiParseError("Expected a Map at surface.components");
  }
  if (source.components.size > A2UI_V1_MAX_COMPONENTS) {
    throw new A2uiParseError(
      `A2UI surface exceeds maximum of ${A2UI_V1_MAX_COMPONENTS} components`,
    );
  }
  const dataModelRevision = source.dataModelRevision;
  if (dataModelRevision !== undefined) {
    if (
      typeof dataModelRevision !== "number" ||
      !Number.isSafeInteger(dataModelRevision) ||
      dataModelRevision < 0
    ) {
      throw new A2uiParseError("Expected a non-negative safe integer at surface.dataModelRevision");
    }
  }

  const sourceEntries = [...source.components.entries()] as readonly (readonly [
    unknown,
    unknown,
  ])[];
  const createSurface: Record<string, unknown> = {
    surfaceId: source.surfaceId,
    sendDataModel: source.sendDataModel,
    dataModel: source.dataModel,
  };
  if (sourceEntries.length > 0) {
    createSurface.components = sourceEntries.map((entry) => entry[1]);
  }
  if (source.catalogId !== undefined) {
    createSurface.catalogId = source.catalogId;
  }
  if (source.metadata !== undefined) {
    createSurface.metadata = source.metadata;
  }
  const envelope = parseA2uiV1Envelope({ version: "v1.0", createSurface });
  if (!("createSurface" in envelope)) {
    throw new A2uiParseError("Expected a validated createSurface snapshot");
  }

  const components = new Map<string, A2uiV1Component>();
  for (const [index, component] of (envelope.createSurface.components ?? []).entries()) {
    const sourceKey = sourceEntries[index]?.[0];
    if (sourceKey !== component.id) {
      throw new A2uiParseError(
        `A2UI component map key ${JSON.stringify(sourceKey)} does not match component id ${JSON.stringify(component.id)}`,
      );
    }
    if (components.has(component.id)) {
      throw new A2uiParseError(
        `Duplicate A2UI component id ${JSON.stringify(component.id)} in surface snapshot`,
      );
    }
    components.set(component.id, component);
  }

  return {
    surfaceId: envelope.createSurface.surfaceId,
    ...(envelope.createSurface.catalogId === undefined
      ? {}
      : { catalogId: envelope.createSurface.catalogId }),
    sendDataModel: envelope.createSurface.sendDataModel === true,
    ...(dataModelRevision === undefined ? {} : { dataModelRevision }),
    components,
    dataModel: envelope.createSurface.dataModel ?? {},
    ...(envelope.createSurface.metadata === undefined
      ? {}
      : { metadata: envelope.createSurface.metadata }),
  };
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
    validateFunctionCall(object, path, context, policy);
    return;
  }
  if (Object.hasOwn(object, "path")) {
    const bindingPath = object.path as string;
    const isTemplateList = Object.hasOwn(object, "componentId");
    validateBindingPath(bindingPath, path, isTemplateList ? "surface" : context);
    return;
  }

  for (const [key, child] of Object.entries(object)) {
    if (key === "action" || key === "metadata") {
      continue;
    }
    validateSemanticValue(child, `${path}.${key}`, context, policy);
  }
}

function validateComponentAction(
  component: A2uiV1Component,
  id: string,
  context: BindingContext,
  policy: SemanticsPolicy,
): void {
  if (!Object.hasOwn(component, "action")) {
    return;
  }
  const action = component.action as Record<string, JsonValue>;
  if (!Object.hasOwn(action, "event")) {
    if (Object.hasOwn(action, "functionCall")) {
      validateDynamicValue(
        action.functionCall!,
        `components.${id}.action.functionCall`,
        context,
        policy,
      );
    }
    return;
  }
  const event = action.event as Record<string, JsonValue>;
  const eventName = event.name as string;
  if (eventName.length === 0 || !policy.allowedEvents.has(eventName)) {
    throw new A2uiParseError(
      `A2UI event ${JSON.stringify(eventName)} at components.${id}.action.event.name is not allowed by the host`,
    );
  }
  if (Object.hasOwn(event, "userMessage")) {
    validateDynamicValue(
      event.userMessage!,
      `components.${id}.action.event.userMessage`,
      context,
      policy,
    );
  }
  if (Object.hasOwn(event, "context")) {
    const eventContext = event.context as Record<string, JsonValue>;
    for (const [name, value] of Object.entries(eventContext)) {
      validateDynamicValue(value, `components.${id}.action.event.context.${name}`, context, policy);
    }
  }
}

function validateDynamicValue(
  value: JsonValue,
  path: string,
  context: BindingContext,
  policy: SemanticsPolicy,
): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return;
  }
  const object = value as Record<string, JsonValue>;
  if (Object.hasOwn(object, "call")) {
    validateFunctionCall(object, path, context, policy);
    return;
  }
  if (Object.hasOwn(object, "path")) {
    validateBindingPath(object.path as string, path, context);
  }
}

function validateFunctionCall(
  object: Record<string, JsonValue>,
  path: string,
  context: BindingContext,
  policy: SemanticsPolicy,
): void {
  const functionName = object.call as string;
  if (Object.hasOwn(object, "catalogId")) {
    validateCatalogId(object.catalogId, `${path}.catalogId`);
  }
  if (!policy.allowedFunctions.has(functionName)) {
    throw new A2uiParseError(
      `A2UI function ${JSON.stringify(functionName)} at ${path}.call is not allowed by the host`,
    );
  }
  if (functionName === "@index" && context !== "template") {
    throw new A2uiParseError(
      `A2UI system function "@index" at ${path}.call is only valid inside a dynamic-list template`,
    );
  }
  if (functionName === "formatString") {
    validateFormatString(object, path, context, policy);
  }
  if (Object.hasOwn(object, "args")) {
    const args = object.args as Record<string, JsonValue>;
    for (const [name, value] of Object.entries(args)) {
      validateDynamicValue(value, `${path}.args.${name}`, context, policy);
    }
  }
}

function validateFormatString(
  object: Record<string, JsonValue>,
  path: string,
  context: BindingContext,
  policy: SemanticsPolicy,
): void {
  const args = object.args as Record<string, JsonValue>;
  const source = args.value;
  if (typeof source !== "string") {
    throw new A2uiParseError(
      `A2UI formatString at ${path}.args.value requires a literal string so every interpolation can be validated`,
    );
  }
  policy.formatStringSourceLength += source.length;
  if (policy.formatStringSourceLength > A2UI_V1_MAX_SOURCE_LENGTH) {
    throw new A2uiParseError(
      `A2UI formatString source exceeds cumulative maximum length of ${A2UI_V1_MAX_SOURCE_LENGTH}`,
    );
  }

  const parsed = parseA2uiV1FormatString(source, `${path}.args.value`);
  policy.formatStringExpressionCount += parsed.expressionCount;
  if (policy.formatStringExpressionCount > JSON_MAX_VALUES) {
    throw new A2uiParseError(
      `A2UI surface exceeds maximum of ${JSON_MAX_VALUES} formatString expressions`,
    );
  }
  for (const [index, expression] of parsed.expressions.entries()) {
    const expressionPath = `${path}.args.value.interpolations[${index}]`;
    if (
      expression !== null &&
      typeof expression === "object" &&
      !Array.isArray(expression) &&
      Object.hasOwn(expression, "call")
    ) {
      const validate = getA2uiV1FunctionCallValidator();
      if (!validate(expression)) {
        throw new A2uiParseError(
          `A2UI formatString function schema validation failed at ${expressionPath}: ${formatAjvErrors(validate)}`,
        );
      }
    }
    validateDynamicValue(expression, expressionPath, context, policy);
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
