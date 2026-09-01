import { parseJsonObject, parseJsonValue } from "@mcp-native/core";
import type { JsonObject, JsonValue } from "@mcp-native/core";

import { A2uiParseError } from "../errors.js";
import { parseA2uiV1Envelope } from "./parse.js";
import {
  A2UI_V1_MAX_COMPONENTS,
  A2UI_V1_MAX_ENVELOPES,
  A2UI_V1_MAX_STORE_STRING_CODE_UNITS,
  A2UI_V1_MAX_STORE_VALUES,
  A2UI_V1_MAX_SURFACES,
} from "./types.js";
import type { A2uiV1Component, A2uiV1Envelope, A2uiV1SurfaceState } from "./types.js";
import { validateA2uiV1SurfaceState } from "./validate.js";
import type { A2uiV1SurfaceValidationPolicy } from "./validate.js";

interface MutableSurface {
  surfaceId: string;
  catalogId?: string;
  sendDataModel: boolean;
  dataModelRevision: number;
  components: Map<string, A2uiV1Component>;
  componentBudgets: Map<string, JsonBudget>;
  dataModel: JsonObject;
  dataModelBudget: JsonBudget;
  metadata?: JsonObject;
  metadataBudget: JsonBudget;
  retainedBudget: JsonBudget;
}

interface JsonBudget {
  readonly values: number;
  readonly stringCodeUnits: number;
}

/**
 * Ordered in-memory store for official A2UI v1.0 lifecycle envelopes.
 * Batches applied through {@link A2uiSurfaceStore.applyAll} are atomic.
 */
export class A2uiSurfaceStore {
  readonly #surfaces = new Map<string, MutableSurface>();
  #retainedValues = 0;
  #retainedStringCodeUnits = 0;

  get size(): number {
    return this.#surfaces.size;
  }

  has(surfaceId: string): boolean {
    return this.#surfaces.has(surfaceId);
  }

  get(surfaceId: string): A2uiV1SurfaceState | undefined {
    const surface = this.#surfaces.get(surfaceId);
    return surface === undefined ? undefined : freezeSurface(surface);
  }

  /** Returns a complete renderer-ready snapshot or fails closed. */
  getValidated(
    surfaceId: string,
    policy: A2uiV1SurfaceValidationPolicy,
  ): A2uiV1SurfaceState | undefined {
    const surface = this.get(surfaceId);
    return surface === undefined ? undefined : validateA2uiV1SurfaceState(surface, policy);
  }

  list(): readonly A2uiV1SurfaceState[] {
    return [...this.#surfaces.values()].map(freezeSurface);
  }

  apply(envelope: unknown): void {
    this.#applyValidated(parseA2uiV1Envelope(envelope));
  }

  #applyValidated(envelope: A2uiV1Envelope): void {
    if ("createSurface" in envelope) {
      this.#createSurface(envelope.createSurface);
      return;
    }
    if ("updateComponents" in envelope) {
      this.#updateComponents(envelope.updateComponents);
      return;
    }
    if ("updateDataModel" in envelope) {
      this.#updateDataModel(envelope.updateDataModel);
      return;
    }
    if ("deleteSurface" in envelope) {
      this.#deleteSurface(envelope.deleteSurface.surfaceId);
      return;
    }
    throw new A2uiParseError("Unsupported A2UI v1 envelope for the surface store");
  }

