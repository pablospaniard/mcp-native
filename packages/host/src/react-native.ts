import { A2uiSurfaceStore, type A2uiV1SurfaceValidationPolicy } from "@mcp-native/a2ui";
import {
  parseMcpNativeAction,
  type JsonObject,
  type McpListToolsResult,
  type McpTool,
  type McpToolCallResult,
} from "@mcp-native/core";
import {
  A2uiV1NativeSurface,
  type A2uiV1NativeActionHandler,
  type A2uiV1NativeHostExtensionEventDescriptor,
  type A2uiV1NativeHostExtensionPolicy,
  type A2uiV1NativeImagePolicy,
  type A2uiV1NativeMediaPolicy,
  type A2uiV1NativeOpenUrlHandler,
  type A2uiV1NativeOpenUrlPolicy,
  type NativeComponentCatalog,
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
  const mountedRef = useRef(true);
  const ownershipGeneration = useRef(0);
  const [activeCall, setActiveCall] = useState<McpNativeHostActiveCall | undefined>();

  useEffect(() => {
    const generation = ++ownershipGeneration.current;
    mountedRef.current = true;
    let mounted = true;
    void controller.start().catch((error: unknown) => {
      if (mounted) onErrorRef.current(error);
    });
    return () => {
      mounted = false;
      mountedRef.current = false;
      // React Strict Mode immediately replays effects in development. Deferring teardown by one
      // microtask lets the replacement setup retain ownership without shutting down its controller.
      void Promise.resolve().then(() => {
        if (ownershipGeneration.current !== generation) return;
        return controller.shutdown().catch((error: unknown) => onErrorRef.current(error));
      });
    };
  }, [controller]);

  const callTool = useCallback(
    async (
      name: string,
      arguments_: JsonObject = {},
      options: McpNativeHostRequestOptions = {},
    ) => {
      const action = parseMcpNativeAction({ type: "tool", name, arguments: arguments_ });
      const ownedArguments = deepFreeze(action.arguments ?? {});
      const sequence = ++callSequence.current;
      setActiveCall(Object.freeze({ id: sequence, name: action.name, arguments: ownedArguments }));
      const result = await controller.callTool(action.name, ownedArguments, options);
      if (mountedRef.current && callSequence.current === sequence) {
        setActiveCall(
          Object.freeze({ id: sequence, name: action.name, arguments: ownedArguments, result }),
        );
      }
      return result;
    },
    [controller],
  );

  const value = useMemo<McpNativeHostReactContextValue>(
    () =>
      Object.freeze({
        controller,
        snapshot,
        ...(activeCall === undefined ? {} : { activeCall }),
        callTool,
        cancelCurrentCall: () => controller.cancelCurrentCall(),
        refreshTools: (options?: McpNativeHostRequestOptions) => controller.refreshTools(options),
        retry: () => controller.retry(),
        setOnline: (online: boolean) => controller.setOnline(online),
      }),
    [activeCall, callTool, controller, snapshot],
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
  readonly mcpApps?: McpNativeHostMcpAppsRendererOptions;
  readonly openUrlPolicy?: A2uiV1NativeOpenUrlPolicy;
  readonly onOpenUrl?: A2uiV1NativeOpenUrlHandler;
  readonly imagePolicy?: A2uiV1NativeImagePolicy;
  readonly mediaPolicy?: A2uiV1NativeMediaPolicy;
  readonly hostExtensionPolicy?: A2uiV1NativeHostExtensionPolicy;
  readonly onHostExtensionEvent?: (event: A2uiV1NativeHostExtensionEventDescriptor) => void;
  readonly locale?: string;
}

/**
 * Renders the complete high-level call state through host-installed primitives. Server-controlled
 * values never select a component, WebView configuration, error message, or executable fallback.
 */
export function McpNativeHostResultView(props: McpNativeHostResultViewProps): ReactElement {
  const host = useMcpNativeHost();
  const resetKey = createResultResetKey(host.snapshot, host.activeCall);
  return createElement(
    HostRenderBoundary,
    {
      components: props.components,
      errorCode: selectRenderErrorCode(host.snapshot, host.activeCall),
      onError: props.onError,
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
  readonly props: McpNativeHostResultViewProps;
}): ReactElement {
  return renderSnapshot(host, props);
}

function renderSnapshot(
  host: McpNativeHostReactContextValue,
  props: McpNativeHostResultViewProps,
): ReactElement {
  const connection = host.snapshot.connection;
  if (connection.kind === "loading") {
    return renderState(props.components, "Connecting", "Connecting to the MCP server.");
  }
  if (connection.kind === "empty") {
    return renderState(props.components, "No connection", "No MCP server is configured.");
  }
  if (connection.kind === "denied") {
    return renderState(props.components, "Connection denied", "The host denied this connection.");
  }
  if (connection.kind === "retryable-error") {
    return renderState(
      props.components,
      "Connection unavailable",
      "The MCP server is temporarily unavailable.",
      () => void host.retry().catch(props.onError),
    );
  }
  if (connection.kind === "terminal-error") {
    return renderState(
      props.components,
      "Connection failed",
      "The MCP server connection could not be established.",
      () => void host.retry().catch(props.onError),
    );
  }
  if (connection.kind === "disconnected") {
    const detail =
      connection.reason === "offline"
        ? "The device is offline."
        : connection.reason === "shutdown"
          ? "The MCP host has shut down."
          : "Preparing the MCP connection.";
    return renderState(props.components, "Disconnected", detail);
  }

  if (host.snapshot.tools.kind === "loading") {
    return renderState(props.components, "Loading tools", "Discovering available MCP tools.");
  }
  if (host.snapshot.tools.kind === "error") {
    return renderState(
      props.components,
      "Tools unavailable",
      "The MCP tool list could not be loaded.",
      () => void host.refreshTools().catch(props.onError),
    );
  }

  const call = host.snapshot.call;
  if (call.kind === "idle") {
    return renderState(props.components, "Ready", "Choose an available MCP tool.");
  }
  if (call.kind === "loading") {
    return renderState(props.components, "Working", "The MCP tool is running.");
  }
  if (call.kind === "cancelled") {
    return renderState(props.components, "Cancelled", "The MCP tool call was cancelled.");
  }
  if (call.kind === "error") {
    return renderState(props.components, "Tool failed", "The MCP tool call did not complete.");
  }

  if (host.activeCall?.result !== call.result) {
    return renderState(props.components, "Preparing result", "Preparing validated MCP content.");
  }
  return renderResolvedResult(
    call.result,
    host.activeCall.arguments,
    host.activeCall.id,
    host.snapshot.tools.kind === "ready" ? host.snapshot.tools.result.tools : [],
    props,
  );
}

function renderResolvedResult(
  result: McpNativeHostResult,
  arguments_: JsonObject,
  resultKey: number,
  tools: readonly McpTool[],
  props: McpNativeHostResultViewProps,
): ReactElement {
  switch (result.kind) {
    case "invalid":
      return renderState(
        props.components,
        "Unsupported result",
        "The MCP result could not be rendered safely.",
      );
    case "ordinary":
      if (result.result.isError === true) {
        return renderState(props.components, "Tool error", "The MCP tool returned an error.");
      }
      return renderState(props.components, "Result", selectOrdinaryText(result.result));
    case "a2ui":
      return createElement(A2uiHostResult, { key: resultKey, props, result, resultKey });
    case "mcp-app":
      if (props.mcpApps === undefined) {
        return renderState(
          props.components,
          "Interactive result unavailable",
          "This host has not installed an MCP Apps WebView adapter.",
        );
      }
      return createElement(McpAppsResultSession, {
        key: resultKey,
        arguments: arguments_,
        components: props.components,
        onError: props.onError,
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
  readonly props: McpNativeHostResultViewProps;
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
    return renderState(props.components, "Empty result", "The A2UI result contains no surface.");
  }
  const children = surfaces.map((surface) =>
    createElement(A2uiV1NativeSurface, {
      key: `${resultKey}:${surface.surfaceId}`,
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
    }),
  );
  return createElement(props.components.View, { accessible: true }, children);
}

interface McpAppsResultSessionProps {
  readonly arguments: JsonObject;
  readonly components: NativeComponentCatalog;
  readonly onError: (error: unknown) => void;
  readonly options: McpNativeHostMcpAppsRendererOptions;
  readonly result: McpNativeHostMcpAppsResult;
  readonly tools: readonly McpTool[];
}

function McpAppsResultSession({
  arguments: arguments_,
  components,
  onError,
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
  const postMessageRef = useRef<((serializedMessage: string) => void | Promise<void>) | undefined>(
    undefined,
  );
  const deliveredRef = useRef(false);
  const bindPostMessage = useCallback(
    (postMessage: (serializedMessage: string) => void | Promise<void>) => {
      if (typeof postMessage !== "function") {
        throw new TypeError("MCP Apps view must bind a postMessage function");
      }
      postMessageRef.current = postMessage;
      return () => {
        if (postMessageRef.current === postMessage) postMessageRef.current = undefined;
      };
    },
    [],
  );
  const reportSessionError = useCallback((error: unknown) => {
    if (!mountedRef.current) return;
    setFailed("session");
    onErrorRef.current(asRenderError("mcp-app-session-failed", error));
  }, []);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const setup = useMemo(() => {
    try {
      deliveredRef.current = false;
      const sandbox = createMcpAppsNativeSandbox(result.resource, sessionOptions.sandboxPolicy);
      const postMessage = (serializedMessage: string) => {
        const mountedPostMessage = postMessageRef.current;
        if (mountedPostMessage === undefined) {
          throw new McpNativeHostRenderError("mcp-app-session-failed");
        }
        return mountedPostMessage(serializedMessage);
      };
      const bridge = new McpAppsBridge({
        ...sessionOptions.bridgeOptions,
        resource: result.resource,
        sandbox,
        postMessage,
        tools,
      });
      const webViewProps = createMcpAppsReactNativeWebViewProps(sandbox, {
        async onMessage(serializedMessage) {
          await bridge.receive(serializedMessage);
          if (bridge.state === "ready" && !deliveredRef.current) {
            deliveredRef.current = true;
            await bridge.sendToolInput(arguments_);
            await bridge.sendToolResult(result.result);
          }
        },
        ...(sessionOptions.onExternalLink === undefined
          ? {}
          : { onExternalLink: sessionOptions.onExternalLink }),
        onError(error) {
          reportSessionError(error);
        },
      });
      return { bridge, webViewProps } as const;
    } catch (error) {
      return { error: asRenderError("mcp-app-session-failed", error) } as const;
    }
  }, [arguments_, generation, reportSessionError, result, sessionOptions, tools]);

  useEffect(() => {
    if ("error" in setup) {
      onErrorRef.current(setup.error);
      return;
    }
    const bridge = setup.bridge;
    return () => {
      const close = () => {
        postMessageRef.current = undefined;
        bridge.close();
      };
      if (bridge.state === "ready") {
        void bridge.requestResourceTeardown().then(close, close);
      } else {
        close();
      }
    };
  }, [setup]);

  if ("error" in setup) {
    return renderState(
      components,
      "Interactive result unavailable",
      "The isolated MCP Apps session could not be created.",
      () => {
        setFailed(undefined);
        setGeneration((current) => current + 1);
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
      () => {
        setFailed(undefined);
        setGeneration((current) => current + 1);
      },
    );
  }

  const onCrash = () => {
    setup.bridge.close();
    onErrorRef.current(new McpNativeHostRenderError("mcp-app-crashed"));
    setFailed("crashed");
  };
  return createElement(sessionOptions.View, {
    key: generation,
    webViewProps: setup.webViewProps,
    bindPostMessage,
    onCrash,
  });
}

interface HostRenderBoundaryProps {
  readonly children?: ReactNode;
  readonly components: NativeComponentCatalog;
  readonly errorCode: "a2ui-render-failed" | "result-render-failed";
  readonly onError: (error: unknown) => void;
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
    this.props.onError(asRenderError(this.props.errorCode, error));
  }

  override render(): ReactNode {
    return this.state.failed
      ? renderState(
          this.props.components,
          "Result unavailable",
          "The validated result could not be rendered.",
        )
      : this.props.children;
  }
}

function renderState(
  components: NativeComponentCatalog,
  title: string,
  detail: string,
  retry?: () => void,
): ReactElement {
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
      accessibilityLiveRegion: "polite",
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
      accessible: true,
      accessibilityLabel: title,
      accessibilityLiveRegion: "polite",
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
