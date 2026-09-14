import type { JsonObject, JsonValue } from "@mcp-native/core";
import {
  CONTRACT_EXTENSION_ID,
  createContractRegistry,
  resolveContractResult,
  type ContractAdapter,
  type ContractDescriptor,
} from "./contracts.js";
import { adapters } from "./contract-registry-state.js";
import {
  Budget,
  CONTRACT_LIMITS,
  ContractError,
  copyObject,
  keys,
  object,
  parseSchema,
  validate,
  type ContractSchema,
} from "./contracts-schema.js";

export const CONTRACT_SCHEMA_BUNDLE_VERSION = "1" as const;
export const CONTRACT_MAX_AUTHORING_FIXTURES = 64;
export type ContractAuthoringErrorCode =
  | "invalid-schema-bundle"
  | "crypto-unavailable"
  | "invalid-fixtures"
  | "schema-revision-mismatch";
export class ContractAuthoringError extends Error {
  readonly code: ContractAuthoringErrorCode;
  constructor(code: ContractAuthoringErrorCode) {
    super(code);
    this.name = "ContractAuthoringError";
    this.code = code;
  }
}
export interface ContractSchemaBundleInput {
  readonly inputSchema: ContractSchema;
  readonly modelSchema: ContractSchema;
  readonly eventSchema?: ContractSchema;
}
export interface ContractSchemaBundle {
  readonly formatVersion: typeof CONTRACT_SCHEMA_BUNDLE_VERSION;
  /** Exact JSON source hashed as UTF-8; object keys sorted, array order preserved, no whitespace/newline. */
  readonly source: string;
  readonly schemaRevision: string;
  readonly schemas: ContractSchemaBundleInput;
}

/** Build/test helper. Requires Web Crypto SHA-256 and TextEncoder (available in supported Node). */
export async function createContractSchemaBundle(
  input: ContractSchemaBundleInput,
): Promise<ContractSchemaBundle> {
  let schemas: ContractSchemaBundleInput;
  let source: string;
  try {
    keys(
      object(input, "invalid-registration"),
      ["inputSchema", "modelSchema", "eventSchema"],
      "invalid-registration",
    );
    schemas = Object.freeze({
      inputSchema: parseSchema(input.inputSchema),
      modelSchema: parseSchema(input.modelSchema),
      ...(input.eventSchema === undefined ? {} : { eventSchema: parseSchema(input.eventSchema) }),
    });
    const budget = new Budget(CONTRACT_LIMITS);
    const owned = copyObject(
      { formatVersion: CONTRACT_SCHEMA_BUNDLE_VERSION, ...schemas },
      budget,
      "invalid-registration",
    );
    source = canonicalSource(owned, budget);
    // Charge serialized output including escaped code units, not just unescaped input strings.
    budget.string(source.length);
  } catch {
    throw new ContractAuthoringError("invalid-schema-bundle");
  }
  const platform = globalThis as unknown as {
    crypto?: { subtle?: { digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer> } };
    TextEncoder?: new () => { encode(input: string): Uint8Array };
  };
  if (!platform.crypto?.subtle || !platform.TextEncoder)
    throw new ContractAuthoringError("crypto-unavailable");
  let digest: ArrayBuffer;
  try {
    digest = await platform.crypto.subtle.digest(
      "SHA-256",
      new platform.TextEncoder().encode(source),
    );
  } catch {
    throw new ContractAuthoringError("crypto-unavailable");
  }
  const schemaRevision =
    "sha256:" +
    Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return Object.freeze({
    formatVersion: CONTRACT_SCHEMA_BUNDLE_VERSION,
    source,
    schemaRevision,
    schemas,
  });
}

function canonicalSource(value: JsonValue, budget: Budget): string {
  const visit = (entry: JsonValue): string => {
    budget.spend();
    let source: string;
    if (Array.isArray(entry)) source = "[" + entry.map(visit).join(",") + "]";
    else if (entry !== null && typeof entry === "object") {
      const names = Object.keys(entry);
      budget.spend(
        Math.max(
          1,
          names.reduce((total, name) => total + name.length + 1, 0) *
            Math.ceil(Math.log2(names.length + 1)),
        ),
      );
      // Explicit serialization also preserves lexical order for integer-looking object keys.
      names.sort();
      source =
        "{" +
        names
          .map((name) => JSON.stringify(name) + ":" + visit((entry as JsonObject)[name]!))
          .join(",") +
        "}";
    } else source = JSON.stringify(entry);
    budget.spend(source.length); // Include repeated intermediate serialization work.
    return source;
  };
  return visit(value);
}

