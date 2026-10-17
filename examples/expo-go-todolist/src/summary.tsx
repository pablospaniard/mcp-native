import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { createContractActionAuthorization } from "@mcp-native/host/contracts";
import {
  ContractHostProvider,
  ContractNativeResultView,
  createContractNativeRegistration,
  createContractNativeRegistry,
  useContractHost,
  type ContractNativeRendererProps,
} from "@mcp-native/host/contracts/react-native";
import type { TodoCounts } from "./domain";
import { appStyles } from "./catalog";
import { createSummaryController, summaryAdapter } from "./summary-contract";

function SummaryCard({ model, dispatchEvent, createRenderBudget }: ContractNativeRendererProps) {
  const renderBudget = createRenderBudget();
  renderBudget.consume(3);
  const [message, setMessage] = useState("Review your current task counts.");
  const [busy, setBusy] = useState(false);
  return (
    <View style={{ gap: 20 }}>
      <Text accessibilityRole="header" style={appStyles.header}>
        Task summary
      </Text>
      <Text style={appStyles.subtitle}>
        {String(model.active)} active · {String(model.completed)} completed · {String(model.total)}{" "}
        total
      </Text>
      <Text accessibilityLiveRegion="polite" style={appStyles.status}>
        {message}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Acknowledge task summary"
        disabled={busy}
        onPress={() => {
          setBusy(true);
          void dispatchEvent({ name: "acknowledge" }).then((outcome) => {
            setBusy(false);
            setMessage(
              outcome.kind === "delivered" ? "Summary acknowledged" : "Acknowledgment unavailable",
            );
          });
        }}
        style={appStyles.resetButton}
      >
        <Text style={appStyles.resetText}>Acknowledge</Text>
      </Pressable>
    </View>
  );
}
const nativeRegistry = createContractNativeRegistry([
  createContractNativeRegistration({ adapter: summaryAdapter, component: SummaryCard }),
]);
function SummaryResult() {
  const { controller } = useContractHost();
  useEffect(() => {
    let active = true;
    void controller
      .start()
      .then(() => (active ? controller.callTool("task_summary") : undefined))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [controller]);
  return (
    <ContractNativeResultView
      fallback={(status) => (
        <Text accessibilityRole="alert">
          {status === "render-failed" ? "Summary could not be displayed" : "Loading task summary…"}
        </Text>
      )}
    />
  );
}
export function TaskSummary({ counts }: { readonly counts: TodoCounts }) {
  const [setup] = useState(() => ({
    controller: createSummaryController(nativeRegistry.registry, counts),
    // This local event only acknowledges a snapshot; it grants no tool or device access.
    authorization: createContractActionAuthorization({
      authorize: (request) => request.kind === "contract" && request.event.name === "acknowledge",
    }),
    onEvent: () => {},
  }));
  return (
    <ContractHostProvider
      controller={setup.controller}
      nativeRegistry={nativeRegistry}
      authorization={setup.authorization}
      onEvent={setup.onEvent}
      onError={() => {}}
    >
      <SummaryResult />
    </ContractHostProvider>
  );
}