  /**
   * Applies every envelope in order. On failure the store is left unchanged.
   */
  applyAll(envelopes: readonly unknown[]): void {
    if (!Array.isArray(envelopes)) {
      throw new A2uiParseError("Expected an array of A2UI v1 envelopes");
    }
    if (envelopes.length > A2UI_V1_MAX_ENVELOPES) {
      throw new A2uiParseError(
        `A2UI v1 batch exceeds maximum of ${A2UI_V1_MAX_ENVELOPES} envelopes`,
      );
    }
    const snapshot = cloneSurfaces(this.#surfaces);
    const retainedValues = this.#retainedValues;
    const retainedStringCodeUnits = this.#retainedStringCodeUnits;
    let batchBudget = EMPTY_BUDGET;
    try {
      for (const input of envelopes) {
        const envelope = parseA2uiV1Envelope(input);
        batchBudget = addBudgets(batchBudget, measureJson(envelope));
        assertBatchBudget(batchBudget);
        this.#applyValidated(envelope);
      }
    } catch (error) {
      this.#surfaces.clear();
      for (const [surfaceId, surface] of snapshot) {
        this.#surfaces.set(surfaceId, surface);
      }
      this.#retainedValues = retainedValues;
      this.#retainedStringCodeUnits = retainedStringCodeUnits;
      throw error;
    }
  }

  #createSurface(message: {
    readonly surfaceId: string;
    readonly catalogId?: string;
    readonly sendDataModel?: boolean;
    readonly components?: readonly A2uiV1Component[];
    readonly dataModel?: JsonObject;
    readonly metadata?: JsonObject;
  }): void {
    if (this.#surfaces.has(message.surfaceId)) {
      throw new A2uiParseError(
        `Cannot create A2UI surface ${JSON.stringify(message.surfaceId)}; it already exists`,
      );
    }
    if (this.#surfaces.size >= A2UI_V1_MAX_SURFACES) {
      throw new A2uiParseError(`A2UI store exceeds maximum of ${A2UI_V1_MAX_SURFACES} surfaces`);
    }

    const componentUpdate = parseComponentUpdates(new Map(), message.components ?? []);
    const components = componentUpdate.components;
    const componentBudgets = componentUpdate.budgets;

    const dataModel =
      message.dataModel === undefined
        ? {}
        : parseJsonObject(message.dataModel, "createSurface.dataModel");
    const dataModelBudget = measureJson(dataModel);
    let metadata: JsonObject | undefined;
    let metadataBudget = EMPTY_BUDGET;
    if (message.metadata !== undefined) {
      metadata = parseJsonObject(message.metadata, "createSurface.metadata");
      metadataBudget = measureJson(metadata);
    }
    const baseBudget = measureJson({
      surfaceId: message.surfaceId,
      ...(message.catalogId === undefined ? {} : { catalogId: message.catalogId }),
      sendDataModel: message.sendDataModel === true,
      dataModelRevision: 0,
    });
    const retainedBudget = addBudgets(
      baseBudget,
      sumBudgets(componentBudgets.values()),
      dataModelBudget,
      metadataBudget,
    );
    this.#assertStoreBudget(retainedBudget);

    const surface: MutableSurface = {
      surfaceId: message.surfaceId,
      sendDataModel: message.sendDataModel === true,
      dataModelRevision: 0,
      components,
      componentBudgets,
      dataModel,
      dataModelBudget,
      metadataBudget,
      retainedBudget,
    };
    if (message.catalogId !== undefined) {
      surface.catalogId = message.catalogId;
    }
    if (metadata !== undefined) {
      surface.metadata = metadata;
    }
    this.#surfaces.set(message.surfaceId, surface);
    this.#commitBudgetDelta(retainedBudget);
  }

  #updateComponents(message: {
    readonly surfaceId: string;
    readonly components: readonly A2uiV1Component[];
  }): void {
    const surface = this.#requireSurface(message.surfaceId, "updateComponents");
    const update = parseComponentUpdates(surface.components, message.components);
    let delta = EMPTY_BUDGET;
    for (const [id, budget] of update.budgets) {
      delta = addBudgets(delta, subtractBudgets(budget, surface.componentBudgets.get(id)));
    }
    this.#assertStoreBudget(delta);
    for (const [id, component] of update.components) {
      surface.components.set(id, component);
      surface.componentBudgets.set(id, update.budgets.get(id)!);
    }
    surface.retainedBudget = addBudgets(surface.retainedBudget, delta);
    this.#commitBudgetDelta(delta);
  }

  #updateDataModel(message: {
    readonly surfaceId: string;
    readonly path?: string;
    readonly value: JsonValue;
  }): void {
    const surface = this.#requireSurface(message.surfaceId, "updateDataModel");
    const updatedDataModel = setJsonPointer(
      surface.dataModel,
      message.path,
      parseJsonValue(message.value, "updateDataModel.value"),
    );
    try {
      const dataModel = parseJsonObject(updatedDataModel, "updateDataModel.result");
      const dataModelBudget = measureJson(dataModel);
      const delta = subtractBudgets(dataModelBudget, surface.dataModelBudget);
      this.#assertStoreBudget(delta);
      surface.dataModel = dataModel;
      surface.dataModelBudget = dataModelBudget;
      surface.retainedBudget = addBudgets(surface.retainedBudget, delta);
      this.#commitBudgetDelta(delta);
      surface.dataModelRevision += 1;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Invalid merged data model";
      throw new A2uiParseError(`Updated A2UI data model is invalid: ${errorMessage}`, {
        cause: error,
      });
    }
  }

  #deleteSurface(surfaceId: string): void {
    const surface = this.#surfaces.get(surfaceId);
    if (surface === undefined) {
      throw new A2uiParseError(
        `Cannot delete A2UI surface ${JSON.stringify(surfaceId)}; it does not exist`,
      );
    }
    this.#surfaces.delete(surfaceId);
    this.#commitBudgetDelta(negateBudget(surface.retainedBudget));
  }

  #assertStoreBudget(delta: JsonBudget): void {
    const values = this.#retainedValues + delta.values;
    const stringCodeUnits = this.#retainedStringCodeUnits + delta.stringCodeUnits;
    if (values > A2UI_V1_MAX_STORE_VALUES) {
      throw new A2uiParseError(
        `A2UI store exceeds maximum of ${A2UI_V1_MAX_STORE_VALUES} retained JSON values`,
      );
    }
    if (stringCodeUnits > A2UI_V1_MAX_STORE_STRING_CODE_UNITS) {
      throw new A2uiParseError(
        `A2UI store exceeds maximum of ${A2UI_V1_MAX_STORE_STRING_CODE_UNITS} retained string code units`,
      );
    }
  }

  #commitBudgetDelta(delta: JsonBudget): void {
    this.#retainedValues += delta.values;
    this.#retainedStringCodeUnits += delta.stringCodeUnits;
  }

  #requireSurface(surfaceId: string, operation: string): MutableSurface {
    const surface = this.#surfaces.get(surfaceId);
    if (surface === undefined) {
      throw new A2uiParseError(
        `Cannot ${operation} A2UI surface ${JSON.stringify(surfaceId)}; it does not exist`,
      );
    }
    return surface;
  }
}

