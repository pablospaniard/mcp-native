import {
  validateA2uiV1SurfaceState,
  type SurfaceState,
  type SurfaceValidationPolicy,
} from "@mcp-native/a2ui";
import {
  McpAppsBridge,
  isMcpAppsBridgeBinding,
  isMcpAppsNativeSandboxConfiguration,
  type McpAppsNativeSandboxConfiguration,
  type McpAppsResource,
} from "@mcp-native/webview";

export const MCP_NATIVE_MIXED_MAX_REGIONS = 32;
export const MCP_NATIVE_MIXED_MAX_LISTENERS = 64;

export type McpNativeMixedSurfaceKind = "a2ui" | "mcp-app";
export type McpNativeMixedSurfaceActivity = "background" | "foreground";
export type McpNativeMixedSurfaceVisibility = "hidden" | "visible";
export type McpNativeMixedSurfaceStatus = "cancelled" | "crashed" | "ready" | "starting";
export type McpNativeMixedSurfaceMemoryPressure = "critical" | "moderate";
export type McpNativeMixedSurfaceOrientation =
  | "landscape-left"
  | "landscape-right"
  | "portrait"
  | "portrait-upside-down"
  | "unknown";

export interface McpNativeMixedSurfaceEnvironment {
  readonly dynamicTypeScale: number;
  readonly keyboardVisible: boolean;
  readonly orientation: McpNativeMixedSurfaceOrientation;
  readonly reducedMotion: boolean;
}

export interface McpNativeMixedSurfaceLifecycle {
  readonly onCreate?: () => void | Promise<void>;
  readonly onVisibilityChange?: (
    visibility: McpNativeMixedSurfaceVisibility,
  ) => void | Promise<void>;
  readonly onActivityChange?: (activity: McpNativeMixedSurfaceActivity) => void | Promise<void>;
  readonly onFocusChange?: (focused: boolean) => void | Promise<void>;
  readonly onEnvironmentChange?: (
    environment: McpNativeMixedSurfaceEnvironment,
  ) => void | Promise<void>;
  readonly onBack?: () => boolean | Promise<boolean>;
  readonly onCancel?: (reason?: string) => void | Promise<void>;
  readonly onCrash?: (error: unknown) => void | Promise<void>;
  readonly onRecover?: () => void | Promise<void>;
  readonly onMemoryPressure?: (
    pressure: McpNativeMixedSurfaceMemoryPressure,
  ) => void | Promise<void>;
  readonly onDispose?: () => void | Promise<void>;
}

interface McpNativeMixedSurfaceRegionBase {
  /** Host-authored stable identifier. Server surface IDs and resource URIs are not used here. */
  readonly id: string;
  readonly accessibilityLabel: string;
  readonly kind: McpNativeMixedSurfaceKind;
}

export interface McpNativeMixedA2uiRegion extends McpNativeMixedSurfaceRegionBase {
  readonly kind: "a2ui";
  /** Reconstructed and revalidated snapshot owned by this host registration. */
  readonly surface: SurfaceState;
}

export interface McpNativeMixedMcpAppsRegion extends McpNativeMixedSurfaceRegionBase {
  readonly kind: "mcp-app";
  readonly bridge: McpAppsBridge;
  /** Opaque sandbox created by `createMcpAppsNativeSandbox`. */
  readonly sandbox: McpAppsNativeSandboxConfiguration;
}

export type McpNativeMixedSurfaceRegion = McpNativeMixedA2uiRegion | McpNativeMixedMcpAppsRegion;

export interface CreateMcpNativeMixedA2uiRegionOptions {
  readonly id: string;
  readonly accessibilityLabel: string;
  readonly surface: SurfaceState;
  readonly policy: SurfaceValidationPolicy;
  readonly lifecycle?: McpNativeMixedSurfaceLifecycle;
}

