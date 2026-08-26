import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  A2UI_V1_BASIC_CATALOG_ID,
  A2UI_V1_BASIC_COMPONENT_NAMES,
  A2UI_V1_BASIC_FUNCTION_NAMES,
  A2UI_V1_MAX_COMPONENTS,
  A2UI_V1_MAX_SURFACES,
  A2UI_V1_SYSTEM_FUNCTION_NAMES,
  A2uiParseError,
  A2uiSurfaceStore,
  createA2uiV1BasicCatalogPolicy,
} from "../packages/a2ui/dist/index.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures/a2ui-v1");

function basicPolicy(options = {}) {
  return createA2uiV1BasicCatalogPolicy({
    allowedComponentNames: A2UI_V1_BASIC_COMPONENT_NAMES,
    ...options,
  });
}

function createStore(components, options = {}) {
  const store = new A2uiSurfaceStore();
  store.apply({
    version: "v1.0",
    createSurface: {
      surfaceId: "validated",
      ...(options.catalogId === undefined ? {} : { catalogId: options.catalogId }),
      components,
      dataModel: options.dataModel ?? {},
    },
  });
  return store;
}

test("the pinned basic catalog exposes stable host-policy inputs", () => {
  assert.equal(
    A2UI_V1_BASIC_CATALOG_ID,
    "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json",
  );
  assert.equal(A2UI_V1_BASIC_COMPONENT_NAMES.includes("Text"), true);
  assert.equal(A2UI_V1_BASIC_COMPONENT_NAMES.includes("Button"), true);
  assert.equal(A2UI_V1_BASIC_FUNCTION_NAMES.includes("formatString"), true);
  assert.deepEqual(A2UI_V1_SYSTEM_FUNCTION_NAMES, ["@index"]);
  assert.equal(Object.isFrozen(A2UI_V1_BASIC_COMPONENT_NAMES), true);
  assert.equal(Object.isFrozen(A2UI_V1_BASIC_FUNCTION_NAMES), true);
});

test("complete official surfaces pass explicit host validation", () => {
  const simple = JSON.parse(readFileSync(join(fixturesDir, "00_simple-text.json"), "utf8"));
  const simpleStore = new A2uiSurfaceStore();
  simpleStore.applyAll(simple.messages);
  assert.equal(
    simpleStore.getValidated("gallery-simple-text", basicPolicy())?.components.get("root")
      ?.component,
    "Text",
  );

  const incremental = JSON.parse(readFileSync(join(fixturesDir, "00_incremental.json"), "utf8"));
  const incrementalStore = new A2uiSurfaceStore();
  incrementalStore.applyAll(incremental.messages);
  const validated = incrementalStore.getValidated(
    "gallery-incremental",
    basicPolicy({ allowedEventNames: ["book_now"] }),
  );
  assert.equal(validated?.components.size, 7);
});

test("validation distinguishes incomplete streaming state from renderer-ready state", () => {
  const store = new A2uiSurfaceStore();
  store.apply({ version: "v1.0", createSurface: { surfaceId: "streaming" } });

  assert.ok(store.get("streaming"));
  assert.throws(
    () => store.getValidated("streaming", basicPolicy()),
    (error) => error instanceof A2uiParseError && /component "root"/.test(error.message),
  );
  assert.equal(store.getValidated("missing", basicPolicy()), undefined);
});

test("untyped host policy input fails with a controlled parse error", () => {
  const store = createStore([{ id: "root", component: "Text", text: "Hello" }]);
  assert.throws(
    () => store.getValidated("validated", null),
    (error) => error instanceof A2uiParseError && /validation policy/.test(error.message),
  );
  assert.throws(
    () => createA2uiV1BasicCatalogPolicy(null),
    (error) => error instanceof A2uiParseError && /policy options/.test(error.message),
  );
});

test("component graph validation rejects missing children and reachable cycles", async (t) => {
  const cases = [
    {
      name: "missing child",
      components: [{ id: "root", component: "Column", children: ["missing"] }],
      message: /references missing child "missing"/,
    },
    {
      name: "cycle",
      components: [
        { id: "root", component: "Column", children: ["loop"] },
        { id: "loop", component: "Column", children: ["root"] },
      ],
      message: /contains a cycle/,
    },
  ];

  await Promise.all(
    cases.map((fixture) =>
      t.test(fixture.name, () => {
        const store = createStore(fixture.components);
        assert.throws(
          () => store.getValidated("validated", basicPolicy()),
          (error) => error instanceof A2uiParseError && fixture.message.test(error.message),
        );
      }),
    ),
  );
});

test("unused retained component definitions do not invalidate the rendered root graph", () => {
  const store = createStore([
    { id: "root", component: "Text", text: "Visible" },
    { id: "unused", component: "Column", children: ["not-yet-defined"] },
  ]);
  assert.ok(store.getValidated("validated", basicPolicy()));
});

test("the host policy restricts catalog components and catalog overrides", () => {
  const deniedComponent = createStore([
    { id: "root", component: "Column", children: ["label"] },
    { id: "label", component: "Text", text: "Hello" },
  ]);
  assert.throws(
    () =>
      deniedComponent.getValidated(
        "validated",
        createA2uiV1BasicCatalogPolicy({ allowedComponentNames: ["Text"] }),
      ),
    (error) =>
      error instanceof A2uiParseError && /host-denied component "Column"/.test(error.message),
  );

  const deniedCatalog = createStore([{ id: "root", component: "Text", text: "Hello" }], {
    catalogId: "https://example.com/untrusted-catalog.json",
  });
  assert.throws(
    () => deniedCatalog.getValidated("validated", basicPolicy()),
    (error) => error instanceof A2uiParseError && /Unsupported A2UI catalog/.test(error.message),
  );
});

