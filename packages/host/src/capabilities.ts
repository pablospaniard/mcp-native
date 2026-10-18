/* eslint-disable no-control-regex -- Reject control characters in local manifest strings. */
import type { JsonObject } from "@mcp-native/core";

import {
  Budget,
  CONTRACT_LIMITS,
  ContractError,
  copyObject,
  keys,
  object,
  parseSchema,
  validate,
  type ContractLimits,
  type ContractSchema,
} from "./contracts-schema.js";

export const CAPABILITY_EXTENSION_ID = "io.github.pablospaniard/mcp-native-capabilities" as const;
export const CAPABILITY_BINDING_VERSION = "0.1" as const;
export const CAPABILITY_MANIFEST_VERSION = "1" as const;
export const CAPABILITY_MAX_PROVIDERS = 32;

export type CapabilityPlatform = "android" | "ios" | "macos" | "tvos" | "visionos";
export type CapabilitySensitivity =
  | "biometric"
  | "communications"
  | "contacts"
  | "financial"
  | "health"
  | "location"
  | "media"
  | "personal-files"
  | "sensor"
  | "stored-secret";

export interface CapabilityDescriptor {
  readonly id: string;
  readonly version: string;
  /** Digest of the canonical request/result/event/error schema bundle shipped with the app. */
  readonly schemaRevision: string;
}

export interface CapabilityPlatformSupport {
  readonly platform: CapabilityPlatform;
  readonly minimumOsVersion: string;
  readonly maximumOsVersion?: string;
  readonly provider: string;
}

export interface CapabilityLimits extends ContractLimits {
  readonly maxSessionValues: number;
  readonly maxSessionStringCodeUnits: number;
  readonly maxSessionWork: number;
  readonly maxCallsPerSession: number;
  readonly maxConcurrentCalls: number;
  readonly maxEventsPerCall: number;
  readonly maxDurationMs: number;
  readonly maxCleanupMs: number;
}

export interface CapabilityManifest {
  readonly manifestVersion: "1";
  readonly descriptor: CapabilityDescriptor;
  readonly requestSchema: ContractSchema;
  readonly resultSchema: ContractSchema;
  readonly eventSchema: ContractSchema;
  readonly errorSchema: ContractSchema;
  readonly platforms: readonly CapabilityPlatformSupport[];
  readonly permissions: readonly string[];
  readonly entitlements: readonly string[];
  readonly activation: "none" | "user";
  readonly consent: "none" | "per-request";
  readonly execution: "foreground" | "foreground-or-background";
  readonly sensitivity: readonly CapabilitySensitivity[];
  readonly limits: CapabilityLimits;
  readonly cancellation: "cooperative" | "result-suppression";
  readonly cleanup: "always";
  readonly fallback: "unavailable" | "ordinary-mcp";
  /** Repository-relative capability-specific threat model reviewed with the provider. */
  readonly threatModel: string;
}

export interface CapabilityProviderContext {
  readonly requestId: string;
  readonly request: JsonObject;
  readonly signal: CapabilityAbortSignal;
  /** Emit one schema-valid event. Events never acquire authority or extend the call budget. */
  emit(event: JsonObject): void;
  /** Charge provider-side input-dependent work before doing it. */
  consume(work: number): void;
}

export type CapabilityProviderOutcome =
  | { readonly kind: "result"; readonly value: JsonObject }
  | { readonly kind: "error"; readonly error: JsonObject };

export interface CapabilityProviderOptions {
  readonly manifest: CapabilityManifest;
  readonly invoke: (context: CapabilityProviderContext) => Promise<CapabilityProviderOutcome>;
  readonly cleanup: (requestId: string, reason: CapabilityCleanupReason) => void | Promise<void>;
}

/** Opaque, factory-issued local provider. A server can never construct one. */
export interface CapabilityProvider {
  readonly manifest: CapabilityManifest;
}

export interface HapticsAdapter {
  impact(
    effect: "heavy" | "light" | "medium" | "rigid" | "soft",
    signal: CapabilityAbortSignal,
  ): void | Promise<void>;
}

export interface CapabilityRiskProfile {
  readonly category:
    | "background"
    | "biometrics-and-secrets"
    | "communication"
    | "contacts-and-calendar"
    | "files-and-sharing"
    | "location-and-maps"
    | "media"
    | "payments-and-wallets"
    | "proximity-and-sensors";
  readonly minimumConsent: "per-request";
  readonly userActivation: "required";
  readonly background: "prohibited" | "separate-review";
  readonly output: "sensitive" | "non-sensitive";
}

export interface CapabilityRegistryOptions {
  readonly platform: CapabilityPlatform;
  readonly osVersion: string;
}

export interface CapabilityRegistry {
  readonly platform: CapabilityPlatform;
  readonly osVersion: string;
  readonly capabilities: readonly CapabilityDescriptor[];
  /** Advertise this exact value under CAPABILITY_EXTENSION_ID. */
  readonly extensionSettings: JsonObject;
}

export type CapabilityNegotiation =
  | { readonly kind: "fallback"; readonly reason: "absent" | "invalid" | "unsupported" }
  | {
      readonly kind: "negotiated";
      readonly capabilities: readonly CapabilityDescriptor[];
    };

export type CapabilityGrant = Extract<CapabilityNegotiation, { readonly kind: "negotiated" }>;

