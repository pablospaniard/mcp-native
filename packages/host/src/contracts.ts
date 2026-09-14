import { MIME_TYPE, negotiateMcpBinding } from "@mcp-native/a2ui";
import {
  JSON_MAX_TOTAL_STRING_CODE_UNITS,
  parseJsonObject,
  parseMcpExtensionSettings,
  type JsonObject,
  type McpExtensionSettings,
} from "@mcp-native/core";
import { parseMcpSdkTool, parseMcpSdkToolCallResult } from "@mcp-native/mcp";
import { MCP_APPS_MIME_TYPE, negotiateMcpApps } from "@mcp-native/webview";

import {
  MCP_NATIVE_HOST_EXTENSION_CAPABILITIES,
  resolveMcpNativeHostResult,
  type McpNativeHostResult,
  type ResolveMcpNativeHostResultOptions,
} from "./results.js";
import {
  Budget,
  CONTRACT_LIMITS,
  ContractError,
  copyObject,
  fail,
  keys,
  parseLimits,
  object,
  parseSchema,
  validate,
  type ContractErrorCode,
  type ContractLimits,
  type ContractSchema,
} from "./contracts-schema.js";
import type { McpNativeHostAbortSignal } from "./controller.js";

export { ContractHostController, createContractHostController } from "./contract-controller.js";
export type {
  ContractHostControllerOptions,
  ContractHostCallState,
  ContractHostSnapshot,
} from "./contract-controller.js";

export { CONTRACT_LIMITS, ContractError } from "./contracts-schema.js";
export type { ContractErrorCode, ContractLimits, ContractSchema } from "./contracts-schema.js";

export const CONTRACT_EXTENSION_ID = "io.github.pablospaniard/mcp-native-contracts" as const;
export const CONTRACT_BINDING_VERSION = "0.1" as const;
export const CONTRACT_MAX_ADAPTERS = 32;
export const CONTRACT_MAX_REGISTRY_STRING_CODE_UNITS = 131_072;

export interface ContractDescriptor {
  readonly id: string;
  readonly version: string;
  /** Build-time SHA-256 digest of the exact local schema bundle bytes; never fetched remotely. */
  readonly schemaRevision: string;
  readonly transport: "structured-content";
  readonly mimeType: string;
}

export interface ContractPreparationContext {
  /** Charge input-dependent work before performing it. A failed charge permanently exhausts this call. */
  consume(work: number): void;
}

export interface ContractAdapterOptions {
  readonly descriptor: ContractDescriptor;
  readonly inputSchema: ContractSchema;
  readonly modelSchema: ContractSchema;
  readonly limits?: Partial<ContractLimits>;
  /** Synchronous trusted local transformation. Both its input and output are schema validated. */
  readonly prepare: (input: JsonObject, context: ContractPreparationContext) => JsonObject;
}

/** Only createContractAdapter-issued objects are accepted by a registry. */
export interface ContractAdapter {
  readonly descriptor: ContractDescriptor;
}

/** A host-created immutable snapshot; this is not a renderer or action grant. */
export interface ContractRegistry {
  readonly contracts: readonly ContractDescriptor[];
  /** Built-in profiles plus the exact locally installed custom contracts. Advertise on the same client. */
  readonly extensionSettings: McpExtensionSettings;
}

export interface ContractDataResult {
  readonly kind: "contract-data";
  readonly descriptor: ContractDescriptor;
  /** Owned inert JSON only. No component, action, resource, or mounting authority is granted. */
  readonly model: JsonObject;
}

export interface ContractInvalidResult {
  readonly kind: "contract-error";
  readonly code: ContractErrorCode;
}

/** Separate opt-in result type; the existing McpNativeHostResult union is unchanged. */
export type ContractResult = McpNativeHostResult | ContractDataResult | ContractInvalidResult;

export interface ResolveContractResultOptions extends ResolveMcpNativeHostResultOptions {
  readonly registry: ContractRegistry;
  /** Optional per-call host ceilings. They cannot raise installed adapter limits. */
  readonly limits?: Partial<ContractLimits>;
  /** Cancellation prevents subsequent preparation/resource work and suppresses late results. */
  readonly signal?: McpNativeHostAbortSignal;
}

interface AdapterState {
  readonly descriptor: ContractDescriptor;
  readonly inputSchema: ContractSchema;
  readonly modelSchema: ContractSchema;
  readonly limits: ContractLimits;
  readonly prepare: ContractAdapterOptions["prepare"];
}

const adapters = new WeakMap<ContractAdapter, AdapterState>();
const registries = new WeakMap<ContractRegistry, ReadonlyMap<string, AdapterState>>();
const DESCRIPTOR_KEYS = ["id", "version", "schemaRevision", "transport", "mimeType"];
const RESERVED_NAMESPACES = [
  "io.modelcontextprotocol",
  "io.github.pablospaniard",
  "io.mcp-native",
  "org.a2ui",
];

