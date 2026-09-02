import type { McpNativeMixedSurfaceCoordinator } from "mcp-native";

export const CITY_CANVAS_APP_REGION_ID = "interactive-city-app";
export const CITY_CANVAS_NATIVE_REGION_ID = "native-route-summary";

type BackCoordinator = Pick<McpNativeMixedSurfaceCoordinator, "handleBack">;
type RecoveryCoordinator = Pick<McpNativeMixedSurfaceCoordinator, "recover">;

export async function handleMixedPlanBack(
  coordinator: BackCoordinator,
  onUnhandled: () => void,
): Promise<void> {
  if (!(await coordinator.handleBack())) onUnhandled();
}

export async function recoverMixedPlanApp(coordinator: RecoveryCoordinator): Promise<void> {
  await coordinator.recover(CITY_CANVAS_APP_REGION_ID);
}

export function advanceMixedPlanSession(session: number): number {
  return session >= Number.MAX_SAFE_INTEGER ? 0 : session + 1;
}
