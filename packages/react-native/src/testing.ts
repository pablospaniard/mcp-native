import { A2uiSurfaceStore } from "@mcp-native/a2ui";
import type { A2uiV1SurfaceState } from "@mcp-native/a2ui";
import type { JsonObject } from "@mcp-native/core";

export interface A2uiV1NativeCatalogConformanceCase {
  readonly id: string;
  readonly description: string;
  readonly surface: A2uiV1SurfaceState;
  readonly requiredComponentNames: readonly string[];
  readonly expectedBehaviors: readonly string[];
  readonly requiredEventNames: readonly string[];
}

interface ConformanceCaseDefinition {
  readonly id: string;
  readonly description: string;
  readonly components: readonly JsonObject[];
  readonly dataModel?: JsonObject;
  readonly requiredComponentNames: readonly string[];
  readonly expectedBehaviors: readonly string[];
  readonly requiredEventNames?: readonly string[];
}

const DEFINITIONS: readonly ConformanceCaseDefinition[] = Object.freeze([
  {
    id: "divider-axes",
    description: "Both Divider axes inside a simple column.",
    components: [
      { id: "root", component: "Column", children: ["horizontal", "vertical"] },
      { id: "horizontal", component: "Divider", axis: "horizontal" },
      { id: "vertical", component: "Divider", axis: "vertical" },
    ],
    requiredComponentNames: ["Column", "Divider"],
    expectedBehaviors: [
      "horizontal remains a horizontal decorative separator",
      "vertical remains a vertical decorative separator",
      "neither divider is accessibility-focusable",
    ],
  },
  {
    id: "choice-picker-modes",
    description: "Single and multiple ChoicePicker semantics and callbacks.",
    components: [
      { id: "root", component: "Column", children: ["single", "multiple"] },
      {
        id: "single",
        component: "ChoicePicker",
        label: "Color",
        variant: "mutuallyExclusive",
        options: [
          { label: "Red", value: "red" },
          { label: "Blue", value: "blue" },
        ],
        value: { path: "/color" },
      },
      {
        id: "multiple",
        component: "ChoicePicker",
        label: "Tags",
        variant: "multipleSelection",
        displayStyle: "chips",
        options: [
          { label: "One", value: "one" },
          { label: "Two", value: "two" },
        ],
        value: { path: "/tags" },
      },
    ],
    dataModel: { color: ["red"], tags: ["one"] },
    requiredComponentNames: ["ChoicePicker", "Column"],
    expectedBehaviors: [
      "single selection emits a one-item string array",
      "multiple selection emits a unique bounded string array",
      "chips presentation does not change selection semantics",
    ],
  },
  {
    id: "slider-partition",
    description: "Slider min/max/steps normalization and callback behavior.",
    components: [
      {
        id: "root",
        component: "Slider",
        label: "Volume",
        min: 0,
        max: 10,
        steps: 5,
        value: { path: "/volume" },
      },
    ],
    dataModel: { volume: 4 },
    requiredComponentNames: ["Slider"],
    expectedBehaviors: [
      "wire steps=5 becomes trusted minimumValue=0, maximumValue=10, step=2",
      "only finite in-range partition-aligned callback values are accepted",
      "the installed control exposes adjustable accessibility semantics",
    ],
  },
  {
    id: "tabs-selection",
    description: "Tabs selection, content ownership, and accessibility behavior.",
    components: [
      {
        id: "root",
        component: "Tabs",
        tabs: [
          { title: "First", child: "first" },
          { title: "Second", child: "second" },
        ],
      },
      { id: "first", component: "Text", text: "First panel" },
      { id: "second", component: "Text", text: "Second panel" },
    ],
    requiredComponentNames: ["Tabs", "Text"],
    expectedBehaviors: [
      "selectedIndex starts at zero and changes only to an in-range integer",
      "each tab is separately selectable",
      "only selected host-owned content is presented to accessibility services",
    ],
  },
  {
    id: "modal-lifecycle",
    description: "Modal trigger, open/dismiss lifecycle, focus, and teardown.",
    components: [
      { id: "root", component: "Modal", trigger: "trigger", content: "content" },
      {
        id: "trigger",
        component: "Button",
        child: "trigger-label",
        action: { event: { name: "conformance.activate" } },
      },
      { id: "trigger-label", component: "Text", text: "Open" },
      { id: "content", component: "Text", text: "Modal content" },
    ],
    requiredComponentNames: ["Button", "Modal", "Text"],
    requiredEventNames: ["conformance.activate"],
    expectedBehaviors: [
      "the Button trigger opens the modal and still resolves its declared action",
      "onRequestClose dismisses the modal",
      "the installed modal traps focus, handles platform dismissal, restores focus, and tears down hidden content",
    ],
  },
]);

/**
 * Returns fresh canonical surfaces for catalog adapter tests. The host chooses its own renderer and
 * assertions while sharing exact protocol fixtures and expected semantic behavior.
 */
export function createA2uiV1NativeCatalogConformanceCases(): readonly A2uiV1NativeCatalogConformanceCase[] {
  return Object.freeze(
    DEFINITIONS.map((definition) => {
      const surfaceId = `catalog-conformance-${definition.id}`;
      const store = new A2uiSurfaceStore();
      store.apply({
        version: "v1.0",
        createSurface: {
          surfaceId,
          components: definition.components,
          ...(definition.dataModel === undefined ? {} : { dataModel: definition.dataModel }),
        },
      });
      const surface = store.get(surfaceId);
      if (surface === undefined) {
        throw new Error("Catalog conformance fixture failed to create its surface");
      }
      return Object.freeze({
        id: definition.id,
        description: definition.description,
        surface,
        requiredComponentNames: Object.freeze([...definition.requiredComponentNames]),
        expectedBehaviors: Object.freeze([...definition.expectedBehaviors]),
        requiredEventNames: Object.freeze([...(definition.requiredEventNames ?? [])]),
      });
    }),
  );
}

/** Concise public names for catalog conformance testing. */
export { createA2uiV1NativeCatalogConformanceCases as createCatalogConformanceCases };
export type { A2uiV1NativeCatalogConformanceCase as CatalogConformanceCase };