export interface CapabilityAuthorizationRequest {
  readonly requestId: string;
  readonly capability: CapabilityDescriptor;
  readonly activation: "none" | "user";
  readonly consent: "none" | "per-request";
  readonly execution: "foreground" | "foreground-or-background";
  readonly sensitivity: readonly CapabilitySensitivity[];
  readonly permissions: readonly string[];
  readonly entitlements: readonly string[];
  readonly request: JsonObject;
}

export interface CapabilityPermissionRequest {
  readonly requestId: string;
  readonly capability: CapabilityDescriptor;
  readonly permissions: readonly string[];
  readonly entitlements: readonly string[];
}

export interface CapabilityAuditEvent {
  readonly phase:
    | "requested"
    | "denied"
    | "started"
    | "event"
    | "succeeded"
    | "provider-error"
    | "failed"
    | "cancelled"
    | "cleanup";
  /** Broker-local correlation value; never derived from server or provider data. */
  readonly operationId: string;
  readonly capabilityId: string;
  readonly capabilityVersion: string;
  /** Stable local category only. No request, result, event, native error, or sensitive value. */
  readonly code?: CapabilityErrorCode;
}

export interface CapabilityBrokerOptions {
  readonly registry: CapabilityRegistry;
  readonly authorize: (request: CapabilityAuthorizationRequest) => boolean | Promise<boolean>;
  readonly ensurePermissions: (request: CapabilityPermissionRequest) => boolean | Promise<boolean>;
  readonly audit: (event: CapabilityAuditEvent) => void;
}

export interface CapabilityInvocation {
  readonly grant: CapabilityGrant;
  readonly requestId: string;
  readonly capability: CapabilityDescriptor;
  readonly request: unknown;
  readonly userActivated: boolean;
  readonly foreground: boolean;
  readonly signal?: CapabilityAbortSignal;
  readonly onEvent?: (event: JsonObject) => void;
}

export type CapabilityResult =
  | { readonly kind: "result"; readonly value: JsonObject }
  | { readonly kind: "provider-error"; readonly error: JsonObject }
  | { readonly kind: "capability-error"; readonly code: CapabilityErrorCode };

export type CapabilityErrorCode =
  | "invalid-broker"
  | "invalid-grant"
  | "invalid-request"
  | "replayed-request"
  | "unavailable"
  | "activation-required"
  | "background-denied"
  | "policy-denied"
  | "permission-denied"
  | "limit-exceeded"
  | "cancelled"
  | "timed-out"
  | "invalid-event"
  | "invalid-result"
  | "invalid-provider-error"
  | "provider-failed"
  | "cleanup-failed"
  | "audit-failed"
  | "closed";

export type CapabilityCleanupReason =
  | "completed"
  | "provider-error"
  | "failed"
  | "cancelled"
  | "timed-out"
  | "closed";

export interface CapabilityBroker {
  invoke(invocation: CapabilityInvocation): Promise<CapabilityResult>;
  close(): Promise<void>;
}

export interface CapabilityAbortSignal {
  readonly aborted: boolean;
  addEventListener(
    type: "abort",
    listener: () => void,
    options?: { readonly once?: boolean },
  ): void;
  removeEventListener(type: "abort", listener: () => void): void;
}

interface CapabilityAbortController {
  readonly signal: CapabilityAbortSignal;
  abort(): void;
}

interface ProviderState {
  readonly manifest: CapabilityManifest;
  readonly invoke: CapabilityProviderOptions["invoke"];
  readonly cleanup: CapabilityProviderOptions["cleanup"];
}

interface RegistryState {
  readonly providers: ReadonlyMap<string, ProviderState>;
}

interface GrantState {
  readonly registry: CapabilityRegistry;
  readonly providers: ReadonlyMap<string, ProviderState>;
}

const providers = new WeakMap<CapabilityProvider, ProviderState>();
const registries = new WeakMap<CapabilityRegistry, RegistryState>();
const grants = new WeakMap<CapabilityGrant, GrantState>();

const LIMIT_CEILINGS: CapabilityLimits = Object.freeze({
  ...CONTRACT_LIMITS,
  maxSessionValues: 100_000,
  maxSessionStringCodeUnits: 4_194_304,
  maxSessionWork: 2_000_000,
  maxCallsPerSession: 1_024,
  maxConcurrentCalls: 16,
  maxEventsPerCall: 256,
  maxDurationMs: 300_000,
  maxCleanupMs: 30_000,
});

const MANIFEST_KEYS = [
  "manifestVersion",
  "descriptor",
  "requestSchema",
  "resultSchema",
  "eventSchema",
  "errorSchema",
  "platforms",
  "permissions",
  "entitlements",
  "activation",
  "consent",
  "execution",
  "sensitivity",
  "limits",
  "cancellation",
  "cleanup",
  "fallback",
  "threatModel",
];
const SENSITIVITY = new Set<CapabilitySensitivity>([
  "biometric",
  "communications",
  "contacts",
  "financial",
  "health",
  "location",
  "media",
  "personal-files",
  "sensor",
  "stored-secret",
]);
const RESERVED_NAMESPACES = [
  "io.modelcontextprotocol",
  "io.github.pablospaniard",
  "io.mcp-native",
  "org.a2ui",
];

