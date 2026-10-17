import {
  Component,
  Fragment,
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react";
import { ContractHostController, type ContractHostSnapshot } from "./contract-controller.js";
import {
  ContractSurfaceRuntime,
  type ContractNativeProviderOptions,
} from "./contract-surface-runtime.js";
export {
  createContractNativeRegistration,
  createContractNativeRegistry,
} from "./contracts-native-registry.js";
export type {
  ContractNativeRegistrationOptions,
  ContractNativeRegistration,
  ContractNativeRegistry,
  ContractNativeRendererProps,
  ContractRenderBudget,
} from "./contracts-native-registry.js";
export type { ContractEventOutcome } from "./contract-surface-runtime.js";

export interface ContractHostContextValue {
  readonly controller: ContractHostController;
  readonly snapshot: ContractHostSnapshot;
}

export interface ContractHostProviderProps extends ContractNativeProviderOptions {
  /** One fresh controller owned by this mounted provider; replacing or sharing it is rejected. */
  readonly controller: ContractHostController;
  readonly onError: (error: unknown) => void;
  readonly children?: ReactNode;
}

const context = createContext<ContractHostContextValue | undefined>(undefined);
const nativeContext = createContext<
  | {
      readonly runtime: ContractSurfaceRuntime | undefined;
      readonly onError: (error: unknown) => void;
    }
  | undefined
>(undefined);
const owners = new WeakMap<ContractHostController, object>();

/** Owns one controller and optional explicitly installed native renderers and event policy. */
export function ContractHostProvider({
  controller: suppliedController,
  onError,
  children,
  nativeRegistry,
  authorization,
  onEvent,
  surfaceLimits,
  eventTimeoutMs,
}: ContractHostProviderProps): ReactElement {
  if (typeof onError !== "function")
    throw new TypeError("Contract host provider requires an error callback");
  const [controller] = useState(() => {
    if (!(suppliedController instanceof ContractHostController))
      throw new TypeError("Contract host provider requires ContractHostController");
    return suppliedController;
  });
  const [native] = useState(() => ({
    nativeRegistry,
    authorization,
    onEvent,
    surfaceLimits,
    eventTimeoutMs,
    runtime:
      nativeRegistry === undefined
        ? undefined
        : new ContractSurfaceRuntime(controller, {
            nativeRegistry,
            ...(authorization === undefined ? {} : { authorization }),
            ...(onEvent === undefined ? {} : { onEvent }),
            ...(surfaceLimits === undefined ? {} : { surfaceLimits }),
            ...(eventTimeoutMs === undefined ? {} : { eventTimeoutMs }),
          }),
  }));
  if (
    native.nativeRegistry !== nativeRegistry ||
    native.authorization !== authorization ||
    native.onEvent !== onEvent ||
    native.surfaceLimits !== surfaceLimits ||
    native.eventTimeoutMs !== eventTimeoutMs
  )
    throw new TypeError("Contract host native configuration cannot be replaced");
  if (
    !nativeRegistry &&
    (authorization !== undefined ||
      onEvent !== undefined ||
      surfaceLimits !== undefined ||
      eventTimeoutMs !== undefined)
  )
    throw new TypeError("Contract host native configuration requires a native registry");
  const [owner] = useState(() => Object.freeze({}));
  if (controller !== suppliedController)
    throw new TypeError("Contract host provider cannot replace its controller");
  const existingOwner = owners.get(controller);
  if (existingOwner !== undefined && existingOwner !== owner)
    throw new TypeError("Contract host controller already has a provider");
  const errors = useRef(onError);
  errors.current = onError;
  const generation = useRef(0);
  const subscribe = useCallback(
    (listener: () => void) => controller.subscribe(listener),
    [controller],
  );
  const snapshot = useSyncExternalStore(subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    const currentOwner = owners.get(controller);
    if (currentOwner !== undefined && currentOwner !== owner)
      throw new TypeError("Contract host controller already has a provider");
    owners.set(controller, owner);
    const mountedGeneration = ++generation.current;
    let mounted = true;
    void controller.start().catch((error: unknown) => {
      if (mounted) report(errors.current, error);
    });
    return () => {
      mounted = false;
      // Strict Mode replays setup immediately. Only a real unmount owns cancellation and shutdown after this microtask.
      void Promise.resolve().then(() => {
        if (generation.current !== mountedGeneration) return;
        controller.cancelCurrentCall();
        if (owners.get(controller) === owner) owners.delete(controller);
        native.runtime?.dispose();
        return controller.shutdown().catch((error: unknown) => report(errors.current, error));
      });
    };
  }, [controller, owner, native]);
  const value = useMemo(() => Object.freeze({ controller, snapshot }), [controller, snapshot]);
  const nativeValue = useMemo(() => ({ runtime: native.runtime, onError }), [native, onError]);
  return createElement(
    context.Provider,
    { value },
    createElement(nativeContext.Provider, { value: nativeValue }, children),
  );
}

export function useContractHost(): ContractHostContextValue {
  const value = useContext(context);
  if (value === undefined) throw new TypeError("useContractHost requires ContractHostProvider");
  return value;
}

function report(callback: (error: unknown) => void, error: unknown): void {
  try {
    void Promise.resolve(callback(error)).catch(() => {});
  } catch {
    /* A local error observer cannot interrupt controller cleanup. */
  }
}

export type ContractNativeViewStatus = "unavailable" | "render-failed";
export interface ContractNativeResultViewProps {
  /** Host-authored accessible empty/error UI. Never receives raw server or renderer exception text. */
  readonly fallback: (status: ContractNativeViewStatus) => ReactNode;
}
type Lease = ReturnType<ContractSurfaceRuntime["createLease"]>;

/** Mount only the provider controller's current custom result through its exact local registration. */
export function ContractNativeResultView({
  fallback,
}: ContractNativeResultViewProps): ReactElement {
  const { snapshot } = useContractHost();
  const native = useContext(nativeContext);
  if (typeof fallback !== "function")
    throw new TypeError("Contract native view requires a fallback");
  const result =
    snapshot.call.kind === "resolved" && snapshot.call.result.kind === "contract-data"
      ? snapshot.call.result
      : undefined;
  const lease = useMemo(() => {
    if (!result || !native?.runtime) return undefined;
    try {
      return native.runtime.createLease(result);
    } catch {
      return undefined;
    }
  }, [result, native?.runtime]);
  if (!lease) return createElement(Fragment, null, fallback("unavailable"));
  return createElement(
    ContractRenderBoundary,
    { lease, fallback, onError: native!.onError },
    createElement(MountedContract, { lease }),
  );
}
function MountedContract({ lease }: { readonly lease: Lease }): ReactElement {
  useEffect(() => lease.activate(), [lease]);
  return createElement(lease.component, lease.props);
}
interface BoundaryProps {
  readonly lease: Lease;
  readonly fallback: ContractNativeResultViewProps["fallback"];
  readonly onError: (error: unknown) => void;
  readonly children?: ReactNode;
}
class ContractRenderBoundary extends Component<
  BoundaryProps,
  { readonly failed: boolean; readonly lease: Lease }
> {
  override state = { failed: false, lease: this.props.lease };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  static getDerivedStateFromProps(props: BoundaryProps, state: { readonly lease: Lease }) {
    return props.lease === state.lease ? null : { failed: false, lease: props.lease };
  }
  override componentDidCatch(): void {
    this.props.lease.fail();
    report(this.props.onError, new TypeError("Contract native renderer failed"));
  }
  override render(): ReactNode {
    return this.state.failed ? this.props.fallback("render-failed") : this.props.children;
  }
}