export interface CreateMcpNativeMixedMcpAppsRegionOptions {
  readonly id: string;
  readonly accessibilityLabel: string;
  readonly resource: McpAppsResource;
  readonly sandbox: McpAppsNativeSandboxConfiguration;
  readonly bridge: McpAppsBridge;
  readonly lifecycle?: McpNativeMixedSurfaceLifecycle;
}

export interface McpNativeMixedSurfaceRegionSnapshot {
  readonly accessibilityLabel: string;
  /** Sibling order authored by the host; isolated WebViews retain their own accessibility tree. */
  readonly accessibilityOrder: number;
  readonly accessibilityTree: "isolated-webview" | "native";
  readonly focused: boolean;
  readonly id: string;
  readonly kind: McpNativeMixedSurfaceKind;
  readonly status: McpNativeMixedSurfaceStatus;
  readonly visibility: McpNativeMixedSurfaceVisibility;
}

export interface McpNativeMixedSurfaceSnapshot {
  readonly activity: McpNativeMixedSurfaceActivity;
  readonly disposed: boolean;
  readonly environment: McpNativeMixedSurfaceEnvironment;
  readonly focusedRegionId?: string;
  readonly regions: readonly McpNativeMixedSurfaceRegionSnapshot[];
  readonly started: boolean;
}

export interface McpNativeMixedSurfaceCoordinatorOptions {
  /** Factory-created, host-authored sibling regions in accessibility order. */
  readonly regions: readonly McpNativeMixedSurfaceRegion[];
  readonly initialActivity?: McpNativeMixedSurfaceActivity;
  readonly initialEnvironment?: Partial<McpNativeMixedSurfaceEnvironment>;
  readonly initialFocusedRegionId?: string;
  readonly initialVisibleRegionIds?: readonly string[];
}

interface MutableRegionState {
  status: McpNativeMixedSurfaceStatus;
  visibility: McpNativeMixedSurfaceVisibility;
}

const registeredRegions = new WeakSet<object>();
const coordinatedRegions = new WeakSet<object>();
const regionLifecycles = new WeakMap<object, McpNativeMixedSurfaceLifecycle>();

export class McpNativeMixedSurfaceError extends Error {
  readonly regionId: string | undefined;

  constructor(message: string, options?: ErrorOptions & { readonly regionId?: string }) {
    super(message, options);
    this.name = "McpNativeMixedSurfaceError";
    this.regionId = options?.regionId;
  }
}

/**
 * Creates one native sibling registration from a validated, host-policy-approved A2UI snapshot.
 * This factory has no WebView fields, so declarative A2UI data cannot create or configure a View.
 */
export function createMcpNativeMixedA2uiRegion(
  options: CreateMcpNativeMixedA2uiRegionOptions,
): McpNativeMixedA2uiRegion {
  expectFactoryOptions(options);
  const region = Object.freeze({
    id: expectRegionId(options.id),
    accessibilityLabel: expectAccessibilityLabel(options.accessibilityLabel),
    kind: "a2ui" as const,
    surface: validateA2uiV1SurfaceState(options.surface, options.policy),
  });
  registerRegion(region, options.lifecycle);
  return region;
}

/**
 * Creates one isolated MCP Apps sibling from an opaque sandbox, its exact resource, and bridge.
 * The server cannot select native WebView props or lifecycle callbacks through this boundary.
 */
