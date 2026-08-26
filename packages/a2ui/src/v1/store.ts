import { parseJsonObject, parseJsonValue } from "@mcp-native/core";
import type { JsonObject, JsonValue } from "@mcp-native/core";

import { A2uiParseError } from "../errors.js";
import { parseA2uiV1Envelope } from "./parse.js";
import type { A2uiV1Component, A2uiV1Envelope, A2uiV1SurfaceState } from "./types.js";

interface MutableSurface {
  surfaceId: string;
  catalogId?: string;
  sendDataModel: boolean;
  components: Map<string, A2uiV1Component>;
  dataModel: JsonObject;
  metadata?: JsonObject;
}

/**
 * Ordered in-memory store for official A2UI v1.0 lifecycle envelopes.
 * Batches applied through {@link A2uiSurfaceStore.applyAll} are atomic.
 */
export class A2uiSurfaceStore {
  readonly #surfaces = new Map<string, MutableSurface>();

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
    const validated = envelopes.map((envelope) => parseA2uiV1Envelope(envelope));
    const snapshot = cloneSurfaces(this.#surfaces);
    try {
      for (const envelope of validated) {
        this.#applyValidated(envelope);
      }
    } catch (error) {
      this.#surfaces.clear();
      for (const [surfaceId, surface] of snapshot) {
        this.#surfaces.set(surfaceId, surface);
      }
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

    const components = new Map<string, A2uiV1Component>();
    if (message.components !== undefined) {
      mergeComponents(components, message.components);
    }

    const dataModel =
      message.dataModel === undefined
        ? {}
        : parseJsonObject(message.dataModel, "createSurface.dataModel");

    const surface: MutableSurface = {
      surfaceId: message.surfaceId,
      sendDataModel: message.sendDataModel === true,
      components,
      dataModel,
    };
    if (message.catalogId !== undefined) {
      surface.catalogId = message.catalogId;
    }
    if (message.metadata !== undefined) {
      surface.metadata = parseJsonObject(message.metadata, "createSurface.metadata");
    }
    this.#surfaces.set(message.surfaceId, surface);
  }

  #updateComponents(message: {
    readonly surfaceId: string;
    readonly components: readonly A2uiV1Component[];
  }): void {
    const surface = this.#requireSurface(message.surfaceId, "updateComponents");
    mergeComponents(surface.components, message.components);
  }

  #updateDataModel(message: {
    readonly surfaceId: string;
    readonly path?: string;
    readonly value: JsonValue;
  }): void {
    const surface = this.#requireSurface(message.surfaceId, "updateDataModel");
    surface.dataModel = setJsonPointer(
      surface.dataModel,
      message.path,
      parseJsonValue(message.value, "updateDataModel.value"),
    );
  }

  #deleteSurface(surfaceId: string): void {
    if (!this.#surfaces.delete(surfaceId)) {
      throw new A2uiParseError(
        `Cannot delete A2UI surface ${JSON.stringify(surfaceId)}; it does not exist`,
      );
    }
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

function mergeComponents(
  target: Map<string, A2uiV1Component>,
  components: readonly A2uiV1Component[],
): void {
  for (const [index, component] of components.entries()) {
    const reconstructed = parseJsonObject(component, `components[${index}]`);
    if (typeof reconstructed.id !== "string" || reconstructed.id.length === 0) {
      throw new A2uiParseError("Expected a non-empty component id");
    }
    if (typeof reconstructed.component !== "string" || reconstructed.component.length === 0) {
      throw new A2uiParseError("Expected a non-empty component name");
    }
    target.set(reconstructed.id, reconstructed as A2uiV1Component);
  }
}

function freezeSurface(surface: MutableSurface): A2uiV1SurfaceState {
  return {
    surfaceId: surface.surfaceId,
    ...(surface.catalogId === undefined ? {} : { catalogId: surface.catalogId }),
    sendDataModel: surface.sendDataModel,
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
      components: cloneComponents(surface.components),
      dataModel: parseJsonObject(surface.dataModel, "surface.dataModel"),
      ...(surface.metadata === undefined
        ? {}
        : { metadata: parseJsonObject(surface.metadata, "surface.metadata") }),
    });
  }
  return clone;
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