type FixtureFailureCode =
  | "invalid-contract-input"
  | "invalid-contract-model"
  | "contract-limit-exceeded"
  | "adapter-failed";
export type ContractFixtureExpectation =
  | { readonly kind: "contract-data"; readonly model: JsonObject }
  | { readonly kind: "contract-error"; readonly code: FixtureFailureCode }
  | { readonly kind: "invalid"; readonly code: "invalid-input" };
export interface ContractAdapterFixture {
  readonly name: string;
  readonly input: unknown;
  readonly expected: ContractFixtureExpectation;
}
export interface ContractEventFixture {
  readonly name: string;
  readonly event: unknown;
  readonly valid: boolean;
}
export interface ContractAdapterFixtureOptions {
  readonly adapter: ContractAdapter;
  readonly fixtures: readonly ContractAdapterFixture[];
  readonly events?: readonly ContractEventFixture[];
}
export interface ContractFixtureResult {
  readonly name: string;
  readonly passed: boolean;
  readonly actual:
    | "contract-data"
    | "contract-error"
    | "invalid"
    | "unexpected"
    | "event-valid"
    | "event-invalid";
  readonly code?: string;
}
export interface ContractAdapterFixtureReport {
  readonly passed: boolean;
  readonly descriptor: ContractDescriptor;
  readonly results: readonly ContractFixtureResult[];
}

