import type { JsonObject } from "@mcp-native/core";
import type { McpNativeHostAbortSignal } from "./controller.js";
import { ContractHostController } from "./contract-controller.js";
import type { ContractDataResult } from "./contracts.js";
import {
  Budget,
  ContractError,
  copyObject,
  fail,
  parseLimits,
  validate,
  type ContractLimits,
} from "./contracts-schema.js";
import {
  authorizationReviews,
  createContractActionAuthorization,
  type ContractActionAuthorization,
  type ContractActionRequest,
} from "./contract-actions.js";
import {
  nativeRegistries,
  type ContractNativeRegistry,
  type ContractNativeRendererProps,
} from "./contracts-native-registry.js";

interface SurfaceAbortController {
  readonly signal: McpNativeHostAbortSignal;
  abort(): void;
}
const platform = globalThis as unknown as {
  AbortController: new () => SurfaceAbortController;
  setTimeout(callback: () => void, milliseconds: number): unknown;
  clearTimeout(timer: unknown): void;
};

export type ContractEventOutcome =
  | { readonly kind: "delivered" }
  | {
      readonly kind: "rejected";
      readonly code:
        | "denied"
        | "invalid-event"
        | "stale"
        | "busy"
        | "limit-exceeded"
        | "delivery-failed"
        | "timeout";
    };
export interface ContractNativeProviderOptions {
  readonly nativeRegistry?: ContractNativeRegistry;
  readonly authorization?: ContractActionAuthorization;
  readonly onEvent?: (request: ContractActionRequest) => void | Promise<void>;
  readonly surfaceLimits?: Partial<ContractLimits>;
  /** Can only lower the 30-second review/delivery deadline. */
  readonly eventTimeoutMs?: number;
}
const rejected = (
  code: Extract<ContractEventOutcome, { kind: "rejected" }>["code"],
): ContractEventOutcome => Object.freeze({ kind: "rejected", code });
interface Lifetime {
  readonly budget: Budget;
  attempts: number;
  exhausted: boolean;
}

/** Private mount leases: data alone never grants rendering or event authority. */
export class ContractSurfaceRuntime {
  readonly #controller: ContractHostController;
  readonly #registry: NonNullable<ReturnType<typeof nativeRegistries.get>>;
  readonly #authorization: ContractActionAuthorization;
  readonly #onEvent: ContractNativeProviderOptions["onEvent"];
  readonly #limits: ContractLimits;
  readonly #timeout: number;
  readonly #lifetimes = new WeakMap<ContractDataResult, Lifetime>();
  readonly #pending = new Set<Promise<unknown>>();
  #active: object | undefined;
  #disposed = false;
  #revoke: (() => void) | undefined;

