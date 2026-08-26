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
  validateA2uiV1SurfaceState,
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

test("the public snapshot validator reconstructs untyped input into owned schema-valid state", () => {
  assert.throws(
    () => validateA2uiV1SurfaceState(null, basicPolicy()),
    (error) => error instanceof A2uiParseError && /surface snapshot object/.test(error.message),
  );
  assert.throws(
    () =>
      validateA2uiV1SurfaceState(
        {
          surfaceId: "forged",
          sendDataModel: false,
          components: new Map([["root", { id: "root", component: "Column" }]]),
          dataModel: {},
        },
        basicPolicy(),
      ),
    (error) => error instanceof A2uiParseError && /schema validation failed/.test(error.message),
  );
  assert.throws(
    () =>
      validateA2uiV1SurfaceState(
        {
          surfaceId: "forged",
          sendDataModel: false,
          components: new Map([
            ["different-map-key", { id: "root", component: "Text", text: "Hello" }],
          ]),
          dataModel: {},
        },
        basicPolicy(),
      ),
    (error) => error instanceof A2uiParseError && /map key.*does not match/.test(error.message),
  );
  assert.throws(
    () =>
      validateA2uiV1SurfaceState(
        {
          surfaceId: "forged",
          sendDataModel: false,
          components: new Map(),
          dataModel: {},
          executable: "unexpected",
        },
        basicPolicy(),
      ),
    (error) => error instanceof A2uiParseError && /Unexpected.*snapshot field/.test(error.message),
  );

  const source = createStore([{ id: "root", component: "Text", text: "Original" }]).get(
    "validated",
  );
  const validated = validateA2uiV1SurfaceState(source, basicPolicy());
  source.components.get("root").text = "Mutated";
  source.dataModel.changed = true;
  assert.equal(validated.components.get("root")?.text, "Original");
  assert.equal(validated.dataModel.changed, undefined);
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
            payload: {
              catalogId: "product-record",
              event: { name: "literal-data" },
              nested: { call: "openUrl", path: "literal-data" },
            },
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

  const eventFunctionStore = createStore([
    {
      id: "root",
      component: "Button",
      child: "label",
      action: {
        event: {
          name: "submit",
          context: { formatted: { call: "formatNumber", args: { value: 42 } } },
        },
      },
    },
    { id: "label", component: "Text", text: "Submit" },
  ]);
  assert.throws(
    () =>
      eventFunctionStore.getValidated("validated", basicPolicy({ allowedEventNames: ["submit"] })),
    (error) => error instanceof A2uiParseError && /function "formatNumber"/.test(error.message),
  );

  const functionStore = createStore([
    {
      id: "root",
      component: "Text",
      text: { call: "formatNumber", args: { value: 42 } },
    },
  ]);
  assert.throws(
    () => functionStore.getValidated("validated", basicPolicy()),
    (error) => error instanceof A2uiParseError && /function "formatNumber"/.test(error.message),
  );
  assert.ok(
    functionStore.getValidated(
      "validated",
      basicPolicy({ allowedFunctionNames: ["formatNumber"] }),
    ),
  );
});

test("formatString validates nested functions, bindings, accessibility, and template context", () => {
  const store = createStore(
    [
      {
        id: "root",
        component: "Text",
        text: {
          call: "formatString",
          args: {
            value:
              "Hello ${/user/name}, updated ${formatDate(value:${/updated}, format:'yyyy-MM-dd')}; ${formatString(value:'again ${/user/name}')} ${${/user/name}} ${true} ${42} ${'literal'} ${null} \\${literal}",
          },
        },
        accessibility: {
          label: {
            call: "formatString",
            args: { value: "Profile for ${/user/name}" },
          },
        },
      },
    ],
    { dataModel: { user: { name: "Ada" }, updated: "2026-08-26" } },
  );
  assert.ok(
    store.getValidated(
      "validated",
      basicPolicy({ allowedFunctionNames: ["formatString", "formatDate"] }),
    ),
  );

  const templateStore = createStore(
    [
      {
        id: "root",
        component: "List",
        children: { path: "/items", componentId: "item" },
      },
      {
        id: "item",
        component: "Text",
        text: {
          call: "formatString",
          args: { value: "${name} #${@index(offset: 1)}" },
        },
      },
    ],
    { dataModel: { items: [{ name: "Ada" }] } },
  );
  assert.ok(
    templateStore.getValidated(
      "validated",
      basicPolicy({ allowedFunctionNames: ["formatString", "@index"] }),
    ),
  );
});

test("formatString cannot hide nested functions from the host allowlist", () => {
  const store = createStore([
    {
      id: "root",
      component: "Text",
      text: {
        call: "formatString",
        args: { value: "Open ${openUrl(url:'https://example.com')}" },
      },
    },
  ]);

  assert.throws(
    () => store.getValidated("validated", basicPolicy({ allowedFunctionNames: ["formatString"] })),
    (error) =>
      error instanceof A2uiParseError && /function "openUrl".*is not allowed/.test(error.message),
  );
});