function parseComponentUpdates(
  current: ReadonlyMap<string, A2uiV1Component>,
  components: readonly A2uiV1Component[],
): { components: Map<string, A2uiV1Component>; budgets: Map<string, JsonBudget> } {
  const seen = new Set<string>();
  const updates = new Map<string, A2uiV1Component>();
  const budgets = new Map<string, JsonBudget>();
  let added = 0;
  for (const [index, component] of components.entries()) {
    const reconstructed = parseJsonObject(component, `components[${index}]`);
    if (typeof reconstructed.id !== "string" || reconstructed.id.length === 0) {
      throw new A2uiParseError("Expected a non-empty component id");
    }
    if (typeof reconstructed.component !== "string" || reconstructed.component.length === 0) {
      throw new A2uiParseError("Expected a non-empty component name");
    }
    if (seen.has(reconstructed.id)) {
      throw new A2uiParseError(
        `Duplicate A2UI component id ${JSON.stringify(reconstructed.id)} in one update`,
      );
    }
    seen.add(reconstructed.id);
    if (!current.has(reconstructed.id)) added += 1;
    updates.set(reconstructed.id, reconstructed as A2uiV1Component);
    budgets.set(reconstructed.id, measureJson(reconstructed));
    if (current.size + added > A2UI_V1_MAX_COMPONENTS) {
      throw new A2uiParseError(
        `A2UI surface exceeds maximum of ${A2UI_V1_MAX_COMPONENTS} components`,
      );
    }
  }
  return { components: updates, budgets };
}

