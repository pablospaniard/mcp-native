/* eslint-disable no-control-regex -- Reject control characters in local review evidence. */
import type { JsonObject, JsonValue } from "@mcp-native/core";
import {
  createContractAdapter,
  parseContractDescriptor,
  type ContractAdapter,
  type ContractAdapterOptions,
  type ContractDescriptor,
} from "./contracts.js";
import { adapters } from "./contract-registry-state.js";
import { Budget, copyObject, fail, keys, object } from "./contracts-schema.js";

export interface ReviewedStandardBinding {
  readonly extensionId: string;
  /** Exact settings required from both peers; no subset or version-range matching. */
  readonly settings: JsonObject;
  readonly resultMetaKey: string;
  /** Exact object required at result._meta[resultMetaKey]. */
  readonly resultMeta: JsonObject;
}
export interface ReviewedStandardEvidence {
  /** Host-reviewed specification location and exact upstream revision; never fetched by the host. */
  readonly specification: string;
  readonly revision: string;
  readonly review: string;
  readonly fixtures: string;
  readonly exclusions: readonly string[];
}
export interface ReviewedStandardProfile {
  readonly manifestVersion: "1";
  readonly descriptor: ContractDescriptor;
  readonly binding: ReviewedStandardBinding;
  readonly evidence: ReviewedStandardEvidence;
  readonly responsibilities: {
    readonly recognition: "exact-result-metadata";
    readonly validation: "closed-input-model-event-schemas";
    readonly resources: "none";
    readonly rendering: "compiled-native-registration";
    readonly actions: "schema-and-host-authorization";
    readonly lifecycle: "controller-and-private-mount-lease";
    readonly fallback: "unnegotiated-inert-selected-failure-closed";
  };
}
export interface ReviewedStandardAdapterOptions extends ContractAdapterOptions {
  readonly binding: ReviewedStandardBinding;
  readonly evidence: ReviewedStandardEvidence;
}
/** A local review attestation, not library certification of an upstream standard or callback. */
export interface ReviewedStandardAdapter extends ContractAdapter {
  readonly profile: ReviewedStandardProfile;
}

/** Install a locally reviewed inline JSON profile. No recognizer, resource, or policy callbacks. */
export function createReviewedStandardAdapter(
  options: ReviewedStandardAdapterOptions,
): ReviewedStandardAdapter {
  try {
    keys(
      object(options, "invalid-registration"),
      [
        "descriptor",
        "inputSchema",
        "modelSchema",
        "eventSchema",
        "limits",
        "prepare",
        "binding",
        "evidence",
      ],
      "invalid-registration",
    );
    const owned = copyObject(
      { binding: options.binding, evidence: options.evidence },
      new Budget({
        maxDepth: 16,
        maxValues: 1024,
        maxStringCodeUnits: 8192,
        maxWork: 32768,
      }),
      "invalid-registration",
    );
    const binding = object(owned.binding, "invalid-registration");
    keys(
      binding,
      ["extensionId", "settings", "resultMetaKey", "resultMeta"],
      "invalid-registration",
    );
    // Reuse the bounded namespaced grammar and all reserved namespace exclusions.
    for (const id of [binding.extensionId, binding.resultMetaKey])
      parseContractDescriptor({ ...options.descriptor, id });
    for (const value of [binding.settings, binding.resultMeta]) {
      if (Object.keys(object(value, "invalid-registration")).length === 0)
        fail("invalid-registration");
    }
    const evidence = object(owned.evidence, "invalid-registration");
    keys(
      evidence,
      ["specification", "revision", "review", "fixtures", "exclusions"],
      "invalid-registration",
    );
    for (const key of ["specification", "revision", "review", "fixtures"]) {
      const value = evidence[key];
      if (
        typeof value !== "string" ||
        value.length < 1 ||
        value.length > 512 ||
        !value.trim() ||
        /[\u0000-\u001f\u007f]/.test(value)
      )
        fail("invalid-registration");
    }
    if (
      !/^(?:sha256:[0-9a-f]{64}|[0-9a-f]{40}|[0-9]{4}-[0-9]{2}-[0-9]{2}|v?(?:0|[1-9][0-9]{0,8})\.(?:0|[1-9][0-9]{0,8})\.(?:0|[1-9][0-9]{0,8}))$/.test(
        evidence.revision as string,
      )
    )
      fail("invalid-registration");
    if (
      !Array.isArray(evidence.exclusions) ||
      evidence.exclusions.length < 1 ||
      evidence.exclusions.length > 16 ||
      evidence.exclusions.some(
        (value) =>
          typeof value !== "string" ||
          !value.trim() ||
          value.length > 512 ||
          /[\u0000-\u001f\u007f]/.test(value),
      )
    )
      fail("invalid-registration");
    const base = createContractAdapter({
      descriptor: options.descriptor,
      inputSchema: options.inputSchema,
      modelSchema: options.modelSchema,
      ...(options.eventSchema === undefined ? {} : { eventSchema: options.eventSchema }),
      ...(options.limits === undefined ? {} : { limits: options.limits }),
      prepare: options.prepare,
    });
    const state = adapters.get(base)!;
    const profile: ReviewedStandardProfile = Object.freeze({
      manifestVersion: "1",
      descriptor: state.descriptor,
      binding: binding as unknown as ReviewedStandardBinding,
      evidence: evidence as unknown as ReviewedStandardEvidence,
      responsibilities: Object.freeze({
        recognition: "exact-result-metadata",
        validation: "closed-input-model-event-schemas",
        resources: "none",
        rendering: "compiled-native-registration",
        actions: "schema-and-host-authorization",
        lifecycle: "controller-and-private-mount-lease",
        fallback: "unnegotiated-inert-selected-failure-closed",
      }),
    });
    const adapter = Object.freeze({ descriptor: state.descriptor, profile });
    adapters.set(adapter, Object.freeze({ ...state, reviewed: profile }));
    return adapter;
  } catch {
    fail("invalid-registration");
  }
}

/** Compare owned JSON without sorting or serializing; caller supplies one cumulative selection budget. */
export function equalStandardJson(left: JsonValue, right: JsonValue, budget: Budget): boolean {
  budget.spend();
  if (left === right) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object")
    return false;
  if (Array.isArray(left)) {
    if (!Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, i) => equalStandardJson(value, right[i]!, budget));
  }
  if (Array.isArray(right)) return false;
  const names = Object.keys(left);
  if (names.length !== Object.keys(right).length) return false;
  return names.every((name) => {
    budget.spend(name.length);
    return (
      Object.hasOwn(right, name) &&
      equalStandardJson((left as JsonObject)[name]!, (right as JsonObject)[name]!, budget)
    );
  });
}
