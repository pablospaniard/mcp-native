import assert from "node:assert/strict";
import test from "node:test";

import { act, createElement } from "react";
import { createRoot } from "test-renderer";

import {
  McpNativeSurface,
  useMcpNativeActionDispatcher,
  useNativeRenderPlan,
} from "../packages/react-native/dist/index.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function hostComponent(type) {
  return function HostComponent(props) {
    return createElement(type, props, props.children);
  };
}

const components = {
  View: hostComponent("View"),
  Text: hostComponent("Text"),
  Button: hostComponent("Button"),
  TextInput: hostComponent("TextInput"),
};

const surface = {
  version: "0.1",
  root: {
    id: "profile",
    type: "container",
    children: [
      { id: "title", type: "text", text: "Profile" },
      {
        id: "save",
        type: "button",
        label: "Save",
        action: { type: "tool", name: "save_profile", arguments: { confirmed: true } },
      },
      {
        id: "name",
        type: "text-input",
        label: "Display name",
        value: "Ada",
        binding: "/profile/name",
      },
      { id: "email", type: "text-input", label: "Email" },
    ],
  },
};

test("McpNativeSurface mounts every node through the host-owned catalog", async () => {
  const actions = [];
  const bindingChanges = [];
  const root = createRoot({ textComponentTypes: ["Text"] });

  await act(async () => {
    root.render(
      createElement(McpNativeSurface, {
        surface,
        components,
        onAction: (action) => actions.push(action),
        onBindingChange: (binding, value) => bindingChanges.push({ binding, value }),
      }),
    );
  });

  const views = root.container.queryAll((element) => element.type === "View");
  const texts = root.container.queryAll((element) => element.type === "Text");
  const buttons = root.container.queryAll((element) => element.type === "Button");
  const inputs = root.container.queryAll((element) => element.type === "TextInput");

  assert.equal(views.length, 1);
  assert.equal(texts.length, 1);
  assert.deepEqual(texts[0]?.children, ["Profile"]);
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0]?.props.title, "Save");
  assert.equal(buttons[0]?.props.accessibilityLabel, "Save");
  assert.equal("action" in buttons[0].props, false);

  buttons[0].props.onPress();
  assert.deepEqual(actions, [
    { type: "tool", name: "save_profile", arguments: { confirmed: true } },
  ]);

  assert.equal(inputs.length, 2);
  assert.deepEqual(
    {
      accessibilityLabel: inputs[0]?.props.accessibilityLabel,
      placeholder: inputs[0]?.props.placeholder,
      value: inputs[0]?.props.value,
    },
    { accessibilityLabel: "Display name", placeholder: "Display name", value: "Ada" },
  );
  assert.equal("binding" in inputs[0].props, false);
  assert.equal("label" in inputs[0].props, false);
  inputs[0].props.onChangeText("Grace");
  assert.deepEqual(bindingChanges, [{ binding: "/profile/name", value: "Grace" }]);

  assert.equal(inputs[1]?.props.accessibilityLabel, "Email");
  assert.equal(inputs[1]?.props.placeholder, "Email");
  assert.equal(inputs[1]?.props.value, undefined);
  assert.equal(inputs[1]?.props.onChangeText, undefined);

  await act(async () => root.unmount());
});

test("McpNativeSurface does not create binding handlers without a host callback", async () => {
  const root = createRoot({ textComponentTypes: ["Text"] });
  await act(async () => {
    root.render(
      createElement(McpNativeSurface, {
        surface,
        components,
        onAction() {},
      }),
    );
  });

  const inputs = root.container.queryAll((element) => element.type === "TextInput");
  assert.equal(inputs[0]?.props.onChangeText, undefined);
  await act(async () => root.unmount());
});