/** Minimum policy floors for the risk families in the native-capability roadmap. */
export const CAPABILITY_RISK_PROFILES: readonly CapabilityRiskProfile[] = Object.freeze(
  [
    ["media", "sensitive", "prohibited"],
    ["files-and-sharing", "sensitive", "prohibited"],
    ["location-and-maps", "sensitive", "prohibited"],
    ["proximity-and-sensors", "sensitive", "prohibited"],
    ["biometrics-and-secrets", "sensitive", "prohibited"],
    ["contacts-and-calendar", "sensitive", "prohibited"],
    ["communication", "sensitive", "prohibited"],
    ["payments-and-wallets", "sensitive", "prohibited"],
    ["background", "sensitive", "separate-review"],
  ].map(([category, output, background]) =>
    Object.freeze({
      category,
      minimumConsent: "per-request",
      userActivation: "required",
      background,
      output,
    }),
  ) as readonly CapabilityRiskProfile[],
);

const EMPTY_SCHEMA: ContractSchema = Object.freeze({
  type: "object",
  properties: Object.freeze({}),
  required: Object.freeze([]),
  additionalProperties: false,
});

/** Low-risk reference profile. Native haptics remain behind the supplied local adapter. */
export const HAPTICS_CAPABILITY_MANIFEST: CapabilityManifest = parseManifest(
  {
    manifestVersion: "1",
    descriptor: {
      id: "io.github.pablospaniard.mcp-native/haptics",
      version: "1.0.0",
      schemaRevision: "sha256:444ef7e8acee8b4db655ab8d1c0b967009a8476fc0468c5328d46d7a28495cc2",
    },
    requestSchema: {
      type: "object",
      properties: {
        effect: {
          type: "string",
          minLength: 4,
          maxLength: 6,
          enum: ["heavy", "light", "medium", "rigid", "soft"],
        },
      },
      required: ["effect"],
      additionalProperties: false,
    },
    resultSchema: {
      type: "object",
      properties: { performed: { type: "boolean" } },
      required: ["performed"],
      additionalProperties: false,
    },
    eventSchema: EMPTY_SCHEMA,
    errorSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          minLength: 11,
          maxLength: 11,
          enum: ["interrupted", "unavailable"],
        },
      },
      required: ["code"],
      additionalProperties: false,
    },
    platforms: [
      { platform: "android", minimumOsVersion: "26", provider: "android-vibrator" },
      { platform: "ios", minimumOsVersion: "13", provider: "ui-feedback-generator" },
    ],
    permissions: [],
    entitlements: [],
    activation: "user",
    consent: "per-request",
    execution: "foreground",
    sensitivity: [],
    limits: {
      maxDepth: 4,
      maxValues: 16,
      maxStringCodeUnits: 128,
      maxWork: 1_024,
      maxSessionValues: 4_096,
      maxSessionStringCodeUnits: 32_768,
      maxSessionWork: 262_144,
      maxCallsPerSession: 256,
      maxConcurrentCalls: 1,
      maxEventsPerCall: 0,
      maxDurationMs: 2_000,
      maxCleanupMs: 500,
    },
    cancellation: "result-suppression",
    cleanup: "always",
    fallback: "ordinary-mcp",
    threatModel: "docs/threat-models/haptics.md",
  },
  true,
);

/** Bind the reference haptics profile to one app-owned implementation. */
export function createHapticsProvider(adapter: HapticsAdapter): CapabilityProvider {
  if (
    adapter === null ||
    typeof adapter !== "object" ||
    Reflect.ownKeys(adapter).some((key) => key !== "impact") ||
    typeof adapter.impact !== "function"
  ) {
    throw new CapabilitySetupError("invalid-provider");
  }
  return installProvider(
    {
      manifest: HAPTICS_CAPABILITY_MANIFEST,
      async invoke({ request, signal }) {
        await adapter.impact(
          request.effect as "heavy" | "light" | "medium" | "rigid" | "soft",
          signal,
        );
        return Object.freeze({ kind: "result", value: Object.freeze({ performed: true }) });
      },
      cleanup() {},
    },
    true,
  );
}

/** Install one audited, locally compiled provider. No native selector or method crosses this seam. */
export function createCapabilityProvider(options: CapabilityProviderOptions): CapabilityProvider {
  return installProvider(options, false);
}

function installProvider(
  options: CapabilityProviderOptions,
  allowReserved: boolean,
): CapabilityProvider {
  try {
    const value = object(options, "invalid-registration");
    keys(value, ["manifest", "invoke", "cleanup"], "invalid-registration");
    if (typeof value.invoke !== "function" || typeof value.cleanup !== "function")
      throw new Error();
    const state: ProviderState = Object.freeze({
      manifest: parseManifest(value.manifest, allowReserved),
      invoke: value.invoke as CapabilityProviderOptions["invoke"],
      cleanup: value.cleanup as CapabilityProviderOptions["cleanup"],
    });
    const provider = Object.freeze({ manifest: state.manifest });
    providers.set(provider, state);
    return provider;
  } catch {
    throw new CapabilitySetupError("invalid-provider");
  }
}

