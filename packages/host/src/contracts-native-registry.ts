import type { ComponentType } from "react";
import type { JsonObject } from "@mcp-native/core";
import {
  createContractRegistry,
  type ContractAdapter,
  type ContractRegistry,
  type ContractRegistryOptions,
} from "./contracts.js";
import { adapters, type AdapterState } from "./contract-registry-state.js";
import { fail, keys, object } from "./contracts-schema.js";
import type { ContractEventOutcome } from "./contract-surface-runtime.js";

export interface ContractRenderBudget {
  /** Charge cumulative work within this render attempt; a failed charge stays failed. */
  readonly consume: (work: number) => void;
}
export interface ContractNativeRendererProps {
  readonly model: JsonObject;
  readonly dispatchEvent: (event: JsonObject) => Promise<ContractEventOutcome>;
  /** Create once per render invocation and share across that invocation's traversal. Never memoize. */
  readonly createRenderBudget: () => ContractRenderBudget;
}
export interface ContractNativeRegistrationOptions {
  readonly adapter: ContractAdapter;
  readonly component: ComponentType<ContractNativeRendererProps>;
}
export interface ContractNativeRegistration {
  readonly adapter: ContractAdapter;
}
export interface ContractNativeRegistry {
  readonly registry: ContractRegistry;
}
interface NativeState {
  readonly adapter: AdapterState;
  readonly component: ComponentType<ContractNativeRendererProps>;
}
const registrations = new WeakMap<ContractNativeRegistration, NativeState>();
export const nativeRegistries = new WeakMap<
  ContractNativeRegistry,
  ReadonlyMap<AdapterState, NativeState>
>();

export function createContractNativeRegistration(
  options: ContractNativeRegistrationOptions,
): ContractNativeRegistration {
  const value = object(options, "invalid-registration");
  keys(value, ["adapter", "component"], "invalid-registration");
  const state = adapters.get(options.adapter);
  if (!state || typeof options.component !== "function") fail("invalid-registration");
  const registration = Object.freeze({ adapter: options.adapter });
  registrations.set(registration, Object.freeze({ adapter: state, component: options.component }));
  return registration;
}

/** Advertise only adapters with an explicitly installed compiled renderer. */
export function createContractNativeRegistry(
  installed: readonly ContractNativeRegistration[],
  options: ContractRegistryOptions = {},
): ContractNativeRegistry {
  if (!Array.isArray(installed) || installed.length > 32) fail("invalid-registry");
  const states = new Map<AdapterState, NativeState>();
  const dataAdapters: ContractAdapter[] = [];
  for (const registration of installed) {
    const state = registrations.get(registration);
    if (!state || states.has(state.adapter)) fail("invalid-registry");
    states.set(state.adapter, state);
    dataAdapters.push(registration.adapter);
  }
  const registry = Object.freeze({ registry: createContractRegistry(dataAdapters, options) });
  nativeRegistries.set(registry, states);
  return registry;
}