test("useNativeRenderPlan preserves a plan until the surface identity changes", async () => {
  const plans = [];
  const root = createRoot();

  function PlanProbe(props) {
    plans.push(useNativeRenderPlan(props.surface));
    return createElement("View");
  }

  await act(async () => root.render(createElement(PlanProbe, { surface })));
  await act(async () => root.render(createElement(PlanProbe, { surface })));
  await act(async () => root.render(createElement(PlanProbe, { surface: { ...surface } })));

  assert.equal(plans[0], plans[1]);
  assert.notEqual(plans[1], plans[2]);
  await act(async () => root.unmount());
});

test("useMcpNativeActionDispatcher reports results and failures", async () => {
  const calls = [];
  const results = [];
  const errors = [];
  let handler;
  const dispatcher = {
    async dispatch(action) {
      calls.push(action);
      if (action.name === "fail") {
        throw new Error("tool failed");
      }
      return { content: [{ type: "text", data: { text: "saved" } }] };
    },
  };
  const options = {
    onResult: (result) => results.push(result),
    onError: (error) => errors.push(error),
  };
  const root = createRoot();

  function DispatcherProbe() {
    handler = useMcpNativeActionDispatcher(dispatcher, options);
    return createElement("View");
  }

  await act(async () => root.render(createElement(DispatcherProbe)));
  const firstHandler = handler;
  await act(async () => root.render(createElement(DispatcherProbe)));
  assert.equal(handler, firstHandler);

  await act(async () => {
    handler({ type: "tool", name: "save" });
    await Promise.resolve();
  });
  await act(async () => {
    handler({ type: "tool", name: "fail" });
    await Promise.resolve();
  });

  assert.deepEqual(calls, [
    { type: "tool", name: "save" },
    { type: "tool", name: "fail" },
  ]);
  assert.deepEqual(results, [{ content: [{ type: "text", data: { text: "saved" } }] }]);
  assert.equal(errors.length, 1);
  assert.match(errors[0]?.message, /tool failed/);
  await act(async () => root.unmount());
});

test("useMcpNativeActionDispatcher routes synchronous dispatcher throws to onError", async () => {
  const errors = [];
  let handler;
  const dispatcher = {
    dispatch() {
      throw new Error("sync boom");
    },
  };
  const root = createRoot();

  function DispatcherProbe() {
    handler = useMcpNativeActionDispatcher(dispatcher, {
      onError: (error) => errors.push(error),
    });
    return createElement("View");
  }

  await act(async () => root.render(createElement(DispatcherProbe)));
  await act(async () => {
    handler({ type: "tool", name: "save" });
    await Promise.resolve();
  });

  assert.equal(errors.length, 1);
  assert.match(errors[0]?.message, /sync boom/);
  await act(async () => root.unmount());
});

test("the mounted renderer rejects malformed trusted-plan fields", async (t) => {
  const cases = [
    {
      name: "text content",
      root: { id: "bad", type: "text", text: 1 },
      message: /bad\.children/,
    },
    {
      name: "button title",
      root: { id: "bad", type: "button", label: 1, action: { type: "tool", name: "run" } },
      message: /bad\.title/,
    },
    {
      name: "button action",
      root: { id: "bad", type: "button", label: "Run", action: { type: "script" } },
      message: /bad\.action/,
    },
    {
      name: "input label",
      root: { id: "bad", type: "text-input", label: 1 },
      message: /bad\.label/,
    },
    {
      name: "input value",
      root: { id: "bad", type: "text-input", label: "Name", value: 1 },
      message: /bad\.value/,
    },
    {
      name: "input binding",
      root: { id: "bad", type: "text-input", label: "Name", binding: 1 },
      message: /bad\.binding/,
    },
  ];

  async function runCase(index) {
    const invalidCase = cases[index];
    if (invalidCase === undefined) {
      return;
    }

    await t.test(invalidCase.name, async () => {
      const root = createRoot();
      await assert.rejects(async () => {
        await act(async () => {
          root.render(
            createElement(McpNativeSurface, {
              surface: { version: "0.1", root: invalidCase.root },
              components,
              onAction() {},
            }),
          );
        });
      }, invalidCase.message);
    });
    await runCase(index + 1);
  }

  await runCase(0);
});
