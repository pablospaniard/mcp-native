import { JSON_MAX_STRING_LENGTH, JSON_MAX_TOTAL_STRING_CODE_UNITS } from "@mcp-native/core";

import { A2uiParseError } from "../errors.js";

/** Maximum surface identities retained by one strict renderer-lifetime registry. */
export const A2UI_V1_MAX_RETAINED_SURFACE_IDS = 4_096;
/** Maximum cumulative UTF-16 code units retained by one strict surface-ID registry. */
export const A2UI_V1_MAX_RETAINED_SURFACE_ID_CODE_UNITS = JSON_MAX_TOTAL_STRING_CODE_UNITS;

export interface A2uiSurfaceIdRegistryOptions {
  readonly maximumRetainedIds?: number;
  readonly maximumIdCodeUnits?: number;
  readonly maximumRetainedCodeUnits?: number;
}

/**
 * Opaque, host-owned renderer-lifetime identity registry. Pass the same registry to replacement
 * stores that belong to one rendering context; create a new registry only after explicit teardown.
 */
export interface A2uiSurfaceIdRegistry {
  readonly retainedCount: number;
  readonly retainedCodeUnits: number;
}

interface RegistryState {
  readonly ids: Set<string>;
  readonly maximumRetainedIds: number;
  readonly maximumIdCodeUnits: number;
  readonly maximumRetainedCodeUnits: number;
  retainedCodeUnits: number;
}

export interface A2uiSurfaceIdRegistrySnapshot {
  readonly ids: ReadonlySet<string>;
  readonly retainedCodeUnits: number;
}

const states = new WeakMap<object, RegistryState>();

export function createA2uiSurfaceIdRegistry(
  options: A2uiSurfaceIdRegistryOptions = {},
): A2uiSurfaceIdRegistry {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new A2uiParseError("Expected A2UI surface-ID registry options to be an object");
  }
  rejectUnknownKeys(options, [
    "maximumRetainedIds",
    "maximumIdCodeUnits",
    "maximumRetainedCodeUnits",
  ]);
  const maximumRetainedIds = parseLimit(
    options.maximumRetainedIds,
    A2UI_V1_MAX_RETAINED_SURFACE_IDS,
    A2UI_V1_MAX_RETAINED_SURFACE_IDS,
    "maximumRetainedIds",
  );
  const maximumIdCodeUnits = parseLimit(
    options.maximumIdCodeUnits,
    JSON_MAX_STRING_LENGTH,
    JSON_MAX_STRING_LENGTH,
    "maximumIdCodeUnits",
  );
  const maximumRetainedCodeUnits = parseLimit(
    options.maximumRetainedCodeUnits,
    A2UI_V1_MAX_RETAINED_SURFACE_ID_CODE_UNITS,
    A2UI_V1_MAX_RETAINED_SURFACE_ID_CODE_UNITS,
    "maximumRetainedCodeUnits",
  );
  const registry = {
    get retainedCount() {
      return states.get(registry)!.ids.size;
    },
    get retainedCodeUnits() {
      return states.get(registry)!.retainedCodeUnits;
    },
  };
  states.set(registry, {
    ids: new Set(),
    maximumRetainedIds,
    maximumIdCodeUnits,
    maximumRetainedCodeUnits,
    retainedCodeUnits: 0,
  });
  return Object.freeze(registry);
}

export function isA2uiSurfaceIdRegistry(value: unknown): value is A2uiSurfaceIdRegistry {
  return value !== null && typeof value === "object" && states.has(value);
}

export function claimA2uiSurfaceId(registry: A2uiSurfaceIdRegistry, surfaceId: string): void {
  const state = requireState(registry);
  if (state.ids.has(surfaceId)) {
    throw new A2uiParseError(
      `Cannot create A2UI surface ${JSON.stringify(surfaceId)}; its ID was already used in this renderer lifetime`,
    );
  }
  if (surfaceId.length > state.maximumIdCodeUnits) {
    throw new A2uiParseError(
      `A2UI surface ID exceeds maximum of ${state.maximumIdCodeUnits} UTF-16 code units`,
    );
  }
  if (state.ids.size >= state.maximumRetainedIds) {
    throw new A2uiParseError(
      `A2UI surface-ID registry exceeds maximum of ${state.maximumRetainedIds} retained IDs`,
    );
  }
  if (state.retainedCodeUnits + surfaceId.length > state.maximumRetainedCodeUnits) {
    throw new A2uiParseError(
      `A2UI surface-ID registry exceeds maximum of ${state.maximumRetainedCodeUnits} retained UTF-16 code units`,
    );
  }
  state.ids.add(surfaceId);
  state.retainedCodeUnits += surfaceId.length;
}

export function snapshotA2uiSurfaceIdRegistry(
  registry: A2uiSurfaceIdRegistry,
): A2uiSurfaceIdRegistrySnapshot {
  const state = requireState(registry);
  return { ids: new Set(state.ids), retainedCodeUnits: state.retainedCodeUnits };
}

export function restoreA2uiSurfaceIdRegistry(
  registry: A2uiSurfaceIdRegistry,
  snapshot: A2uiSurfaceIdRegistrySnapshot,
): void {
  const state = requireState(registry);
  state.ids.clear();
  for (const id of snapshot.ids) state.ids.add(id);
  state.retainedCodeUnits = snapshot.retainedCodeUnits;
}

function requireState(registry: A2uiSurfaceIdRegistry): RegistryState {
  const state =
    registry !== null && typeof registry === "object" ? states.get(registry) : undefined;
  if (state === undefined) {
    throw new A2uiParseError("Expected an opaque A2UI surface-ID registry");
  }
  return state;
}

function parseLimit(
  value: number | undefined,
  fallback: number,
  maximum: number,
  name: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > maximum) {
    throw new A2uiParseError(
      `A2UI surface-ID registry ${name} must be an integer from 1 through ${maximum}`,
    );
  }
  return resolved;
}

function rejectUnknownKeys(value: object, allowed: readonly string[]): void {
  const keys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) {
      throw new A2uiParseError(`Unexpected A2UI surface-ID registry option ${JSON.stringify(key)}`);
    }
  }
}
