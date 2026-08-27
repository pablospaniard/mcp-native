import assert from "node:assert/strict";
import test from "node:test";

import {
  A2UI_V1_BASIC_CATALOG_ID,
  A2uiParseError,
  A2uiSurfaceStore,
  createA2uiV1BasicCatalogPolicy,
  parseA2uiV1Envelope,
  parseA2uiV1RendererToAgentEnvelope,
} from "../packages/a2ui/dist/index.js";
import { createA2uiV1NativeRenderPlan } from "../packages/react-native/dist/index.js";

const LIFECYCLE_KINDS = ["createSurface", "updateComponents", "updateDataModel", "deleteSurface"];
const RENDERER_KINDS = ["action", "callAgentFunction", "rendererFunctionResponse", "error"];

test("deterministic JSON fuzzing keeps both A2UI envelope parsers controlled", () => {
  const random = createRandom(0xa2_01_00_01);

  for (let index = 0; index < 750; index += 1) {
    const value = randomJson(random, 0);
    const input = index % 2 === 0 ? value : JSON.stringify(value);
    assertControlledParse(parseA2uiV1Envelope, input, LIFECYCLE_KINDS);
    assertControlledParse(parseA2uiV1RendererToAgentEnvelope, input, RENDERER_KINDS);
  }
});

test("generated lifecycle streams round-trip and preserve ordered update state", () => {
  const random = createRandom(0xa2_01_00_02);

  for (let iteration = 0; iteration < 125; iteration += 1) {
    const textCount = randomInteger(random, 1, 32);
    const childIds = Array.from({ length: textCount }, (_, index) => `text-${index}`);
    const source = {
      version: "v1.0",
      createSurface: {
        surfaceId: `surface-${iteration}`,
        catalogId: A2UI_V1_BASIC_CATALOG_ID,
        components: [
          { id: "root", component: "Column", children: childIds },
          ...childIds.map((id) => ({ id, component: "Text", text: randomString(random) })),
        ],
        dataModel: { counter: 0, marker: randomString(random) },
      },
    };

    const parsed = parseA2uiV1Envelope(iteration % 2 === 0 ? source : JSON.stringify(source));
    assert.deepEqual(parseA2uiV1Envelope(JSON.stringify(parsed)), parsed);
    source.createSurface.components[1].text = "mutated-after-parse";
    assert.notEqual(parsed.createSurface.components[1].text, "mutated-after-parse");

    const store = new A2uiSurfaceStore();
    store.apply(parsed);
    const updateCount = randomInteger(random, 1, 40);
    for (let update = 1; update <= updateCount; update += 1) {
      store.apply({
        version: "v1.0",
        updateDataModel: {
          surfaceId: `surface-${iteration}`,
          path: "/counter",
          value: update,
        },
      });
    }

    const surface = store.get(`surface-${iteration}`);
    assert.equal(surface?.components.size, textCount + 1);
    assert.equal(surface?.dataModel.counter, updateCount);
    assert.equal(surface?.dataModelRevision, updateCount);
  }
});

test("generated dynamic lists produce bounded trusted plans with stable unique keys", () => {
  const random = createRandom(0xa2_01_00_03);
  const policy = createA2uiV1BasicCatalogPolicy({
    allowedComponentNames: ["List", "Text"],
    allowedEventNames: [],
    allowedFunctionNames: [],
  });

  for (let iteration = 0; iteration < 150; iteration += 1) {
    const itemCount = randomInteger(random, 0, 128);
    const items = Array.from({ length: itemCount }, () => ({ label: randomString(random) }));
    const store = new A2uiSurfaceStore();
    store.apply({
      version: "v1.0",
      createSurface: {
        surfaceId: `list-${iteration}`,
        catalogId: A2UI_V1_BASIC_CATALOG_ID,
        components: [
          {
            id: "root",
            component: "List",
            children: { path: "/items", componentId: "item" },
          },
          { id: "item", component: "Text", text: { path: "label" } },
        ],
        dataModel: { items },
      },
    });
    const surface = store.get(`list-${iteration}`);
    assert.ok(surface);

    const plan = createA2uiV1NativeRenderPlan(surface, policy);
    const elements = flattenPlan(plan);
    assert.equal(elements.length, itemCount + 1);
    assert.equal(new Set(elements.map((element) => element.key)).size, elements.length);
    assert.equal(
      elements.every((element) => ["Text", "View"].includes(element.component)),
      true,
    );
  }
});

