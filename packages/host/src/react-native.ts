import { A2uiSurfaceStore, type A2uiV1SurfaceValidationPolicy } from "@mcp-native/a2ui";
import {
  parseMcpNativeAction,
  type JsonObject,
  type McpListToolsResult,
  type McpTool,
  type McpToolCallResult,
} from "@mcp-native/core";
import {
  A2uiV1NativeHostSurface,
  A2uiV1NativeSurface,
  isA2uiV1NativeHost,
  type A2uiV1NativeHost,
  type A2uiV1NativeActionHandler,
  type A2uiV1NativeHostExtensionEventDescriptor,
  type A2uiV1NativeHostExtensionPolicy,
  type A2uiV1NativeImagePolicy,
  type A2uiV1NativeMediaPolicy,
  type A2uiV1NativeOpenUrlHandler,
  type A2uiV1NativeOpenUrlPolicy,
  type NativeComponentCatalog,
  type NativeSurfaceParentLayout,
} from "@mcp-native/react-native";
import {
  McpAppsBridge,
  createMcpAppsNativeSandbox,
  createMcpAppsReactNativeWebViewProps,
  type McpAppsBridgeOptions,
  type McpAppsNativeSandboxPolicy,
  type McpAppsReactNativeWebViewProps,
} from "@mcp-native/webview";
import {
  Component,
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from "react";

import {
  McpNativeHostController,
  McpNativeHostControllerError,
  type McpNativeHostRequestOptions,
  type McpNativeHostSnapshot,
} from "./controller.js";
import type { McpNativeHostMcpAppsResult, McpNativeHostResult } from "./results.js";

/** Maximum server text mounted by the high-level ordinary-content fallback. */
export const MCP_NATIVE_HOST_MAX_ORDINARY_TEXT_LENGTH = 32_768;

export type McpNativeHostRenderErrorCode =
  | "a2ui-render-failed"
  | "mcp-app-crashed"
  | "mcp-app-session-failed"
  | "result-render-failed";

/** Stable renderer error that never includes a server or transport error message. */
export class McpNativeHostRenderError extends Error {
  readonly code: McpNativeHostRenderErrorCode;

  constructor(code: McpNativeHostRenderErrorCode, options?: ErrorOptions) {
    super(RENDER_ERROR_MESSAGES[code], options);
    this.name = "McpNativeHostRenderError";
    this.code = code;
  }
}

export interface McpNativeHostActiveCall {
  readonly id: number;
  readonly name: string;
  readonly arguments: JsonObject;
  /** Set only after the controller resolves this exact call. */
  readonly result?: McpNativeHostResult;
}

export interface McpNativeHostReactContextValue {
  readonly controller: McpNativeHostController;
  readonly snapshot: McpNativeHostSnapshot;
  readonly activeCall?: McpNativeHostActiveCall;
  callTool(
    name: string,
    arguments_?: JsonObject,
    options?: McpNativeHostRequestOptions,
  ): Promise<McpNativeHostResult>;
  cancelCurrentCall(): boolean;
  refreshTools(options?: McpNativeHostRequestOptions): Promise<McpListToolsResult>;
  retry(): Promise<void>;
  setOnline(online: boolean): Promise<void>;
}

export interface McpNativeHostProviderProps {
  /** Controller whose start/shutdown lifecycle is owned by this provider. */
  readonly controller: McpNativeHostController;
  /** Required local error boundary for startup and asynchronous teardown failures. */
  readonly onError: (error: unknown) => void;
  readonly children?: ReactNode;
}

const McpNativeHostReactContext = createContext<McpNativeHostReactContextValue | undefined>(
  undefined,
);

/**
 * Owns one controller for a React tree. It starts after mount, exposes immutable snapshots through
 * `useSyncExternalStore`, and always shuts the controller down on unmount.
 */
export function McpNativeHostProvider({
  controller: suppliedController,
  onError,
  children,
}: McpNativeHostProviderProps): ReactElement {
  if (typeof onError !== "function") {
    throw new TypeError("MCP native host provider requires an error callback");
  }
  const [controller] = useState(() => {
    if (!(suppliedController instanceof McpNativeHostController)) {
      throw new TypeError("MCP native host provider requires McpNativeHostController");
    }
    return suppliedController;
  });
  if (controller !== suppliedController) {
    throw new TypeError("MCP native host provider cannot replace its owned controller");
  }
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const subscribe = useCallback(
    (listener: () => void) => controller.subscribe(listener),
    [controller],
  );
  const snapshot = useSyncExternalStore(subscribe, controller.getSnapshot, controller.getSnapshot);
  const callSequence = useRef(0);
  const callPending = useRef(false);
  const mountedRef = useRef(true);
  const ownershipGeneration = useRef(0);
  const [activeCall, setActiveCall] = useState<McpNativeHostActiveCall | undefined>();
  const exposedActiveCall = snapshot.call.kind === "idle" ? undefined : activeCall;

  useEffect(() => {
    const generation = ++ownershipGeneration.current;
    mountedRef.current = true;
    let mounted = true;
    void controller.start().catch((error: unknown) => {
      if (mounted) reportHostError(onErrorRef.current, error);
    });
    return () => {
      mounted = false;
      mountedRef.current = false;
      // React Strict Mode immediately replays effects in development. Deferring teardown by one
      // microtask lets the replacement setup retain ownership without shutting down its controller.
      void Promise.resolve().then(() => {
        if (ownershipGeneration.current !== generation) return;
        return controller
          .shutdown()
          .catch((error: unknown) => reportHostError(onErrorRef.current, error));
      });
    };
  }, [controller]);

  useEffect(() => {
    if (snapshot.call.kind === "idle") {
      setActiveCall(undefined);
    }
  }, [snapshot.call]);

  const callTool = useCallback(
    async (
      name: string,
      arguments_: JsonObject = {},
      options: McpNativeHostRequestOptions = {},
    ) => {
      let action;
      try {
        action = parseMcpNativeAction({ type: "tool", name, arguments: arguments_ });
      } catch {
        throw new McpNativeHostControllerError("invalid-call");
      }
      const ownedArguments = deepFreeze(action.arguments ?? {});
      if (callPending.current) {
        throw new McpNativeHostControllerError("operation-in-progress");
      }
      callPending.current = true;
      try {
        const previousCallState = controller.getSnapshot().call;
        const pendingResult = controller.callTool(action.name, ownedArguments, options);
        // Accepted calls synchronously publish a fresh loading state before their promise is
        // returned. An unchanged state means controller preflight rejected the call.
        if (controller.getSnapshot().call === previousCallState) {
          return await pendingResult;
        }
        const sequence = ++callSequence.current;
        setActiveCall(
          Object.freeze({ id: sequence, name: action.name, arguments: ownedArguments }),
        );
        const result = await pendingResult;
        if (mountedRef.current && callSequence.current === sequence) {
          setActiveCall(
            Object.freeze({ id: sequence, name: action.name, arguments: ownedArguments, result }),
          );
        }
        return result;
      } finally {
        callPending.current = false;
      }
    },
    [controller],
  );

  const value = useMemo<McpNativeHostReactContextValue>(
    () =>
      Object.freeze({
        controller,
        snapshot,
        ...(exposedActiveCall === undefined ? {} : { activeCall: exposedActiveCall }),
        callTool,
        cancelCurrentCall: () => controller.cancelCurrentCall(),
        refreshTools: (options?: McpNativeHostRequestOptions) => controller.refreshTools(options),
        retry: () => controller.retry(),
        setOnline: (online: boolean) => controller.setOnline(online),
      }),
    [callTool, controller, exposedActiveCall, snapshot],
  );

  return createElement(McpNativeHostReactContext.Provider, { value }, children);
}

/** Returns the nearest provider-owned high-level host API. */
export function useMcpNativeHost(): McpNativeHostReactContextValue {
  const value = useContext(McpNativeHostReactContext);
  if (value === undefined) {
    throw new Error("useMcpNativeHost requires a parent McpNativeHostProvider");
  }
  return value;
}

export interface McpNativeHostMcpAppsViewProps {
  /** Closed safe prop subset produced by `@mcp-native/webview`. */
  readonly webViewProps: McpAppsReactNativeWebViewProps;
  /** Bind the mounted local WebView's `postMessage` method for this session. */
  readonly bindPostMessage: (
    postMessage: (serializedMessage: string) => void | Promise<void>,
  ) => () => void;
  /** Report either native WebView renderer/content-process failure. */
  readonly onCrash: () => void;
}

export type McpNativeHostMcpAppsBridgeOptions = Omit<
  McpAppsBridgeOptions,
  "postMessage" | "resource" | "sandbox" | "tools"
>;

export interface McpNativeHostMcpAppsRendererOptions {
  /** Locally compiled adapter around the application's React Native WebView component. */
  readonly View: ComponentType<McpNativeHostMcpAppsViewProps>;
  /** Host-authored bridge callbacks and presentation context. Exact bindings remain host-owned. */
  readonly bridgeOptions: McpNativeHostMcpAppsBridgeOptions;
  /** Omission uses the deny-by-default native sandbox policy. */
  readonly sandboxPolicy?: McpAppsNativeSandboxPolicy;
  readonly onExternalLink?: (uri: string) => void | Promise<void>;
}

export interface McpNativeHostResultViewProps {
  readonly components: NativeComponentCatalog;
  readonly a2uiPolicy: A2uiV1SurfaceValidationPolicy;
  readonly onA2uiAction: A2uiV1NativeActionHandler;
  readonly onError: (error: unknown) => void;
  /**
   * Optional cross-platform accessibility announcement sink. Wire this to
   * `AccessibilityInfo.announceForAccessibility` (or platform equivalent) to have loading,
   * error, retry, and result-ready state changes announced to screen reader users.
   */
  readonly onAnnounce?: ((message: string) => void) | undefined;
  readonly mcpApps?: McpNativeHostMcpAppsRendererOptions;
  readonly openUrlPolicy?: A2uiV1NativeOpenUrlPolicy;
  readonly onOpenUrl?: A2uiV1NativeOpenUrlHandler;
  readonly imagePolicy?: A2uiV1NativeImagePolicy;
  readonly mediaPolicy?: A2uiV1NativeMediaPolicy;
  readonly hostExtensionPolicy?: A2uiV1NativeHostExtensionPolicy;
  readonly onHostExtensionEvent?: (event: A2uiV1NativeHostExtensionEventDescriptor) => void;
  readonly locale?: string;
}

export type McpNativeRegisteredHostResultViewProps = Omit<
  McpNativeHostResultViewProps,
  "a2uiPolicy" | "components" | "hostExtensionPolicy" | "imagePolicy" | "mediaPolicy"
> & {
  readonly nativeHost: A2uiV1NativeHost;
  /** Layout category supplied by the shell that contains each rendered A2UI surface. */
  readonly parentLayout?: NativeSurfaceParentLayout;
};

interface McpNativeHostResultViewInternalProps extends McpNativeHostResultViewProps {
  readonly nativeHost?: A2uiV1NativeHost;
  readonly parentLayout?: NativeSurfaceParentLayout;
}

/** Renders high-level host state through one immutable registered native host. */
export function McpNativeRegisteredHostResultView({
  nativeHost,
  ...props
}: McpNativeRegisteredHostResultViewProps): ReactElement {
  if (!isA2uiV1NativeHost(nativeHost)) {
    throw new TypeError("Expected a native host created by createA2uiV1NativeHost");
  }
  return createElement(McpNativeHostResultViewInternal, {
    ...props,
    components: nativeHost.components,
    a2uiPolicy: nativeHost.policy,
    ...(nativeHost.imagePolicy === undefined ? {} : { imagePolicy: nativeHost.imagePolicy }),
    ...(nativeHost.mediaPolicy === undefined ? {} : { mediaPolicy: nativeHost.mediaPolicy }),
    ...(nativeHost.hostExtensionPolicy === undefined
      ? {}
      : { hostExtensionPolicy: nativeHost.hostExtensionPolicy }),
    nativeHost,
  });
}

/**
 * Renders the complete high-level call state through host-installed primitives. Server-controlled
 * values never select a component, WebView configuration, error message, or executable fallback.
 */
export function McpNativeHostResultView(props: McpNativeHostResultViewProps): ReactElement {
  return createElement(McpNativeHostResultViewInternal, props);
}

function McpNativeHostResultViewInternal(
  props: McpNativeHostResultViewInternalProps,
): ReactElement {
  const host = useMcpNativeHost();
  const resetKey = createResultResetKey(host.snapshot, host.activeCall);
  return createElement(
    HostRenderBoundary,
    {
      components: props.components,
      errorCode: selectRenderErrorCode(host.snapshot, host.activeCall),
      onError: props.onError,
      ...(props.onAnnounce === undefined ? {} : { onAnnounce: props.onAnnounce }),
      resetKey,
    },
    createElement(McpNativeHostResultContent, { host, props }),
  );
}

function McpNativeHostResultContent({
  host,
  props,
}: {
  readonly host: McpNativeHostReactContextValue;
  readonly props: McpNativeHostResultViewInternalProps;
}): ReactElement {
  return renderSnapshot(host, props);
}

function renderSnapshot(
  host: McpNativeHostReactContextValue,
  props: McpNativeHostResultViewInternalProps,
): ReactElement {
  const onAnnounce = props.onAnnounce;
  const connection = host.snapshot.connection;
  if (connection.kind === "loading") {
    return renderState(props.components, "Connecting", "Connecting to the MCP server.", {
      busy: true,
      onAnnounce,
    });
  }
  if (connection.kind === "empty") {
    return renderState(props.components, "No connection", "No MCP server is configured.", {
      severity: "error",
      onAnnounce,
    });
  }
  if (connection.kind === "denied") {
    return renderState(props.components, "Connection denied", "The host denied this connection.", {
      severity: "error",
      onAnnounce,
    });
  }
  if (connection.kind === "retryable-error") {
    return renderState(
      props.components,
      "Connection unavailable",
      "The MCP server is temporarily unavailable.",
      {
        retry: () =>
          void host.retry().catch((error: unknown) => reportHostError(props.onError, error)),
        severity: "error",
        onAnnounce,
      },
    );
  }
  if (connection.kind === "terminal-error") {
    return renderState(
      props.components,
      "Connection failed",
      "The MCP server connection could not be established.",
      {
        retry: () =>
          void host.retry().catch((error: unknown) => reportHostError(props.onError, error)),
        severity: "error",
        onAnnounce,
      },
    );
  }
  if (connection.kind === "disconnected") {
    const detail =
      connection.reason === "offline"
        ? "The device is offline."
        : connection.reason === "shutdown"
          ? "The MCP host has shut down."
          : "Preparing the MCP connection.";
    return renderState(props.components, "Disconnected", detail, { onAnnounce });
  }

  const tools = host.snapshot.tools;
  if (tools.kind === "idle" || tools.kind === "loading") {
    return renderState(props.components, "Loading tools", "Discovering available MCP tools.", {
      busy: true,
      onAnnounce,
    });
  }
  if (tools.kind === "error") {
    return renderState(
      props.components,
      "Tools unavailable",
      "The MCP tool list could not be loaded.",
      {
        retry: () =>
          void host.refreshTools().catch((error: unknown) => reportHostError(props.onError, error)),
        severity: "error",
        onAnnounce,
      },
    );
  }
  if (tools.result.tools.length === 0) {
    return renderState(props.components, "No tools", "The MCP server did not provide any tools.", {
      onAnnounce,
    });
  }

  const call = host.snapshot.call;
  if (call.kind === "idle") {
    return renderState(props.components, "Ready", "Choose an available MCP tool.", { onAnnounce });
  }
  if (call.kind === "loading") {
    return renderState(props.components, "Working", "The MCP tool is running.", {
      busy: true,
      onAnnounce,
    });
  }
  if (call.kind === "cancelled") {
    return renderState(props.components, "Cancelled", "The MCP tool call was cancelled.", {
      onAnnounce,
    });
  }
  if (call.kind === "error") {
    const activeCall = host.activeCall;
    return renderState(props.components, "Tool failed", "The MCP tool call did not complete.", {
      ...(activeCall === undefined
        ? {}
        : {
            retry: () =>
              void host
                .callTool(activeCall.name, activeCall.arguments)
                .catch((error: unknown) => reportHostError(props.onError, error)),
          }),
      severity: "error",
      onAnnounce,
    });
  }

  if (host.activeCall?.result !== call.result) {
    return renderState(props.components, "Preparing result", "Preparing validated MCP content.", {
      busy: true,
      onAnnounce,
    });
  }
  return renderResolvedResult(
    call.result,
    host.activeCall.arguments,
    host.activeCall.id,
    tools.result.tools,
    props,
  );
}

function renderResolvedResult(
  result: McpNativeHostResult,
  arguments_: JsonObject,
  resultKey: number,
  tools: readonly McpTool[],
  props: McpNativeHostResultViewInternalProps,
): ReactElement {
  switch (result.kind) {
    case "invalid":
      return renderState(
        props.components,
        "Unsupported result",
        "The MCP result could not be rendered safely.",
        { severity: "error", onAnnounce: props.onAnnounce },
      );
    case "ordinary":
      if (result.result.isError === true) {
        return renderState(props.components, "Tool error", "The MCP tool returned an error.", {
          severity: "error",
          onAnnounce: props.onAnnounce,
        });
      }
      return renderState(props.components, "Result", selectOrdinaryText(result.result), {
        announceOverride: "Result ready",
        onAnnounce: props.onAnnounce,
      });
    case "a2ui":
      return createElement(A2uiHostResult, { key: resultKey, props, result, resultKey });
    case "mcp-app":
      if (props.mcpApps === undefined) {
        return renderState(
          props.components,
          "Interactive result unavailable",
          "This host has not installed an MCP Apps WebView adapter.",
          { severity: "error", onAnnounce: props.onAnnounce },
        );
      }
      return createElement(McpAppsResultSession, {
        key: resultKey,
        arguments: arguments_,
        components: props.components,
        onError: props.onError,
        ...(props.onAnnounce === undefined ? {} : { onAnnounce: props.onAnnounce }),
        options: props.mcpApps,
        result,
        tools,
      });
  }
}

function A2uiHostResult({
  result,
  resultKey,
  props,
}: {
  readonly result: Extract<McpNativeHostResult, { kind: "a2ui" }>;
  readonly resultKey: number;
  readonly props: McpNativeHostResultViewInternalProps;
}): ReactElement {
  const surfaces = useMemo(() => {
    const store = new A2uiSurfaceStore({
      ...(props.a2uiPolicy.hostExtensions === undefined
        ? {}
        : { hostExtensions: props.a2uiPolicy.hostExtensions }),
    });
    store.applyAll(result.resource.envelopes);
    return store.list();
  }, [props.a2uiPolicy.hostExtensions, result.resource]);
  if (surfaces.length === 0) {
    return renderState(props.components, "Empty result", "The A2UI result contains no surface.", {
      severity: "error",
      onAnnounce: props.onAnnounce,
    });
  }
  const children = surfaces.map((surface) => {
    const key = `${resultKey}:${surface.surfaceId}`;
    if (props.nativeHost !== undefined) {
      return createElement(A2uiV1NativeHostSurface, {
        key,
        host: props.nativeHost,
        surface,
        onAction: props.onA2uiAction,
        onRenderError: (error) => reportHostError(props.onError, error),
        fallback: renderState(
          props.components,
          "Result unavailable",
          "The validated result could not be rendered.",
          { severity: "error", onAnnounce: props.onAnnounce },
        ),
        ...(props.parentLayout === undefined ? {} : { parentLayout: props.parentLayout }),
        ...(props.openUrlPolicy === undefined ? {} : { openUrlPolicy: props.openUrlPolicy }),
        ...(props.onOpenUrl === undefined ? {} : { onOpenUrl: props.onOpenUrl }),
        ...(props.onHostExtensionEvent === undefined
          ? {}
          : { onHostExtensionEvent: props.onHostExtensionEvent }),
        ...(props.locale === undefined ? {} : { locale: props.locale }),
      });
    }
    return createElement(A2uiV1NativeSurface, {
      key,
      surface,
      policy: props.a2uiPolicy,
      components: props.components,
      onAction: props.onA2uiAction,
      ...(props.openUrlPolicy === undefined ? {} : { openUrlPolicy: props.openUrlPolicy }),
      ...(props.onOpenUrl === undefined ? {} : { onOpenUrl: props.onOpenUrl }),
      ...(props.imagePolicy === undefined ? {} : { imagePolicy: props.imagePolicy }),
      ...(props.mediaPolicy === undefined ? {} : { mediaPolicy: props.mediaPolicy }),
      ...(props.hostExtensionPolicy === undefined
        ? {}
        : { hostExtensionPolicy: props.hostExtensionPolicy }),
      ...(props.onHostExtensionEvent === undefined
        ? {}
        : { onHostExtensionEvent: props.onHostExtensionEvent }),
      ...(props.locale === undefined ? {} : { locale: props.locale }),
    });
  });
  return createElement(InteractiveResultAnnouncer, {
    View: props.components.View,
    onAnnounce: props.onAnnounce,
    children,
  });
}

/**
 * Wraps rendered interactive content (an A2UI surface tree or an MCP Apps WebView session) so it
 * is discoverable by screen readers and its readiness is announced once per mount.
 */
function InteractiveResultAnnouncer({
  View,
  onAnnounce,
  children,
}: {
  readonly View: NativeComponentCatalog["View"];
  readonly onAnnounce?: ((message: string) => void) | undefined;
  readonly children: ReactNode;
}): ReactElement {
  useEffect(() => {
    if (onAnnounce === undefined) return;
    try {
      onAnnounce("Interactive app content ready");
    } catch {
      // Host-owned announcement failures must not interrupt rendering.
    }
  }, [onAnnounce]);
  return createElement(
    View,
    { accessible: true, accessibilityLabel: "Interactive app content" },
    children,
  );
}

interface McpAppsResultSessionProps {
  readonly arguments: JsonObject;
  readonly components: NativeComponentCatalog;
  readonly onError: (error: unknown) => void;
  readonly onAnnounce?: ((message: string) => void) | undefined;
  readonly options: McpNativeHostMcpAppsRendererOptions;
  readonly result: McpNativeHostMcpAppsResult;
  readonly tools: readonly McpTool[];
}

function McpAppsResultSession({
  arguments: arguments_,
  components,
  onError,
  onAnnounce,
  options,
  result,
  tools,
}: McpAppsResultSessionProps): ReactElement {
  const [sessionOptions] = useState(options);
  const [generation, setGeneration] = useState(0);
  const [failed, setFailed] = useState<"crashed" | "session" | undefined>();
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const mountedRef = useRef(true);
  const deliveredRef = useRef(false);
  const reportSessionError = useCallback((error: unknown) => {
    if (!mountedRef.current) return;
    setFailed("session");
    reportHostError(onErrorRef.current, asRenderError("mcp-app-session-failed", error));
  }, []);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const setup = useMemo(() => {
    const transport: {
      current: ((serializedMessage: string) => void | Promise<void>) | undefined;
    } = { current: undefined };
    let bridge: McpAppsBridge | undefined;
    let owned = true;
    let sessionFailed = false;
    try {
      deliveredRef.current = false;
      const sandbox = createMcpAppsNativeSandbox(result.resource, sessionOptions.sandboxPolicy);
      const postMessage = (serializedMessage: string) => {
        const mountedPostMessage = transport.current;
        if (mountedPostMessage === undefined) {
          throw new McpNativeHostRenderError("mcp-app-session-failed");
        }
        return mountedPostMessage(serializedMessage);
      };
      bridge = new McpAppsBridge({
        ...sessionOptions.bridgeOptions,
        resource: result.resource,
        sandbox,
        postMessage,
        tools,
      });
      const sessionBridge = bridge;
      const close = () => {
        transport.current = undefined;
        sessionBridge.close();
      };
      const failSession = (error: unknown) => {
        if (!owned || sessionFailed) return;
        sessionFailed = true;
        close();
        reportSessionError(error);
      };
      const bindPostMessage = (
        mountedPostMessage: (serializedMessage: string) => void | Promise<void>,
      ) => {
        if (typeof mountedPostMessage !== "function") {
          throw new TypeError("MCP Apps view must bind a postMessage function");
        }
        if (!owned || sessionFailed) {
          throw new McpNativeHostRenderError("mcp-app-session-failed");
        }
        transport.current = mountedPostMessage;
        return () => {
          if (transport.current === mountedPostMessage) transport.current = undefined;
        };
      };
      const webViewProps = createMcpAppsReactNativeWebViewProps(sandbox, {
        async onMessage(serializedMessage) {
          await sessionBridge.receive(serializedMessage);
          if (sessionBridge.state === "ready" && !deliveredRef.current) {
            deliveredRef.current = true;
            await sessionBridge.sendToolInput(arguments_);
            await sessionBridge.sendToolResult(result.result);
          }
        },
        ...(sessionOptions.onExternalLink === undefined
          ? {}
          : { onExternalLink: sessionOptions.onExternalLink }),
        onError(error) {
          failSession(error);
        },
      });
      return {
        bindPostMessage,
        dispose() {
          if (!owned) return;
          owned = false;
          if (sessionBridge.state === "ready") {
            void sessionBridge.requestResourceTeardown().then(close, close);
          } else {
            close();
          }
        },
        onCrash() {
          if (!owned || sessionFailed) return;
          sessionFailed = true;
          close();
          reportHostError(onErrorRef.current, new McpNativeHostRenderError("mcp-app-crashed"));
          setFailed("crashed");
        },
        webViewProps,
      } as const;
    } catch (error) {
      owned = false;
      transport.current = undefined;
      bridge?.close();
      return { error: asRenderError("mcp-app-session-failed", error) } as const;
    }
  }, [arguments_, generation, reportSessionError, result, sessionOptions, tools]);

  useEffect(() => {
    if ("error" in setup) {
      reportHostError(onErrorRef.current, setup.error);
      return;
    }
    return setup.dispose;
  }, [setup]);

  if ("error" in setup) {
    return renderState(
      components,
      "Interactive result unavailable",
      "The isolated MCP Apps session could not be created.",
      {
        retry: () => {
          setFailed(undefined);
          setGeneration((current) => current + 1);
        },
        severity: "error",
        onAnnounce,
      },
    );
  }

  if (failed !== undefined) {
    return renderState(
      components,
      failed === "crashed" ? "Interactive view stopped" : "Interactive result unavailable",
      failed === "crashed"
        ? "The isolated MCP Apps view stopped unexpectedly."
        : "The isolated MCP Apps session could not continue.",
      {
        retry: () => {
          setFailed(undefined);
          setGeneration((current) => current + 1);
        },
        severity: "error",
        onAnnounce,
      },
    );
  }

  return createElement(InteractiveResultAnnouncer, {
    View: components.View,
    onAnnounce,
    children: createElement(sessionOptions.View, {
      key: generation,
      webViewProps: setup.webViewProps,
      bindPostMessage: setup.bindPostMessage,
      onCrash: setup.onCrash,
    }),
  });
}

interface HostRenderBoundaryProps {
  readonly children?: ReactNode;
  readonly components: NativeComponentCatalog;
  readonly errorCode: "a2ui-render-failed" | "result-render-failed";
  readonly onError: (error: unknown) => void;
  readonly onAnnounce?: ((message: string) => void) | undefined;
  readonly resetKey: string;
}

interface HostRenderBoundaryState {
  readonly failed: boolean;
  readonly resetKey: string;
}

class HostRenderBoundary extends Component<HostRenderBoundaryProps, HostRenderBoundaryState> {
  override state: HostRenderBoundaryState = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError(): Partial<HostRenderBoundaryState> {
    return { failed: true };
  }

  static getDerivedStateFromProps(
    props: HostRenderBoundaryProps,
    state: HostRenderBoundaryState,
  ): Partial<HostRenderBoundaryState> | null {
    return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey };
  }

  override componentDidCatch(error: unknown): void {
    reportHostError(this.props.onError, asRenderError(this.props.errorCode, error));
  }

  override render(): ReactNode {
    return this.state.failed
      ? renderState(
          this.props.components,
          "Result unavailable",
          "The validated result could not be rendered.",
          { severity: "error", onAnnounce: this.props.onAnnounce },
        )
      : this.props.children;
  }
}