/** Test factory-issued registry identity without treating a structural copy as a registration. */
export function isContractRegistry(value: unknown): value is ContractRegistry {
  return typeof value === "object" && value !== null && registries.has(value as ContractRegistry);
}

/** Validate the closed custom wire descriptor without performing negotiation or granting execution. */
export function parseContractDescriptor(input: unknown): ContractDescriptor {
  try {
    const value = object(input, "invalid-claim");
    keys(value, DESCRIPTOR_KEYS, "invalid-claim");
    for (const key of DESCRIPTOR_KEYS) {
      if (
        !Object.hasOwn(value, key) ||
        typeof value[key] !== "string" ||
        (value[key] as string).length > 192
      )
        fail("invalid-claim");
    }
    const id = value.id as string;
    const namespace = id.split("/")[0]!;
    if (
      !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)+\/[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(
        id,
      ) ||
      RESERVED_NAMESPACES.some(
        (reserved) => namespace === reserved || namespace.startsWith(`${reserved}.`),
      )
    )
      fail("invalid-claim");
    if (
      !/^(?:0|[1-9][0-9]{0,8})\.(?:0|[1-9][0-9]{0,8})\.(?:0|[1-9][0-9]{0,8})$/.test(
        value.version as string,
      ) ||
      !/^sha256:[0-9a-f]{64}$/.test(value.schemaRevision as string) ||
      value.transport !== "structured-content" ||
      !/^application\/vnd\.[a-z0-9]+(?:[.-][a-z0-9]+)*\+json$/.test(value.mimeType as string)
    )
      fail("invalid-claim");
    return Object.freeze({
      id,
      version: value.version as string,
      schemaRevision: value.schemaRevision as string,
      transport: "structured-content",
      mimeType: value.mimeType as string,
    });
  } catch {
    fail("invalid-claim");
  }
}

/** Install a trusted local data adapter; strict schemas are snapshotted before any server result. */
export function createContractAdapter(options: ContractAdapterOptions): ContractAdapter {
  try {
    const value = object(options, "invalid-registration");
    keys(
      value,
      ["descriptor", "inputSchema", "modelSchema", "limits", "prepare"],
      "invalid-registration",
    );
    if (typeof value.prepare !== "function") fail("invalid-registration");
    const state: AdapterState = Object.freeze({
      descriptor: parseContractDescriptor(value.descriptor),
      inputSchema: parseSchema(value.inputSchema),
      modelSchema: parseSchema(value.modelSchema),
      limits: parseLimits(value.limits === undefined ? {} : value.limits),
      prepare: value.prepare as ContractAdapterOptions["prepare"],
    });
    const registration = Object.freeze({ descriptor: state.descriptor });
    adapters.set(registration, state);
    return registration;
  } catch {
    fail("invalid-registration");
  }
}

/** Select only host-installed adapters. Order never acts as precedence and duplicates are rejected. */
export function createContractRegistry(installed: readonly ContractAdapter[]): ContractRegistry {
  try {
    if (!Array.isArray(installed) || installed.length > CONTRACT_MAX_ADAPTERS)
      fail("invalid-registry");
    const byIdentity = new Map<string, AdapterState>();
    const budget = new Budget({
      maxDepth: 32,
      maxValues: 16_384,
      maxStringCodeUnits: CONTRACT_MAX_REGISTRY_STRING_CODE_UNITS,
      maxWork: 524_288,
    });
    for (const adapter of installed) {
      const state = adapters.get(adapter);
      if (!state || byIdentity.has(identity(state.descriptor))) fail("invalid-registry");
      // Aggregate installed schemas as well as descriptors: individually valid registrations can amplify retention.
      copyObject(state.descriptor, budget, "invalid-registry");
      copyObject(state.inputSchema, budget, "invalid-registry");
      copyObject(state.modelSchema, budget, "invalid-registry");
      byIdentity.set(identity(state.descriptor), state);
    }
    const contracts = Object.freeze([...byIdentity.values()].map((entry) => entry.descriptor));
    const extensionSettings = copyObject(
      {
        ...MCP_NATIVE_HOST_EXTENSION_CAPABILITIES,
        ...(contracts.length === 0
          ? {}
          : { [CONTRACT_EXTENSION_ID]: { bindingVersion: CONTRACT_BINDING_VERSION, contracts } }),
      },
      new Budget(CONTRACT_LIMITS),
      "invalid-registry",
    ) as McpExtensionSettings;
    const registry = Object.freeze({ contracts, extensionSettings });
    registries.set(registry, byIdentity);
    return registry;
  } catch {
    fail("invalid-registry");
  }
}