/** Bounded schema/preparation fixtures, not certification of renderer, consent, or I/O safety. */
export async function runContractAdapterFixtures(
  options: ContractAdapterFixtureOptions,
): Promise<ContractAdapterFixtureReport> {
  let state;
  let adapter;
  let fixtures: readonly ContractAdapterFixture[];
  let events: readonly ContractEventFixture[];
  const comparisons: (string | undefined)[] = [];
  try {
    keys(
      object(options, "invalid-registration"),
      ["adapter", "fixtures", "events"],
      "invalid-registration",
    );
    adapter = options.adapter;
    state = adapters.get(adapter);
    if (!state) throw new Error();
    fixtures = options.fixtures;
    events = options.events ?? [];
    if (
      !Array.isArray(fixtures) ||
      !Array.isArray(events) ||
      fixtures.length < 1 ||
      fixtures.length + events.length > CONTRACT_MAX_AUTHORING_FIXTURES
    )
      throw new Error();
    const names = new Set<string>();
    const budget = new Budget(CONTRACT_LIMITS);
    const name = (input: unknown) => {
      if (
        typeof input !== "string" ||
        !/^[a-zA-Z0-9][a-zA-Z0-9 ._-]{0,79}$/.test(input) ||
        names.has(input)
      )
        throw new Error();
      budget.string(input.length);
      names.add(input);
    };
    for (const fixture of fixtures) {
      keys(
        object(fixture, "invalid-registration"),
        ["name", "input", "expected"],
        "invalid-registration",
      );
      name(fixture.name);
      if (!Object.hasOwn(fixture, "input")) throw new Error();
      const expected = object(fixture.expected, "invalid-registration");
      if (expected.kind === "contract-data") {
        keys(expected, ["kind", "model"], "invalid-registration");
        const source = canonicalSource(
          copyObject(expected.model, budget, "invalid-registration"),
          budget,
        );
        budget.string(source.length);
        comparisons.push(source);
      } else {
        keys(expected, ["kind", "code"], "invalid-registration");
        if (
          !(
            (expected.kind === "invalid" && expected.code === "invalid-input") ||
            (expected.kind === "contract-error" &&
              [
                "invalid-contract-input",
                "invalid-contract-model",
                "contract-limit-exceeded",
                "adapter-failed",
              ].includes(expected.code as string))
          )
        )
          throw new Error();
        comparisons.push(undefined);
      }
    }
    for (const event of events) {
      keys(
        object(event, "invalid-registration"),
        ["name", "event", "valid"],
        "invalid-registration",
      );
      name(event.name);
      if (!Object.hasOwn(event, "event") || typeof event.valid !== "boolean") throw new Error();
    }
    // Snapshot assertion metadata before awaiting hashing or invoking a preparation callback.
    fixtures = Object.freeze(
      fixtures.map((fixture) =>
        Object.freeze({
          name: fixture.name,
          input: fixture.input,
          expected: Object.freeze({ ...fixture.expected }),
        }),
      ),
    );
    events = Object.freeze(
      events.map((fixture) =>
        Object.freeze({ name: fixture.name, event: fixture.event, valid: fixture.valid }),
      ),
    );
  } catch {
    throw new ContractAuthoringError("invalid-fixtures");
  }
  const bundle = await createContractSchemaBundle({
    inputSchema: state.inputSchema,
    modelSchema: state.modelSchema,
    ...(state.eventSchema ? { eventSchema: state.eventSchema } : {}),
  });
  if (bundle.schemaRevision !== state.descriptor.schemaRevision)
    throw new ContractAuthoringError("schema-revision-mismatch");
  const registry = createContractRegistry([adapter], { standards: [] });
  const results: ContractFixtureResult[] = [];
  for (const [index, fixture] of fixtures.entries()) {
    // Each resolver invocation is independently bounded, with at most 64 fixtures per run.
    // eslint-disable-next-line no-await-in-loop -- A trusted adapter may be stateful; preserve fixture order.
    const actual = await resolveContractResult({
      registry,
      tool: { name: "fixture", inputSchema: { type: "object" } },
      result: {
        content: [],
        structuredContent: fixture.input,
        _meta: state.reviewed
          ? { [state.reviewed.binding.resultMetaKey]: state.reviewed.binding.resultMeta }
          : { [CONTRACT_EXTENSION_ID]: state.descriptor },
      },
      client: {
        getClientExtensionSettings: () => registry.extensionSettings,
        getServerExtensionSettings: () => registry.extensionSettings,
        readResource: async () => {
          throw new Error("Inline fixture cannot read resources");
        },
      },
    });
    const kind =
      actual.kind === "contract-data" ||
      actual.kind === "contract-error" ||
      actual.kind === "invalid"
        ? actual.kind
        : "unexpected";
    let passed = false;
    if (actual.kind === "contract-data" && fixture.expected.kind === "contract-data") {
      try {
        const budget = new Budget(CONTRACT_LIMITS);
        const source = canonicalSource(
          copyObject(actual.model, budget, "invalid-contract-model"),
          budget,
        );
        passed = source === comparisons[index];
      } catch {
        /* Excessive comparison output is a controlled failed fixture. */
      }
    } else if (
      (actual.kind === "contract-error" || actual.kind === "invalid") &&
      (fixture.expected.kind === "contract-error" || fixture.expected.kind === "invalid")
    )
      passed = actual.kind === fixture.expected.kind && actual.code === fixture.expected.code;
    results.push(
      Object.freeze({
        name: fixture.name,
        passed,
        actual: kind,
        ...("code" in actual ? { code: actual.code } : {}),
      }),
    );
  }
  for (const fixture of events) {
    let valid = false;
    let code: string | undefined;
    try {
      if (!state.eventSchema) code = "events-disabled";
      else {
        const budget = new Budget(state.limits);
        const event = copyObject(fixture.event, budget, "invalid-contract-event");
        validate(state.eventSchema, event, budget, "invalid-contract-event");
        valid = true;
      }
    } catch (error) {
      code = error instanceof ContractError ? error.code : "invalid-contract-event";
    }
    results.push(
      Object.freeze({
        name: fixture.name,
        passed: valid === fixture.valid,
        actual: valid ? "event-valid" : "event-invalid",
        ...(code ? { code } : {}),
      }),
    );
  }
  return Object.freeze({
    passed: results.every((result) => result.passed),
    descriptor: state.descriptor,
    results: Object.freeze(results),
  });
}