export function createMcpNativeMixedMcpAppsRegion(
  options: CreateMcpNativeMixedMcpAppsRegionOptions,
): McpNativeMixedMcpAppsRegion {
  expectFactoryOptions(options);
  if (!isMcpAppsNativeSandboxConfiguration(options.sandbox)) {
    throw new McpNativeMixedSurfaceError(
      "Mixed MCP Apps regions require an opaque createMcpAppsNativeSandbox result",
    );
  }
  if (!(options.bridge instanceof McpAppsBridge)) {
    throw new McpNativeMixedSurfaceError("Mixed MCP Apps regions require an McpAppsBridge");
  }
  if (
    options.resource === null ||
    typeof options.resource !== "object" ||
    Array.isArray(options.resource) ||
    options.resource.uri !== options.sandbox.source.baseUrl
  ) {
    throw new McpNativeMixedSurfaceError(
      "Mixed MCP Apps resource URI must match the sandbox base URL",
    );
  }
  if (!isMcpAppsBridgeBinding(options.bridge, options.resource, options.sandbox)) {
    throw new McpNativeMixedSurfaceError(
      "Mixed MCP Apps regions require the exact resource, sandbox, and bridge binding",
    );
  }
  const region = Object.freeze({
    id: expectRegionId(options.id),
    accessibilityLabel: expectAccessibilityLabel(options.accessibilityLabel),
    kind: "mcp-app" as const,
    sandbox: options.sandbox,
    bridge: options.bridge,
  });
  registerRegion(region, options.lifecycle);
  return region;
}

/**
 * Serializes host lifecycle changes across fixed sibling regions. It does not parse a layout,
 * render a component, navigate a WebView, or forward messages between native and Apps regions.
 */
export class McpNativeMixedSurfaceCoordinator {
  readonly #regions: readonly McpNativeMixedSurfaceRegion[];
  readonly #regionsById: ReadonlyMap<string, McpNativeMixedSurfaceRegion>;
  readonly #states = new Map<string, MutableRegionState>();
  readonly #listeners = new Set<() => void>();
  #activity: McpNativeMixedSurfaceActivity;
  #environment: McpNativeMixedSurfaceEnvironment;
  #focusedRegionId: string | undefined;
  #started = false;
  #disposed = false;
  #operationTail: Promise<void> = Promise.resolve();
  #snapshot: McpNativeMixedSurfaceSnapshot;

  constructor(options: McpNativeMixedSurfaceCoordinatorOptions) {
    if (options === null || typeof options !== "object" || Array.isArray(options)) {
      throw new McpNativeMixedSurfaceError("Mixed surface coordinator options must be an object");
    }
    if (!Array.isArray(options.regions)) {
      throw new McpNativeMixedSurfaceError("Mixed surface regions must be an array");
    }
    if (options.regions.length === 0 || options.regions.length > MCP_NATIVE_MIXED_MAX_REGIONS) {
      throw new McpNativeMixedSurfaceError(
        `Mixed surface layouts require 1-${MCP_NATIVE_MIXED_MAX_REGIONS} regions`,
      );
    }

    const regions: McpNativeMixedSurfaceRegion[] = [];
    const byId = new Map<string, McpNativeMixedSurfaceRegion>();
    for (const [index, region] of options.regions.entries()) {
      if (
        region === null ||
        typeof region !== "object" ||
        !registeredRegions.has(region as object)
      ) {
        throw new McpNativeMixedSurfaceError(
          `Mixed surface region ${index} must come from a host registration factory`,
        );
      }
      if (byId.has(region.id)) {
        throw new McpNativeMixedSurfaceError(`Duplicate mixed surface region id: ${region.id}`);
      }
      if (coordinatedRegions.has(region)) {
        throw new McpNativeMixedSurfaceError(
          `Mixed surface region ${region.id} already belongs to a coordinator`,
        );
      }
      regions.push(region);
      byId.set(region.id, region);
      this.#states.set(region.id, { status: "starting", visibility: "hidden" });
    }
    this.#regions = Object.freeze(regions);
    this.#regionsById = byId;
    this.#activity = parseActivity(options.initialActivity ?? "foreground");
    this.#environment = createEnvironment(options.initialEnvironment);

    const visibleIds = parseRegionIds(
      options.initialVisibleRegionIds ?? this.#regions.map((region) => region.id),
      byId,
      "initialVisibleRegionIds",
    );
    for (const id of visibleIds) this.#states.get(id)!.visibility = "visible";

    if (options.initialFocusedRegionId !== undefined) {
      const focusId = expectKnownRegionId(options.initialFocusedRegionId, byId, "initial focus");
      if (this.#states.get(focusId)!.visibility !== "visible") {
        throw new McpNativeMixedSurfaceError("The initially focused region must be visible", {
          regionId: focusId,
        });
      }
      this.#focusedRegionId = focusId;
    }
    for (const region of regions) coordinatedRegions.add(region);
    this.#snapshot = this.#createSnapshot();
  }