test("mutated render surfaces fail through controlled parser errors", () => {
  const random = createRandom(0xa2_01_00_04);
  const policy = createA2uiV1BasicCatalogPolicy({
    allowedComponentNames: ["Column", "List", "Text"],
    allowedEventNames: [],
    allowedFunctionNames: [],
  });

  for (let iteration = 0; iteration < 250; iteration += 1) {
    const mutation = randomInteger(random, 0, 4);
    const components = createInvalidComponents(mutation, iteration);
    const surface = {
      surfaceId: `invalid-${iteration}`,
      catalogId: A2UI_V1_BASIC_CATALOG_ID,
      sendDataModel: false,
      dataModelRevision: 0,
      components: new Map(components.map((component) => [component.id, component])),
      dataModel: { items: [{ label: "one" }] },
    };

    assert.throws(
      () => createA2uiV1NativeRenderPlan(surface, policy),
      (error) => error instanceof A2uiParseError,
    );
  }
});

function assertControlledParse(parser, input, kinds) {
  let parsed;
  try {
    parsed = parser(input);
  } catch (error) {
    assert.equal(error instanceof A2uiParseError, true);
    return;
  }
  assert.equal(parsed.version, "v1.0");
  const messageKeys = Object.keys(parsed).filter((key) => key !== "version");
  assert.equal(messageKeys.length, 1);
  assert.equal(kinds.includes(messageKeys[0]), true);
  assert.deepEqual(parser(JSON.stringify(parsed)), parsed);
}

function createInvalidComponents(mutation, iteration) {
  switch (mutation) {
    case 0:
      return [
        { id: "root", component: "Column", children: ["missing"] },
        { id: "unused", component: "Text", text: `unused-${iteration}` },
      ];
    case 1:
      return [{ id: "root", component: "Column", children: ["root"] }];
    case 2:
      return [{ id: "root", component: "ExecutableWidget", module: "remote" }];
    case 3:
      return [
        {
          id: "root",
          component: "List",
          children: { path: "items", componentId: "item" },
        },
        { id: "item", component: "Text", text: { path: "label" } },
      ];
    default:
      return [
        {
          id: "root",
          component: "Text",
          text: { call: "formatString", args: { value: { path: "/runtimeSource" } } },
        },
      ];
  }
}

function randomJson(random, depth) {
  const kind = depth >= 4 ? randomInteger(random, 0, 3) : randomInteger(random, 0, 5);
  switch (kind) {
    case 0:
      return null;
    case 1:
      return random() < 0.5;
    case 2:
      return randomInteger(random, -10_000, 10_000);
    case 3:
      return randomString(random);
    case 4:
      return Array.from({ length: randomInteger(random, 0, 5) }, () =>
        randomJson(random, depth + 1),
      );
    default: {
      const result = {};
      const keys = [
        "version",
        "createSurface",
        "action",
        "error",
        "rendererFunctionResponse",
        "callAgentFunction",
        "__proto__",
        randomString(random),
      ];
      for (let index = 0; index < randomInteger(random, 0, 6); index += 1) {
        Object.defineProperty(result, keys[randomInteger(random, 0, keys.length - 1)], {
          configurable: true,
          enumerable: true,
          value: randomJson(random, depth + 1),
          writable: true,
        });
      }
      return result;
    }
  }
}

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_00_00_00_00;
  };
}

function randomInteger(random, minimum, maximum) {
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

function randomString(random) {
  const alphabet = "abcXYZ09_-/~";
  return Array.from(
    { length: randomInteger(random, 0, 24) },
    () => alphabet[randomInteger(random, 0, alphabet.length - 1)],
  ).join("");
}

function flattenPlan(element) {
  return [element, ...(element.children?.flatMap(flattenPlan) ?? [])];
}