test("formatString rejects runtime-provided interpolation sources", () => {
  const store = createStore([
    {
      id: "root",
      component: "Text",
      text: {
        call: "formatString",
        args: { value: { path: "/serverControlledTemplate" } },
      },
    },
  ]);

  assert.throws(
    () => store.getValidated("validated", basicPolicy({ allowedFunctionNames: ["formatString"] })),
    (error) =>
      error instanceof A2uiParseError &&
      /requires a literal string so every interpolation can be validated/.test(error.message),
  );
});

test("formatString syntax and reconstructed function calls fail closed", async (t) => {
  let deeplyNestedExpression = "/value";
  for (let index = 0; index < 64; index += 1) {
    deeplyNestedExpression = `formatString(value:\${${deeplyNestedExpression}})`;
  }
  const cases = [
    {
      name: "unterminated interpolation",
      value: "Hello ${/user/name",
      allowedFunctionNames: ["formatString"],
      message: /unterminated interpolation expression/,
    },
    {
      name: "relative binding outside a template",
      value: "Hello ${name}",
      allowedFunctionNames: ["formatString"],
      message: /Relative A2UI binding.*only valid inside/,
    },
    {
      name: "balanced path braces cannot hide an invalid suffix",
      value: "${/objects/{id}/bad~2}",
      allowedFunctionNames: ["formatString"],
      message: /Invalid JSON Pointer escape/,
    },
    {
      name: "unknown nested function",
      value: "It is ${now()}",
      allowedFunctionNames: ["formatString"],
      message: /function schema validation failed/,
    },
    {
      name: "unnamed function argument",
      value: "${formatDate(${/updated}, format:'yyyy-MM-dd')}",
      allowedFunctionNames: ["formatString", "formatDate"],
      message: /requires every function argument to be named/,
    },
    {
      name: "duplicate function argument",
      value: "${formatDate(value:${/updated}, value:${/other}, format:'yyyy')}",
      allowedFunctionNames: ["formatString", "formatDate"],
      message: /duplicate argument "value"/,
    },
    {
      name: "invalid catalog function signature",
      value: "${formatDate(value:${/updated}, extra:'yyyy')}",
      allowedFunctionNames: ["formatString", "formatDate"],
      message: /function schema validation failed/,
    },
    {
      name: "index outside a template",
      value: "#${@index(offset: 1)}",
      allowedFunctionNames: ["formatString", "@index"],
      message: /only valid inside a dynamic-list template/,
    },
    {
      name: "excessive expression nesting",
      value: `\${${deeplyNestedExpression}}`,
      allowedFunctionNames: ["formatString"],
      message: /maximum expression depth of 64/,
    },
    {
      name: "excessive expression count",
      value: Array.from({ length: 10_001 }, () => "${/}").join(""),
      allowedFunctionNames: ["formatString"],
      message: /maximum of 10000 interpolation expressions/,
    },
  ];

  await Promise.all(
    cases.map((fixture) =>
      t.test(fixture.name, () => {
        const store = createStore([
          {
            id: "root",
            component: "Text",
            text: { call: "formatString", args: { value: fixture.value } },
          },
        ]);
        assert.throws(
          () =>
            store.getValidated(
              "validated",
              basicPolicy({ allowedFunctionNames: fixture.allowedFunctionNames }),
            ),
          (error) => error instanceof A2uiParseError && fixture.message.test(error.message),
        );
      }),
    ),
  );
});

test("formatString limits are cumulative across a reachable surface", async (t) => {
  await t.test("source length", () => {
    const children = Array.from({ length: 17 }, (_, index) => `text-${index}`);
    const store = createStore([
      { id: "root", component: "Column", children },
      ...children.map((id) => ({
        id,
        component: "Text",
        text: { call: "formatString", args: { value: "x".repeat(65_536) } },
      })),
    ]);

    assert.throws(
      () =>
        store.getValidated("validated", basicPolicy({ allowedFunctionNames: ["formatString"] })),
      (error) =>
        error instanceof A2uiParseError &&
        /cumulative maximum length of 1048576/.test(error.message),
    );
  });

  await t.test("expression count", () => {
    const expressionBatch = Array.from({ length: 5_001 }, () => "${/}").join("");
    const store = createStore([
      {
        id: "root",
        component: "Text",
        text: { call: "formatString", args: { value: expressionBatch } },
        accessibility: {
          label: { call: "formatString", args: { value: expressionBatch } },
        },
      },
    ]);

    assert.throws(
      () =>
        store.getValidated("validated", basicPolicy({ allowedFunctionNames: ["formatString"] })),
      (error) =>
        error instanceof A2uiParseError &&
        /maximum of 10000 formatString expressions/.test(error.message),
    );
  });
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