  getSnapshot = (): McpNativeMixedSurfaceSnapshot => this.#snapshot;

  getRegion(id: string): McpNativeMixedSurfaceRegion | undefined {
    return this.#regionsById.get(id);
  }

  subscribe(listener: () => void): () => void {
    if (this.#disposed) {
      throw new McpNativeMixedSurfaceError("Cannot subscribe after mixed surface disposal");
    }
    if (typeof listener !== "function") {
      throw new McpNativeMixedSurfaceError("Mixed surface listener must be a function");
    }
    if (this.#listeners.size >= MCP_NATIVE_MIXED_MAX_LISTENERS) {
      throw new McpNativeMixedSurfaceError(
        `Mixed surface coordinator exceeds ${MCP_NATIVE_MIXED_MAX_LISTENERS} listeners`,
      );
    }
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  start(): Promise<void> {
    return this.#enqueue("start", async () => {
      if (this.#started) {
        throw new McpNativeMixedSurfaceError("Mixed surface coordinator has already started");
      }
      this.#started = true;
      let firstError: unknown;
      await forEachSerial(this.#regions, async (region) => {
        try {
          await this.#invoke(region, "onCreate");
          await this.#invoke(region, "onActivityChange", this.#activity);
          await this.#invoke(region, "onEnvironmentChange", this.#environment);
          await this.#invoke(region, "onVisibilityChange", this.#states.get(region.id)!.visibility);
          await this.#invoke(region, "onFocusChange", this.#focusedRegionId === region.id);
          this.#states.get(region.id)!.status = "ready";
        } catch (error) {
          this.#states.get(region.id)!.status = "crashed";
          if (this.#focusedRegionId === region.id) this.#focusedRegionId = undefined;
          firstError ??= error;
        }
      });
      this.#publish();
      if (firstError !== undefined) throw firstError;
    });
  }

  setActivity(activity: McpNativeMixedSurfaceActivity): Promise<void> {
    return this.#enqueue("set activity", async () => {
      this.#assertStarted();
      const parsed = parseActivity(activity);
      if (parsed === this.#activity) return;
      await forEachSerial(this.#regions, async (region) => {
        if (this.#states.get(region.id)!.status === "ready") {
          await this.#invoke(region, "onActivityChange", parsed);
        }
      });
      this.#activity = parsed;
      this.#publish();
    });
  }

  setEnvironment(environment: McpNativeMixedSurfaceEnvironment): Promise<void> {
    return this.#enqueue("set environment", async () => {
      this.#assertStarted();
      const parsed = createEnvironment(environment);
      if (environmentsEqual(parsed, this.#environment)) return;
      await forEachSerial(this.#regions, async (region) => {
        if (this.#states.get(region.id)!.status === "ready") {
          await this.#invoke(region, "onEnvironmentChange", parsed);
        }
      });
      this.#environment = parsed;
      this.#publish();
    });
  }

  setVisibleRegions(ids: readonly string[]): Promise<void> {
    return this.#enqueue("set visibility", async () => {
      this.#assertStarted();
      const visible = new Set(parseRegionIds(ids, this.#regionsById, "visible region ids"));
      const previousFocusId = this.#focusedRegionId;
      if (previousFocusId !== undefined && !visible.has(previousFocusId)) {
        const previous = this.#regionsById.get(previousFocusId)!;
        await this.#invoke(previous, "onFocusChange", false);
      }
      await forEachSerial(this.#regions, async (region) => {
        const state = this.#states.get(region.id)!;
        const next = visible.has(region.id) ? "visible" : "hidden";
        if (state.visibility === next) return;
        if (state.status === "ready") await this.#invoke(region, "onVisibilityChange", next);
      });
      if (previousFocusId !== undefined && !visible.has(previousFocusId)) {
        this.#focusedRegionId = undefined;
      }
      for (const region of this.#regions) {
        this.#states.get(region.id)!.visibility = visible.has(region.id) ? "visible" : "hidden";
      }
      this.#publish();
    });
  }

  transferFocus(id?: string): Promise<void> {
    return this.#enqueue("transfer focus", async () => {
      this.#assertStarted();
      const nextId =
        id === undefined ? undefined : expectKnownRegionId(id, this.#regionsById, "focus target");
      if (nextId === this.#focusedRegionId) return;
      if (nextId !== undefined) {
        const nextState = this.#states.get(nextId)!;
        if (nextState.visibility !== "visible" || nextState.status !== "ready") {
          throw new McpNativeMixedSurfaceError("Focus target must be visible and ready", {
            regionId: nextId,
          });
        }
      }
      const previousId = this.#focusedRegionId;
      if (previousId !== undefined) {
        await this.#invoke(this.#regionsById.get(previousId)!, "onFocusChange", false);
      }
      if (nextId !== undefined) {
        await this.#invoke(this.#regionsById.get(nextId)!, "onFocusChange", true);
      }
      this.#focusedRegionId = nextId;
      this.#publish();
    });
  }

  handleBack(): Promise<boolean> {
    let handled = false;
    return this.#enqueue("handle back", async () => {
      this.#assertStarted();
      const candidates = this.#backCandidates();
      for (const region of candidates) {
        const callback = regionLifecycles.get(region)?.onBack;
        if (callback === undefined) continue;
        // eslint-disable-next-line no-await-in-loop -- back handlers are ordered and short-circuit
        const result = await this.#invokeResult(region, "onBack", callback);
        if (typeof result !== "boolean") {
          throw new McpNativeMixedSurfaceError("Mixed surface onBack must return a boolean", {
            regionId: region.id,
          });
        }
        if (result) {
          handled = true;
          break;
        }
      }
    }).then(() => handled);
  }

  cancel(id: string, reason?: string): Promise<void> {
    return this.#enqueue("cancel", async () => {
      this.#assertStarted();
      const region = this.#requireRegion(id);
      const parsedReason = optionalReason(reason);
      const state = this.#states.get(region.id)!;
      if (state.status === "cancelled") return;
      if (this.#focusedRegionId === region.id) {
        await this.#invoke(region, "onFocusChange", false);
      }
      await this.#invoke(region, "onCancel", parsedReason);
      if (this.#focusedRegionId === region.id) this.#focusedRegionId = undefined;
      state.status = "cancelled";
      state.visibility = "hidden";
      this.#publish();
    });
  }

  reportCrash(id: string, error: unknown): Promise<void> {
    return this.#enqueue("report crash", async () => {
      this.#assertStarted();
      const region = this.#requireRegion(id);
      const state = this.#states.get(region.id)!;
      if (state.status === "cancelled") {
        throw new McpNativeMixedSurfaceError("A cancelled mixed surface cannot crash", {
          regionId: id,
        });
      }
      if (state.status === "crashed") return;
      if (this.#focusedRegionId === region.id) {
        await this.#invoke(region, "onFocusChange", false);
      }
      await this.#invoke(region, "onCrash", error);
      if (this.#focusedRegionId === region.id) this.#focusedRegionId = undefined;
      state.status = "crashed";
      this.#publish();
    });
  }

  recover(id: string): Promise<void> {
    return this.#enqueue("recover", async () => {
      this.#assertStarted();
      const region = this.#requireRegion(id);
      const state = this.#states.get(region.id)!;
      if (state.status !== "crashed") {
        throw new McpNativeMixedSurfaceError("Only a crashed mixed surface can recover", {
          regionId: id,
        });
      }
      await this.#invoke(region, "onRecover");
      await this.#invoke(region, "onActivityChange", this.#activity);
      await this.#invoke(region, "onEnvironmentChange", this.#environment);
      await this.#invoke(region, "onVisibilityChange", state.visibility);
      state.status = "ready";
      this.#publish();
    });
  }

  handleMemoryPressure(pressure: McpNativeMixedSurfaceMemoryPressure): Promise<void> {
    return this.#enqueue("handle memory pressure", async () => {
      this.#assertStarted();
      if (pressure !== "moderate" && pressure !== "critical") {
        throw new McpNativeMixedSurfaceError("Unsupported mixed surface memory-pressure level");
      }
      await forEachSerial(this.#regions, async (region) => {
        if (this.#states.get(region.id)!.status === "ready") {
          await this.#invoke(region, "onMemoryPressure", pressure);
        }
      });
    });
  }

  dispose(): Promise<void> {
    return this.#enqueue(
      "dispose",
      async () => {
        if (this.#disposed) return;
        this.#disposed = true;
        this.#focusedRegionId = undefined;
        let firstError: unknown;
        await forEachSerial([...this.#regions].reverse(), async (region) => {
          if (region.kind === "mcp-app") {
            try {
              if (region.bridge.state === "ready") {
                await region.bridge.requestResourceTeardown();
              }
            } catch (error) {
              firstError ??= error;
            } finally {
              region.bridge.close();
            }
          }
          try {
            await this.#invoke(region, "onDispose");
          } catch (error) {
            firstError ??= error;
          }
        });
        this.#publish();
        this.#listeners.clear();
        if (firstError !== undefined) throw firstError;
      },
      true,
    );
  }

  #requireRegion(id: string): McpNativeMixedSurfaceRegion {
    return (
      this.#regionsById.get(expectRegionId(id)) ??
      (() => {
        throw new McpNativeMixedSurfaceError(`Unknown mixed surface region: ${String(id)}`);
      })()
    );
  }

  #assertStarted(): void {
    if (!this.#started)
      throw new McpNativeMixedSurfaceError("Mixed surface coordinator is not started");
  }

  #backCandidates(): readonly McpNativeMixedSurfaceRegion[] {
    const result: McpNativeMixedSurfaceRegion[] = [];
    if (this.#focusedRegionId !== undefined) {
      const focused = this.#regionsById.get(this.#focusedRegionId)!;
      const focusedState = this.#states.get(focused.id)!;
      if (focusedState.visibility === "visible" && focusedState.status === "ready") {
        result.push(focused);
      }
    }
    for (const region of [...this.#regions].reverse()) {
      if (
        region.id !== this.#focusedRegionId &&
        this.#states.get(region.id)!.visibility === "visible" &&
        this.#states.get(region.id)!.status === "ready"
      ) {
        result.push(region);
      }
    }
    return result;
  }

  #enqueue(label: string, operation: () => Promise<void>, allowDisposed = false): Promise<void> {
    const result = this.#operationTail.then(async () => {
      if (this.#disposed && !allowDisposed) {
        throw new McpNativeMixedSurfaceError(`Cannot ${label} after mixed surface disposal`);
      }
      try {
        await operation();
      } catch (error) {
        this.#publish();
        throw error;
      }
    });
    this.#operationTail = result.catch(() => {
      // Keep serialization usable while returning the original rejection to the caller.
    });
    return result;
  }

  async #invoke<K extends keyof McpNativeMixedSurfaceLifecycle>(
    region: McpNativeMixedSurfaceRegion,
    key: K,
    ...arguments_: Parameters<NonNullable<McpNativeMixedSurfaceLifecycle[K]>>
  ): Promise<void> {
    const callback = regionLifecycles.get(region)?.[key];
    if (callback === undefined) return;
    await this.#invokeResult(region, key, callback, ...arguments_);
  }

  async #invokeResult<K extends keyof McpNativeMixedSurfaceLifecycle>(
    region: McpNativeMixedSurfaceRegion,
    key: K,
    callback: NonNullable<McpNativeMixedSurfaceLifecycle[K]>,
    ...arguments_: Parameters<NonNullable<McpNativeMixedSurfaceLifecycle[K]>>
  ): Promise<unknown> {
    try {
      return await (callback as (...values: readonly unknown[]) => unknown)(...arguments_);
    } catch (error) {
      throw new McpNativeMixedSurfaceError(`Mixed surface ${String(key)} callback failed`, {
        cause: error,
        regionId: region.id,
      });
    }
  }

  #publish(): void {
    this.#snapshot = this.#createSnapshot();
    for (const listener of this.#listeners) {
      try {
        listener();
      } catch {
        // A consumer notification must not corrupt serialized host lifecycle work.
      }
    }
  }

  #createSnapshot(): McpNativeMixedSurfaceSnapshot {
    return Object.freeze({
      activity: this.#activity,
      disposed: this.#disposed,
      environment: this.#environment,
      ...(this.#focusedRegionId === undefined ? {} : { focusedRegionId: this.#focusedRegionId }),
      regions: Object.freeze(
        this.#regions.map((region, index) => {
          const state = this.#states.get(region.id)!;
          return Object.freeze({
            accessibilityLabel: region.accessibilityLabel,
            accessibilityOrder: index,
            accessibilityTree: region.kind === "a2ui" ? "native" : "isolated-webview",
            focused: this.#focusedRegionId === region.id,
            id: region.id,
            kind: region.kind,
            status: state.status,
            visibility: state.visibility,
          });
        }),
      ),
      started: this.#started,
    });
  }
}

