import assert from "node:assert/strict";
import test from "node:test";

import { act, createElement } from "react";
import { createRoot } from "test-renderer";

import {
  A2UI_V1_BASIC_COMPONENT_NAMES,
  A2uiParseError,
  A2uiSurfaceStore,
  createA2uiV1BasicCatalogPolicy,
} from "../packages/a2ui/dist/index.js";
import {
  A2UI_V1_NATIVE_COMPONENT_NAMES,
  A2UI_V1_NATIVE_MAX_RENDER_NODES,
  A2uiV1NativeSurface,
  createA2uiV1NativeRenderPlan,
  resolveA2uiV1NativeEvent,
} from "../packages/react-native/dist/index.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function hostComponent(type) {
  return function HostComponent(props) {
    return createElement(type, props, props.children);
  };
}

const nativeComponents = {
  View: hostComponent("View"),
  Text: hostComponent("Text"),
  Button: hostComponent("Button"),
  TextInput: hostComponent("TextInput"),
};

function createSurface(components, dataModel = {}, options = {}) {
  const store = new A2uiSurfaceStore();
  store.apply({
    version: "v1.0",
    createSurface: { surfaceId: "native", components, dataModel, ...options },
  });
  return store.get("native");
}

function nativePolicy(options = {}) {
  return createA2uiV1BasicCatalogPolicy({
    allowedComponentNames: A2UI_V1_NATIVE_COMPONENT_NAMES,
    ...options,
  });
}

test("mounted v1 surfaces keep input local and resolve actions at dispatch time", async () => {
  const surface = createSurface(
    [
      { id: "root", component: "Column", children: ["preview", "field", "save"] },
      {
        id: "preview",
        component: "Text",
        text: { path: "/profile/name" },
        accessibility: { live: "polite" },
      },
      {
        id: "field",
        component: "TextField",
        label: "Name",
        value: { path: "/profile/name" },
        accessibility: { description: "Public display name", hidden: false },
      },
      {
        id: "save",
        component: "Button",
        child: "save-label",
        action: {
          event: {
            name: "save_profile",
            userMessage: { path: "/profile/name" },
            context: { name: { path: "/profile/name" } },
          },
        },
      },
      { id: "save-label", component: "Text", text: "Save" },
    ],
    { profile: { name: "Ada" } },
    { sendDataModel: true },
  );
  const actions = [];
  const localModels = [];
  const root = createRoot({ textComponentTypes: ["Text"] });

  await act(async () => {
    root.render(
      createElement(A2uiV1NativeSurface, {
        surface,
        policy: nativePolicy({ allowedEventNames: ["save_profile"] }),
        components: nativeComponents,
        actionMetadata: { extensions: { auditSession: "session-1" } },
        now: () => "2026-08-26T16:30:00.000Z",
        onAction: (envelope, dataModel) => actions.push({ envelope, dataModel }),
        onDataModelChange: (dataModel) => localModels.push(dataModel),
      }),
    );
  });

  let texts = root.container.queryAll((element) => element.type === "Text");
  let inputs = root.container.queryAll((element) => element.type === "TextInput");
  assert.deepEqual(texts[0]?.children, ["Ada"]);
  assert.equal(inputs[0]?.props.value, "Ada");
  assert.equal(inputs[0]?.props.accessibilityLabel, "Name");
  assert.equal(inputs[0]?.props.accessibilityHint, "Public display name");
  assert.equal(inputs[0]?.props.accessibilityElementsHidden, false);
  assert.equal(inputs[0]?.props.importantForAccessibility, "auto");
  assert.equal(texts[0]?.props.accessibilityLiveRegion, "polite");

  await act(async () => inputs[0].props.onChangeText("Grace"));
  assert.equal(actions.length, 0);
  assert.deepEqual(localModels, [{ profile: { name: "Grace" } }]);

  texts = root.container.queryAll((element) => element.type === "Text");
  inputs = root.container.queryAll((element) => element.type === "TextInput");
  assert.deepEqual(texts[0]?.children, ["Grace"]);
  assert.equal(inputs[0]?.props.value, "Grace");

  const buttons = root.container.queryAll((element) => element.type === "Button");
  buttons[0].props.onPress();
  assert.deepEqual(actions, [
    {
      envelope: {
        version: "v1.0",
        action: {
          name: "save_profile",
          surfaceId: "native",
          sourceComponentId: "save",
          timestamp: "2026-08-26T16:30:00.000Z",
          userMessage: "Grace",
          context: { name: "Grace" },
          metadata: { extensions: { auditSession: "session-1" } },
        },
      },
      dataModel: { profile: { name: "Grace" } },
    },
  ]);

  await act(async () => root.unmount());
});

