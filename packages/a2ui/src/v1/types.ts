import type { JsonObject, JsonValue } from "@mcp-native/core";

export const A2UI_V1_PROTOCOL_VERSION = "v1.0" as const;

/** Maximum UTF-16 code units accepted in one JSONL resource body. */
export const A2UI_V1_MAX_SOURCE_LENGTH = 1_048_576;
/** Maximum number of non-empty JSONL envelopes in one resource batch. */
export const A2UI_V1_MAX_ENVELOPES = 1_024;
/** Maximum surfaces retained by one in-memory store. */
export const A2UI_V1_MAX_SURFACES = 1_024;
/** Maximum retained component definitions in one surface. */
export const A2UI_V1_MAX_COMPONENTS = 1_024;

export type A2uiV1Component = JsonObject & {
  readonly id: string;
  readonly component: string;
};

export type A2uiV1CreateSurfaceEnvelope = {
  readonly version: typeof A2UI_V1_PROTOCOL_VERSION;
  readonly createSurface: {
    readonly surfaceId: string;
    readonly catalogId?: string;
    readonly sendDataModel?: boolean;
    readonly components?: readonly A2uiV1Component[];
    readonly dataModel?: JsonObject;
    readonly metadata?: JsonObject;
  };
};

export type A2uiV1UpdateComponentsEnvelope = {
  readonly version: typeof A2UI_V1_PROTOCOL_VERSION;
  readonly updateComponents: {
    readonly surfaceId: string;
    readonly components: readonly A2uiV1Component[];
  };
};

export type A2uiV1UpdateDataModelEnvelope = {
  readonly version: typeof A2UI_V1_PROTOCOL_VERSION;
  readonly updateDataModel: {
    readonly surfaceId: string;
    readonly path?: string;
    readonly value: JsonValue;
  };
};

export type A2uiV1DeleteSurfaceEnvelope = {
  readonly version: typeof A2UI_V1_PROTOCOL_VERSION;
  readonly deleteSurface: {
    readonly surfaceId: string;
  };
};

/** Lifecycle envelopes supported by the Milestone 3 surface store. */
export type A2uiV1Envelope =
  | A2uiV1CreateSurfaceEnvelope
  | A2uiV1UpdateComponentsEnvelope
  | A2uiV1UpdateDataModelEnvelope
  | A2uiV1DeleteSurfaceEnvelope;

export type A2uiV1EnvelopeKind =
  | "createSurface"
  | "updateComponents"
  | "updateDataModel"
  | "deleteSurface";

export interface A2uiV1SurfaceState {
  readonly surfaceId: string;
  readonly catalogId?: string;
  readonly sendDataModel: boolean;
  readonly components: ReadonlyMap<string, A2uiV1Component>;
  readonly dataModel: JsonObject;
  readonly metadata?: JsonObject;
}
