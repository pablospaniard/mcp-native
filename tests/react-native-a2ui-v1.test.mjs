import assert from "node:assert/strict";
import test from "node:test";

import {
  A2UI_V1_BASIC_COMPONENT_NAMES,
  A2uiParseError,
  A2uiSurfaceStore,
  createA2uiV1BasicCatalogPolicy,
} from "../packages/a2ui/dist/index.js";
import {
  A2UI_V1_NATIVE_COMPONENT_NAMES,
  A2UI_V1_NATIVE_MAX_RENDER_NODES,
  createA2uiV1NativeRenderPlan,
} from "../packages/react-native/dist/index.js";

function createSurface(components, dataModel = {}) {
  const store = new A2uiSurfaceStore();
  store.apply({
    version: "v1.0",
    createSurface: { surfaceId: "native", components, dataModel },
  });
  return store.get("native");
}

function nativePolicy(options = {}) {
  return createA2uiV1BasicCatalogPolicy({
    allowedComponentNames: A2UI_V1_NATIVE_COMPONENT_NAMES,
    ...options,
  });
}

test("validated v1 state becomes a trusted native plan for the bundled component subset", () => {
  const prototypeNamedLiteral = JSON.parse('{"__proto__":{"polluted":true}}');
  const surface = createSurface(
    [
      {
        id: "root",
        component: "Column",
        children: ["heading", "field", "save"],
        justify: "center",
        align: "end",
      },
      {
        id: "heading",
        component: "Text",
        text: { path: "/profile/title" },
        variant: "caption",
        weight: 2,
        accessibility: { label: { path: "/profile/headingLabel" }, live: "polite" },
      },
      {
        id: "field",
        component: "TextField",
        label: "Name",
        value: { path: "/profile/name" },
        placeholder: "Display name",
        variant: "shortText",
        accessibility: {
          description: "Shown publicly",
          hidden: { path: "/profile/hideName" },
        },
      },
      {
        id: "save",
        component: "Button",
        child: "save-label",
        variant: "primary",
        accessibility: { label: "Save profile" },
        action: {
          event: {
            name: "save_profile",
            userMessage: { path: "/profile/saveMessage" },
            context: {
              name: { path: "/profile/name" },
              literal: { nested: { path: "literal-data" } },
              prototypeNamedLiteral,
            },
          },
        },
      },
      { id: "save-label", component: "Text", text: "Save" },
    ],
    {
      profile: {
        title: "Profile",
        headingLabel: "Profile heading",
        name: "Ada",
        hideName: false,
        saveMessage: "Saved Ada",
      },
    },
  );

  const plan = createA2uiV1NativeRenderPlan(
    surface,
    nativePolicy({ allowedEventNames: ["save_profile"] }),
  );

  assert.equal(plan.component, "View");
  assert.deepEqual(plan.props, { layout: "column", justify: "center", align: "end" });
  assert.equal(plan.children?.length, 3);
  assert.deepEqual(plan.children?.[0], {
    key: "root/heading:0",
    component: "Text",
    props: {
      children: "Profile",
      variant: "caption",
      weight: 2,
      accessibilityLabel: "Profile heading",
      accessibilityLive: "polite",
    },
  });
  assert.deepEqual(plan.children?.[1]?.props, {
    label: "Name",
    placeholder: "Display name",
    value: "Ada",
    binding: "/profile/name",
    variant: "shortText",
    accessibilityHint: "Shown publicly",
    accessibilityHidden: false,
    accessibilityLabel: "Name",
  });
  assert.deepEqual(plan.children?.[2]?.props, {
    title: "Save",
    event: {
      name: "save_profile",
      surfaceId: "native",
      sourceComponentId: "save",
      userMessage: "Saved Ada",
      context: {
        name: "Ada",
        literal: { nested: { path: "literal-data" } },
        prototypeNamedLiteral: JSON.parse('{"__proto__":{"polluted":true}}'),
      },
    },
    variant: "primary",
    accessibilityLabel: "Save profile",
  });
  const resolvedLiteral = plan.children?.[2]?.props.event.context.prototypeNamedLiteral;
  assert.equal(Object.getPrototypeOf(resolvedLiteral), Object.prototype);
  assert.equal(Object.hasOwn(resolvedLiteral, "__proto__"), true);
  assert.equal(resolvedLiteral.polluted, undefined);
});

