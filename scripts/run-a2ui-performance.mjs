import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import {
  A2UI_V1_BASIC_CATALOG_ID,
  A2uiSurfaceStore,
  createA2uiV1BasicCatalogPolicy,
  parseA2uiV1Envelope,
} from "../packages/a2ui/dist/index.js";
import { createA2uiV1NativeRenderPlan } from "../packages/react-native/dist/index.js";

const KIBIBYTE = 1_024;
const MEBIBYTE = KIBIBYTE * KIBIBYTE;
const LARGE_COMPONENT_COUNT = 1_024;
const RAPID_UPDATE_COUNT = 500;
const SAMPLE_COUNT = 20;
const WARMUP_COUNT = 5;

const budgets = Object.freeze({
  parseP95Ms: 100,
  rapidUpdatesP95Ms: 250,
  renderPlanP95Ms: 100,
  retainedHeapBytes: 32 * MEBIBYTE,
});

if (typeof globalThis.gc !== "function") {
  throw new Error("A2UI performance verification requires Node --expose-gc");
}

const largeFixture = createLargeFixture();
const policy = createA2uiV1BasicCatalogPolicy({
  allowedComponentNames: ["Column", "Text"],
  allowedEventNames: [],
  allowedFunctionNames: [],
});
const parsedLargeEnvelope = parseA2uiV1Envelope(largeFixture.source);
const largeStore = new A2uiSurfaceStore();
largeStore.apply(parsedLargeEnvelope);
const largeSurface = largeStore.get("performance-large");
assert.ok(largeSurface);

const parseP95Ms = measureP95(() => {
  const envelope = parseA2uiV1Envelope(largeFixture.source);
  assert.equal(envelope.createSurface.components.length, LARGE_COMPONENT_COUNT);
});

const renderPlanP95Ms = measureP95(() => {
  const plan = createA2uiV1NativeRenderPlan(largeSurface, policy);
  assert.equal(countPlanNodes(plan), LARGE_COMPONENT_COUNT);
});

const rapidUpdatesP95Ms = measureP95(() => {
  const store = createUpdateStore();
  for (let index = 1; index <= RAPID_UPDATE_COUNT; index += 1) {
    store.apply({
      version: "v1.0",
      updateDataModel: {
        surfaceId: "performance-updates",
        path: "/counter",
        value: index,
      },
    });
  }
  assert.equal(store.get("performance-updates")?.dataModel.counter, RAPID_UPDATE_COUNT);
});

globalThis.gc();
const heapBefore = process.memoryUsage().heapUsed;
const retainedEnvelope = parseA2uiV1Envelope(largeFixture.source);
const retainedStore = new A2uiSurfaceStore();
retainedStore.apply(retainedEnvelope);
const retainedSurface = retainedStore.get("performance-large");
assert.ok(retainedSurface);
const retainedPlan = createA2uiV1NativeRenderPlan(retainedSurface, policy);
globalThis.gc();
const retainedHeapBytes = Math.max(0, process.memoryUsage().heapUsed - heapBefore);
assert.equal(countPlanNodes(retainedPlan), LARGE_COMPONENT_COUNT);

const results = {
  runtime: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
  },
  fixture: {
    components: LARGE_COMPONENT_COUNT,
    rapidUpdates: RAPID_UPDATE_COUNT,
    sourceCodeUnits: largeFixture.source.length,
  },
  measurements: {
    parseP95Ms: round(parseP95Ms),
    rapidUpdatesP95Ms: round(rapidUpdatesP95Ms),
    renderPlanP95Ms: round(renderPlanP95Ms),
    retainedHeapMiB: round(retainedHeapBytes / MEBIBYTE),
  },
  budgets: {
    ...budgets,
    retainedHeapMiB: budgets.retainedHeapBytes / MEBIBYTE,
  },
};

assert.ok(
  parseP95Ms <= budgets.parseP95Ms,
  `Large-surface parse p95 ${round(parseP95Ms)}ms exceeds ${budgets.parseP95Ms}ms`,
);
assert.ok(
  renderPlanP95Ms <= budgets.renderPlanP95Ms,
  `Large render-plan p95 ${round(renderPlanP95Ms)}ms exceeds ${budgets.renderPlanP95Ms}ms`,
);
assert.ok(
  rapidUpdatesP95Ms <= budgets.rapidUpdatesP95Ms,
  `Rapid-update p95 ${round(rapidUpdatesP95Ms)}ms exceeds ${budgets.rapidUpdatesP95Ms}ms`,
);
assert.ok(
  retainedHeapBytes <= budgets.retainedHeapBytes,
  `Retained heap ${round(retainedHeapBytes / MEBIBYTE)}MiB exceeds ${budgets.retainedHeapBytes / MEBIBYTE}MiB`,
);

console.log(JSON.stringify(results, null, 2));

function createLargeFixture() {
  const childIds = Array.from({ length: LARGE_COMPONENT_COUNT - 1 }, (_, index) => `text-${index}`);
  const components = [
    { id: "root", component: "Column", children: childIds },
    ...childIds.map((id, index) => ({ id, component: "Text", text: `Item ${index}` })),
  ];
  const envelope = {
    version: "v1.0",
    createSurface: {
      surfaceId: "performance-large",
      catalogId: A2UI_V1_BASIC_CATALOG_ID,
      components,
      dataModel: {},
    },
  };
  return { source: JSON.stringify(envelope) };
}

function createUpdateStore() {
  const store = new A2uiSurfaceStore();
  store.apply({
    version: "v1.0",
    createSurface: {
      surfaceId: "performance-updates",
      components: [{ id: "root", component: "Text", text: "Updates" }],
      dataModel: { counter: 0 },
    },
  });
  return store;
}

function measureP95(operation) {
  for (let index = 0; index < WARMUP_COUNT; index += 1) {
    operation();
  }
  const durations = [];
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const start = performance.now();
    operation();
    durations.push(performance.now() - start);
  }
  durations.sort((left, right) => left - right);
  return durations[Math.ceil(durations.length * 0.95) - 1];
}

function countPlanNodes(element) {
  return 1 + (element.children?.reduce((total, child) => total + countPlanNodes(child), 0) ?? 0);
}

function round(value) {
  return Math.round(value * 100) / 100;
}