test("binding validation is strict and template-aware", async (t) => {
  const cases = [
    {
      name: "relative binding outside template",
      text: { path: "name" },
      message: /only valid inside a dynamic-list template/,
    },
    {
      name: "invalid JSON Pointer escape",
      text: { path: "/user~2name" },
      message: /Invalid JSON Pointer escape/,
    },
  ];

  await Promise.all(
    cases.map((fixture) =>
      t.test(fixture.name, () => {
        const store = createStore([{ id: "root", component: "Text", text: fixture.text }]);
        assert.throws(
          () => store.getValidated("validated", basicPolicy()),
          (error) => error instanceof A2uiParseError && fixture.message.test(error.message),
        );
      }),
    ),
  );
});

test("agent events and catalog functions require explicit host allowlists", () => {
  const eventStore = createStore([
    {
      id: "root",
      component: "Button",
      child: "label",
      action: {
        event: {
          name: "submit",
          context: {
            payload: { catalogId: "product-record", event: { name: "literal-data" } },
          },
        },
      },
    },
    { id: "label", component: "Text", text: "Submit" },
  ]);
  assert.throws(
    () => eventStore.getValidated("validated", basicPolicy()),
    (error) => error instanceof A2uiParseError && /event "submit"/.test(error.message),
  );
  assert.ok(eventStore.getValidated("validated", basicPolicy({ allowedEventNames: ["submit"] })));

  const functionStore = createStore([
    {
      id: "root",
      component: "Text",
      text: { call: "formatString", args: { value: "Hello" } },
    },
  ]);
  assert.throws(
    () => functionStore.getValidated("validated", basicPolicy()),
    (error) => error instanceof A2uiParseError && /function "formatString"/.test(error.message),
  );
  assert.ok(
    functionStore.getValidated(
      "validated",
      basicPolicy({ allowedFunctionNames: ["formatString"] }),
    ),
  );
});

test("duplicate component IDs fail atomically within one update", () => {
  const store = createStore([{ id: "root", component: "Text", text: "Original" }]);
  assert.throws(
    () =>
      store.apply({
        version: "v1.0",
        updateComponents: {
          surfaceId: "validated",
          components: [
            { id: "root", component: "Text", text: "First" },
            { id: "root", component: "Text", text: "Second" },
          ],
        },
      }),
    (error) => error instanceof A2uiParseError && /Duplicate A2UI component id/.test(error.message),
  );
  assert.equal(store.get("validated")?.components.get("root")?.text, "Original");
});

test("cumulative component updates are bounded and atomic", () => {
  const store = createStore([{ id: "root", component: "Text", text: "Original" }]);
  const components = Array.from({ length: A2UI_V1_MAX_COMPONENTS }, (_, index) => ({
    id: `component-${index}`,
    component: "Text",
    text: `${index}`,
  }));
  assert.throws(
    () =>
      store.apply({
        version: "v1.0",
        updateComponents: { surfaceId: "validated", components },
      }),
    (error) => error instanceof A2uiParseError && /maximum of 1024 components/.test(error.message),
  );
  assert.equal(store.get("validated")?.components.size, 1);
  assert.equal(store.get("validated")?.components.get("root")?.text, "Original");
});

test("the number of retained surfaces is bounded", () => {
  const store = new A2uiSurfaceStore();
  for (let index = 0; index < A2UI_V1_MAX_SURFACES; index += 1) {
    store.apply({
      version: "v1.0",
      createSurface: { surfaceId: `surface-${index}` },
    });
  }
  assert.throws(
    () =>
      store.apply({
        version: "v1.0",
        createSurface: { surfaceId: "overflow" },
      }),
    (error) => error instanceof A2uiParseError && /maximum of 1024 surfaces/.test(error.message),
  );
  assert.equal(store.size, A2UI_V1_MAX_SURFACES);
  assert.equal(store.has("overflow"), false);
});

test("weight and @index obey their beyond-schema placement rules", () => {
  const weightedRoot = createStore([{ id: "root", component: "Text", text: "Invalid", weight: 1 }]);
  assert.throws(
    () => weightedRoot.getValidated("validated", basicPolicy()),
    (error) =>
      error instanceof A2uiParseError && /weight only as a direct child/.test(error.message),
  );

  const indexOutsideTemplate = createStore([
    {
      id: "root",
      component: "Text",
      text: { call: "@index", args: { offset: 1 } },
    },
  ]);
  assert.throws(
    () =>
      indexOutsideTemplate.getValidated(
        "validated",
        basicPolicy({ allowedFunctionNames: ["@index"] }),
      ),
    (error) =>
      error instanceof A2uiParseError &&
      /only valid inside a dynamic-list template/.test(error.message),
  );

  const indexInTemplate = createStore(
    [
      {
        id: "root",
        component: "List",
        children: { path: "/items", componentId: "item" },
      },
      {
        id: "item",
        component: "Text",
        text: { call: "@index", args: { offset: 1 } },
      },
    ],
    { dataModel: { items: [{}] } },
  );
  assert.ok(
    indexInTemplate.getValidated("validated", basicPolicy({ allowedFunctionNames: ["@index"] })),
  );
});