test("structural mappings and escaped array bindings produce deterministic native plans", () => {
  const surface = createSurface(
    [
      { id: "root", component: "Card", child: "row", accessibility: { label: "Summary" } },
      {
        id: "row",
        component: "Row",
        children: ["list"],
        justify: "spaceBetween",
        align: "center",
      },
      {
        id: "list",
        component: "List",
        direction: "horizontal",
        children: ["value"],
        align: "end",
      },
      { id: "value", component: "Text", text: { path: "/a~1b/~0items/0" } },
    ],
    { "a/b": { "~items": ["First"] } },
  );

  assert.deepEqual(createA2uiV1NativeRenderPlan(surface, nativePolicy()), {
    key: "root",
    component: "View",
    props: {
      layout: "column",
      variant: "card",
      accessibilityLabel: "Summary",
    },
    children: [
      {
        key: "root/row:0",
        component: "View",
        props: { layout: "row", justify: "spaceBetween", align: "center" },
        children: [
          {
            key: "root/row:0/list:0",
            component: "View",
            props: { layout: "row", variant: "list", align: "end" },
            children: [
              {
                key: "root/row:0/list:0/value:0",
                component: "Text",
                props: { children: "First" },
              },
            ],
          },
        ],
      },
    ],
  });
});

test("the v1 native adapter rejects unsupported renderer semantics", async (t) => {
  const cases = [
    {
      name: "unsupported component",
      surface: createSurface([
        { id: "root", component: "Image", url: "https://example.com/a.png" },
      ]),
      policy: createA2uiV1BasicCatalogPolicy({
        allowedComponentNames: A2UI_V1_BASIC_COMPONENT_NAMES,
      }),
      message: /native adapter does not support/,
    },
    {
      name: "dynamic list",
      surface: createSurface(
        [
          {
            id: "root",
            component: "List",
            children: { path: "/items", componentId: "item" },
          },
          { id: "item", component: "Text", text: { path: "name" } },
        ],
        { items: [{ name: "Ada" }] },
      ),
      policy: nativePolicy(),
      message: /does not yet support dynamic children/,
    },
    {
      name: "renderer function",
      surface: createSurface([
        {
          id: "root",
          component: "Text",
          text: { call: "formatNumber", args: { value: 42 } },
        },
      ]),
      policy: nativePolicy({ allowedFunctionNames: ["formatNumber"] }),
      message: /does not execute function "formatNumber"/,
    },
    {
      name: "missing binding",
      surface: createSurface([{ id: "root", component: "Text", text: { path: "/missing" } }]),
      policy: nativePolicy(),
      message: /binding "\/missing" is missing/,
    },
    {
      name: "local button function",
      surface: createSurface([
        {
          id: "root",
          component: "Button",
          child: "label",
          action: {
            functionCall: {
              call: "openUrl",
              args: { url: "https://example.com" },
            },
          },
        },
        { id: "label", component: "Text", text: "Open" },
      ]),
      policy: nativePolicy({ allowedFunctionNames: ["openUrl"] }),
      message: /does not support local function actions/,
    },
    {
      name: "text field renderer checks",
      surface: createSurface(
        [
          {
            id: "root",
            component: "TextField",
            label: "Name",
            value: { path: "/name" },
            checks: [
              {
                condition: {
                  call: "required",
                  args: { value: { path: "/name" } },
                },
                message: "Name is required",
              },
            ],
          },
        ],
        { name: "Ada" },
      ),
      policy: nativePolicy({ allowedFunctionNames: ["required"] }),
      message: /does not yet support renderer-side checks.*root\.checks/,
    },
    {
      name: "button renderer checks",
      surface: createSurface([
        {
          id: "root",
          component: "Button",
          child: "label",
          checks: [
            {
              condition: {
                call: "required",
                args: { value: "ready" },
              },
            },
          ],
          action: { event: { name: "submit" } },
        },
        { id: "label", component: "Text", text: "Submit" },
      ]),
      policy: nativePolicy({
        allowedEventNames: ["submit"],
        allowedFunctionNames: ["required"],
      }),
      message: /does not yet support renderer-side checks.*root\.checks/,
    },
  ];

  await Promise.all(
    cases.map((fixture) =>
      t.test(fixture.name, () => {
        assert.throws(
          () => createA2uiV1NativeRenderPlan(fixture.surface, fixture.policy),
          (error) => error instanceof A2uiParseError && fixture.message.test(error.message),
        );
      }),
    ),
  );
});

test("expanded shared graphs remain bounded", () => {
  const components = [{ id: "leaf", component: "Text", text: "Leaf" }];
  let child = "leaf";
  for (let index = 0; index < 11; index += 1) {
    const id = index === 10 ? "root" : `branch-${index}`;
    components.push({ id, component: "Column", children: [child, child] });
    child = id;
  }
  const surface = createSurface(components);

  assert.throws(
    () => createA2uiV1NativeRenderPlan(surface, nativePolicy()),
    (error) =>
      error instanceof A2uiParseError &&
      new RegExp(`exceeds maximum of ${A2UI_V1_NATIVE_MAX_RENDER_NODES} nodes`).test(error.message),
  );
});