function registerRegion(
  region: McpNativeMixedSurfaceRegion,
  lifecycle: McpNativeMixedSurfaceLifecycle | undefined,
): void {
  const parsedLifecycle = validateLifecycle(lifecycle ?? {});
  registeredRegions.add(region);
  regionLifecycles.set(region, parsedLifecycle);
}

function expectFactoryOptions(value: unknown): asserts value is object {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new McpNativeMixedSurfaceError("Mixed surface factory options must be an object");
  }
}

async function forEachSerial<T>(
  values: readonly T[],
  operation: (value: T) => void | Promise<void>,
): Promise<void> {
  for (const value of values) {
    // eslint-disable-next-line no-await-in-loop -- host lifecycle callbacks must never race
    await operation(value);
  }
}

function validateLifecycle(
  lifecycle: McpNativeMixedSurfaceLifecycle,
): McpNativeMixedSurfaceLifecycle {
  if (lifecycle === null || typeof lifecycle !== "object" || Array.isArray(lifecycle)) {
    throw new McpNativeMixedSurfaceError("Mixed surface lifecycle must be an object");
  }
  const allowed = new Set([
    "onCreate",
    "onVisibilityChange",
    "onActivityChange",
    "onFocusChange",
    "onEnvironmentChange",
    "onBack",
    "onCancel",
    "onCrash",
    "onRecover",
    "onMemoryPressure",
    "onDispose",
  ]);
  for (const key of Object.keys(lifecycle)) {
    if (!allowed.has(key)) {
      throw new McpNativeMixedSurfaceError(`Unsupported mixed surface lifecycle callback: ${key}`);
    }
    if (typeof (lifecycle as Record<string, unknown>)[key] !== "function") {
      throw new McpNativeMixedSurfaceError(`Mixed surface lifecycle ${key} must be a function`);
    }
  }
  return Object.freeze({ ...lifecycle });
}

