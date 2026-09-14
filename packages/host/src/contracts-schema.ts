import type { JsonObject, JsonValue } from "@mcp-native/core";

/** Closed local schema subset for inline contract data. No references or executable keywords. */
export type ContractSchema =
  | { readonly type: "null" | "boolean" }
  | {
      readonly type: "string";
      readonly maxLength: number;
      readonly minLength?: number;
      readonly enum?: readonly string[];
    }
  | { readonly type: "number" | "integer"; readonly minimum?: number; readonly maximum?: number }
  | {
      readonly type: "array";
      readonly items: ContractSchema;
      readonly maxItems: number;
      readonly minItems?: number;
    }
  | {
      readonly type: "object";
      readonly properties: Readonly<Record<string, ContractSchema>>;
      readonly required: readonly string[];
      readonly additionalProperties: false;
    };

export interface ContractLimits {
  readonly maxDepth: number;
  readonly maxValues: number;
  readonly maxStringCodeUnits: number;
  readonly maxWork: number;
}

/** Hard ceilings and defaults; callers and adapters may only lower them. */
export const CONTRACT_LIMITS: Readonly<ContractLimits> = Object.freeze({
  maxDepth: 32,
  maxValues: 10_000,
  maxStringCodeUnits: 262_144,
  maxWork: 100_000,
});

export type ContractErrorCode =
  | "invalid-registration"
  | "invalid-registry"
  | "invalid-claim"
  | "invalid-contract-settings"
  | "conflicting-contract-claims"
  | "invalid-contract-input"
  | "invalid-contract-model"
  | "contract-limit-exceeded"
  | "adapter-failed";

/** Errors never retain a server value, thrown adapter message, or validation issue list. */
export class ContractError extends Error {
  readonly code: ContractErrorCode;
  constructor(code: ContractErrorCode) {
    super(code);
    this.name = "ContractError";
    this.code = code;
  }
}

export function fail(code: ContractErrorCode): never {
  throw new ContractError(code);
}

export class Budget {
  values = 0;
  strings = 0;
  work = 0;
  constructor(readonly limits: ContractLimits) {}
  spend(work = 1): void {
    this.work += work;
    if (this.work > this.limits.maxWork) fail("contract-limit-exceeded");
  }
  value(depth: number): void {
    this.spend();
    if (++this.values > this.limits.maxValues || depth > this.limits.maxDepth) {
      fail("contract-limit-exceeded");
    }
  }
  string(length: number): void {
    this.spend(length);
    this.strings += length;
    if (this.strings > this.limits.maxStringCodeUnits) fail("contract-limit-exceeded");
  }
}

export function object(value: unknown, code: ContractErrorCode): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  )
    fail(code);
  return value as Record<string, unknown>;
}

export function keys(value: object, allowed: readonly string[], code: ContractErrorCode): void {
  for (const key of Reflect.ownKeys(value)) {
    const entry = Object.getOwnPropertyDescriptor(value, key)!;
    if (
      typeof key !== "string" ||
      !allowed.includes(key) ||
      !entry.enumerable ||
      !("value" in entry)
    ) {
      fail(code);
    }
  }
}

export function parseLimits(
  input: unknown,
  ceiling: ContractLimits = CONTRACT_LIMITS,
): ContractLimits {
  const value = object(input, "invalid-registration");
  keys(value, Object.keys(CONTRACT_LIMITS), "invalid-registration");
  const result = { ...ceiling };
  for (const key of Object.keys(CONTRACT_LIMITS) as (keyof ContractLimits)[]) {
    if (!Object.hasOwn(value, key)) continue;
    const entry = value[key];
    if (
      typeof entry !== "number" ||
      !Number.isSafeInteger(entry) ||
      entry < 1 ||
      entry > ceiling[key]
    ) {
      fail("invalid-registration");
    }
    result[key] = entry;
  }
  return Object.freeze(result);
}

/** Own and freeze every graph, charging repeated references each time they are copied. */
export function copyJson(
  input: unknown,
  budget: Budget,
  code: ContractErrorCode,
  depth = 0,
): JsonValue {
  budget.value(depth);
  if (input === null || typeof input === "boolean") return input;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) fail(code);
    return input;
  }
  if (typeof input === "string") {
    budget.string(input.length);
    return input;
  }
  if (Array.isArray(input)) {
    if (input.length > budget.limits.maxValues - budget.values) fail("contract-limit-exceeded");
    const names = Reflect.ownKeys(input);
    if (names.length !== input.length + 1) fail(code);
    const output: JsonValue[] = [];
    for (let i = 0; i < input.length; i++) {
      const entry = Object.getOwnPropertyDescriptor(input, String(i));
      if (!entry?.enumerable || !("value" in entry)) fail(code);
      output.push(copyJson(entry.value, budget, code, depth + 1));
    }
    return Object.freeze(output);
  }
  const source = object(input, code);
  const output: Record<string, JsonValue> = {};
  for (const key of Reflect.ownKeys(source)) {
    if (typeof key !== "string") fail(code);
    budget.string(key.length);
    const entry = Object.getOwnPropertyDescriptor(source, key)!;
    if (!entry.enumerable || !("value" in entry)) fail(code);
    Object.defineProperty(output, key, {
      value: copyJson(entry.value, budget, code, depth + 1),
      enumerable: true,
    });
  }
  return Object.freeze(output);
}