/** Create an immutable platform snapshot containing only installed providers available on this OS. */
export function createCapabilityRegistry(
  installed: readonly CapabilityProvider[],
  options: CapabilityRegistryOptions,
): CapabilityRegistry {
  try {
    if (!Array.isArray(installed) || installed.length > CAPABILITY_MAX_PROVIDERS) throw new Error();
    const config = object(options, "invalid-registration");
    keys(config, ["platform", "osVersion"], "invalid-registration");
    const platform = parsePlatform(config.platform);
    const osVersion = parseOsVersion(config.osVersion);
    const selected = new Map<string, ProviderState>();
    const retention = new Budget({
      maxDepth: 32,
      maxValues: 32_768,
      maxStringCodeUnits: 262_144,
      maxWork: 1_000_000,
    });
    for (const provider of installed) {
      const state = providers.get(provider);
      if (!state) throw new Error();
      const key = identity(state.manifest.descriptor);
      if (selected.has(key)) throw new Error();
      copyObject(state.manifest, retention, "invalid-registry");
      if (supports(state.manifest, platform, osVersion)) selected.set(key, state);
    }
    const capabilities = Object.freeze(
      [...selected.values()].map(({ manifest }) => manifest.descriptor),
    );
    const extensionSettings = copyObject(
      { bindingVersion: CAPABILITY_BINDING_VERSION, capabilities },
      new Budget(CONTRACT_LIMITS),
      "invalid-registry",
    );
    const registry = Object.freeze({ platform, osVersion, capabilities, extensionSettings });
    registries.set(registry, Object.freeze({ providers: selected }));
    return registry;
  } catch {
    throw new CapabilitySetupError("invalid-registry");
  }
}

/**
 * Negotiate an exact server-requested subset of the host's installed and advertised snapshot.
 * Metadata outside this explicit settings exchange grants nothing.
 */
export function negotiateCapabilities(
  registry: CapabilityRegistry,
  serverSettings: unknown,
): CapabilityNegotiation {
  const local = registries.get(registry);
  if (!local) return fallback("invalid");
  if (serverSettings === undefined) return fallback("absent");
  let requested: readonly CapabilityDescriptor[];
  try {
    requested = parseSettings(serverSettings);
  } catch {
    return fallback("invalid");
  }
  const selected = new Map<string, ProviderState>();
  for (const descriptor of requested) {
    const state = local.providers.get(identity(descriptor));
    if (!state || !sameDescriptor(state.manifest.descriptor, descriptor)) {
      return fallback("unsupported");
    }
    selected.set(identity(descriptor), state);
  }
  if (selected.size === 0) return fallback("unsupported");
  const grant = Object.freeze({
    kind: "negotiated" as const,
    capabilities: Object.freeze([...selected.values()].map((state) => state.manifest.descriptor)),
  });
  grants.set(grant, Object.freeze({ registry, providers: selected }));
  return grant;
}