function expectRegionId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u.test(value)) {
    throw new McpNativeMixedSurfaceError(
      "Mixed surface region IDs must be 1-128 host-authored identifier characters",
    );
  }
  return value;
}

function expectAccessibilityLabel(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) {
    throw new McpNativeMixedSurfaceError(
      "Mixed surface accessibility labels must contain 1-512 characters",
    );
  }
  return value;
}

function expectKnownRegionId(
  value: unknown,
  regions: ReadonlyMap<string, McpNativeMixedSurfaceRegion>,
  path: string,
): string {
  const id = expectRegionId(value);
  if (!regions.has(id)) {
    throw new McpNativeMixedSurfaceError(`Unknown mixed surface region at ${path}: ${id}`);
  }
  return id;
}

function parseRegionIds(
  values: readonly string[],
  regions: ReadonlyMap<string, McpNativeMixedSurfaceRegion>,
  path: string,
): readonly string[] {
  if (!Array.isArray(values) || values.length > MCP_NATIVE_MIXED_MAX_REGIONS) {
    throw new McpNativeMixedSurfaceError(`${path} must be a bounded array`);
  }
  const result: string[] = [];
  for (const [index, value] of values.entries()) {
    const id = expectKnownRegionId(value, regions, `${path}[${index}]`);
    if (result.includes(id)) {
      throw new McpNativeMixedSurfaceError(`Duplicate mixed surface region at ${path}[${index}]`);
    }
    result.push(id);
  }
  return result;
}

