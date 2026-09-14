import {
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

export interface ContractHostContextValue {
  readonly controller: ContractHostController;
  readonly snapshot: ContractHostSnapshot;
}

export interface ContractHostProviderProps {
  /** One fresh controller owned by this mounted provider; replacing or sharing it is rejected. */
  readonly controller: ContractHostController;
  readonly onError: (error: unknown) => void;
  readonly children?: ReactNode;
}

const context = createContext<ContractHostContextValue | undefined>(undefined);
const owners = new WeakMap<ContractHostController, object>();

/** Starts/disposes a contract controller. This provider does not render custom data or grant actions. */
export function ContractHostProvider({
  controller: suppliedController,
  onError,
  children,
}: ContractHostProviderProps): ReactElement {
  if (typeof onError !== "function")
    throw new TypeError("Contract host provider requires an error callback");
  const [controller] = useState(() => {
    if (!(suppliedController instanceof ContractHostController))
      throw new TypeError("Contract host provider requires ContractHostController");
    return suppliedController;
  });
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
      controller.cancelCurrentCall();
      // Strict Mode replays setup immediately. Only a real unmount owns shutdown after this microtask.
      void Promise.resolve().then(() => {
        if (generation.current !== mountedGeneration) return;
        if (owners.get(controller) === owner) owners.delete(controller);
        return controller.shutdown().catch((error: unknown) => report(errors.current, error));
      });
    };
  }, [controller, owner]);
  const value = useMemo(() => Object.freeze({ controller, snapshot }), [controller, snapshot]);
  return createElement(context.Provider, { value }, children);
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