/**
 * Resolve bounded inline custom data or preserve the existing built-in standard path.
 * The caller owns connection/lifecycle; returned custom JSON has no renderer or action authority.
 */
export async function resolveContractResult(
  options: ResolveContractResultOptions,
): Promise<ContractResult> {
  let installed;
  let tool;
  let result;
  let client;
  let hostLimits;
  try {
    const value = object(options, "invalid-registration");
    keys(
      value,
      ["registry", "tool", "result", "client", "limits", "a2uiParseOptions", "signal"],
      "invalid-registration",
    );
    installed = registries.get(options.registry);
    if (!installed) return rejected("invalid-registry");
    if (
      options.signal !== undefined &&
      (options.signal === null ||
        typeof options.signal !== "object" ||
        typeof options.signal.aborted !== "boolean" ||
        typeof options.signal.addEventListener !== "function" ||
        typeof options.signal.removeEventListener !== "function")
    )
      return Object.freeze({ kind: "invalid", code: "invalid-input" });
    if (options.signal?.aborted) return rejected("cancelled");
    client = options.client;
    if (
      !client ||
      typeof client.readResource !== "function" ||
      typeof client.getClientExtensionSettings !== "function" ||
      typeof client.getServerExtensionSettings !== "function"
    )
      return Object.freeze({ kind: "invalid", code: "invalid-input" });
    hostLimits = parseLimits(options.limits === undefined ? {} : options.limits);
    tool = parseMcpSdkTool(options.tool);
    result = parseMcpSdkToolCallResult(options.result);
  } catch {
    return Object.freeze({ kind: "invalid", code: "invalid-input" });
  }

  let clientSettings;
  let serverSettings;
  try {
    // Snapshot both settings exactly once, through the same reader bound to the result connection.
    clientSettings = parseMcpExtensionSettings(
      parseJsonObject(client.getClientExtensionSettings(), "client extensions", {
        maxTotalStringCodeUnits: JSON_MAX_TOTAL_STRING_CODE_UNITS,
      }),
    );
    if (options.signal?.aborted) return rejected("cancelled");
    serverSettings = parseMcpExtensionSettings(
      parseJsonObject(client.getServerExtensionSettings(), "server extensions", {
        maxTotalStringCodeUnits: JSON_MAX_TOTAL_STRING_CODE_UNITS,
      }),
    );
    negotiateMcpBinding(clientSettings, serverSettings);
    negotiateMcpApps(clientSettings, serverSettings);
  } catch {
    if (options.signal?.aborted) return rejected("cancelled");
    return Object.freeze({ kind: "invalid", code: "invalid-extension-settings" });
  }

  let clientContracts;
  let serverContracts;
  try {
    clientContracts = parseSettings(clientSettings[CONTRACT_EXTENSION_ID]);
    serverContracts = parseSettings(serverSettings[CONTRACT_EXTENSION_ID]);
    for (const descriptor of clientContracts) {
      const registration = installed.get(identity(descriptor));
      if (!registration || !same(registration.descriptor, descriptor))
        fail("invalid-contract-settings");
    }
  } catch {
    return rejected("invalid-contract-settings");
  }
  if (options.signal?.aborted) return rejected("cancelled");

  const resolveBuiltin = async (): Promise<ContractResult> => {
    const resolved = await resolveMcpNativeHostResult({
      tool,
      result,
      client: {
        readResource: async (uri) => {
          if (options.signal?.aborted) fail("cancelled");
          const resource = await client.readResource(uri);
          if (options.signal?.aborted) fail("cancelled");
          return resource;
        },
        getClientExtensionSettings: () => clientSettings,
        getServerExtensionSettings: () => serverSettings,
      },
      ...(options.a2uiParseOptions === undefined
        ? {}
        : { a2uiParseOptions: options.a2uiParseOptions }),
    });
    return options.signal?.aborted ? rejected("cancelled") : resolved;
  };

  let claimField: PropertyDescriptor | undefined;
  let hasOriginalUi = false;
  try {
    const metaField = Object.getOwnPropertyDescriptor(options.result as object, "_meta");
    if (metaField && !("value" in metaField)) return rejected("invalid-claim");
    if (metaField?.value !== undefined) {
      claimField = Object.getOwnPropertyDescriptor(metaField.value, CONTRACT_EXTENSION_ID);
    }
    const originalToolMeta = Object.getOwnPropertyDescriptor(options.tool as object, "_meta");
    hasOriginalUi = Boolean(
      originalToolMeta &&
      "value" in originalToolMeta &&
      originalToolMeta.value !== null &&
      typeof originalToolMeta.value === "object" &&
      Object.hasOwn(originalToolMeta.value, "ui"),
    );
  } catch {
    return rejected("invalid-claim");
  }
  if (claimField === undefined) {
    return resolveBuiltin();
  }

  // Reserved markers exclude custom routing even when malformed or not negotiated.
  const reservedMime = (mime: unknown) => mime === MIME_TYPE || mime === MCP_APPS_MIME_TYPE;
  if (
    hasOriginalUi ||
    Object.hasOwn(tool["_meta"] ?? {}, "ui") ||
    result.content.some(
      (block) =>
        ("mimeType" in block && reservedMime(block.mimeType)) ||
        (block.type === "resource" && reservedMime(block.resource.mimeType)),
    )
  ) {
    return rejected("conflicting-contract-claims");
  }

  let descriptor;
  try {
    if (!claimField.enumerable || !("value" in claimField)) fail("invalid-claim");
    descriptor = parseContractDescriptor(claimField.value);
  } catch {
    return rejected("invalid-claim");
  }
  const state = installed.get(identity(descriptor));
  if (
    result.isError ||
    !state ||
    !same(state.descriptor, descriptor) ||
    !clientContracts.some((entry) => same(entry, descriptor)) ||
    !serverContracts.some((entry) => same(entry, descriptor))
  ) {
    // Use the existing freezing and ordinary-content behavior, with no custom callbacks or reads.
    return resolveBuiltin();
  }

  try {
    if (options.signal?.aborted) fail("cancelled");
    const effective = Object.fromEntries(
      Object.keys(CONTRACT_LIMITS).map((key) => [
        key,
        Math.min(
          state.limits[key as keyof ContractLimits],
          hostLimits[key as keyof ContractLimits],
        ),
      ]),
    ) as unknown as ContractLimits;
    const budget = new Budget(effective);
    // Validate the original custom payload, not the SDK's optional-field normalization. Undefined
    // properties and unknown fields must not disappear before this contract's strict schema check.
    const payloadField = Object.getOwnPropertyDescriptor(
      options.result as object,
      "structuredContent",
    );
    if (!payloadField?.enumerable || !("value" in payloadField)) fail("invalid-contract-input");
    const input = copyObject(payloadField.value, budget, "invalid-contract-input");
    validate(state.inputSchema, input, budget, "invalid-contract-input");
    const context = Object.freeze({
      consume(work: number) {
        if (options.signal?.aborted) fail("cancelled");
        if (!Number.isSafeInteger(work) || work < 1) fail("adapter-failed");
        budget.spend(work);
      },
    });
    let prepared;
    try {
      prepared = state.prepare(input, context);
    } catch (error) {
      if (options.signal?.aborted) fail("cancelled");
      if (error instanceof ContractError && error.code === "contract-limit-exceeded") throw error;
      fail("adapter-failed");
    }
    // Async adapters are outside this slice. Contain rejected native promises as well as invalid output.
    if (prepared instanceof Promise) {
      void prepared.catch(() => {});
      fail("invalid-contract-model");
    }
    if (options.signal?.aborted) fail("cancelled");
    const model = copyObject(prepared, budget, "invalid-contract-model");
    validate(state.modelSchema, model, budget, "invalid-contract-model");
    if (options.signal?.aborted) fail("cancelled");
    return Object.freeze({ kind: "contract-data", descriptor: state.descriptor, model });
  } catch (error) {
    return rejected(error instanceof ContractError ? error.code : "adapter-failed");
  }
}