function parseActivity(value: unknown): McpNativeMixedSurfaceActivity {
  if (value !== "background" && value !== "foreground") {
    throw new McpNativeMixedSurfaceError("Mixed surface activity must be background or foreground");
  }
  return value;
}

function createEnvironment(
  input: Partial<McpNativeMixedSurfaceEnvironment> = {},
): McpNativeMixedSurfaceEnvironment {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new McpNativeMixedSurfaceError("Mixed surface environment must be an object");
  }
  for (const key of Object.keys(input)) {
    if (!["dynamicTypeScale", "keyboardVisible", "orientation", "reducedMotion"].includes(key)) {
      throw new McpNativeMixedSurfaceError(`Unsupported mixed surface environment field: ${key}`);
    }
  }
  const dynamicTypeScale = input.dynamicTypeScale ?? 1;
  if (!Number.isFinite(dynamicTypeScale) || dynamicTypeScale < 0.5 || dynamicTypeScale > 4) {
    throw new McpNativeMixedSurfaceError(
      "Mixed surface dynamic type scale must be between 0.5 and 4",
    );
  }
  const keyboardVisible = input.keyboardVisible ?? false;
  const reducedMotion = input.reducedMotion ?? false;
  if (typeof keyboardVisible !== "boolean" || typeof reducedMotion !== "boolean") {
    throw new McpNativeMixedSurfaceError("Mixed surface environment flags must be booleans");
  }
  const orientation = input.orientation ?? "unknown";
  if (
    !["landscape-left", "landscape-right", "portrait", "portrait-upside-down", "unknown"].includes(
      orientation,
    )
  ) {
    throw new McpNativeMixedSurfaceError("Unsupported mixed surface orientation");
  }
  return Object.freeze({ dynamicTypeScale, keyboardVisible, orientation, reducedMotion });
}

function environmentsEqual(
  left: McpNativeMixedSurfaceEnvironment,
  right: McpNativeMixedSurfaceEnvironment,
): boolean {
  return (
    left.dynamicTypeScale === right.dynamicTypeScale &&
    left.keyboardVisible === right.keyboardVisible &&
    left.orientation === right.orientation &&
    left.reducedMotion === right.reducedMotion
  );
}

function optionalReason(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0 || value.length > 1_024) {
    throw new McpNativeMixedSurfaceError(
      "Mixed surface cancellation reasons must be bounded strings",
    );
  }
  return value;
}