interface RenderStateOptions {
  /** Present only for states with a recoverable action; renders a Retry button when set. */
  readonly retry?: () => void;
  /** Marks the state as in-progress via `accessibilityState.busy`. */
  readonly busy?: boolean;
  /** "error" uses an assertive Android live region; "info" (default) uses polite. */
  readonly severity?: "error" | "info";
  readonly onAnnounce?: ((message: string) => void) | undefined;
  /** Overrides the announced message; used to keep long result text out of the announcement. */
  readonly announceOverride?: string;
}

function renderState(
  components: NativeComponentCatalog,
  title: string,
  detail: string,
  options: RenderStateOptions = {},
): ReactElement {
  return createElement(HostStateView, { components, title, detail, options });
}

function HostStateView({
  components,
  title,
  detail,
  options,
}: {
  readonly components: NativeComponentCatalog;
  readonly title: string;
  readonly detail: string;
  readonly options: RenderStateOptions;
}): ReactElement {
  const { retry, busy = false, severity = "info", onAnnounce, announceOverride } = options;
  const message = announceOverride ?? `${title}. ${detail}`;
  useEffect(() => {
    if (onAnnounce === undefined) return;
    try {
      onAnnounce(message);
    } catch {
      // Host-owned announcement failures must not interrupt rendering.
    }
  }, [message, onAnnounce]);

  const children: ReactElement[] = [
    createElement(components.Text, {
      key: "title",
      accessible: true,
      accessibilityRole: "text",
      allowFontScaling: true,
      children: title,
    }),
    createElement(components.Text, {
      key: "detail",
      accessible: true,
      accessibilityLiveRegion: severity === "error" ? "assertive" : "polite",
      accessibilityRole: "text",
      allowFontScaling: true,
      children: detail,
    }),
  ];
  if (retry !== undefined) {
    children.push(
      createElement(components.Button, {
        key: "retry",
        accessible: true,
        accessibilityLabel: "Retry",
        accessibilityRole: "button",
        accessibilityState: Object.freeze({ disabled: false }),
        onPress: retry,
        title: "Retry",
      }),
    );
  }
  return createElement(
    components.View,
    {
      accessible: false,
      ...(busy ? { accessibilityState: Object.freeze({ busy: true }) } : {}),
    },
    children,
  );
}