  constructor(controller: ContractHostController, options: ContractNativeProviderOptions) {
    const registry = options.nativeRegistry && nativeRegistries.get(options.nativeRegistry);
    if (!registry || controller.registry !== options.nativeRegistry?.registry)
      fail("invalid-registry");
    const authorization = options.authorization ?? createContractActionAuthorization();
    if (!authorizationReviews.has(authorization)) fail("invalid-registration");
    if (options.onEvent !== undefined && typeof options.onEvent !== "function")
      fail("invalid-registration");
    const timeout = options.eventTimeoutMs ?? 30_000;
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 30_000)
      fail("invalid-registration");
    this.#controller = controller;
    this.#registry = registry;
    this.#authorization = authorization;
    this.#onEvent = options.onEvent;
    this.#limits = parseLimits(options.surfaceLimits ?? {});
    this.#timeout = timeout;
  }

  dispose(): void {
    this.#disposed = true;
    this.#revoke?.();
  }

  createLease(result: ContractDataResult) {
    if (this.#disposed || !this.#controller.isCurrentResult(result)) fail("invalid-contract-model");
    const state = [...this.#registry.values()].find(
      (entry) => entry.adapter.descriptor === result.descriptor,
    );
    if (!state) fail("invalid-registration");
    let lifetime = this.#lifetimes.get(result);
    if (!lifetime) {
      const limits = Object.fromEntries(
        Object.keys(this.#limits).map((key) => [
          key,
          Math.min(
            this.#limits[key as keyof ContractLimits],
            state.adapter.limits[key as keyof ContractLimits],
          ),
        ]),
      ) as unknown as ContractLimits;
      lifetime = { budget: new Budget(limits), attempts: 0, exhausted: false };
      this.#lifetimes.set(result, lifetime);
    }
    const allowance = lifetime;
    const token = {};
    let mounted = false;
    let revoked = false;
    let failed = false;
    let abort: SurfaceAbortController | undefined;
    let unsubscribe: (() => void) | undefined;
    const current = () =>
      mounted &&
      !failed &&
      !this.#disposed &&
      this.#active === token &&
      this.#controller.isCurrentResult(result);
    const revoke = () => {
      revoked = true;
      mounted = false;
      abort?.abort();
      unsubscribe?.();
      unsubscribe = undefined;
      if (this.#active === token) {
        this.#active = undefined;
        this.#revoke = undefined;
      }
    };
    const consume = (work: number) => {
      // Initial render may charge before activation; cleanup permanently revokes that render
      // unless React reactivates this same lease during its Strict Mode effect replay.
      if (revoked || failed || this.#disposed || !this.#controller.isCurrentResult(result))
        fail("cancelled");
      if (allowance.exhausted || !Number.isSafeInteger(work) || work < 1) {
        allowance.exhausted = true;
        fail("contract-limit-exceeded");
      }
      try {
        allowance.budget.spend(work);
      } catch {
        allowance.exhausted = true;
        throw new ContractError("contract-limit-exceeded");
      }
    };
    const dispatchEvent = async (event: JsonObject): Promise<ContractEventOutcome> => {
      if (!current()) return rejected("stale");
      if (abort || this.#pending.size >= 8) return rejected("busy");
      if (!state.adapter.eventSchema || !this.#onEvent) return rejected("denied");
      if (allowance.exhausted || ++allowance.attempts > 128) return rejected("limit-exceeded");
      let owned: JsonObject;
      try {
        owned = copyObject(event, allowance.budget, "invalid-contract-event");
        validate(state.adapter.eventSchema, owned, allowance.budget, "invalid-contract-event");
      } catch (error) {
        if (error instanceof ContractError && error.code === "contract-limit-exceeded") {
          allowance.exhausted = true;
          return rejected("limit-exceeded");
        }
        return rejected("invalid-event");
      }
      const operation = new platform.AbortController();
      abort = operation;
      const request: ContractActionRequest = Object.freeze({
        kind: "contract",
        descriptor: result.descriptor,
        model: result.model,
        event: owned,
        signal: operation.signal,
      });
      const raw = Promise.resolve().then(async (): Promise<ContractEventOutcome> => {
        if (!current() || operation.signal.aborted) return rejected("stale");
        if (!(await authorizationReviews.get(this.#authorization)!(request)))
          return rejected("denied");
        if (!current() || operation.signal.aborted) return rejected("stale");
        try {
          await this.#onEvent!(request);
        } catch {
          return rejected("delivery-failed");
        }
        return current() && !operation.signal.aborted
          ? Object.freeze({ kind: "delivered" })
          : rejected("stale");
      });
      this.#pending.add(raw);
      void raw.then(
        () => this.#pending.delete(raw),
        () => this.#pending.delete(raw),
      );
      let timer: unknown;
      let onAbort: () => void = () => {};
      const interrupted = new Promise<ContractEventOutcome>((resolve) => {
        onAbort = () => resolve(rejected("stale"));
        operation.signal.addEventListener("abort", onAbort, { once: true });
        timer = platform.setTimeout(() => {
          resolve(rejected("timeout"));
          operation.abort();
        }, this.#timeout);
      });
      try {
        return await Promise.race([raw, interrupted]);
      } finally {
        platform.clearTimeout(timer);
        operation.signal.removeEventListener("abort", onAbort);
        if (abort === operation) abort = undefined;
      }
    };
    const props: ContractNativeRendererProps = Object.freeze({
      model: result.model,
      dispatchEvent,
      consume,
    });
    return Object.freeze({
      component: state.component,
      props,
      activate: () => {
        if (
          failed ||
          this.#disposed ||
          !this.#controller.isCurrentResult(result) ||
          (this.#active && this.#active !== token)
        )
          fail("invalid-registration");
        this.#active = token;
        this.#revoke = revoke;
        revoked = false;
        mounted = true;
        unsubscribe = this.#controller.subscribe(() => {
          if (!this.#controller.isCurrentResult(result)) revoke();
        });
        return revoke;
      },
      fail: () => {
        failed = true;
        revoke();
      },
    });
  }
}