/** Create one session-scoped broker. It never retains request, result, event, or native error data. */
export function createCapabilityBroker(options: CapabilityBrokerOptions): CapabilityBroker {
  try {
    const value = object(options, "invalid-registration");
    keys(value, ["registry", "authorize", "ensurePermissions", "audit"], "invalid-registration");
    if (
      !registries.has(options.registry) ||
      typeof options.authorize !== "function" ||
      typeof options.ensurePermissions !== "function" ||
      typeof options.audit !== "function"
    ) {
      throw new Error();
    }
  } catch {
    throw new CapabilitySetupError("invalid-broker");
  }
  let closed = false;
  let calls = 0;
  let active = 0;
  const seen = new Set<string>();
  const controllers = new Map<string, CapabilityAbortController>();
  const pending = new Set<Promise<CapabilityResult>>();
  const usage = { values: 0, strings: 0, work: 0 };

  const run = async (invocation: CapabilityInvocation): Promise<CapabilityResult> => {
    if (closed) return rejected("closed");
    let grantState: GrantState | undefined;
    let state: ProviderState | undefined;
    let requestId = "invalid";
    let operationId = "0";
    let callBudget: CumulativeBudget | undefined;
    let controller: CapabilityAbortController | undefined;
    let detach = () => {};
    let cleanupReason: CapabilityCleanupReason = "failed";
    let started = false;
    let reserved = false;
    let auditOk = true;
    let failureOverride: CapabilityErrorCode | undefined;
    try {
      const input = object(invocation, "invalid-registration");
      keys(
        input,
        [
          "grant",
          "requestId",
          "capability",
          "request",
          "userActivated",
          "foreground",
          "signal",
          "onEvent",
        ],
        "invalid-registration",
      );
      grantState = grants.get(invocation.grant);
      if (!grantState || grantState.registry !== options.registry) return rejected("invalid-grant");
      requestId = parseRequestId(input.requestId);
      const descriptor = parseDescriptor(input.capability, true);
      state = grantState.providers.get(identity(descriptor));
      if (!state || !sameDescriptor(state.manifest.descriptor, descriptor))
        return rejected("unavailable");
      if (typeof input.userActivated !== "boolean" || typeof input.foreground !== "boolean") {
        return rejected("invalid-request");
      }
      if (input.onEvent !== undefined && typeof input.onEvent !== "function") {
        return rejected("invalid-request");
      }
      if (input.signal !== undefined && !isAbortSignal(input.signal))
        return rejected("invalid-request");
      if (seen.has(requestId)) return rejected("replayed-request");
      seen.add(requestId);
      if (++calls > state.manifest.limits.maxCallsPerSession) return rejected("limit-exceeded");
      operationId = String(calls);
      auditOk = emitAudit(options.audit, "requested", operationId, descriptor);
      if (!auditOk) return rejected("audit-failed");
      if (state.manifest.activation === "user" && !input.userActivated) {
        emitAudit(options.audit, "denied", operationId, descriptor, "activation-required");
        return rejected("activation-required");
      }
      if (state.manifest.execution === "foreground" && !input.foreground) {
        emitAudit(options.audit, "denied", operationId, descriptor, "background-denied");
        return rejected("background-denied");
      }
      if (active >= state.manifest.limits.maxConcurrentCalls) return rejected("limit-exceeded");
      active++;
      reserved = true;
      const effective = state.manifest.limits;
      callBudget = new CumulativeBudget(effective, usage);
      const request = copyObject(input.request, callBudget, "invalid-contract-input");
      validate(state.manifest.requestSchema, request, callBudget, "invalid-contract-input");
      controller = createAbortController();
      if (invocation.signal) {
        const abort = () => controller!.abort();
        invocation.signal.addEventListener("abort", abort, { once: true });
        detach = () => invocation.signal!.removeEventListener("abort", abort);
        if (invocation.signal.aborted) controller.abort();
      }
      controllers.set(requestId, controller);
      if (controller.signal.aborted) {
        cleanupReason = "cancelled";
        return rejected("cancelled");
      }
      const authorization = Object.freeze({
        requestId,
        capability: descriptor,
        activation: state.manifest.activation,
        consent: state.manifest.consent,
        execution: state.manifest.execution,
        sensitivity: state.manifest.sensitivity,
        permissions: state.manifest.permissions,
        entitlements: state.manifest.entitlements,
        request,
      });
      let authorized = false;
      try {
        authorized =
          (await withDeadline(
            Promise.resolve().then(() => options.authorize(authorization)),
            effective.maxDurationMs,
            controller,
          )) === true;
      } catch (error) {
        if (error instanceof CapabilityRuntimeError) throw error;
        authorized = false;
      }
      if (!authorized) {
        emitAudit(options.audit, "denied", operationId, descriptor, "policy-denied");
        return rejected("policy-denied");
      }
      if (closed) return rejected("closed");
      const permissionRequest = Object.freeze({
        requestId,
        capability: descriptor,
        permissions: state.manifest.permissions,
        entitlements: state.manifest.entitlements,
      });
      let permitted = false;
      try {
        permitted =
          (await withDeadline(
            Promise.resolve().then(() => options.ensurePermissions(permissionRequest)),
            effective.maxDurationMs,
            controller,
          )) === true;
      } catch (error) {
        if (error instanceof CapabilityRuntimeError) throw error;
        permitted = false;
      }
      if (!permitted) {
        emitAudit(options.audit, "denied", operationId, descriptor, "permission-denied");
        return rejected("permission-denied");
      }
      if (closed) return rejected("closed");
      if (controller.signal.aborted) {
        cleanupReason = "cancelled";
        return rejected("cancelled");
      }
      started = true;
      if (!emitAudit(options.audit, "started", operationId, descriptor)) {
        controller.abort();
        return rejected("audit-failed");
      }
      let eventCount = 0;
      const context = Object.freeze({
        requestId,
        request,
        signal: controller.signal,
        emit(event: JsonObject) {
          if (controller!.signal.aborted || failureOverride) return;
          if (++eventCount > effective.maxEventsPerCall) {
            failureOverride = "limit-exceeded";
            controller!.abort();
            return;
          }
          try {
            const owned = copyObject(event, callBudget!, "invalid-contract-event");
            validate(state!.manifest.eventSchema, owned, callBudget!, "invalid-contract-event");
            invocation.onEvent?.(owned);
            if (!emitAudit(options.audit, "event", operationId, descriptor)) {
              failureOverride = "audit-failed";
              controller!.abort();
            }
          } catch (error) {
            failureOverride = mapValidation(error, "invalid-event");
            controller!.abort();
          }
        },
        consume(work: number) {
          if (!Number.isSafeInteger(work) || work < 1)
            throw new CapabilityRuntimeError("provider-failed");
          callBudget!.spend(work);
        },
      });
      const outcome = await withDeadline(
        Promise.resolve().then(() => state!.invoke(context)),
        effective.maxDurationMs,
        controller,
      );
      if (failureOverride) return rejected(failureOverride);
      if (controller.signal.aborted) {
        cleanupReason = invocation.signal?.aborted || closed ? "cancelled" : "timed-out";
        return rejected(cleanupReason === "timed-out" ? "timed-out" : "cancelled");
      }
      const result = object(outcome, "adapter-failed");
      keys(result, ["kind", "value", "error"], "adapter-failed");
      if (
        result.kind === "result" &&
        Object.hasOwn(result, "value") &&
        !Object.hasOwn(result, "error")
      ) {
        let owned: JsonObject;
        try {
          owned = copyObject(result.value, callBudget, "invalid-contract-model");
          validate(state.manifest.resultSchema, owned, callBudget, "invalid-contract-model");
        } catch (error) {
          return rejected(mapValidation(error, "invalid-result"));
        }
        cleanupReason = "completed";
        if (!emitAudit(options.audit, "succeeded", operationId, descriptor))
          return rejected("audit-failed");
        return Object.freeze({ kind: "result", value: owned });
      }
      if (
        result.kind === "error" &&
        Object.hasOwn(result, "error") &&
        !Object.hasOwn(result, "value")
      ) {
        let owned: JsonObject;
        try {
          owned = copyObject(result.error, callBudget, "invalid-contract-model");
          validate(state.manifest.errorSchema, owned, callBudget, "invalid-contract-model");
        } catch (error) {
          return rejected(mapValidation(error, "invalid-provider-error"));
        }
        cleanupReason = "provider-error";
        if (!emitAudit(options.audit, "provider-error", operationId, descriptor))
          return rejected("audit-failed");
        return Object.freeze({ kind: "provider-error", error: owned });
      }
      return rejected("provider-failed");
    } catch (error) {
      const code = failureOverride ?? mapRuntime(error);
      cleanupReason = code === "cancelled" || code === "timed-out" ? code : "failed";
      if (state)
        emitAudit(
          options.audit,
          code === "cancelled" ? "cancelled" : "failed",
          operationId,
          state.manifest.descriptor,
          code,
        );
      return rejected(code);
    } finally {
      detach();
      if (controller) controllers.delete(requestId);
      if (started && state && controller) {
        const cleaned = await cleanup(state, requestId, cleanupReason);
        emitAudit(
          options.audit,
          "cleanup",
          operationId,
          state.manifest.descriptor,
          cleaned ? undefined : "cleanup-failed",
        );
      }
      if (reserved) active--;
    }
  };

  const invoke = (invocation: CapabilityInvocation): Promise<CapabilityResult> => {
    if (closed) return Promise.resolve(rejected("closed"));
    const task = run(invocation);
    pending.add(task);
    void task.then(
      () => pending.delete(task),
      () => pending.delete(task),
    );
    return task;
  };

  return Object.freeze({
    invoke,
    async close() {
      if (closed) return;
      closed = true;
      for (const controller of controllers.values()) controller.abort();
      await Promise.allSettled([...pending]);
    },
  });
}