test("mounted v1 local state resets when an agent supplies a new surface snapshot", async () => {
  const components = [
    { id: "root", component: "TextField", label: "Name", value: { path: "/name" } },
  ];
  const store = new A2uiSurfaceStore();
  store.apply({
    version: "v1.0",
    createSurface: { surfaceId: "native", components, dataModel: { name: "Ada" } },
  });
  const first = store.getValidated("native", nativePolicy());
  const root = createRoot();
  const props = {
    policy: nativePolicy(),
    components: nativeComponents,
    onAction() {},
  };

  await act(async () =>
    root.render(createElement(A2uiV1NativeSurface, { ...props, surface: first })),
  );
  let input = root.container.queryAll((element) => element.type === "TextInput")[0];
  await act(async () => input.props.onChangeText("Grace"));
  input = root.container.queryAll((element) => element.type === "TextInput")[0];
  assert.equal(input.props.value, "Grace");

  const equivalent = store.getValidated("native", nativePolicy());
  assert.notEqual(equivalent, first);
  await act(async () =>
    root.render(createElement(A2uiV1NativeSurface, { ...props, surface: equivalent })),
  );
  input = root.container.queryAll((element) => element.type === "TextInput")[0];
  assert.equal(input.props.value, "Grace");

  store.apply({
    version: "v1.0",
    updateDataModel: { surfaceId: "native", path: "/name", value: "Lin" },
  });
  const second = store.getValidated("native", nativePolicy());
  await act(async () =>
    root.render(createElement(A2uiV1NativeSurface, { ...props, surface: second })),
  );
  input = root.container.queryAll((element) => element.type === "TextInput")[0];
  assert.equal(input.props.value, "Lin");
  await act(async () => root.unmount());
});

test("mounted v1 actions omit the local model unless sendDataModel is enabled", async () => {
  const surface = createSurface([
    {
      id: "root",
      component: "Button",
      child: "label",
      action: { event: { name: "save" } },
    },
    { id: "label", component: "Text", text: "Save" },
  ]);
  const calls = [];
  const root = createRoot();

  await act(async () => {
    root.render(
      createElement(A2uiV1NativeSurface, {
        surface,
        policy: nativePolicy({ allowedEventNames: ["save"] }),
        components: nativeComponents,
        onAction: (...args) => calls.push(args),
      }),
    );
  });

  root.container.queryAll((element) => element.type === "Button")[0].props.onPress();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].length, 1);
  assert.equal(calls[0][0].action.name, "save");
  await act(async () => root.unmount());
});

test("mounted v1 surfaces apply container layout and TextField variants", async () => {
  const surface = createSurface(
    [
      {
        id: "root",
        component: "Row",
        children: ["secret", "amount", "notes"],
        justify: "spaceBetween",
        align: "end",
      },
      {
        id: "secret",
        component: "TextField",
        label: "Password",
        value: { path: "/secret" },
        variant: "obscured",
        weight: 2,
      },
      {
        id: "amount",
        component: "TextField",
        label: "Amount",
        value: { path: "/amount" },
        variant: "number",
      },
      {
        id: "notes",
        component: "TextField",
        label: "Notes",
        value: { path: "/notes" },
        variant: "longText",
      },
    ],
    { secret: "hidden", amount: "42", notes: "Details" },
  );
  const root = createRoot();

  await act(async () => {
    root.render(
      createElement(A2uiV1NativeSurface, {
        surface,
        policy: nativePolicy(),
        components: nativeComponents,
        onAction() {},
      }),
    );
  });

  const views = root.container.queryAll((element) => element.type === "View");
  assert.deepEqual(views[0].props.style, {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  });
  assert.equal("layout" in views[0].props, false);
  assert.equal("justify" in views[0].props, false);
  assert.equal("align" in views[0].props, false);
  assert.deepEqual(views[1].props.style, { flexGrow: 2 });
  assert.equal("weight" in views[1].props, false);

  const inputs = root.container.queryAll((element) => element.type === "TextInput");
  assert.equal(inputs[0].props.secureTextEntry, true);
  assert.equal("weight" in inputs[0].props, false);
  assert.equal(inputs[1].props.keyboardType, "numeric");
  assert.equal(inputs[2].props.multiline, true);
  for (const input of inputs) {
    assert.equal("variant" in input.props, false);
  }
  await act(async () => root.unmount());
});

