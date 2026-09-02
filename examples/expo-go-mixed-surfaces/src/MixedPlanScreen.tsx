import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  AccessibilityInfo,
  AppState,
  BackHandler,
  Dimensions,
  Keyboard,
  PixelRatio,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { A2uiV1NativeSurface } from "@mcp-native/react-native";
import {
  McpAppsBridge,
  createMcpAppsNativeDeliveryScript,
  createMcpAppsNativeSandbox,
  createMcpAppsReactNativeWebViewProps,
} from "@mcp-native/webview";
import {
  McpNativeMixedSurfaceCoordinator,
  createMcpNativeMixedA2uiRegion,
  createMcpNativeMixedMcpAppsRegion,
} from "mcp-native";

import { cityCatalog, cityPalette } from "./catalog";
import {
  authorizeSaveCityStop,
  cityCanvasResource,
  createSavedStopResult,
  parseSavedStop,
  saveCityStopTool,
} from "./mcp-app";
import { citySurfacePolicy, createSummarySurface, getCityVibeDetails } from "./surfaces";
import type { CityVibe, SavedStop } from "./types";

export interface MixedPlanScreenProps {
  readonly onBack: () => void;
  readonly onSaveStop: (stop: SavedStop) => void;
  readonly savedStops: readonly SavedStop[];
  readonly vibe: CityVibe;
}

function getOrientation() {
  const { height, width } = Dimensions.get("window");
  return width > height ? ("landscape-left" as const) : ("portrait" as const);
}