/** Stable local setup failure; messages never include manifest or callback values. */
export class CapabilitySetupError extends TypeError {
  constructor(readonly code: "invalid-provider" | "invalid-registry" | "invalid-broker") {
    super(code);
    this.name = "CapabilitySetupError";
  }
}

class CapabilityRuntimeError extends Error {
  constructor(readonly code: CapabilityErrorCode) {
    super(code);
  }
}

class CumulativeBudget extends Budget {
  constructor(
    limits: CapabilityLimits,
    private readonly usage: { values: number; strings: number; work: number },
  ) {
    super(limits);
  }
  override spend(work = 1): void {
    super.spend(work);
    this.usage.work += work;
    if (this.usage.work > (this.limits as CapabilityLimits).maxSessionWork) {
      throw new CapabilityRuntimeError("limit-exceeded");
    }
  }
  override value(depth: number): void {
    super.value(depth);
    this.usage.values++;
    if (this.usage.values > (this.limits as CapabilityLimits).maxSessionValues) {
      throw new CapabilityRuntimeError("limit-exceeded");
    }
  }
  override string(length: number): void {
    super.string(length);
    this.usage.strings += length;
    if (this.usage.strings > (this.limits as CapabilityLimits).maxSessionStringCodeUnits) {
      throw new CapabilityRuntimeError("limit-exceeded");
    }
  }
}

function parseManifest(input: unknown, allowReserved: boolean): CapabilityManifest {
  const value = object(
    copyObject(
      input,
      new Budget({
        maxDepth: 32,
        maxValues: 8_192,
        maxStringCodeUnits: 131_072,
        maxWork: 524_288,
      }),
      "invalid-registration",
    ),
    "invalid-registration",
  );
  keys(value, MANIFEST_KEYS, "invalid-registration");
  if (value.manifestVersion !== CAPABILITY_MANIFEST_VERSION) throw new Error();
  const descriptor = parseDescriptor(value.descriptor, allowReserved);
  const requestSchema = parseSchema(value.requestSchema);
  const resultSchema = parseSchema(value.resultSchema);
  const eventSchema = parseSchema(value.eventSchema);
  const errorSchema = parseSchema(value.errorSchema);
  if (!Array.isArray(value.platforms) || value.platforms.length < 1 || value.platforms.length > 16)
    throw new Error();
  const platformKeys = new Set<string>();
  const platforms = Object.freeze(
    value.platforms.map((entry) => {
      const item = object(entry, "invalid-registration");
      keys(
        item,
        ["platform", "minimumOsVersion", "maximumOsVersion", "provider"],
        "invalid-registration",
      );
      const platform = parsePlatform(item.platform);
      const minimumOsVersion = parseOsVersion(item.minimumOsVersion);
      const maximumOsVersion =
        item.maximumOsVersion === undefined ? undefined : parseOsVersion(item.maximumOsVersion);
      if (maximumOsVersion && compareOsVersions(minimumOsVersion, maximumOsVersion) > 0)
        throw new Error();
      const provider = boundedName(item.provider, 128);
      const key = `${platform}:${provider}`;
      if (platformKeys.has(key)) throw new Error();
      platformKeys.add(key);
      return Object.freeze({
        platform,
        minimumOsVersion,
        ...(maximumOsVersion ? { maximumOsVersion } : {}),
        provider,
      });
    }),
  );
  const permissions = parseNames(value.permissions, 32);
  const entitlements = parseNames(value.entitlements, 32);
  const sensitivity = parseNames(value.sensitivity, 10) as readonly CapabilitySensitivity[];
  if (sensitivity.some((entry) => !SENSITIVITY.has(entry))) throw new Error();
  const limits = parseCapabilityLimits(value.limits);
  if (!(["none", "user"] as unknown[]).includes(value.activation)) throw new Error();
  if (!(["none", "per-request"] as unknown[]).includes(value.consent)) throw new Error();
  if (!(["foreground", "foreground-or-background"] as unknown[]).includes(value.execution))
    throw new Error();
  if (!(["cooperative", "result-suppression"] as unknown[]).includes(value.cancellation))
    throw new Error();
  if (
    value.cleanup !== "always" ||
    !(["unavailable", "ordinary-mcp"] as unknown[]).includes(value.fallback)
  )
    throw new Error();
  const threatModel = boundedName(value.threatModel, 256);
  return Object.freeze({
    manifestVersion: "1",
    descriptor,
    requestSchema,
    resultSchema,
    eventSchema,
    errorSchema,
    platforms,
    permissions,
    entitlements,
    activation: value.activation as CapabilityManifest["activation"],
    consent: value.consent as CapabilityManifest["consent"],
    execution: value.execution as CapabilityManifest["execution"],
    sensitivity,
    limits,
    cancellation: value.cancellation as CapabilityManifest["cancellation"],
    cleanup: "always",
    fallback: value.fallback as CapabilityManifest["fallback"],
    threatModel,
  });
}