function selectOrdinaryText(result: McpToolCallResult): string {
  let output = "";
  let omitted = false;
  for (const block of result.content) {
    if (block.type !== "text") {
      omitted = true;
      continue;
    }
    const separator = output.length === 0 ? "" : "\n";
    const available = MCP_NATIVE_HOST_MAX_ORDINARY_TEXT_LENGTH - output.length;
    if (separator.length + block.text.length > available) {
      output += `${separator}${block.text.slice(0, Math.max(0, available - separator.length))}`;
      omitted = true;
      break;
    }
    output += `${separator}${block.text}`;
  }
  if (output.length === 0) return "The tool returned non-text MCP content.";
  if (!omitted) return output;
  const notice = "\n[Additional MCP content omitted]";
  return `${output.slice(0, MCP_NATIVE_HOST_MAX_ORDINARY_TEXT_LENGTH - notice.length)}${notice}`;
}

function createResultResetKey(
  snapshot: McpNativeHostSnapshot,
  activeCall: McpNativeHostActiveCall | undefined,
): string {
  const call = snapshot.call;
  if (call.kind !== "resolved")
    return `${snapshot.connection.kind}:${snapshot.tools.kind}:${call.kind}`;
  return `${call.kind}:${activeCall?.id ?? "unbound"}:${call.result.kind}`;
}