function parseSettings(input: unknown): readonly ContractDescriptor[] {
  if (input === undefined) return [];
  const value = object(input, "invalid-contract-settings");
  keys(value, ["bindingVersion", "contracts"], "invalid-contract-settings");
  if (
    value.bindingVersion !== CONTRACT_BINDING_VERSION ||
    !Array.isArray(value.contracts) ||
    value.contracts.length > CONTRACT_MAX_ADAPTERS
  ) {
    fail("invalid-contract-settings");
  }
  const result: ContractDescriptor[] = [];
  const seen = new Set<string>();
  for (const item of value.contracts) {
    const descriptor = parseContractDescriptor(item);
    if (seen.has(identity(descriptor))) fail("invalid-contract-settings");
    seen.add(identity(descriptor));
    result.push(descriptor);
  }
  return result;
}

function identity(value: ContractDescriptor): string {
  return `${value.id}@${value.version}`;
}
function same(a: ContractDescriptor, b: ContractDescriptor): boolean {
  return (
    a.id === b.id &&
    a.version === b.version &&
    a.schemaRevision === b.schemaRevision &&
    a.transport === b.transport &&
    a.mimeType === b.mimeType
  );
}
function rejected(code: ContractErrorCode): ContractInvalidResult {
  return Object.freeze({ kind: "contract-error", code });
}
