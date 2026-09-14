import type {
  ContractAdapter,
  ContractAdapterOptions,
  ContractDescriptor,
  ContractRegistry,
} from "./contracts.js";
import type { ContractLimits, ContractSchema } from "./contracts-schema.js";

export interface AdapterState {
  readonly descriptor: ContractDescriptor;
  readonly inputSchema: ContractSchema;
  readonly modelSchema: ContractSchema;
  readonly eventSchema?: ContractSchema;
  readonly limits: ContractLimits;
  readonly prepare: ContractAdapterOptions["prepare"];
}

// Package-private identities; no public subpath exposes these maps.
export const adapters = new WeakMap<ContractAdapter, AdapterState>();
export const registries = new WeakMap<ContractRegistry, ReadonlyMap<string, AdapterState>>();