export function copyObject(input: unknown, budget: Budget, code: ContractErrorCode): JsonObject {
  object(input, code);
  return copyJson(input, budget, code) as JsonObject;
}

const SCHEMA_LIMITS = {
  maxDepth: 32,
  maxValues: 2_048,
  maxStringCodeUnits: 32_768,
  maxWork: 65_536,
};

export function parseSchema(schemaInput: unknown): ContractSchema {
  const parsedSchema = copyObject(schemaInput, new Budget(SCHEMA_LIMITS), "invalid-registration");
  let count = 0;
  const visit = (input: unknown, depth: number): void => {
    if (++count > 256 || depth > 16) fail("invalid-registration");
    const schema = object(input, "invalid-registration");
    switch (schema.type) {
      case "null":
      case "boolean":
        keys(schema, ["type"], "invalid-registration");
        break;
      case "number":
      case "integer":
        keys(schema, ["type", "minimum", "maximum"], "invalid-registration");
        for (const key of ["minimum", "maximum"]) {
          if (
            Object.hasOwn(schema, key) &&
            (typeof schema[key] !== "number" || !Number.isFinite(schema[key]))
          ) {
            fail("invalid-registration");
          }
        }
        if (
          typeof schema.minimum === "number" &&
          typeof schema.maximum === "number" &&
          schema.minimum > schema.maximum
        )
          fail("invalid-registration");
        break;
      case "string": {
        keys(schema, ["type", "minLength", "maxLength", "enum"], "invalid-registration");
        range(schema, "minLength", "maxLength", 65_536);
        if (Object.hasOwn(schema, "enum")) {
          if (!Array.isArray(schema.enum) || schema.enum.length < 1 || schema.enum.length > 32)
            fail("invalid-registration");
          const seen = new Set<string>();
          for (const item of schema.enum) {
            if (
              typeof item !== "string" ||
              item.length > (schema.maxLength as number) ||
              item.length < ((schema.minLength as number) ?? 0) ||
              seen.has(item)
            )
              fail("invalid-registration");
            seen.add(item);
          }
        }
        break;
      }
      case "array":
        keys(schema, ["type", "items", "minItems", "maxItems"], "invalid-registration");
        range(schema, "minItems", "maxItems", 1_024);
        visit(schema.items, depth + 1);
        break;
      case "object": {
        keys(
          schema,
          ["type", "properties", "required", "additionalProperties"],
          "invalid-registration",
        );
        if (schema.additionalProperties !== false || !Array.isArray(schema.required))
          fail("invalid-registration");
        const properties = object(schema.properties, "invalid-registration");
        const names = Object.keys(properties);
        if (names.length > 64 || schema.required.length > names.length)
          fail("invalid-registration");
        const seen = new Set<string>();
        for (const name of schema.required) {
          if (typeof name !== "string" || !Object.hasOwn(properties, name) || seen.has(name))
            fail("invalid-registration");
          seen.add(name);
        }
        for (const name of names) {
          if (name.length < 1 || name.length > 128) fail("invalid-registration");
          visit(properties[name], depth + 1);
        }
        break;
      }
      default:
        fail("invalid-registration");
    }
  };
  visit(parsedSchema, 0);
  if (parsedSchema.type !== "object") fail("invalid-registration");
  return parsedSchema as unknown as ContractSchema;
}

function range(schema: Record<string, unknown>, min: string, max: string, ceiling: number): void {
  const upper = schema[max];
  const lower = Object.hasOwn(schema, min) ? schema[min] : 0;
  if (
    typeof upper !== "number" ||
    !Number.isSafeInteger(upper) ||
    upper < 0 ||
    upper > ceiling ||
    typeof lower !== "number" ||
    !Number.isSafeInteger(lower) ||
    lower < 0 ||
    lower > upper
  )
    fail("invalid-registration");
}

export function validate(
  schema: ContractSchema,
  data: JsonValue,
  budget: Budget,
  code: ContractErrorCode,
): void {
  budget.spend();
  switch (schema.type) {
    case "null":
      if (data !== null) fail(code);
      return;
    case "boolean":
      if (typeof data !== "boolean") fail(code);
      return;
    case "number":
    case "integer":
      if (
        typeof data !== "number" ||
        (schema.type === "integer" && !Number.isSafeInteger(data)) ||
        (schema.minimum !== undefined && data < schema.minimum) ||
        (schema.maximum !== undefined && data > schema.maximum)
      )
        fail(code);
      return;
    case "string":
      if (
        typeof data !== "string" ||
        data.length > schema.maxLength ||
        data.length < (schema.minLength ?? 0)
      )
        fail(code);
      if (schema.enum) {
        let matched = false;
        for (const entry of schema.enum) {
          budget.spend(1 + entry.length + data.length);
          if (entry === data) matched = true;
        }
        if (!matched) fail(code);
      }
      return;
    case "array":
      if (
        !Array.isArray(data) ||
        data.length > schema.maxItems ||
        data.length < (schema.minItems ?? 0)
      )
        fail(code);
      for (const child of data) validate(schema.items, child, budget, code);
      return;
    case "object": {
      const record = object(data, code);
      for (const name of schema.required) {
        budget.spend(1 + name.length);
        if (!Object.hasOwn(record, name)) fail(code);
      }
      for (const [name, value] of Object.entries(record)) {
        budget.spend(1 + name.length);
        if (!Object.hasOwn(schema.properties, name)) fail(code);
        validate(schema.properties[name]!, value as JsonValue, budget, code);
      }
    }
  }
}