function freezeSurface(surface: MutableSurface): A2uiV1SurfaceState {
  return {
    surfaceId: surface.surfaceId,
    ...(surface.catalogId === undefined ? {} : { catalogId: surface.catalogId }),
    sendDataModel: surface.sendDataModel,
    dataModelRevision: surface.dataModelRevision,
    components: cloneComponents(surface.components),
    dataModel: parseJsonObject(surface.dataModel, "surface.dataModel"),
    ...(surface.metadata === undefined
      ? {}
      : { metadata: parseJsonObject(surface.metadata, "surface.metadata") }),
  };
}

function cloneSurfaces(surfaces: ReadonlyMap<string, MutableSurface>): Map<string, MutableSurface> {
  const clone = new Map<string, MutableSurface>();
  for (const [surfaceId, surface] of surfaces) {
    clone.set(surfaceId, {
      surfaceId: surface.surfaceId,
      ...(surface.catalogId === undefined ? {} : { catalogId: surface.catalogId }),
      sendDataModel: surface.sendDataModel,
      dataModelRevision: surface.dataModelRevision,
      components: new Map(surface.components),
      componentBudgets: new Map(surface.componentBudgets),
      dataModel: surface.dataModel,
      dataModelBudget: surface.dataModelBudget,
      ...(surface.metadata === undefined ? {} : { metadata: surface.metadata }),
      metadataBudget: surface.metadataBudget,
      retainedBudget: surface.retainedBudget,
    });
  }
  return clone;
}

const EMPTY_BUDGET: JsonBudget = Object.freeze({ values: 0, stringCodeUnits: 0 });

function assertBatchBudget(budget: JsonBudget): void {
  if (budget.values > A2UI_V1_MAX_STORE_VALUES) {
    throw new A2uiParseError(
      `A2UI v1 batch exceeds maximum of ${A2UI_V1_MAX_STORE_VALUES} cumulative JSON values`,
    );
  }
  if (budget.stringCodeUnits > A2UI_V1_MAX_STORE_STRING_CODE_UNITS) {
    throw new A2uiParseError(
      `A2UI v1 batch exceeds maximum of ${A2UI_V1_MAX_STORE_STRING_CODE_UNITS} cumulative string code units`,
    );
  }
}

function measureJson(value: JsonValue): JsonBudget {
  let values = 0;
  let stringCodeUnits = 0;
  const pending: JsonValue[] = [value];
  while (pending.length > 0) {
    const current = pending.pop()!;
    values += 1;
    if (typeof current === "string") {
      stringCodeUnits += current.length;
    } else if (Array.isArray(current)) {
      pending.push(...current);
    } else if (current !== null && typeof current === "object") {
      for (const [key, child] of Object.entries(current)) {
        stringCodeUnits += key.length;
        pending.push(child);
      }
    }
  }
  return { values, stringCodeUnits };
}

function addBudgets(...budgets: readonly JsonBudget[]): JsonBudget {
  return budgets.reduce(
    (total, budget) => ({
      values: total.values + budget.values,
      stringCodeUnits: total.stringCodeUnits + budget.stringCodeUnits,
    }),
    EMPTY_BUDGET,
  );
}

function sumBudgets(budgets: Iterable<JsonBudget>): JsonBudget {
  return addBudgets(...budgets);
}

function subtractBudgets(budget: JsonBudget, previous: JsonBudget | undefined): JsonBudget {
  return {
    values: budget.values - (previous?.values ?? 0),
    stringCodeUnits: budget.stringCodeUnits - (previous?.stringCodeUnits ?? 0),
  };
}

function negateBudget(budget: JsonBudget): JsonBudget {
  return { values: -budget.values, stringCodeUnits: -budget.stringCodeUnits };
}

function cloneComponents(
  components: ReadonlyMap<string, A2uiV1Component>,
): Map<string, A2uiV1Component> {
  const clone = new Map<string, A2uiV1Component>();
  for (const [id, component] of components) {
    clone.set(id, parseJsonObject(component, `components.${id}`) as A2uiV1Component);
  }
  return clone;
}

