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
  /** Host-owned revision incremented after each accepted agent data-model update. */
  readonly dataModelRevision?: number;
  readonly components: ReadonlyMap<string, A2uiV1Component>;
  readonly dataModel: JsonObject;
  readonly metadata?: JsonObject;
}

export interface A2uiV1Action {
  readonly name: string;
  readonly surfaceId: string;
  readonly sourceComponentId: string;
  readonly timestamp: string;
  readonly context: JsonObject;
  readonly userMessage?: string;
  readonly metadata?: JsonObject;
}

export interface A2uiV1ActionEnvelope {
  readonly version: typeof A2UI_V1_PROTOCOL_VERSION;
  readonly action: A2uiV1Action;
}

export interface A2uiV1ActionEnvelopeInput {
  readonly name: string;
  readonly surfaceId: string;
  readonly sourceComponentId: string;
  readonly context: JsonObject;
  readonly userMessage?: string;
  readonly metadata?: JsonObject;
  /** RFC 3339 timestamp. Defaults to the current time when omitted. */
  readonly timestamp?: string;
}

export interface A2uiV1FunctionCall extends JsonObject {
  readonly call: string;
  readonly catalogId?: string;
  readonly args?: JsonObject;
}

export interface A2uiV1CallAgentFunctionEnvelope {
  readonly version: typeof A2UI_V1_PROTOCOL_VERSION;
  readonly callAgentFunction: {
    readonly surfaceId: string;
    readonly functionCallId: string;
    readonly callFunction: A2uiV1FunctionCall;
  };
}

export type A2uiV1RendererFunctionResponse =
  | {
      readonly functionCallId: string;
      readonly value: JsonValue;
    }
  | {
      readonly functionCallId: string;
      readonly error: {
        readonly code: string;
        readonly message: string;
      };
    };

export interface A2uiV1RendererFunctionResponseEnvelope {
  readonly version: typeof A2UI_V1_PROTOCOL_VERSION;
  readonly rendererFunctionResponse: A2uiV1RendererFunctionResponse;
}

export type A2uiV1ValidationErrorCode =
  | "VALIDATION_FAILED"
  | "UNALLOWED_CHILD"
  | "UNALLOWED_PARENT";

export interface A2uiV1ValidationRendererError {
  readonly code: A2uiV1ValidationErrorCode;
  readonly surfaceId: string;
  readonly path: string;
  readonly message: string;
}

/**
 * The pinned Candidate schema explicitly permits additional JSON fields on generic errors.
 * They are preserved as inert data and never grant host behavior.
 */
export type A2uiV1GenericRendererError = JsonObject & {
  readonly code: string;
  readonly message: string;
} & ({ readonly surfaceId: string } | { readonly functionCallId: string });

export type A2uiV1RendererError = A2uiV1GenericRendererError | A2uiV1ValidationRendererError;

export interface A2uiV1ErrorEnvelope {
  readonly version: typeof A2UI_V1_PROTOCOL_VERSION;
  readonly error: A2uiV1RendererError;
}

/** All renderer-to-agent message kinds in the pinned Candidate schema. */
export type A2uiV1RendererToAgentEnvelope =
  | A2uiV1ActionEnvelope
  | A2uiV1CallAgentFunctionEnvelope
  | A2uiV1ErrorEnvelope
  | A2uiV1RendererFunctionResponseEnvelope;

export type A2uiV1RendererToAgentEnvelopeKind =
  | "action"
  | "callAgentFunction"
  | "error"
  | "rendererFunctionResponse";

export interface A2uiV1AgentCapabilities {
  readonly "v1.0": {
    readonly supportedCatalogIds: readonly string[];
    readonly acceptsInlineCatalogs: boolean;
  };
}

export interface A2uiV1RendererCapabilities {
  readonly "v1.0": {
    readonly supportedCatalogIds: readonly string[];
  };
}

export interface A2uiV1RendererCapabilitiesOptions {
  /** Catalogs fully implemented and registered by the host renderer. */
  readonly supportedCatalogIds: readonly string[];
}

export type A2uiV1CapabilityNegotiation =
  | {
      readonly kind: "fallback";
      readonly protocolVersion: typeof A2UI_V1_PROTOCOL_VERSION;
      readonly reason: "no-shared-catalog";
    }
  | {
      readonly kind: "negotiated";
      readonly protocolVersion: typeof A2UI_V1_PROTOCOL_VERSION;
      readonly supportedCatalogIds: readonly string[];
      /** This implementation never enables untrusted inline catalog definitions. */
      readonly inlineCatalogsEnabled: false;
    };