function selectRenderErrorCode(
  snapshot: McpNativeHostSnapshot,
  activeCall: McpNativeHostActiveCall | undefined,
): "a2ui-render-failed" | "result-render-failed" {
  return snapshot.call.kind === "resolved" &&
    activeCall?.result === snapshot.call.result &&
    snapshot.call.result.kind === "a2ui"
    ? "a2ui-render-failed"
    : "result-render-failed";
}

function asRenderError(
  code: McpNativeHostRenderErrorCode,
  cause: unknown,
): McpNativeHostRenderError {
  return cause instanceof McpNativeHostRenderError
    ? cause
    : new McpNativeHostRenderError(code, { cause });
}

function reportHostError(onError: (error: unknown) => void, error: unknown): void {
  try {
    void Promise.resolve(onError(error)).catch(() => {
      // Error reporting is observational and must not reopen a contained server-triggered failure.
    });
  } catch {
    // A broken local observer must not escape a render, effect, event, or teardown boundary.
  }
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const RENDER_ERROR_MESSAGES: Readonly<Record<McpNativeHostRenderErrorCode, string>> = Object.freeze(
  {
    "a2ui-render-failed": "MCP native host could not render the A2UI result",
    "mcp-app-crashed": "MCP native host WebView process stopped",
    "mcp-app-session-failed": "MCP native host could not create the MCP Apps session",
    "result-render-failed": "MCP native host could not render the result state",
  },
);
