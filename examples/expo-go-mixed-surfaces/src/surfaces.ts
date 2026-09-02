import {
  A2uiSurfaceStore,
  createA2uiV1BasicCatalogPolicy,
  type A2uiV1Component,
  type A2uiV1CreateSurfaceEnvelope,
  type A2uiV1SurfaceState,
} from "@mcp-native/a2ui";
import type { JsonObject } from "@mcp-native/core";

import type { CityVibe } from "./types";

export const EXPLORE_SURFACE_ID = "city-canvas-explore";
export const SUMMARY_SURFACE_ID = "city-canvas-summary";

export const citySurfacePolicy = createA2uiV1BasicCatalogPolicy({
  allowedComponentNames: ["Button", "Card", "ChoicePicker", "Column", "Divider", "Row", "Text"],
  allowedEventNames: ["open_live_plan"],
});

const vibeDetails: Readonly<
  Record<CityVibe, { readonly label: string; readonly route: string; readonly accent: string }>
> = Object.freeze({
  culture: {
    label: "Culture trail",
    route: "Retiro → Prado → Barrio de las Letras",
    accent: "Gallery light, shaded streets, and a late vermouth.",
  },
  food: {
    label: "Food crawl",
    route: "Lavapiés → La Latina → Conde Duque",
    accent: "Market bites, tiny bars, and one table worth waiting for.",
  },
  "after-dark": {
    label: "After dark",
    route: "Malasaña → Gran Vía → Templo de Debod",
    accent: "Rooftop color, neon corners, and a sunset finish.",
  },
});

export function getCityVibeDetails(vibe: CityVibe) {
  return vibeDetails[vibe];
}

export function readCityVibe(dataModel: JsonObject | undefined, fallback: CityVibe): CityVibe {
  const value = dataModel?.vibe;
  if (!Array.isArray(value) || value.length !== 1) return fallback;
  const selected = value[0];
  return selected === "culture" || selected === "food" || selected === "after-dark"
    ? selected
    : fallback;
}

export function createCityActionMetadata(platform: string): JsonObject {
  return { extensions: { example: "expo-go-mixed-surfaces", platform } };
}

export function createExploreSurface(vibe: CityVibe): A2uiV1SurfaceState {
  const details = getCityVibeDetails(vibe);
  const components: A2uiV1Component[] = [
    { id: "root", component: "Card", child: "content" },
    {
      id: "content",
      component: "Column",
      children: ["eyebrow", "intro", "divider", "vibe", "route-card", "open-plan"],
    },
    {
      id: "eyebrow",
      component: "Text",
      text: "Native A2UI · live local controls",
      variant: "caption",
    },
    {
      id: "intro",
      component: "Text",
      text: "Choose a mood. This entire card is validated A2UI data rendered by components bundled with the host app.",
      variant: "body",
    },
    { id: "divider", component: "Divider", axis: "horizontal" },
    {
      id: "vibe",
      component: "ChoicePicker",
      label: "What should Madrid feel like?",
      variant: "mutuallyExclusive",
      displayStyle: "chips",
      options: [
        { label: "Art & shade", value: "culture" },
        { label: "Taste everything", value: "food" },
        { label: "Chase the glow", value: "after-dark" },
      ],
      value: { path: "/vibe" },
    },
    { id: "route-card", component: "Card", child: "route-content" },
    {
      id: "route-content",
      component: "Column",
      children: ["route-label", "route", "accent"],
    },
    { id: "route-label", component: "Text", text: details.label, variant: "caption" },
    { id: "route", component: "Text", text: details.route, variant: "body" },
    { id: "accent", component: "Text", text: details.accent, variant: "body" },
    {
      id: "open-plan",
      component: "Button",
      child: "open-plan-label",
      variant: "primary",
      action: { event: { name: "open_live_plan" } },
      accessibility: { description: "Opens the mixed native and WebView city plan" },
    },
    { id: "open-plan-label", component: "Text", text: "Open the live city canvas  →" },
  ];
  return createValidatedSurface({
    version: "v1.0",
    createSurface: {
      surfaceId: EXPLORE_SURFACE_ID,
      sendDataModel: true,
      components,
      dataModel: { vibe: [vibe] },
    },
  });
}

export function createSummarySurface(vibe: CityVibe): A2uiV1SurfaceState {
  const details = getCityVibeDetails(vibe);
  const components: A2uiV1Component[] = [
    { id: "root", component: "Card", child: "summary" },
    {
      id: "summary",
      component: "Column",
      children: ["eyebrow", "title-row", "route", "note"],
    },
    { id: "eyebrow", component: "Text", text: "Native A2UI region", variant: "caption" },
    { id: "title-row", component: "Row", children: ["title", "duration"] },
    { id: "title", component: "Text", text: details.label, variant: "body", weight: 1 },
    { id: "duration", component: "Text", text: "6 hours", variant: "caption" },
    { id: "route", component: "Text", text: details.route, variant: "body" },
    {
      id: "note",
      component: "Text",
      text: "The host owns this native summary and places the isolated app directly below it.",
      variant: "caption",
    },
  ];
  return createValidatedSurface({
    version: "v1.0",
    createSurface: {
      surfaceId: SUMMARY_SURFACE_ID,
      components,
      dataModel: { vibe: [vibe] },
    },
  });
}

function createValidatedSurface(envelope: A2uiV1CreateSurfaceEnvelope): A2uiV1SurfaceState {
  const store = new A2uiSurfaceStore();
  store.apply(envelope);
  const surface = store.getValidated(envelope.createSurface.surfaceId, citySurfacePolicy);
  if (surface === undefined) throw new Error("The city lifecycle did not create its surface");
  return surface;
}
