import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Surface } from "@mcp-native/react-native";
import type { ActionEnvelope } from "@mcp-native/a2ui";
import type { JsonObject } from "@mcp-native/core";

import { appStyles, todoCatalog } from "./src/catalog";
import {
  applyTodoAction,
  createInitialTodoState,
  reconcileRendererModel,
  startTodoReset,
  type TodoState,
} from "./src/domain";
import { clearPersistedTodoState, loadTodoState, saveTodoState } from "./src/storage";
import {
  createTodoActionMetadata,
  createValidatedTodoSurface,
  todoSurfacePolicy,
} from "./src/surface";

export default function App() {
  const [state, setState] = useState<TodoState>(createInitialTodoState);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Loading persisted tasks…");
  const idSequence = useRef(0);

  useEffect(() => {
    let active = true;
    void loadTodoState().then(
      (loaded) => {
        if (!active) return;
        setState(loaded);
        setStatus("Ready · state is stored on this device");
        setReady(true);
      },
      () => {
        if (!active) return;
        setStatus("Ready · persistence was unavailable, so this session is in memory");
        setReady(true);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      void saveTodoState(state).catch(() => {
        setStatus("Changes are active, but the latest device save failed");
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [ready, state]);

  const surface = useMemo(() => createValidatedTodoSurface(state), [state]);
  const actionMetadata = useMemo(() => createTodoActionMetadata(Platform.OS), []);

  const createId = useCallback(() => {
    idSequence.current += 1;
    return `todo-${Date.now().toString(36)}-${idSequence.current.toString(36)}`;
  }, []);

  const handleAction = useCallback(
    (envelope: ActionEnvelope, dataModel?: JsonObject) => {
      setState((current) =>
        applyTodoAction(
          current,
          envelope.action.name,
          envelope.action.context,
          dataModel,
          createId,
        ),
      );
      setStatus(`Handled A2UI action: ${envelope.action.name}`);
    },
    [createId],
  );

  const handleDataModelChange = useCallback((dataModel: JsonObject) => {
    setState((current) => reconcileRendererModel(current, dataModel));
  }, []);

  const confirmReset = useCallback(() => {
    Alert.alert("Reset the demo?", "This restores the three example tasks.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: () => {
          const reset = startTodoReset(clearPersistedTodoState);
          setState(reset.state);
          setStatus("Demo tasks restored");
          void reset.persistenceCleared.then((cleared) => {
            if (!cleared) {
              setStatus("Demo tasks restored in memory · the device save could not be cleared");
            }
          });
        },
      },
    ]);
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView edges={["top", "right", "bottom", "left"]} style={appStyles.app}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={appStyles.app}
        >
          <ScrollView
            contentContainerStyle={appStyles.content}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
          >
            <View style={appStyles.headerRow}>
              <View style={appStyles.headerText}>
                <Text allowFontScaling style={appStyles.eyebrow}>
                  Expo Go · MCP Native
                </Text>
                <Text accessibilityRole="header" allowFontScaling style={appStyles.header}>
                  Today
                </Text>
                <Text allowFontScaling style={appStyles.subtitle}>
                  A complete todo workflow rendered from a validated A2UI v1 surface.
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Reset demo tasks"
                accessibilityRole="button"
                onPress={confirmReset}
                style={({ pressed }) => [appStyles.resetButton, pressed && { opacity: 0.65 }]}
              >
                <Text allowFontScaling style={appStyles.resetText}>
                  Reset
                </Text>
              </Pressable>
            </View>
            <Text accessibilityLiveRegion="polite" allowFontScaling style={appStyles.status}>
              {status}
            </Text>
            {ready ? (
              <Surface
                actionMetadata={actionMetadata}
                components={todoCatalog}
                locale="en"
                onAction={handleAction}
                onDataModelChange={handleDataModelChange}
                policy={todoSurfacePolicy}
                surface={surface}
              />
            ) : (
              <ActivityIndicator accessibilityLabel="Loading tasks" color="#176B4D" size="large" />
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