test("mounted v1 interactions reject malformed local values and timestamps", async () => {
  const surface = createSurface(
    [
      { id: "root", component: "Column", children: ["field", "save"] },
      { id: "field", component: "TextField", label: "Name", value: { path: "/name" } },
      {
        id: "save",
        component: "Button",
        child: "label",
        action: { event: { name: "save", context: { name: { path: "/name" } } } },
      },
      { id: "label", component: "Text", text: "Save" },
    ],
    { name: "Ada" },
  );
  const actions = [];
  const root = createRoot();
  await act(async () => {
    root.render(
      createElement(A2uiV1NativeSurface, {
        surface,
        policy: nativePolicy({ allowedEventNames: ["save"] }),
        components: nativeComponents,
        now: () => "invalid",
        onAction: (action) => actions.push(action),
      }),
    );
  });

  const input = root.container.queryAll((element) => element.type === "TextInput")[0];
  assert.throws(() => input.props.onChangeText(42), /string renderer binding value/);
  const button = root.container.queryAll((element) => element.type === "Button")[0];
  assert.throws(
    () => button.props.onPress(),
    (error) =>
      error instanceof A2uiParseError && /schema validation failed.*format/.test(error.message),
  );
  assert.equal(actions.length, 0);
  await act(async () => root.unmount());
});

test("dispatch-time resolution cannot activate an unreachable server event", () => {
  const surface = createSurface(
    [
      { id: "root", component: "Text", text: "Visible" },
      {
        id: "hidden-action",
        component: "Button",
        child: "hidden-label",
        action: { event: { name: "hidden" } },
      },
      { id: "hidden-label", component: "Text", text: "Hidden" },
    ],
    {},
  );

  assert.throws(
    () => resolveA2uiV1NativeEvent(surface, nativePolicy(), "hidden-action", {}),
    (error) =>
      error instanceof A2uiParseError && /not a reachable supported Button/.test(error.message),
  );
});

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
      instanceKey: "root/save:2",
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

test("dynamic lists expand bounded template instances with relative bindings and @index", () => {
  const surface = createSurface(
    [
      {
        id: "root",
        component: "List",
        children: { path: "/items", componentId: "item" },
        direction: "horizontal",
        align: "center",
      },
      {
        id: "item",
        component: "Column",
        children: ["name", "field", "choose"],
      },
      { id: "name", component: "Text", text: { path: "name" } },
      { id: "field", component: "TextField", label: "Name", value: { path: "name" } },
      {
        id: "choose",
        component: "Button",
        child: "choose-label",
        action: {
          event: {
            name: "choose_item",
            context: { name: { path: "name" }, index: { call: "@index" } },
          },
        },
      },
      { id: "choose-label", component: "Text", text: "Choose" },
    ],
    { items: [{ name: "Ada" }, { name: "Grace" }] },
  );
  const policy = nativePolicy({
    allowedEventNames: ["choose_item"],
    allowedFunctionNames: ["@index"],
  });
  const plan = createA2uiV1NativeRenderPlan(surface, policy);

  assert.deepEqual(plan.props, {
    layout: "row",
    variant: "list",
    align: "center",
  });
  assert.equal(plan.children?.length, 2);
  assert.equal(plan.children?.[0]?.children?.[0]?.props.children, "Ada");
  assert.equal(plan.children?.[1]?.children?.[0]?.props.children, "Grace");
  assert.equal(plan.children?.[0]?.children?.[1]?.props.binding, "/items/0/name");
  assert.equal(plan.children?.[1]?.children?.[1]?.props.binding, "/items/1/name");
  assert.deepEqual(plan.children?.[1]?.children?.[2]?.props.event, {
    name: "choose_item",
    surfaceId: "native",
    sourceComponentId: "choose",
    instanceKey: "root/item:1/choose:2",
    context: { name: "Grace", index: 1 },
  });

  assert.throws(
    () => resolveA2uiV1NativeEvent(surface, policy, "choose", surface.dataModel),
    (error) =>
      error instanceof A2uiParseError && /ambiguous without.*instance key/.test(error.message),
  );
  assert.deepEqual(
    resolveA2uiV1NativeEvent(surface, policy, "choose", surface.dataModel, {
      instanceKey: "root/item:1/choose:2",
    }),
    plan.children?.[1]?.children?.[2]?.props.event,
  );
  assert.throws(
    () =>
      resolveA2uiV1NativeEvent(surface, policy, "choose", surface.dataModel, {
        instanceKey: "missing",
      }),
    (error) =>
      error instanceof A2uiParseError && /not a reachable supported Button/.test(error.message),
  );
  assert.throws(
    () =>
      resolveA2uiV1NativeEvent(surface, policy, "choose", surface.dataModel, {
        instanceKey: 1,
      }),
    (error) => error instanceof A2uiParseError && /non-empty.*instance key/.test(error.message),
  );
  assert.throws(
    () =>
      resolveA2uiV1NativeEvent(surface, policy, "choose", surface.dataModel, {
        instanceKey: "root/item:1/choose:2",
        executable: true,
      }),
    (error) => error instanceof A2uiParseError && /Unexpected.*"executable"/.test(error.message),
  );
});