function parseDescriptor(input: unknown, allowReserved: boolean): CapabilityDescriptor {
  const value = object(input, "invalid-registration");
  keys(value, ["id", "version", "schemaRevision"], "invalid-registration");
  const id = boundedName(value.id, 192);
  const namespace = id.split("/")[0]!;
  if (
    !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)+\/[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(
      id,
    )
  )
    throw new Error();
  if (
    !allowReserved &&
    RESERVED_NAMESPACES.some((entry) => namespace === entry || namespace.startsWith(`${entry}.`))
  )
    throw new Error();
  if (
    typeof value.version !== "string" ||
    !/^(?:0|[1-9][0-9]{0,8})\.(?:0|[1-9][0-9]{0,8})\.(?:0|[1-9][0-9]{0,8})$/.test(value.version)
  )
    throw new Error();
  if (
    typeof value.schemaRevision !== "string" ||
    !/^sha256:[0-9a-f]{64}$/.test(value.schemaRevision)
  )
    throw new Error();
  return Object.freeze({ id, version: value.version, schemaRevision: value.schemaRevision });
}

function parseCapabilityLimits(input: unknown): CapabilityLimits {
  const value = object(input, "invalid-registration");
  keys(value, Object.keys(LIMIT_CEILINGS), "invalid-registration");
  const output: Record<string, number> = {};
  for (const key of Object.keys(LIMIT_CEILINGS) as (keyof CapabilityLimits)[]) {
    const entry = value[key];
    if (
      typeof entry !== "number" ||
      !Number.isSafeInteger(entry) ||
      entry < (key === "maxEventsPerCall" ? 0 : 1) ||
      entry > LIMIT_CEILINGS[key]
    )
      throw new Error();
    output[key] = entry;
  }
  if (
    output.maxSessionValues! < output.maxValues! ||
    output.maxSessionStringCodeUnits! < output.maxStringCodeUnits! ||
    output.maxSessionWork! < output.maxWork!
  )
    throw new Error();
  return Object.freeze(output) as unknown as CapabilityLimits;
}

function parseSettings(input: unknown): readonly CapabilityDescriptor[] {
  const value = object(
    copyObject(input, new Budget(CONTRACT_LIMITS), "invalid-registration"),
    "invalid-registration",
  );
  keys(value, ["bindingVersion", "capabilities"], "invalid-registration");
  if (
    value.bindingVersion !== CAPABILITY_BINDING_VERSION ||
    !Array.isArray(value.capabilities) ||
    value.capabilities.length > CAPABILITY_MAX_PROVIDERS
  )
    throw new Error();
  const result: CapabilityDescriptor[] = [];
  const seen = new Set<string>();
  for (const entry of value.capabilities) {
    const descriptor = parseDescriptor(entry, true);
    if (seen.has(identity(descriptor))) throw new Error();
    seen.add(identity(descriptor));
    result.push(descriptor);
  }
  return Object.freeze(result);
}

function parseNames(input: unknown, maximum: number): readonly string[] {
  if (!Array.isArray(input) || input.length > maximum) throw new Error();
  const result = input.map((entry) => boundedName(entry, 128));
  if (new Set(result).size !== result.length) throw new Error();
  return Object.freeze(result);
}

function boundedName(input: unknown, maximum: number): string {
  if (
    typeof input !== "string" ||
    input.length < 1 ||
    input.length > maximum ||
    !input.trim() ||
    /[\u0000-\u001f\u007f]/.test(input)
  )
    throw new Error();
  return input;
}

