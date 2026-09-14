import type { JsonObject, McpExtensionSettings, McpListToolsResult } from "@mcp-native/core";
import {
  McpNativeHostControllerError,
  type McpNativeHostCallState,
  type McpNativeHostConnection,
  type McpNativeHostControllerOptions,
  type McpNativeHostRequestOptions,
  type McpNativeHostSnapshot,
} from "./controller.js";
import { HostControllerEngine } from "./controller-engine.js";
import {
  isContractRegistry,
  resolveContractResult,
  type ContractRegistry,
  type ContractResult,
} from "./contracts.js";
import { fail, keys, object, parseLimits, type ContractLimits } from "./contracts-schema.js";

export type ContractHostCallState =
  | Exclude<McpNativeHostCallState, { readonly kind: "resolved" }>
  | { readonly kind: "resolved"; readonly result: ContractResult };

export interface ContractHostSnapshot extends Omit<McpNativeHostSnapshot, "call"> {
  readonly call: ContractHostCallState;
}

export type ContractHostControllerOptions = Omit<
  McpNativeHostControllerOptions,
  "createConnection"
> & {
  readonly registry: ContractRegistry;
  readonly limits?: Partial<ContractLimits>;
  /** Use this frozen map for both SDK advertising and its adapter. Return a fresh client/unit each time. */
  readonly createConnection: (extensionSettings: McpExtensionSettings) => McpNativeHostConnection;
};

/** Own connection, discovery, cancellation, and one current result for an immutable contract registry. */
export class ContractHostController {
  readonly #engine: HostControllerEngine<ContractResult>;
  readonly #registry: ContractRegistry;

  constructor(options: ContractHostControllerOptions) {
    const value = object(options, "invalid-registration");
    keys(
      value,
      [
        "registry",
        "limits",
        "createConnection",
        "a2uiParseOptions",
        "classifyError",
        "diagnostics",
        "timeoutMs",
        "closeTimeoutMs",
        "maxAttempts",
        "initialBackoffMs",
        "maxBackoffMs",
        "backoffMultiplier",
        "now",
        "wait",
        "initiallyOnline",
      ],
      "invalid-registration",
    );
    const { registry, limits: hostLimits, createConnection, ...lifecycleOptions } = options;
    if (!isContractRegistry(registry)) fail("invalid-registry");
    if (typeof createConnection !== "function") fail("invalid-registration");
    const resolvedLimits = parseLimits(hostLimits === undefined ? {} : hostLimits);
    this.#registry = registry;
    const units = new WeakSet<object>();
    const clients = new WeakSet<object>();
    this.#engine = new HostControllerEngine(
      {
        ...lifecycleOptions,
        createConnection() {
          const unit = createConnection(registry.extensionSettings);
          if (
            unit === null ||
            typeof unit !== "object" ||
            unit.client === null ||
            typeof unit.client !== "object" ||
            units.has(unit) ||
            clients.has(unit.client)
          )
            throw new McpNativeHostControllerError("invalid-connection");
          units.add(unit);
          clients.add(unit.client);
          return unit;
        },
      },
      (request, signal) =>
        resolveContractResult({ ...request, registry, limits: resolvedLimits, signal }),
    );
  }

  get registry(): ContractRegistry {
    return this.#registry;
  }
  getSnapshot = (): ContractHostSnapshot => this.#engine.getSnapshot();
  subscribe(listener: () => void): () => void {
    return this.#engine.subscribe(listener);
  }
  start(): Promise<void> {
    return this.#engine.start();
  }
  retry(): Promise<void> {
    return this.#engine.retry();
  }
  setOnline(online: boolean): Promise<void> {
    return this.#engine.setOnline(online);
  }
  refreshTools(options: McpNativeHostRequestOptions = {}): Promise<McpListToolsResult> {
    return this.#engine.refreshTools(options);
  }
  callTool(
    name: string,
    arguments_: JsonObject = {},
    options: McpNativeHostRequestOptions = {},
  ): Promise<ContractResult> {
    return this.#engine.callTool(name, arguments_, options);
  }
  cancelCurrentCall(): boolean {
    return this.#engine.cancelCurrentCall();
  }
  /** Drop the controller's current result. Previously returned JSON remains inert readable data. */
  clearResult(): boolean {
    return this.#engine.clearResult();
  }
  /** Reference identity and live connection ownership, not structural equality or a capability grant. */
  isCurrentResult(result: ContractResult): boolean {
    return this.#engine.isCurrentResult(result);
  }
  /** Immediately drop results/listeners and revoke operations, then await bounded transport cleanup. */
  shutdown(): Promise<void> {
    return this.#engine.shutdown();
  }
}

export function createContractHostController(
  options: ContractHostControllerOptions,
): ContractHostController {
  return new ContractHostController(options);
}