test("mounted dynamic-list bindings and events retain their template instance", async () => {
  const surface = createSurface(
    [
      {
        id: "root",
        component: "List",
        children: { path: "/items", componentId: "item" },
      },
      { id: "item", component: "Column", children: ["field", "choose"] },
      { id: "field", component: "TextField", label: "Name", value: { path: "name" } },
      {
        id: "choose",
        component: "Button",
        child: "choose-label",
        action: {
          event: {
            name: "choose_item",
            context: { name: { path: "name" }, index: { call: "@index" } },
          },
        },
      },
      { id: "choose-label", component: "Text", text: "Choose" },
    ],
    { items: [{ name: "Ada" }, { name: "Grace" }] },
    { sendDataModel: true },
  );
  const policy = nativePolicy({
    allowedEventNames: ["choose_item"],
    allowedFunctionNames: ["@index"],
  });
  const actions = [];
  const root = createRoot();

  await act(async () => {
    root.render(
      createElement(A2uiV1NativeSurface, {
        surface,
        policy,
        components: nativeComponents,
        now: () => "2026-08-26T18:00:00.000Z",
        onAction: (envelope, dataModel) => actions.push({ envelope, dataModel }),
      }),
    );
  });

  let inputs = root.container.queryAll((element) => element.type === "TextInput");
  assert.deepEqual(
    inputs.map((input) => input.props.value),
    ["Ada", "Grace"],
  );
  await act(async () => inputs[1].props.onChangeText("Lin"));
  inputs = root.container.queryAll((element) => element.type === "TextInput");
  assert.equal(inputs[1].props.value, "Lin");

  const buttons = root.container.queryAll((element) => element.type === "Button");
  buttons[1].props.onPress();
  assert.deepEqual(actions, [
    {
      envelope: {
        version: "v1.0",
        action: {
          name: "choose_item",
          surfaceId: "native",
          sourceComponentId: "choose",
          timestamp: "2026-08-26T18:00:00.000Z",
          context: { name: "Lin", index: 1 },
        },
      },
      dataModel: { items: [{ name: "Ada" }, { name: "Lin" }] },
    },
  ]);
  await act(async () => root.unmount());
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
      name: "dynamic list with a non-array model",
      surface: createSurface(
        [
          {
            id: "root",
            component: "List",
            children: { path: "/items", componentId: "item" },
          },
          { id: "item", component: "Text", text: { path: "name" } },
        ],
        { items: { name: "Ada" } },
      ),
      policy: nativePolicy(),
      message: /Expected an array.*root\.children path "\/items"/,
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
      name: "unsupported main-axis stretch",
      surface: createSurface([
        {
          id: "root",
          component: "Row",
          children: ["child"],
          justify: "stretch",
        },
        { id: "child", component: "Text", text: "Child" },
      ]),
      policy: nativePolicy(),
      message: /does not support main-axis stretch.*root\.justify/,
    },
    {
      name: "unsupported negative weight",
      surface: createSurface([
        { id: "root", component: "Row", children: ["child"] },
        { id: "child", component: "Text", text: "Child", weight: -1 },
      ]),
      policy: nativePolicy(),
      message: /does not support negative weight.*child\.weight/,
    },
    {
      name: "missing binding",
      surface: createSurface([{ id: "root", component: "Text", text: { path: "/missing" } }]),
      policy: nativePolicy(),
      message: /binding "\/missing" is missing/,
    },
    {
      name: "non-string text field binding",
      surface: createSurface(
        [{ id: "root", component: "TextField", label: "Name", value: { path: "/name" } }],
        { name: 42 },
      ),
      policy: nativePolicy(),
      message: /Expected a string at components\.root\.value/,
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

test("expanded shared graphs and dynamic lists remain bounded", () => {
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

  const listSurface = createSurface(
    [
      {
        id: "root",
        component: "List",
        children: { path: "/items", componentId: "item" },
      },
      { id: "item", component: "Text", text: { path: "" } },
    ],
    { items: Array.from({ length: A2UI_V1_NATIVE_MAX_RENDER_NODES }, () => "item") },
  );
  assert.throws(
    () => createA2uiV1NativeRenderPlan(listSurface, nativePolicy()),
    (error) =>
      error instanceof A2uiParseError &&
      new RegExp(`exceeds maximum of ${A2UI_V1_NATIVE_MAX_RENDER_NODES} nodes`).test(error.message),
  );
});