function parsePlatform(value: unknown): CapabilityPlatform {
  if (!(["android", "ios", "macos", "tvos", "visionos"] as unknown[]).includes(value))
    throw new Error();
  return value as CapabilityPlatform;
}

function parseOsVersion(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^(?:0|[1-9][0-9]{0,3})(?:\.(?:0|[1-9][0-9]{0,3})){0,2}$/.test(value)
  )
    throw new Error();
  return value;
}

function parseRequestId(value: unknown): string {
  const id = boundedName(value, 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id))
    throw new CapabilityRuntimeError("invalid-request");
  return id;
}

function compareOsVersions(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function supports(
  manifest: CapabilityManifest,
  platform: CapabilityPlatform,
  version: string,
): boolean {
  return manifest.platforms.some(
    (entry) =>
      entry.platform === platform &&
      compareOsVersions(version, entry.minimumOsVersion) >= 0 &&
      (entry.maximumOsVersion === undefined ||
        compareOsVersions(version, entry.maximumOsVersion) <= 0),
  );
}

function identity(descriptor: CapabilityDescriptor): string {
  return `${descriptor.id}@${descriptor.version}`;
}

function sameDescriptor(left: CapabilityDescriptor, right: CapabilityDescriptor): boolean {
  return (
    left.id === right.id &&
    left.version === right.version &&
    left.schemaRevision === right.schemaRevision
  );
}

function fallback(
  reason: Extract<CapabilityNegotiation, { kind: "fallback" }>["reason"],
): CapabilityNegotiation {
  return Object.freeze({ kind: "fallback", reason });
}

function rejected(code: CapabilityErrorCode): CapabilityResult {
  return Object.freeze({ kind: "capability-error", code });
}

function isAbortSignal(value: unknown): value is CapabilityAbortSignal {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as CapabilityAbortSignal).aborted === "boolean" &&
    typeof (value as CapabilityAbortSignal).addEventListener === "function" &&
    typeof (value as CapabilityAbortSignal).removeEventListener === "function"
  );
}

function emitAudit(
  callback: CapabilityBrokerOptions["audit"],
  phase: CapabilityAuditEvent["phase"],
  operationId: string,
  descriptor: CapabilityDescriptor,
  code?: CapabilityErrorCode,
): boolean {
  try {
    callback(
      Object.freeze({
        phase,
        operationId,
        capabilityId: descriptor.id,
        capabilityVersion: descriptor.version,
        ...(code ? { code } : {}),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

async function withDeadline<T>(
  promise: Promise<T>,
  milliseconds: number,
  controller: CapabilityAbortController,
): Promise<T> {
  const timers = getTimers();
  let timer: unknown;
  let timedOut = false;
  let rejectAbort: ((error: CapabilityRuntimeError) => void) | undefined;
  const onAbort = () =>
    rejectAbort?.(new CapabilityRuntimeError(timedOut ? "timed-out" : "cancelled"));
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
    controller.signal.addEventListener("abort", onAbort, { once: true });
  });
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = timers.setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new CapabilityRuntimeError("timed-out"));
    }, milliseconds);
  });
  try {
    return await Promise.race([promise, timeout, aborted]);
  } finally {
    controller.signal.removeEventListener("abort", onAbort);
    if (timer !== undefined) timers.clearTimeout(timer);
  }
}

async function cleanup(
  state: ProviderState,
  requestId: string,
  reason: CapabilityCleanupReason,
): Promise<boolean> {
  const controller = createAbortController();
  try {
    await withDeadline(
      Promise.resolve().then(() => state.cleanup(requestId, reason)),
      state.manifest.limits.maxCleanupMs,
      controller,
    );
    return true;
  } catch {
    return false;
  }
}

function createAbortController(): CapabilityAbortController {
  const Constructor = (
    globalThis as typeof globalThis & {
      readonly AbortController?: new () => CapabilityAbortController;
    }
  ).AbortController;
  if (!Constructor) throw new CapabilityRuntimeError("provider-failed");
  return new Constructor();
}

function getTimers(): {
  readonly setTimeout: (callback: () => void, milliseconds: number) => unknown;
  readonly clearTimeout: (timer: unknown) => void;
} {
  const runtime = globalThis as typeof globalThis & {
    readonly setTimeout?: (callback: () => void, milliseconds: number) => unknown;
    readonly clearTimeout?: (timer: unknown) => void;
  };
  if (!runtime.setTimeout || !runtime.clearTimeout) {
    throw new CapabilityRuntimeError("provider-failed");
  }
  return { setTimeout: runtime.setTimeout, clearTimeout: runtime.clearTimeout };
}

function mapValidation(error: unknown, fallbackCode: CapabilityErrorCode): CapabilityErrorCode {
  if (error instanceof CapabilityRuntimeError) return error.code;
  if (error instanceof ContractError && error.code === "contract-limit-exceeded")
    return "limit-exceeded";
  return fallbackCode;
}

function mapRuntime(error: unknown): CapabilityErrorCode {
  if (error instanceof CapabilityRuntimeError) return error.code;
  if (error instanceof ContractError) {
    if (error.code === "contract-limit-exceeded") return "limit-exceeded";
    if (error.code === "invalid-contract-input") return "invalid-request";
    if (error.code === "invalid-contract-event") return "invalid-event";
    if (error.code === "invalid-contract-model") return "invalid-result";
  }
  return "provider-failed";
}