export function MixedPlanScreen({ onBack, onSaveStop, savedStops, vibe }: MixedPlanScreenProps) {
  const webViewRef = useRef<WebView<Record<never, never>>>(null);
  const [error, setError] = useState<string>();
  const summarySurface = useMemo(() => createSummarySurface(vibe), [vibe]);
  const sandbox = useMemo(() => createMcpAppsNativeSandbox(cityCanvasResource), []);
  const bridge = useMemo(
    () =>
      new McpAppsBridge({
        resource: cityCanvasResource,
        sandbox,
        hostInfo: {
          name: "mcp-native-city-canvas",
          title: "City Canvas Expo Go host",
          version: "1.0.0",
        },
        tools: [saveCityStopTool],
        handlers: {
          authorizeToolCall: authorizeSaveCityStop,
          callTool(_name, arguments_) {
            const stop = parseSavedStop(arguments_);
            if (stop === undefined) throw new Error("The host rejected an unknown city stop");
            onSaveStop(stop);
            return createSavedStopResult(stop);
          },
        },
        postMessage(serialized) {
          const view = webViewRef.current;
          if (view === null) throw new Error("The isolated WebView is not mounted");
          view.injectJavaScript(createMcpAppsNativeDeliveryScript(serialized));
        },
        onProtocolError(cause) {
          setError(cause.message);
        },
      }),
    [onSaveStop, sandbox],
  );
  const coordinator = useMemo(() => {
    const nativeRegion = createMcpNativeMixedA2uiRegion({
      id: "native-route-summary",
      accessibilityLabel: "Native route summary",
      surface: summarySurface,
      policy: citySurfacePolicy,
      lifecycle: { onBack: () => false },
    });
    const appRegion = createMcpNativeMixedMcpAppsRegion({
      id: "interactive-city-app",
      accessibilityLabel: "Interactive isolated city canvas",
      resource: cityCanvasResource,
      sandbox,
      bridge,
      lifecycle: {
        onBack: () => false,
        onRecover: () => webViewRef.current?.reload(),
      },
    });
    return new McpNativeMixedSurfaceCoordinator({
      regions: [nativeRegion, appRegion],
      initialFocusedRegionId: nativeRegion.id,
    });
  }, [bridge, sandbox, summarySurface]);
  const subscribe = useCallback(
    (listener: () => void) => coordinator.subscribe(listener),
    [coordinator],
  );
  const snapshot = useSyncExternalStore(
    subscribe,
    coordinator.getSnapshot,
    coordinator.getSnapshot,
  );
  const webViewProps = useMemo(
    () =>
      createMcpAppsReactNativeWebViewProps(sandbox, {
        onMessage: (serialized) => bridge.receive(serialized),
        onError(cause) {
          setError(cause instanceof Error ? cause.message : "MCP Apps host callback failed");
        },
      }),
    [bridge, sandbox],
  );
  const webViewComponentProps = useMemo(
    () => ({ ...webViewProps, originWhitelist: [...webViewProps.originWhitelist] }),
    [webViewProps],
  );

  useEffect(() => {
    let disposed = false;
    const report = (cause: unknown) => {
      if (!disposed)
        setError(cause instanceof Error ? cause.message : "Mixed-surface lifecycle failed");
    };
    void coordinator.start().catch(report);
    const appState = AppState.addEventListener("change", (state) => {
      void coordinator.setActivity(state === "active" ? "foreground" : "background").catch(report);
    });
    const dimensions = Dimensions.addEventListener("change", () => {
      void coordinator
        .setEnvironment({
          ...coordinator.getSnapshot().environment,
          dynamicTypeScale: PixelRatio.getFontScale(),
          orientation: getOrientation(),
        })
        .catch(report);
    });
    const keyboardDidShow = Keyboard.addListener("keyboardDidShow", () => {
      void coordinator
        .setEnvironment({ ...coordinator.getSnapshot().environment, keyboardVisible: true })
        .catch(report);
    });
    const keyboardDidHide = Keyboard.addListener("keyboardDidHide", () => {
      void coordinator
        .setEnvironment({ ...coordinator.getSnapshot().environment, keyboardVisible: false })
        .catch(report);
    });
    const hardwareBack = BackHandler.addEventListener("hardwareBackPress", () => {
      void coordinator
        .handleBack()
        .then((handled) => {
          if (!handled) onBack();
        })
        .catch(report);
      return true;
    });
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reducedMotion) =>
        coordinator.setEnvironment({
          ...coordinator.getSnapshot().environment,
          dynamicTypeScale: PixelRatio.getFontScale(),
          orientation: getOrientation(),
          reducedMotion,
        }),
      )
      .catch(report);
    return () => {
      disposed = true;
      appState.remove();
      dimensions.remove();
      keyboardDidShow.remove();
      keyboardDidHide.remove();
      hardwareBack.remove();
      void coordinator.dispose().catch(() => {
        // Both regions are already unmounted, so there is no remaining UI error boundary.
      });
    };
  }, [coordinator, onBack]);

  const reportCrash = (message: string) => {
    void coordinator.reportCrash("interactive-city-app", new Error(message)).catch((cause) => {
      setError(cause instanceof Error ? cause.message : "WebView crash handling failed");
    });
  };
  const readyRegions = snapshot.regions.filter((region) => region.status === "ready").length;
  const appRegion = snapshot.regions[1];
  const details = getCityVibeDetails(vibe);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Back to city mood"
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Text allowFontScaling style={styles.backLabel}>
            ←
          </Text>
        </Pressable>
        <View style={styles.headerCopy}>
          <Text allowFontScaling style={styles.eyebrow}>
            LIVE PLAN · {details.label.toUpperCase()}
          </Text>
          <Text accessibilityRole="header" allowFontScaling style={styles.title}>
            Two surfaces, one host.
          </Text>
        </View>
        <View accessibilityLabel={`${savedStops.length} saved stops`} style={styles.savedBadge}>
          <Text allowFontScaling style={styles.savedCount}>
            {savedStops.length}
          </Text>
          <Text allowFontScaling style={styles.savedLabel}>
            saved
          </Text>
        </View>
      </View>

      {snapshot.regions[0]?.visibility === "visible" && (
        <View
          accessibilityLabel={snapshot.regions[0].accessibilityLabel}
          onTouchStart={() => {
            void coordinator.transferFocus("native-route-summary").catch(() => undefined);
          }}
          style={styles.nativeRegion}
        >
          <A2uiV1NativeSurface
            components={cityCatalog}
            onAction={() => undefined}
            policy={citySurfacePolicy}
            surface={summarySurface}
          />
        </View>
      )}

      {appRegion?.visibility === "visible" && (
        <View
          accessibilityLabel={appRegion.accessibilityLabel}
          onTouchStart={() => {
            void coordinator.transferFocus("interactive-city-app").catch(() => undefined);
          }}
          style={styles.appRegion}
        >
          <WebView<Record<never, never>>
            {...webViewComponentProps}
            accessibilityLabel="Isolated MCP Apps city canvas"
            onContentProcessDidTerminate={() => reportCrash("Web content process ended")}
            onError={() => reportCrash("Web content failed to load")}
            onRenderProcessGone={() => reportCrash("Web renderer process ended")}
            ref={webViewRef}
            style={styles.webView}
          />
          {appRegion.status === "crashed" && (
            <View style={styles.crashOverlay}>
              <Text allowFontScaling style={styles.crashTitle}>
                The isolated view stopped
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  void coordinator.recover("interactive-city-app").catch(() => undefined)
                }
                style={styles.reloadButton}
              >
                <Text allowFontScaling style={styles.reloadLabel}>
                  Reload securely
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      <View style={styles.hostStatus}>
        <View style={styles.hostDot} />
        <Text accessibilityLiveRegion="polite" allowFontScaling style={styles.hostStatusText}>
          {error ?? `${readyRegions}/2 host-owned sibling regions ready`}
        </Text>
        <Text allowFontScaling style={styles.platformLabel}>
          {Platform.OS.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  appRegion: {
    backgroundColor: cityPalette.panel,
    borderColor: cityPalette.border,
    borderRadius: 28,
    borderWidth: 1,
    flex: 1,
    minHeight: 360,
    overflow: "hidden",
  },
  backButton: {
    alignItems: "center",
    backgroundColor: cityPalette.panelRaised,
    borderColor: cityPalette.border,
    borderRadius: 16,
    borderWidth: 1,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  backLabel: { color: cityPalette.ink, fontSize: 24, fontWeight: "700", marginTop: -2 },
  crashOverlay: {
    alignItems: "center",
    backgroundColor: cityPalette.panel,
    gap: 14,
    inset: 0,
    justifyContent: "center",
    padding: 24,
    position: "absolute",
  },
  crashTitle: { color: cityPalette.ink, fontSize: 17, fontWeight: "800" },
  eyebrow: {
    color: cityPalette.mint,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
    marginBottom: 5,
  },
  header: { alignItems: "center", flexDirection: "row", gap: 12 },
  headerCopy: { flex: 1 },
  hostDot: { backgroundColor: cityPalette.mint, borderRadius: 99, height: 7, width: 7 },
  hostStatus: { alignItems: "center", flexDirection: "row", gap: 8, minHeight: 28 },
  hostStatusText: { color: cityPalette.muted, flex: 1, fontSize: 11, fontWeight: "700" },
  nativeRegion: { marginTop: 2 },
  platformLabel: { color: cityPalette.lavender, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  pressed: { opacity: 0.68 },
  reloadButton: {
    backgroundColor: cityPalette.lemon,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  reloadLabel: { color: "#21180A", fontSize: 13, fontWeight: "900" },
  savedBadge: {
    alignItems: "center",
    backgroundColor: cityPalette.lavender,
    borderRadius: 17,
    minWidth: 48,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  savedCount: { color: "#130E26", fontSize: 17, fontWeight: "900", lineHeight: 18 },
  savedLabel: { color: "#2B2052", fontSize: 8, fontWeight: "900", textTransform: "uppercase" },
  screen: {
    backgroundColor: cityPalette.canvas,
    flex: 1,
    gap: 12,
    paddingBottom: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  title: { color: cityPalette.ink, fontSize: 23, fontWeight: "900", letterSpacing: -0.7 },
  webView: { backgroundColor: cityPalette.panel, flex: 1 },
});
