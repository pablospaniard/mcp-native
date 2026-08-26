import type { ErrorObject, ValidateFunction } from "ajv/dist/2020.js";
import Ajv2020Import from "ajv/dist/2020.js";
import addFormatsImport from "ajv-formats";

import agentToRenderer from "./vendor/agent_to_renderer.json" with { type: "json" };
import basicCatalog from "./vendor/catalog.json" with { type: "json" };
import commonTypes from "./vendor/common_types.json" with { type: "json" };
import rendererToAgent from "./vendor/renderer_to_agent.json" with { type: "json" };

type AjvInstance = {
  addSchema(schema: object): unknown;
  compile(schema: object): ValidateFunction;
};

type AjvConstructor = new (options?: {
  allErrors?: boolean;
  strict?: boolean;
  validateSchema?: boolean;
}) => AjvInstance;

type FormatsPlugin = (ajv: AjvInstance) => unknown;

const Ajv2020 = Ajv2020Import as unknown as AjvConstructor;
const addFormats = addFormatsImport as unknown as FormatsPlugin;

/** Official catalogs ship a discriminator that Ajv cannot map through $ref; drop it. */
function stripDiscriminator(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripDiscriminator);
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === "discriminator") {
        continue;
      }
      result[key] = stripDiscriminator(child);
    }
    return result;
  }
  return value;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function addSchemaAs(ajv: AjvInstance, schema: Record<string, unknown>, id: string): void {
  const copy = stripDiscriminator(cloneJson(schema)) as Record<string, unknown>;
  copy["$id"] = id;
  ajv.addSchema(copy);
}

let cachedValidate: ValidateFunction | undefined;
let cachedFunctionValidate: ValidateFunction | undefined;
let cachedRendererToAgentValidate: ValidateFunction | undefined;

/** Compiles the pinned agent-to-renderer schema once with the basic catalog mapped in. */
export function getA2uiV1EnvelopeValidator(): ValidateFunction {
  if (cachedValidate !== undefined) {
    return cachedValidate;
  }

  const common = commonTypes as Record<string, unknown>;
  const catalog = basicCatalog as Record<string, unknown>;
  const envelope = agentToRenderer as Record<string, unknown>;
  const ajv = createCatalogAjv(common, catalog);

  const validate = ajv.compile(stripDiscriminator(envelope) as object);
  cachedValidate = validate;
  return validate;
}

/** Validates a function reconstructed from the formatString expression language. */
export function getA2uiV1FunctionCallValidator(): ValidateFunction {
  if (cachedFunctionValidate !== undefined) {
    return cachedFunctionValidate;
  }

  const common = commonTypes as Record<string, unknown>;
  const catalog = basicCatalog as Record<string, unknown>;
  const ajv = createCatalogAjv(common, catalog);
  cachedFunctionValidate = ajv.compile({
    oneOf: [
      { $ref: `${expectStringId(catalog)}#/$defs/anyFunction` },
      { $ref: `${expectStringId(common)}#/$defs/IndexSystemFunction` },
    ],
  });
  return cachedFunctionValidate;
}

/** Compiles the pinned renderer-to-agent schema once with its standard references. */
export function getA2uiV1RendererToAgentValidator(): ValidateFunction {
  if (cachedRendererToAgentValidate !== undefined) {
    return cachedRendererToAgentValidate;
  }

  const common = commonTypes as Record<string, unknown>;
  const catalog = basicCatalog as Record<string, unknown>;
  const ajv = createCatalogAjv(common, catalog);
  cachedRendererToAgentValidate = ajv.compile(stripDiscriminator(rendererToAgent) as object);
  return cachedRendererToAgentValidate;
}

function createCatalogAjv(
  common: Record<string, unknown>,
  catalog: Record<string, unknown>,
): AjvInstance {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateSchema: false,
  });
  addFormats(ajv);

  const commonId = expectStringId(common);
  const catalogId = expectStringId(catalog);
  addSchemaAs(ajv, common, commonId);
  addSchemaAs(ajv, common, "common_types.json");
  addSchemaAs(ajv, catalog, catalogId);
  addSchemaAs(ajv, catalog, "catalog.json");
  addSchemaAs(ajv, catalog, "https://a2ui.org/specification/v1_0/catalog.json");
  return ajv;
}

function expectStringId(schema: Record<string, unknown>): string {
  const id = schema["$id"];
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("Vendored A2UI schema is missing a string $id");
  }
  return id;
}

export function formatAjvErrors(validate: ValidateFunction): string {
  const errors = validate.errors as ErrorObject[] | null | undefined;
  return (
    errors?.map((error) => `${error.instancePath || "/"} ${error.message}`).join("; ") ??
    "schema validation failed"
  );
}
