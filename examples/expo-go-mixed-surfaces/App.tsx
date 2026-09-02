import { useCallback, useMemo, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import type { A2uiV1ActionEnvelope } from "@mcp-native/a2ui";
import type { JsonObject } from "@mcp-native/core";
import { A2uiV1NativeSurface } from "@mcp-native/react-native";

import { MixedPlanScreen } from "./src/MixedPlanScreen";
import { cityCatalog, cityPalette } from "./src/catalog";
import {
  citySurfacePolicy,
  createCityActionMetadata,
  createExploreSurface,
  readCityVibe,
} from "./src/surfaces";
import type { CityVibe, SavedStop } from "./src/types";

type AppScreen = "explore" | "live-plan";

export default function App() {
  const [screen, setScreen] = useState<AppScreen>("explore");
  const [vibe, setVibe] = useState<CityVibe>("culture");
  const [savedStops, setSavedStops] = useState<readonly SavedStop[]>([]);
  const exploreSurface = useMemo(() => createExploreSurface(vibe), [vibe]);
  const actionMetadata = useMemo(() => createCityActionMetadata(Platform.OS), []);

  const handleModelChange = useCallback(
    (dataModel: JsonObject) => setVibe((current) => readCityVibe(dataModel, current)),
    [],
  );
  const handleExploreAction = useCallback(
    (envelope: A2uiV1ActionEnvelope, dataModel?: JsonObject) => {
      if (envelope.action.name !== "open_live_plan") return;
      setVibe((current) => readCityVibe(dataModel, current));
      setScreen("live-plan");
    },
    [],
  );
  const saveStop = useCallback((stop: SavedStop) => {
    setSavedStops((current) =>
      current.some((candidate) => candidate.id === stop.id) ? current : [...current, stop],
    );
  }, []);
  const closeLivePlan = useCallback(() => setScreen("explore"), []);

  return (
    <SafeAreaProvider>
      <SafeAreaView edges={["top", "right", "bottom", "left"]} style={styles.safeArea}>
        <StatusBar style="light" />
        {screen === "explore" ? (
          <ScrollView
            contentContainerStyle={styles.exploreContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View pointerEvents="none" style={styles.coralOrb} />
            <View pointerEvents="none" style={styles.lavenderOrb} />
            <View style={styles.hero}>
              <View style={styles.brandRow}>
                <View style={styles.brandMark}>
                  <Text allowFontScaling style={styles.brandMarkText}>
                    M
                  </Text>
                </View>
                <Text allowFontScaling style={styles.brandName}>
                  CITY CANVAS
                </Text>
                <View style={styles.screenPill}>
                  <Text allowFontScaling style={styles.screenPillText}>
                    01 / 02
                  </Text>
                </View>
              </View>
              <Text accessibilityRole="header" allowFontScaling style={styles.heroTitle}>
                A weekend that feels like you.
              </Text>
              <Text allowFontScaling style={styles.heroSubtitle}>
                Native controls first. An interactive MCP App exactly where HTML adds something
                special.
              </Text>
            </View>

            <View style={styles.statRow}>
              <View style={[styles.statCard, styles.lemonCard]}>
                <Text allowFontScaling style={styles.statNumberDark}>
                  27°
                </Text>
                <Text allowFontScaling style={styles.statLabelDark}>
                  soft sun
                </Text>
              </View>
              <View style={[styles.statCard, styles.purpleCard]}>
                <Text allowFontScaling style={styles.statNumberLight}>
                  8:41
                </Text>
                <Text allowFontScaling style={styles.statLabelLight}>
                  last light
                </Text>
              </View>
              <View style={[styles.statCard, styles.darkCard]}>
                <Text allowFontScaling style={styles.statNumberLight}>
                  4.2 km
                </Text>
                <Text allowFontScaling style={styles.statLabelLight}>
                  easy pace
                </Text>
              </View>
            </View>

            <A2uiV1NativeSurface
              actionMetadata={actionMetadata}
              components={cityCatalog}
              onAction={handleExploreAction}
              onDataModelChange={handleModelChange}
              policy={citySurfacePolicy}
              surface={exploreSurface}
            />

            <View style={styles.footerNote}>
              <View style={styles.footerDot} />
              <Text allowFontScaling style={styles.footerText}>
                Screen one is React Native + validated A2UI. Screen two adds an isolated WebView as
                a host-owned sibling.
              </Text>
            </View>
          </ScrollView>
        ) : (
          <MixedPlanScreen
            onBack={closeLivePlan}
            onSaveStop={saveStop}
            savedStops={savedStops}
            vibe={vibe}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  brandMark: {
    alignItems: "center",
    backgroundColor: cityPalette.coral,
    borderRadius: 12,
    height: 34,
    justifyContent: "center",
    transform: [{ rotate: "-7deg" }],
    width: 34,
  },
  brandMarkText: { color: "#2A1020", fontSize: 18, fontWeight: "900" },
  brandName: { color: cityPalette.ink, flex: 1, fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  brandRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  coralOrb: {
    backgroundColor: cityPalette.coral,
    borderRadius: 999,
    height: 190,
    opacity: 0.2,
    position: "absolute",
    right: -92,
    top: 72,
    width: 190,
  },
  darkCard: {
    backgroundColor: cityPalette.panelRaised,
    borderColor: cityPalette.border,
    borderWidth: 1,
  },
  exploreContent: {
    gap: 18,
    overflow: "hidden",
    paddingBottom: 34,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  footerDot: {
    backgroundColor: cityPalette.mint,
    borderRadius: 99,
    height: 8,
    marginTop: 4,
    width: 8,
  },
  footerNote: { flexDirection: "row", gap: 9, paddingHorizontal: 7 },
  footerText: { color: cityPalette.muted, flex: 1, fontSize: 12, lineHeight: 18 },
  hero: { gap: 12, paddingHorizontal: 5 },
  heroSubtitle: { color: cityPalette.muted, fontSize: 16, lineHeight: 24, maxWidth: 340 },
  heroTitle: {
    color: cityPalette.ink,
    fontSize: 43,
    fontWeight: "900",
    letterSpacing: -1.8,
    lineHeight: 45,
    marginTop: 17,
    maxWidth: 350,
  },
  lavenderOrb: {
    backgroundColor: cityPalette.lavender,
    borderRadius: 999,
    height: 140,
    left: -100,
    opacity: 0.12,
    position: "absolute",
    top: 245,
    width: 140,
  },
  lemonCard: { backgroundColor: cityPalette.lemon },
  purpleCard: { backgroundColor: cityPalette.lavender },
  safeArea: { backgroundColor: cityPalette.canvas, flex: 1 },
  screenPill: {
    borderColor: cityPalette.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  screenPillText: { color: cityPalette.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  statCard: { borderRadius: 20, flex: 1, minHeight: 78, padding: 12 },
  statLabelDark: { color: "#5A4610", fontSize: 10, fontWeight: "800", marginTop: 5 },
  statLabelLight: { color: "#D1C7E1", fontSize: 10, fontWeight: "800", marginTop: 5 },
  statNumberDark: { color: "#2D2108", fontSize: 18, fontWeight: "900" },
  statNumberLight: { color: cityPalette.ink, fontSize: 18, fontWeight: "900" },
  statRow: { flexDirection: "row", gap: 9 },
});