function setJsonPointer(
  document: JsonObject,
  path: string | undefined,
  value: JsonValue,
): JsonObject {
  if (path === undefined || path === "" || path === "/") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new A2uiParseError("Root data model replacement must be a JSON object");
    }
    return parseJsonObject(value, "dataModel");
  }
  if (!path.startsWith("/")) {
    throw new A2uiParseError(`Invalid JSON Pointer ${JSON.stringify(path)}`);
  }

  const tokens = path
    .slice(1)
    .split("/")
    .map((token) => decodeJsonPointerToken(token, path));

  const root = parseJsonObject(document, "dataModel") as Record<string, JsonValue>;
  let cursor: JsonValue = root;
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index]!;
    if (Array.isArray(cursor)) {
      const arrayIndex = parseArrayIndex(token, path);
      if (arrayIndex > cursor.length) {
        throw new A2uiParseError(`JSON Pointer path missing at ${JSON.stringify(path)}`);
      }
      if (arrayIndex === cursor.length) {
        cursor.push({});
      }
      const next: JsonValue | undefined = cursor[arrayIndex];
      if (next === null || typeof next !== "object") {
        throw new A2uiParseError(`JSON Pointer path is not a container at ${JSON.stringify(path)}`);
      }
      cursor = next;
      continue;
    }
    if (cursor === null || typeof cursor !== "object") {
      throw new A2uiParseError(`JSON Pointer path missing at ${JSON.stringify(path)}`);
    }
    const object = cursor as Record<string, JsonValue>;
    if (!Object.hasOwn(object, token)) {
      defineJsonProperty(object, token, {});
    }
    const next: JsonValue | undefined = object[token];
    if (next === null || typeof next !== "object") {
      throw new A2uiParseError(`JSON Pointer path is not a container at ${JSON.stringify(path)}`);
    }
    cursor = next;
  }

  const last = tokens[tokens.length - 1]!;
  if (Array.isArray(cursor)) {
    const arrayIndex = parseArrayIndex(last, path);
    if (value === null) {
      if (arrayIndex >= cursor.length) {
        throw new A2uiParseError(`JSON Pointer path missing at ${JSON.stringify(path)}`);
      }
      cursor.splice(arrayIndex, 1);
    } else if (arrayIndex === cursor.length) {
      cursor.push(value);
    } else if (arrayIndex < cursor.length) {
      cursor[arrayIndex] = value;
    } else {
      throw new A2uiParseError(`JSON Pointer path missing at ${JSON.stringify(path)}`);
    }
    return root;
  }

  if (cursor === null || typeof cursor !== "object") {
    throw new A2uiParseError(`JSON Pointer path missing at ${JSON.stringify(path)}`);
  }
  const object = cursor as Record<string, JsonValue>;
  if (value === null) {
    if (!Object.hasOwn(object, last)) {
      throw new A2uiParseError(`JSON Pointer path missing at ${JSON.stringify(path)}`);
    }
    delete object[last];
  } else {
    defineJsonProperty(object, last, value);
  }
  return root;
}

function parseArrayIndex(token: string, path: string): number {
  if (!/^(0|[1-9][0-9]*)$/.test(token)) {
    throw new A2uiParseError(`Invalid JSON Pointer array index in ${JSON.stringify(path)}`);
  }
  const index = Number(token);
  if (!Number.isSafeInteger(index)) {
    throw new A2uiParseError(`Invalid JSON Pointer array index in ${JSON.stringify(path)}`);
  }
  return index;
}

function decodeJsonPointerToken(token: string, path: string): string {
  for (let index = 0; index < token.length; index += 1) {
    if (token[index] !== "~") {
      continue;
    }
    const escaped = token[index + 1];
    if (escaped !== "0" && escaped !== "1") {
      throw new A2uiParseError(`Invalid JSON Pointer escape in ${JSON.stringify(path)}`);
    }
    index += 1;
  }
  return token.replaceAll("~1", "/").replaceAll("~0", "~");
}

function defineJsonProperty(
  object: Record<string, JsonValue>,
  key: string,
  value: JsonValue,
): void {
  Object.defineProperty(object, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}
