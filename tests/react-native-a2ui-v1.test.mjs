import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  A2UI_V1_NATIVE_MAX_OPEN_URL_LENGTH,
  A2UI_V1_NATIVE_MAX_RENDER_NODES,
  A2uiV1NativeSurface,
  createA2uiV1NativeRenderPlan,
  createNativeButtonAdapter,
  createNativeTextAdapter,
  createNativeTextInputAdapter,
  createNativeViewAdapter,
  resolveA2uiV1NativeEvent,
  resolveA2uiV1NativeOpenUrl,
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

const accessibilityFixture = JSON.parse(
  readFileSync(new URL("fixtures/a2ui-v1/accessibility-surface.json", import.meta.url), "utf8"),
);

function createSurface(components, dataModel = {}, options = {}) {
  const store = new A2uiSurfaceStore();
  store.apply({
    version: "v1.0",
    createSurface: { surfaceId: "native", components, dataModel, ...options },
  });
  return store.get("native");
}

function createFixtureSurface(message) {
  const store = new A2uiSurfaceStore();
  store.apply(message);
  return store.get(message.createSurface.surfaceId);
}

function nativePolicy(options = {}) {
  return createA2uiV1BasicCatalogPolicy({
    allowedComponentNames: A2UI_V1_NATIVE_COMPONENT_NAMES,
    ...options,
  });
}

function localDate(year, month, day, hour = 0, minute = 0, second = 0) {
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(hour, minute, second, 0);
  return date;
}

function intlDatePart(locale, date, options, type) {
  const part = new Intl.DateTimeFormat(locale, options)
    .formatToParts(date)
    .find((candidate) => candidate.type === type);
  assert.ok(part, `Expected ${type} from Intl.DateTimeFormat`);
  return part.value;
}

function normalizedIntlDateNumber(locale, date, options, type, width) {
  const value = intlDatePart(locale, date, options, type);
  const zero = new Intl.NumberFormat(locale, { useGrouping: false })
    .formatToParts(0)
    .find((part) => part.type === "integer")?.value;
  assert.ok(zero, "Expected a localized zero from Intl.NumberFormat");
  if (width === 1) {
    let normalized = value;
    while (Array.from(normalized).length > 1 && normalized.startsWith(zero)) {
      normalized = normalized.slice(zero.length);
    }
    return normalized;
  }
  return `${zero.repeat(Math.max(0, width - Array.from(value).length))}${value}`;
}

test("the platform accessibility fixture exercises the complete trusted host boundary", async () => {
  const surface = createFixtureSurface(accessibilityFixture);
  const policy = nativePolicy({
    allowedEventNames: ["activate", "choose_item", "submit"],
    allowedFunctionNames: ["@index", "email", "required"],
  });
  const actions = [];
  const localModels = [];
  const root = createRoot({ textComponentTypes: ["Text"] });

  await act(async () => {
    root.render(
      createElement(A2uiV1NativeSurface, {
        surface,
        policy,
        components: nativeComponents,
        onAction: (envelope, dataModel) => actions.push({ envelope, dataModel }),
        onDataModelChange: (dataModel) => localModels.push(dataModel),
        now: () => "2026-08-27T15:00:00.000Z",
      }),
    );
  });

  const findText = (value) =>
    root.container
      .queryAll((element) => element.type === "Text")
      .find((element) => element.children.includes(value));
  const findInput = (label) =>
    root.container
      .queryAll((element) => element.type === "TextInput")
      .find((element) => element.props.accessibilityLabel === label);
  const findButton = (title) =>
    root.container
      .queryAll((element) => element.type === "Button")
      .find((element) => element.props.title === title);

  assert.equal(findText("Visible body text")?.props.accessibilityRole, "text");
  assert.equal(findText("Visible caption")?.props.allowFontScaling, true);
  assert.equal(findText("This must not be announced")?.props.accessible, false);
  assert.equal(
    findText("This must not be announced")?.props.importantForAccessibility,
    "no-hide-descendants",
  );
  assert.equal(findText("Ada")?.props.accessibilityLiveRegion, "polite");
  assert.equal(findText("Email is incomplete")?.props.accessibilityLiveRegion, "assertive");

  let nameInput = findInput("Display name");
  let emailInput = findInput("Email");
  assert.equal(nameInput?.props.allowFontScaling, true);
  assert.equal(nameInput?.props.accessibilityHint, "Shown in the polite preview");
  assert.equal(emailInput?.props.invalid, true);
  assert.deepEqual(emailInput?.props.validationMessages, [
    "Email is required.",
    "Enter a valid email.",
  ]);
  assert.equal(findInput("Notes")?.props.multiline, true);
  assert.equal(findInput("Quantity")?.props.keyboardType, "numeric");
  assert.equal(findInput("Password")?.props.secureTextEntry, true);

  const defaultButton = findButton("Default action");
  let submitButton = findButton("Submit");
  assert.deepEqual(defaultButton?.props.accessibilityState, { disabled: false });
  assert.deepEqual(submitButton?.props.accessibilityState, { disabled: true });
  defaultButton.props.onPress();
  submitButton.props.onPress();
  assert.equal(actions.length, 1);
  assert.equal(actions[0].envelope.action.name, "activate");
  assert.equal(actions[0].envelope.action.context.variant, "default");

  await act(async () => nameInput.props.onChangeText("Grace"));
  assert.equal(findText("Grace")?.props.accessibilityLiveRegion, "polite");
  assert.equal(localModels.at(-1).form.name, "Grace");

  emailInput = findInput("Email");
  await act(async () => emailInput.props.onChangeText("grace@example.com"));
  emailInput = findInput("Email");
  submitButton = findButton("Submit");
  assert.equal(emailInput.props.invalid, undefined);
  assert.equal(emailInput.props.validationMessages, undefined);
  assert.deepEqual(submitButton.props.accessibilityState, { disabled: false });
  submitButton.props.onPress();
  assert.equal(actions.length, 2);
  assert.deepEqual(actions[1].envelope.action.context, {
    email: "grace@example.com",
    name: "Grace",
  });
  assert.equal(actions[1].dataModel.form.email, "grace@example.com");

  const chooseButtons = root.container
    .queryAll((element) => element.type === "Button")
    .filter((element) => element.props.title === "Choose item");
  assert.equal(chooseButtons.length, 2);
  chooseButtons[1].props.onPress();
  assert.equal(actions.length, 3);
  assert.deepEqual(actions[2].envelope.action.context, { name: "Second item", index: 1 });

  await act(async () => root.unmount());
});

test("mounted v1 surfaces keep input local and resolve actions at dispatch time", async () => {
  const surface = createSurface(
    [
      {
        id: "root",
        component: "Column",
        children: ["preview", "hidden-note", "field", "hidden-field", "save"],
      },
      {
        id: "preview",
        component: "Text",
        text: { path: "/profile/name" },
        accessibility: { live: "polite" },
      },
      {
        id: "hidden-note",
        component: "Text",
        text: "Private note",
        accessibility: { hidden: true },
      },
      {
        id: "field",
        component: "TextField",
        label: "Name",
        value: { path: "/profile/name" },
        accessibility: { description: "Public display name", hidden: false },
      },
      {
        id: "hidden-field",
        component: "TextField",
        label: "Internal identifier",
        accessibility: { hidden: true },
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
  assert.equal(inputs[0]?.props.accessible, true);
  assert.equal(inputs[0]?.props.allowFontScaling, true);
  assert.equal(inputs[1]?.props.accessibilityElementsHidden, true);
  assert.equal(inputs[1]?.props.importantForAccessibility, "no-hide-descendants");
  assert.equal(inputs[1]?.props.accessible, false);
  assert.equal(inputs[1]?.props.allowFontScaling, true);
  assert.equal(texts[0]?.props.accessibilityLiveRegion, "polite");
  assert.equal(texts[0]?.props.accessible, true);
  assert.equal(texts[0]?.props.accessibilityRole, "text");
  assert.equal(texts[0]?.props.allowFontScaling, true);
  assert.equal(texts[1]?.props.accessibilityElementsHidden, true);
  assert.equal(texts[1]?.props.importantForAccessibility, "no-hide-descendants");
  assert.equal(texts[1]?.props.accessible, false);

  await act(async () => inputs[0].props.onChangeText("Grace"));
  assert.equal(actions.length, 0);
  assert.deepEqual(localModels, [{ profile: { name: "Grace" } }]);

  texts = root.container.queryAll((element) => element.type === "Text");
  inputs = root.container.queryAll((element) => element.type === "TextInput");
  assert.deepEqual(texts[0]?.children, ["Grace"]);
  assert.equal(inputs[0]?.props.value, "Grace");

  const buttons = root.container.queryAll((element) => element.type === "Button");
  assert.equal(buttons[0].props.accessible, true);
  assert.equal(buttons[0].props.accessibilityRole, "button");
  assert.deepEqual(buttons[0].props.accessibilityState, { disabled: false });
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

test("mounted openUrl actions require a press and current-state host authorization", async () => {
  const surface = createSurface(
    [
      { id: "root", component: "Column", children: ["url", "open"] },
      { id: "url", component: "TextField", label: "URL", value: { path: "/url" } },
      {
        id: "open",
        component: "Button",
        child: "open-label",
        action: {
          functionCall: { call: "openUrl", args: { url: { path: "/url" } } },
        },
      },
      { id: "open-label", component: "Text", text: "Open" },
    ],
    { url: "https://example.com/old" },
  );
  const policy = nativePolicy({ allowedFunctionNames: ["openUrl"] });
  const policyCalls = [];
  const opened = [];
  const root = createRoot();

  await act(async () => {
    root.render(
      createElement(A2uiV1NativeSurface, {
        surface,
        policy,
        components: nativeComponents,
        onAction() {},
        openUrlPolicy: (request) => {
          policyCalls.push(request);
          return request.url === "https://example.com/current";
        },
        onOpenUrl: (request) => opened.push(request),
      }),
    );
  });

  assert.deepEqual(policyCalls, []);
  assert.deepEqual(opened, []);
  let input = root.container.queryAll((element) => element.type === "TextInput")[0];
  await act(async () => input.props.onChangeText("https:"));
  let button = root.container.queryAll((element) => element.type === "Button")[0];
  assert.equal(button.props.disabled, true);
  button.props.onPress();
  assert.deepEqual(policyCalls, []);
  assert.deepEqual(opened, []);
  assert.throws(
    () => resolveA2uiV1NativeOpenUrl(surface, policy, "open", { url: "https:" }),
    (error) => error instanceof A2uiParseError && /absolute HTTP\(S\) URL/.test(error.message),
  );

  input = root.container.queryAll((element) => element.type === "TextInput")[0];
  await act(async () => input.props.onChangeText("https://example.com/current"));
  button = root.container.queryAll((element) => element.type === "Button")[0];
  assert.equal(button.props.disabled, undefined);
  button.props.onPress();
  assert.deepEqual(policyCalls, [
    {
      url: "https://example.com/current",
      surfaceId: "native",
      sourceComponentId: "open",
      instanceKey: "root/open:1",
    },
  ]);
  assert.deepEqual(opened, policyCalls);

  const invalidUpdatedSurface = createSurface(
    [
      { id: "root", component: "Column", children: ["field", "open"] },
      { id: "field", component: "TextField", label: "URL", value: { path: "/url" } },
      {
        id: "open",
        component: "Button",
        child: "open-label",
        action: {
          functionCall: { call: "openUrl", args: { url: "https://user@example.com" } },
        },
      },
      { id: "open-label", component: "Text", text: "Open" },
    ],
    { url: "https://example.com/old" },
  );
  await assert.rejects(async () => {
    await act(async () => {
      root.render(
        createElement(A2uiV1NativeSurface, {
          surface: invalidUpdatedSurface,
          policy,
          components: nativeComponents,
          onAction() {},
          openUrlPolicy: () => true,
          onOpenUrl() {},
        }),
      );
    });
  }, /does not allow URL credentials/);
});

test("openUrl fails closed when host policy denies or capability handlers are incomplete", async () => {
  const surface = createSurface([
    {
      id: "root",
      component: "Button",
      child: "label",
      action: { functionCall: { call: "openUrl", args: { url: "https://example.com" } } },
    },
    { id: "label", component: "Text", text: "Open" },
  ]);
  const policy = nativePolicy({ allowedFunctionNames: ["openUrl"] });
  const opened = [];
  const root = createRoot();

  await act(async () => {
    root.render(
      createElement(A2uiV1NativeSurface, {
        surface,
        policy,
        components: nativeComponents,
        onAction() {},
        openUrlPolicy: () => false,
        onOpenUrl: (request) => opened.push(request),
      }),
    );
  });
  root.container.queryAll((element) => element.type === "Button")[0].props.onPress();
  assert.deepEqual(opened, []);
  await act(async () => root.unmount());

  const incompleteRoot = createRoot();
  await assert.rejects(async () => {
    await act(async () => {
      incompleteRoot.render(
        createElement(A2uiV1NativeSurface, {
          surface,
          policy,
          components: nativeComponents,
          onAction() {},
          onOpenUrl() {},
        }),
      );
    });
  }, /Missing A2UI v1 openUrl policy or handler/);

  const invalidInitialSurface = createSurface(
    [
      {
        id: "root",
        component: "Button",
        child: "label",
        action: {
          functionCall: { call: "openUrl", args: { url: { path: "/url" } } },
        },
      },
      { id: "label", component: "Text", text: "Open" },
    ],
    { url: "https:" },
  );
  const invalidRoot = createRoot();
  await assert.rejects(async () => {
    await act(async () => {
      invalidRoot.render(
        createElement(A2uiV1NativeSurface, {
          surface: invalidInitialSurface,
          policy,
          components: nativeComponents,
          onAction() {},
          openUrlPolicy: () => true,
          onOpenUrl() {},
        }),
      );
    });
  }, /absolute HTTP\(S\) URL/);
});

test("mounted formatString values follow renderer-local state through dispatch", async () => {
  const surface = createSurface(
    [
      { id: "root", component: "Column", children: ["field", "save"] },
      { id: "field", component: "TextField", label: "Name", value: { path: "/name" } },
      {
        id: "save",
        component: "Button",
        child: "save-label",
        action: {
          event: {
            name: "save",
            userMessage: {
              call: "formatString",
              args: { value: "Saved ${/name}" },
            },
            context: {
              greeting: {
                call: "formatString",
                args: { value: "Hello ${/name}" },
              },
            },
          },
        },
      },
      {
        id: "save-label",
        component: "Text",
        text: { call: "formatString", args: { value: "Save ${/name}" } },
      },
    ],
    { name: "Ada" },
  );
  const actions = [];
  const root = createRoot();
  const policy = nativePolicy({
    allowedEventNames: ["save"],
    allowedFunctionNames: ["formatString"],
  });

  await act(async () => {
    root.render(
      createElement(A2uiV1NativeSurface, {
        surface,
        policy,
        components: nativeComponents,
        now: () => "2026-08-26T19:00:00.000Z",
        onAction: (envelope) => actions.push(envelope),
      }),
    );
  });

  let button = root.container.queryAll((element) => element.type === "Button")[0];
  assert.equal(button.props.title, "Save Ada");
  const input = root.container.queryAll((element) => element.type === "TextInput")[0];
  await act(async () => input.props.onChangeText("Grace"));
  button = root.container.queryAll((element) => element.type === "Button")[0];
  assert.equal(button.props.title, "Save Grace");
  button.props.onPress();
  assert.deepEqual(actions, [
    {
      version: "v1.0",
      action: {
        name: "save",
        surfaceId: "native",
        sourceComponentId: "save",
        timestamp: "2026-08-26T19:00:00.000Z",
        userMessage: "Saved Grace",
        context: { greeting: "Hello Grace" },
      },
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

test("host adapters map trusted primitives into a third-party component API", async () => {
  const DesignStack = hostComponent("DesignStack");
  const DesignLabel = hostComponent("DesignLabel");
  const DesignButton = hostComponent("DesignButton");
  const DesignInput = hostComponent("DesignInput");
  const designSystemComponents = {
    View: createNativeViewAdapter(DesignStack, ({ children, style, accessibilityLabel }) => ({
      children,
      direction: style?.flexDirection,
      grow: style?.flexGrow,
      justify: style?.justifyContent,
      assistiveLabel: accessibilityLabel,
    })),
    Text: createNativeTextAdapter(
      DesignLabel,
      ({ children, accessibilityLabel, accessible, accessibilityRole, allowFontScaling }) => ({
        content: children,
        assistiveLabel: accessibilityLabel,
        assistiveElement: accessible,
        assistiveRole: accessibilityRole,
        scalesText: allowFontScaling,
      }),
    ),
    Button: createNativeButtonAdapter(
      DesignButton,
      ({
        title,
        onPress,
        disabled,
        accessibilityLabel,
        accessibilityRole,
        accessibilityState,
        accessible,
        validationMessages,
      }) => ({
        label: title,
        onActivate: onPress,
        inactive: disabled,
        assistiveLabel: accessibilityLabel,
        assistiveElement: accessible,
        assistiveRole: accessibilityRole,
        assistiveState: accessibilityState,
        errors: validationMessages,
      }),
    ),
    TextInput: createNativeTextInputAdapter(
      DesignInput,
      ({
        value,
        placeholder,
        onChangeText,
        keyboardType,
        invalid,
        accessibilityLabel,
        accessible,
        allowFontScaling,
      }) => ({
        currentValue: value,
        hint: placeholder,
        onValueChange: onChangeText,
        inputMode: keyboardType,
        hasError: invalid,
        assistiveLabel: accessibilityLabel,
        assistiveElement: accessible,
        scalesText: allowFontScaling,
      }),
    ),
  };
  assert.equal(designSystemComponents.View.displayName, "McpNativeViewAdapter(HostComponent)");
  assert.equal(
    designSystemComponents.TextInput.displayName,
    "McpNativeTextInputAdapter(HostComponent)",
  );
  const surface = createSurface(
    [
      {
        id: "root",
        component: "Row",
        children: ["preview", "amount", "save"],
        justify: "spaceBetween",
      },
      { id: "preview", component: "Text", text: { path: "/amount" } },
      {
        id: "amount",
        component: "TextField",
        label: "Amount",
        value: { path: "/amount" },
        variant: "number",
        weight: 2,
      },
      {
        id: "save",
        component: "Button",
        child: "save-label",
        action: { event: { name: "save", context: { amount: { path: "/amount" } } } },
      },
      { id: "save-label", component: "Text", text: "Save" },
    ],
    { amount: "42" },
  );
  const actions = [];
  const root = createRoot();

  await act(async () => {
    root.render(
      createElement(A2uiV1NativeSurface, {
        surface,
        policy: nativePolicy({ allowedEventNames: ["save"] }),
        components: designSystemComponents,
        onAction: (action) => actions.push(action),
        now: () => "2026-08-27T13:00:00.000Z",
      }),
    );
  });

  const stacks = root.container.queryAll((element) => element.type === "DesignStack");
  assert.equal(stacks[0].props.direction, "row");
  assert.equal(stacks[0].props.justify, "space-between");
  assert.equal(stacks[1].props.grow, 2);
  const label = root.container.queryAll((element) => element.type === "DesignLabel")[0];
  assert.equal(label.props.content, "42");
  assert.equal(label.props.assistiveElement, true);
  assert.equal(label.props.assistiveRole, "text");
  assert.equal(label.props.scalesText, true);
  let input = root.container.queryAll((element) => element.type === "DesignInput")[0];
  assert.equal(input.props.currentValue, "42");
  assert.equal(input.props.inputMode, "numeric");
  assert.equal(input.props.assistiveElement, true);
  assert.equal(input.props.scalesText, true);
  await act(async () => input.props.onValueChange("84"));
  input = root.container.queryAll((element) => element.type === "DesignInput")[0];
  assert.equal(input.props.currentValue, "84");
  const button = root.container.queryAll((element) => element.type === "DesignButton")[0];
  assert.equal(button.props.label, "Save");
  assert.equal(button.props.assistiveElement, true);
  assert.equal(button.props.assistiveRole, "button");
  assert.deepEqual(button.props.assistiveState, { disabled: false });
  assert.equal("title" in button.props, false);
  button.props.onActivate();
  assert.equal(actions[0].action.context.amount, "84");
  await act(async () => root.unmount());
});

test("closed host variants select richer local components without forwarding style hints", async () => {
  const BaseView = hostComponent("BaseView");
  const BaseText = hostComponent("BaseText");
  const BaseButton = hostComponent("BaseButton");
  const BaseInput = hostComponent("BaseInput");
  const components = {
    View: BaseView,
    Text: BaseText,
    Button: BaseButton,
    TextInput: BaseInput,
    variants: {
      View: {
        card: hostComponent("CardView"),
        column: hostComponent("ColumnView"),
        list: hostComponent("ListView"),
        row: hostComponent("RowView"),
      },
      Text: {
        body: hostComponent("BodyText"),
        caption: hostComponent("CaptionText"),
      },
      Button: {
        default: hostComponent("DefaultButton"),
        primary: hostComponent("PrimaryButton"),
        borderless: hostComponent("BorderlessButton"),
      },
      TextInput: {
        shortText: hostComponent("ShortInput"),
        longText: hostComponent("LongInput"),
        number: hostComponent("NumberInput"),
        obscured: hostComponent("ObscuredInput"),
      },
    },
  };
  const surface = createSurface([
    { id: "root", component: "Card", child: "column" },
    {
      id: "column",
      component: "Column",
      children: [
        "row",
        "list",
        "body",
        "caption",
        "default-button",
        "primary-button",
        "borderless-button",
        "short-input",
        "long-input",
        "number-input",
        "obscured-input",
      ],
    },
    { id: "row", component: "Row", children: [] },
    { id: "list", component: "List", children: [] },
    { id: "body", component: "Text", text: "Body" },
    { id: "caption", component: "Text", text: "Caption", variant: "caption" },
    {
      id: "default-button",
      component: "Button",
      child: "default-label",
      action: { event: { name: "activate" } },
    },
    { id: "default-label", component: "Text", text: "Default" },
    {
      id: "primary-button",
      component: "Button",
      child: "primary-label",
      variant: "primary",
      action: { event: { name: "activate" } },
    },
    { id: "primary-label", component: "Text", text: "Primary" },
    {
      id: "borderless-button",
      component: "Button",
      child: "borderless-label",
      variant: "borderless",
      action: { event: { name: "activate" } },
    },
    { id: "borderless-label", component: "Text", text: "Borderless" },
    { id: "short-input", component: "TextField", label: "Short" },
    { id: "long-input", component: "TextField", label: "Long", variant: "longText" },
    { id: "number-input", component: "TextField", label: "Number", variant: "number" },
    { id: "obscured-input", component: "TextField", label: "Secret", variant: "obscured" },
  ]);
  const root = createRoot();

  await act(async () => {
    root.render(
      createElement(A2uiV1NativeSurface, {
        surface,
        policy: nativePolicy({ allowedEventNames: ["activate"] }),
        components,
        onAction() {},
      }),
    );
  });

  for (const type of [
    "CardView",
    "ColumnView",
    "RowView",
    "ListView",
    "BodyText",
    "CaptionText",
    "DefaultButton",
    "PrimaryButton",
    "BorderlessButton",
    "ShortInput",
    "LongInput",
    "NumberInput",
    "ObscuredInput",
  ]) {
    assert.equal(root.container.queryAll((element) => element.type === type).length, 1, type);
  }
  for (const type of ["BaseView", "BaseText", "BaseButton", "BaseInput"]) {
    assert.equal(root.container.queryAll((element) => element.type === type).length, 0, type);
  }
  const card = root.container.queryAll((element) => element.type === "CardView")[0];
  assert.deepEqual(card.props.style, { flexDirection: "column" });
  assert.equal("variant" in card.props, false);
  const primary = root.container.queryAll((element) => element.type === "PrimaryButton")[0];
  assert.equal(primary.props.title, "Primary");
  assert.equal("variant" in primary.props, false);
  const caption = root.container.queryAll((element) => element.type === "CaptionText")[0];
  assert.equal(caption.props.children, "Caption");
  assert.equal("variant" in caption.props, false);
  const longInput = root.container.queryAll((element) => element.type === "LongInput")[0];
  const numberInput = root.container.queryAll((element) => element.type === "NumberInput")[0];
  const obscuredInput = root.container.queryAll((element) => element.type === "ObscuredInput")[0];
  assert.equal(longInput.props.multiline, true);
  assert.equal(numberInput.props.keyboardType, "numeric");
  assert.equal(obscuredInput.props.secureTextEntry, true);
  assert.equal("variant" in obscuredInput.props, false);
  await act(async () => root.unmount());
});

test("server-provided native style hints remain closed to pinned catalog variants", async (t) => {
  const cases = [
    { component: "Text", text: "Hello", variant: "headline" },
    {
      component: "Button",
      child: "label",
      action: { event: { name: "activate" } },
      variant: "danger",
    },
    { component: "TextField", label: "Name", variant: "search" },
  ];

  await Promise.all(
    cases.map((component) =>
      t.test(`${component.component} rejects ${component.variant}`, () => {
        assert.throws(
          () =>
            createSurface([
              { id: "root", ...component },
              ...(component.component === "Button"
                ? [{ id: "label", component: "Text", text: "Activate" }]
                : []),
            ]),
          (error) =>
            error instanceof A2uiParseError && /schema validation failed/.test(error.message),
        );
      }),
    ),
  );
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

test("openUrl plans retain only a canonical descriptor and resolve reachable current actions", () => {
  const surface = createSurface([
    {
      id: "root",
      component: "Button",
      child: "label",
      action: {
        functionCall: { call: "openUrl", args: { url: "https://example.com/docs?q=a%20b" } },
      },
    },
    { id: "label", component: "Text", text: "Docs" },
  ]);
  const policy = nativePolicy({ allowedFunctionNames: ["openUrl"] });
  const plan = createA2uiV1NativeRenderPlan(surface, policy);

  assert.deepEqual(plan.props, {
    title: "Docs",
    openUrl: {
      url: "https://example.com/docs?q=a%20b",
      surfaceId: "native",
      sourceComponentId: "root",
      instanceKey: "root",
    },
    accessibilityLabel: "Docs",
  });
  assert.deepEqual(
    resolveA2uiV1NativeOpenUrl(surface, policy, "root", surface.dataModel),
    plan.props.openUrl,
  );

  const hiddenSurface = createSurface([
    { id: "root", component: "Text", text: "Visible" },
    {
      id: "hidden",
      component: "Button",
      child: "hidden-label",
      action: {
        functionCall: { call: "openUrl", args: { url: "https://example.com/hidden" } },
      },
    },
    { id: "hidden-label", component: "Text", text: "Hidden" },
  ]);
  assert.throws(
    () => resolveA2uiV1NativeOpenUrl(hiddenSurface, policy, "hidden", {}),
    (error) =>
      error instanceof A2uiParseError && /not a reachable supported Button/.test(error.message),
  );
});

test("openUrl rejects unsafe dynamic URLs and bounded expansion", async (t) => {
  const cases = [
    ["script scheme", "javascript:alert(1)", /Expected an HTTP\(S\) URL/],
    ["data scheme", "data:text/html,hello", /Expected an HTTP\(S\) URL/],
    ["file scheme", "file:///private/data", /Expected an HTTP\(S\) URL/],
    ["relative URL", "/local/path", /absolute HTTP\(S\) URL/],
    ["credentials", "https://user:secret@example.com", /does not allow URL credentials/],
    ["whitespace", "https://example.com/a b", /without whitespace/],
    ["Unicode format character", "https://example.com/a\u200bb", /Unicode format characters/],
    [
      "oversized URL",
      `https://example.com/${"a".repeat(A2UI_V1_NATIVE_MAX_OPEN_URL_LENGTH)}`,
      new RegExp(`up to ${A2UI_V1_NATIVE_MAX_OPEN_URL_LENGTH} characters`),
    ],
  ];

  await Promise.all(
    cases.map(([name, url, message]) =>
      t.test(name, () => {
        const surface = createSurface(
          [
            {
              id: "root",
              component: "Button",
              child: "label",
              action: {
                functionCall: { call: "openUrl", args: { url: { path: "/url" } } },
              },
            },
            { id: "label", component: "Text", text: "Open" },
          ],
          { url },
        );
        assert.throws(
          () =>
            createA2uiV1NativeRenderPlan(
              surface,
              nativePolicy({ allowedFunctionNames: ["openUrl"] }),
            ),
          (error) => error instanceof A2uiParseError && message.test(error.message),
        );
      }),
    ),
  );

  const longUrl = `https://example.com/${"a".repeat(
    A2UI_V1_NATIVE_MAX_OPEN_URL_LENGTH - "https://example.com/".length,
  )}`;
  const expanded = createSurface(
    [
      {
        id: "root",
        component: "List",
        children: { path: "/items", componentId: "link" },
      },
      {
        id: "link",
        component: "Button",
        child: "label",
        action: { functionCall: { call: "openUrl", args: { url: longUrl } } },
      },
      { id: "label", component: "Text", text: "Open" },
    ],
    { items: Array.from({ length: 129 }, () => ({})) },
  );
  assert.throws(
    () =>
      createA2uiV1NativeRenderPlan(expanded, nativePolicy({ allowedFunctionNames: ["openUrl"] })),
    (error) =>
      error instanceof A2uiParseError && /maximum openUrl length of 1048576/.test(error.message),
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

test("formatString resolves scoped values, JSON coercion, nesting, escapes, and index offsets", () => {
  const surface = createSurface(
    [
      { id: "root", component: "Column", children: ["summary", "items"] },
      {
        id: "summary",
        component: "Text",
        text: {
          call: "formatString",
          args: {
            value: "${/name} ${/count} ${/active} ${/nothing} ${/object} ${/array} \\${literal}",
          },
        },
      },
      {
        id: "items",
        component: "List",
        children: { path: "/items", componentId: "item" },
      },
      {
        id: "item",
        component: "Text",
        text: {
          call: "formatString",
          args: {
            value: "${name} #${@index(offset: 1)} nested ${formatString(value:'(${name})')}",
          },
        },
      },
    ],
    {
      name: "Ada",
      count: 42,
      active: true,
      nothing: null,
      object: { role: "admin" },
      array: [1, "two"],
      items: [{ name: "Ada" }, { name: "Grace" }],
    },
  );
  const plan = createA2uiV1NativeRenderPlan(
    surface,
    nativePolicy({ allowedFunctionNames: ["formatString", "@index"] }),
  );

  assert.equal(
    plan.children?.[0]?.props.children,
    'Ada 42 true  {"role":"admin"} [1,"two"] ${literal}',
  );
  assert.equal(plan.children?.[1]?.children?.[0]?.props.children, "Ada #1 nested (Ada)");
  assert.equal(plan.children?.[1]?.children?.[1]?.props.children, "Grace #2 nested (Grace)");
});

test("formatNumber and formatCurrency use the host locale in render and event resolution", async () => {
  const surface = createSurface(
    [
      { id: "root", component: "Column", children: ["number", "currency", "summary", "submit"] },
      {
        id: "number",
        component: "Text",
        text: {
          call: "formatNumber",
          args: {
            value: { path: "/amount" },
            decimals: { path: "/decimals" },
            grouping: true,
          },
        },
      },
      {
        id: "currency",
        component: "Text",
        text: {
          call: "formatCurrency",
          args: {
            value: { path: "/amount" },
            currency: { path: "/currency" },
            decimals: 2,
            grouping: true,
          },
        },
      },
      {
        id: "summary",
        component: "Text",
        text: {
          call: "formatString",
          args: {
            value:
              "Total: ${formatCurrency(value:${/amount}, currency:${/currency}, decimals:2, grouping:true)}",
          },
        },
      },
      {
        id: "submit",
        component: "Button",
        child: "submit-label",
        action: {
          event: {
            name: "submit",
            context: {
              displayAmount: {
                call: "formatNumber",
                args: { value: { path: "/amount" }, decimals: 1, grouping: false },
              },
            },
          },
        },
      },
      { id: "submit-label", component: "Text", text: "Submit" },
    ],
    { amount: 12345.6, currency: "usd", decimals: 2 },
  );
  const policy = nativePolicy({
    allowedEventNames: ["submit"],
    allowedFunctionNames: ["formatString", "formatNumber", "formatCurrency"],
  });
  const plan = createA2uiV1NativeRenderPlan(surface, policy, { locale: "en-US" });

  assert.equal(plan.children?.[0]?.props.children, "12,345.60");
  assert.equal(plan.children?.[1]?.props.children, "$12,345.60");
  assert.equal(plan.children?.[2]?.props.children, "Total: $12,345.60");
  const germanPlan = createA2uiV1NativeRenderPlan(surface, policy, { locale: "de-DE" });
  assert.equal(germanPlan.children?.[0]?.props.children, "12.345,60");
  assert.deepEqual(
    resolveA2uiV1NativeEvent(surface, policy, "submit", surface.dataModel, { locale: "en-US" })
      .context,
    { displayAmount: "12345.6" },
  );
  assert.deepEqual(
    resolveA2uiV1NativeEvent(surface, policy, "submit", surface.dataModel, { locale: "de-DE" })
      .context,
    { displayAmount: "12345,6" },
  );

  const actions = [];
  const root = createRoot({ textComponentTypes: ["Text"] });
  await act(async () => {
    root.render(
      createElement(A2uiV1NativeSurface, {
        surface,
        policy,
        locale: "en-US",
        components: nativeComponents,
        now: () => "2026-08-26T19:30:00.000Z",
        onAction: (envelope) => actions.push(envelope),
      }),
    );
  });
  root.container.queryAll((element) => element.type === "Button")[0].props.onPress();
  assert.deepEqual(actions[0].action.context, { displayAmount: "12345.6" });
});

test("localized number formatting fails closed for invalid dynamic and host options", () => {
  const policy = nativePolicy({ allowedFunctionNames: ["formatNumber", "formatCurrency"] });
  const decimalSurface = createSurface([
    {
      id: "root",
      component: "Text",
      text: { call: "formatNumber", args: { value: 42, decimals: 1.5 } },
    },
  ]);
  assert.throws(
    () => createA2uiV1NativeRenderPlan(decimalSurface, policy),
    (error) =>
      error instanceof A2uiParseError && /decimal places from 0 through 100/.test(error.message),
  );

  const currencySurface = createSurface([
    {
      id: "root",
      component: "Text",
      text: { call: "formatCurrency", args: { value: 42, currency: "US" } },
    },
  ]);
  assert.throws(
    () => createA2uiV1NativeRenderPlan(currencySurface, policy),
    (error) => error instanceof A2uiParseError && /current ISO 4217/.test(error.message),
  );

  const unknownCurrencySurface = createSurface([
    {
      id: "root",
      component: "Text",
      text: { call: "formatCurrency", args: { value: 42, currency: "ZZZ" } },
    },
  ]);
  assert.throws(
    () => createA2uiV1NativeRenderPlan(unknownCurrencySurface, policy),
    (error) => error instanceof A2uiParseError && /current ISO 4217/.test(error.message),
  );

  assert.throws(
    () => createA2uiV1NativeRenderPlan(decimalSurface, policy, { locale: "not_a_locale" }),
    (error) => error instanceof A2uiParseError && /Invalid BCP 47 locale/.test(error.message),
  );
  assert.throws(
    () => createA2uiV1NativeRenderPlan(decimalSurface, policy, { locale: "zz-ZZ" }),
    (error) => error instanceof A2uiParseError && /Unsupported BCP 47 locale/.test(error.message),
  );
  assert.throws(
    () => createA2uiV1NativeRenderPlan(decimalSurface, policy, { executable: true }),
    (error) => error instanceof A2uiParseError && /Unexpected.*"executable"/.test(error.message),
  );
});

test("formatDate uses pinned Unicode tokens for localized render and event values", () => {
  const surface = createSurface(
    [
      {
        id: "root",
        component: "Column",
        children: ["date", "tokens", "nested", "submit"],
      },
      {
        id: "date",
        component: "Text",
        text: {
          call: "formatDate",
          args: { value: { path: "/date" }, format: { path: "/pattern" } },
        },
      },
      {
        id: "tokens",
        component: "Text",
        text: {
          call: "formatDate",
          args: {
            value: "2026-01-06",
            format: "yy|M|MM|MMM|MMMM|d|dd|E|EEEE|h|hh|H|HH|mm|ss|a|'o''clock'",
          },
        },
      },
      {
        id: "nested",
        component: "Text",
        text: {
          call: "formatString",
          args: {
            value: "When: ${formatDate(value:${/date}, format:'MMM dd, yyyy')}",
          },
        },
      },
      {
        id: "submit",
        component: "Button",
        child: "submit-label",
        action: {
          event: {
            name: "submit",
            context: {
              seconds: {
                call: "formatDate",
                args: { value: 1768573800, format: "yyyy-MM-dd 'at' HH:mm" },
              },
              milliseconds: {
                call: "formatDate",
                args: { value: 1768573800000, format: "yyyy-MM-dd 'at' HH:mm" },
              },
              numericString: {
                call: "formatDate",
                args: { value: "1768573800000", format: "yyyy-MM-dd 'at' HH:mm" },
              },
              currentDate: {
                call: "formatDate",
                args: { value: { path: "/date" }, format: "yyyy-MM-dd" },
              },
              paddedYear: {
                call: "formatDate",
                args: { value: "0001-01-01", format: "yyyy" },
              },
            },
          },
        },
      },
      { id: "submit-label", component: "Text", text: "Submit" },
    ],
    { date: "2026-01-16", pattern: "EEEE, MMMM d, yyyy" },
  );
  const policy = nativePolicy({
    allowedEventNames: ["submit"],
    allowedFunctionNames: ["formatDate", "formatString"],
  });

  const date = localDate(2026, 1, 16);
  const tokenDate = localDate(2026, 1, 6);
  const englishPlan = createA2uiV1NativeRenderPlan(surface, policy, { locale: "en-US" });
  assert.equal(
    englishPlan.children?.[0]?.props.children,
    `${intlDatePart("en-US", date, { weekday: "long" }, "weekday")}, ${intlDatePart(
      "en-US",
      date,
      { month: "long", day: "numeric" },
      "month",
    )} ${intlDatePart("en-US", date, { day: "numeric" }, "day")}, ${intlDatePart(
      "en-US",
      date,
      { year: "numeric" },
      "year",
    )}`,
  );
  assert.equal(
    englishPlan.children?.[1]?.props.children,
    [
      intlDatePart("en-US", tokenDate, { year: "2-digit" }, "year"),
      normalizedIntlDateNumber(
        "en-US",
        tokenDate,
        { month: "numeric", day: "numeric" },
        "month",
        1,
      ),
      normalizedIntlDateNumber(
        "en-US",
        tokenDate,
        { month: "2-digit", day: "numeric" },
        "month",
        2,
      ),
      intlDatePart("en-US", tokenDate, { month: "short", day: "numeric" }, "month"),
      intlDatePart("en-US", tokenDate, { month: "long", day: "numeric" }, "month"),
      normalizedIntlDateNumber("en-US", tokenDate, { day: "numeric" }, "day", 1),
      normalizedIntlDateNumber("en-US", tokenDate, { day: "2-digit" }, "day", 2),
      intlDatePart("en-US", tokenDate, { weekday: "short" }, "weekday"),
      intlDatePart("en-US", tokenDate, { weekday: "long" }, "weekday"),
      normalizedIntlDateNumber(
        "en-US",
        tokenDate,
        { hour: "numeric", hourCycle: "h12" },
        "hour",
        1,
      ),
      normalizedIntlDateNumber(
        "en-US",
        tokenDate,
        { hour: "2-digit", hourCycle: "h12" },
        "hour",
        2,
      ),
      normalizedIntlDateNumber(
        "en-US",
        tokenDate,
        { hour: "numeric", hourCycle: "h23" },
        "hour",
        1,
      ),
      normalizedIntlDateNumber(
        "en-US",
        tokenDate,
        { hour: "2-digit", hourCycle: "h23" },
        "hour",
        2,
      ),
      normalizedIntlDateNumber("en-US", tokenDate, { minute: "2-digit" }, "minute", 2),
      normalizedIntlDateNumber("en-US", tokenDate, { second: "2-digit" }, "second", 2),
      intlDatePart("en-US", tokenDate, { hour: "numeric", hourCycle: "h12" }, "dayPeriod"),
      "o'clock",
    ].join("|"),
  );
  assert.equal(
    englishPlan.children?.[2]?.props.children,
    `When: ${intlDatePart("en-US", date, { month: "short", day: "numeric" }, "month")} ${intlDatePart("en-US", date, { day: "2-digit" }, "day")}, ${intlDatePart("en-US", date, { year: "numeric" }, "year")}`,
  );
  const frenchPlan = createA2uiV1NativeRenderPlan(surface, policy, { locale: "fr-FR" });
  assert.equal(
    frenchPlan.children?.[0]?.props.children,
    `${intlDatePart("fr-FR", date, { weekday: "long" }, "weekday")}, ${intlDatePart(
      "fr-FR",
      date,
      { month: "long", day: "numeric" },
      "month",
    )} ${intlDatePart("fr-FR", date, { day: "numeric" }, "day")}, ${intlDatePart(
      "fr-FR",
      date,
      { year: "numeric" },
      "year",
    )}`,
  );
  const russianPlan = createA2uiV1NativeRenderPlan(surface, policy, {
    dataModel: { ...surface.dataModel, pattern: "d MMMM yyyy" },
    locale: "ru-RU",
  });
  assert.equal(
    russianPlan.children?.[0]?.props.children,
    `${intlDatePart("ru-RU", date, { day: "numeric" }, "day")} ${intlDatePart(
      "ru-RU",
      date,
      { month: "long", day: "numeric" },
      "month",
    )} ${intlDatePart("ru-RU", date, { year: "numeric" }, "year")}`,
  );

  const context = resolveA2uiV1NativeEvent(
    surface,
    policy,
    "submit",
    { ...surface.dataModel, date: "2027-02-03" },
    { locale: "en-US" },
  ).context;
  assert.equal(context.seconds, context.milliseconds);
  assert.equal(context.seconds, context.numericString);
  assert.equal(context.currentDate, "2027-02-03");
  assert.equal(context.paddedYear, "0001");
  assert.match(context.seconds, /^\d{4}-\d{2}-\d{2} at \d{2}:\d{2}$/);
});

test("formatDate applies offsets, fractional timestamps, and the documented epoch heuristic", () => {
  const policy = nativePolicy({ allowedFunctionNames: ["formatDate"] });
  const render = (value) =>
    createA2uiV1NativeRenderPlan(
      createSurface([
        {
          id: "root",
          component: "Text",
          text: {
            call: "formatDate",
            args: { value, format: "yyyy-MM-dd HH:mm:ss" },
          },
        },
      ]),
      policy,
      { locale: "en-US" },
    ).props.children;

  assert.equal(render("2026-01-16T14:30:45.123Z"), render("2026-01-16T15:30:45.123+01:00"));
  assert.equal(render(-1), render("-1"));
  assert.equal(render(-10_000_000_001), render("-10000000001"));
  assert.equal(render(1_000_000_000_000), render("1e12"));
  assert.notEqual(render(10_000_000_000), render(10_000_000_001));
});

test("formatDate preserves host calendar locale extensions", () => {
  const surface = createSurface([
    {
      id: "root",
      component: "Text",
      text: {
        call: "formatDate",
        args: { value: "2026-01-16", format: "yyyy" },
      },
    },
  ]);
  const policy = nativePolicy({ allowedFunctionNames: ["formatDate"] });
  const date = localDate(2026, 1, 16);

  for (const locale of ["en-US-u-ca-buddhist", "th-TH-u-ca-gregory"]) {
    const plan = createA2uiV1NativeRenderPlan(surface, policy, { locale });
    assert.equal(
      plan.props.children,
      normalizedIntlDateNumber(locale, date, { year: "numeric" }, "year", 4),
    );
  }
});

test("formatDate fails closed for invalid values, patterns, and excessive work", async (t) => {
  const cases = [
    {
      name: "impossible calendar date",
      value: "2026-02-30",
      pattern: "yyyy-MM-dd",
      message: /Invalid calendar date/,
    },
    {
      name: "invalid RFC 3339 time",
      value: "2026-01-16T25:00:00Z",
      pattern: "HH:mm",
      message: /Invalid RFC 3339 time/,
    },
    {
      name: "unsupported date value",
      value: { year: 2026 },
      pattern: "yyyy",
      message: /date string or finite epoch number/,
    },
    {
      name: "unsupported pattern token",
      value: "2026-01-16",
      pattern: "YYYY-MM-dd",
      message: /Unsupported Unicode date pattern token/,
    },
    ...[
      ["month", "MMMMM"],
      ["day", "ddd"],
      ["weekday", "EEE"],
      ["hour", "HHH"],
      ["day period", "aa"],
    ].map(([field, pattern]) => ({
      name: `unsupported repeated ${field} field`,
      value: "2026-01-16",
      pattern,
      message: /Unsupported Unicode date pattern token/,
    })),
    {
      name: "unterminated quoted literal",
      value: "2026-01-16",
      pattern: "yyyy 'year",
      message: /Unterminated quoted literal/,
    },
    {
      name: "ambiguous 12-hour pattern",
      value: "2026-01-16T14:30:00Z",
      pattern: "h:mm",
      message: /requires token "a"/,
    },
    {
      name: "excessive pattern tokens",
      value: "2026-01-16",
      pattern: "yyyy-".repeat(129),
      message: /exceeds maximum of 128 tokens/,
    },
    {
      name: "epoch outside Date range",
      value: 9_000_000_000_000_000,
      pattern: "yyyy",
      message: /outside the supported date range/,
    },
  ];

  await Promise.all(
    cases.map((fixture) =>
      t.test(fixture.name, () => {
        const surface = createSurface([
          {
            id: "root",
            component: "Text",
            text: {
              call: "formatDate",
              args: { value: fixture.value, format: fixture.pattern },
            },
          },
        ]);
        assert.throws(
          () =>
            createA2uiV1NativeRenderPlan(
              surface,
              nativePolicy({ allowedFunctionNames: ["formatDate"] }),
              { locale: "en-US" },
            ),
          (error) => error instanceof A2uiParseError && fixture.message.test(error.message),
        );
      }),
    ),
  );

  const dynamicPattern = createSurface(
    [
      {
        id: "root",
        component: "Text",
        text: {
          call: "formatDate",
          args: { value: "2026-01-16", format: { path: "/pattern" } },
        },
      },
    ],
    { pattern: 2026 },
  );
  assert.throws(
    () =>
      createA2uiV1NativeRenderPlan(
        dynamicPattern,
        nativePolicy({ allowedFunctionNames: ["formatDate"] }),
      ),
    (error) =>
      error instanceof A2uiParseError && /Expected a string.*args\.format/.test(error.message),
  );
});

test("pluralize and boolean functions use host locale and current dispatch state", async () => {
  const surface = createSurface(
    [
      { id: "root", component: "Column", children: ["plural", "number", "submit"] },
      {
        id: "plural",
        component: "Text",
        text: {
          call: "formatString",
          args: {
            value:
              "Count: ${pluralize(value:${/count}, zero:'zero', one:'item', two:'two', few:'few', many:'many', other:'items')}",
          },
        },
      },
      {
        id: "number",
        component: "Text",
        text: {
          call: "formatNumber",
          args: {
            value: { path: "/amount" },
            decimals: 0,
            grouping: {
              call: "and",
              args: {
                values: [
                  { path: "/ready" },
                  { call: "not", args: { value: { path: "/blocked" } } },
                ],
              },
            },
          },
        },
      },
      {
        id: "submit",
        component: "Button",
        child: "submit-label",
        action: {
          event: {
            name: "submit",
            context: {
              label: {
                call: "pluralize",
                args: {
                  value: { path: "/count" },
                  zero: "zero",
                  one: "item",
                  two: "two",
                  few: "few",
                  many: "many",
                  other: "items",
                },
              },
              enabled: {
                call: "and",
                args: {
                  values: [
                    { path: "/ready" },
                    { call: "not", args: { value: { path: "/blocked" } } },
                  ],
                },
              },
              alternative: {
                call: "or",
                args: {
                  values: [
                    { path: "/blocked" },
                    { call: "not", args: { value: { path: "/alternate" } } },
                  ],
                },
              },
            },
          },
        },
      },
      { id: "submit-label", component: "Text", text: "Submit" },
    ],
    { count: 0, amount: 12345, ready: true, blocked: false, alternate: false },
  );
  const policy = nativePolicy({
    allowedEventNames: ["submit"],
    allowedFunctionNames: ["formatString", "formatNumber", "pluralize", "and", "or", "not"],
  });

  const englishPlan = createA2uiV1NativeRenderPlan(surface, policy, { locale: "en-US" });
  assert.equal(englishPlan.children?.[0]?.props.children, "Count: items");
  assert.equal(englishPlan.children?.[1]?.props.children, "12,345");
  const frenchPlan = createA2uiV1NativeRenderPlan(surface, policy, { locale: "fr-FR" });
  assert.equal(frenchPlan.children?.[0]?.props.children, "Count: item");
  const arabicPlan = createA2uiV1NativeRenderPlan(surface, policy, {
    dataModel: { ...surface.dataModel, count: 5 },
    locale: "ar",
  });
  assert.equal(arabicPlan.children?.[0]?.props.children, "Count: few");
  assert.deepEqual(
    resolveA2uiV1NativeEvent(surface, policy, "submit", surface.dataModel, {
      locale: "fr-FR",
    }).context,
    { label: "item", enabled: true, alternative: true },
  );

  const actions = [];
  const root = createRoot({ textComponentTypes: ["Text"] });
  await act(async () => {
    root.render(
      createElement(A2uiV1NativeSurface, {
        surface,
        policy,
        locale: "fr-FR",
        components: nativeComponents,
        now: () => "2026-08-26T20:15:00.000Z",
        onAction: (envelope) => actions.push(envelope),
      }),
    );
  });
  root.container.queryAll((element) => element.type === "Button")[0].props.onPress();
  assert.deepEqual(actions[0].action.context, {
    label: "item",
    enabled: true,
    alternative: true,
  });
});

test("pluralize and boolean functions fail closed for invalid bound values", () => {
  const pluralSurface = createSurface(
    [
      {
        id: "root",
        component: "Text",
        text: {
          call: "pluralize",
          args: { value: { path: "/count" }, one: "item", other: "items" },
        },
      },
    ],
    { count: "1" },
  );
  assert.throws(
    () =>
      createA2uiV1NativeRenderPlan(
        pluralSurface,
        nativePolicy({ allowedFunctionNames: ["pluralize"] }),
        { locale: "en-US" },
      ),
    (error) => error instanceof A2uiParseError && /finite number/.test(error.message),
  );

  const booleanSurface = createSurface(
    [
      {
        id: "root",
        component: "Text",
        text: {
          call: "formatNumber",
          args: {
            value: 42,
            grouping: {
              call: "and",
              args: { values: [{ path: "/ready" }, true] },
            },
          },
        },
      },
    ],
    { ready: "true" },
  );
  assert.throws(
    () =>
      createA2uiV1NativeRenderPlan(
        booleanSurface,
        nativePolicy({ allowedFunctionNames: ["formatNumber", "and"] }),
      ),
    (error) => error instanceof A2uiParseError && /Expected a boolean/.test(error.message),
  );
});

test("validation functions execute with pinned boolean semantics", () => {
  const surface = createSurface(
    [
      {
        id: "root",
        component: "Column",
        children: ["summary", "submit"],
      },
      {
        id: "summary",
        component: "Text",
        text: {
          call: "formatString",
          args: { value: "Ready: ${required(value:${/ready})}" },
        },
      },
      {
        id: "submit",
        component: "Button",
        child: "submit-label",
        action: {
          event: {
            name: "submit",
            context: {
              requiredValue: { call: "required", args: { value: { path: "/ready" } } },
              requiredEmpty: { call: "required", args: { value: "" } },
              requiredEmptyArray: { call: "required", args: { value: [] } },
              regex: {
                call: "regex",
                args: { value: { path: "/zip" }, pattern: "^[0-9]{5}$" },
              },
              length: {
                call: "length",
                args: { value: { path: "/name" }, min: 2, max: 4 },
              },
              numeric: {
                call: "numeric",
                args: { value: { path: "/amount" }, min: 5, max: 15 },
              },
              email: { call: "email", args: { value: { path: "/email" } } },
              combined: {
                call: "and",
                args: {
                  values: [
                    { call: "required", args: { value: { path: "/email" } } },
                    { call: "email", args: { value: { path: "/email" } } },
                  ],
                },
              },
            },
          },
        },
      },
      { id: "submit-label", component: "Text", text: "Submit" },
    ],
    {
      ready: "yes",
      zip: "28001",
      name: "Ada",
      amount: 10,
      email: "ada@example.com",
    },
  );
  const policy = nativePolicy({
    allowedEventNames: ["submit"],
    allowedFunctionNames: [
      "formatString",
      "required",
      "regex",
      "length",
      "numeric",
      "email",
      "and",
    ],
  });

  const plan = createA2uiV1NativeRenderPlan(surface, policy);
  assert.equal(plan.children?.[0]?.props.children, "Ready: true");
  assert.deepEqual(resolveA2uiV1NativeEvent(surface, policy, "submit", surface.dataModel).context, {
    requiredValue: true,
    requiredEmpty: false,
    requiredEmptyArray: false,
    regex: true,
    length: true,
    numeric: true,
    email: true,
    combined: true,
  });
});

test("renderer checks expose field errors and prevent invalid button dispatch", async () => {
  const surface = createSurface(
    [
      { id: "root", component: "Column", children: ["email", "submit"] },
      {
        id: "email",
        component: "TextField",
        label: "Email",
        value: { path: "/email" },
        accessibility: { description: "Account email." },
        checks: [
          {
            condition: { call: "required", args: { value: { path: "/email" } } },
            message: "Email is required.",
          },
          {
            condition: { call: "email", args: { value: { path: "/email" } } },
            message: "Enter a valid email.",
          },
        ],
      },
      {
        id: "submit",
        component: "Button",
        child: "submit-label",
        checks: [
          {
            condition: {
              call: "and",
              args: {
                values: [
                  { call: "required", args: { value: { path: "/email" } } },
                  { call: "email", args: { value: { path: "/email" } } },
                ],
              },
            },
            message: "Fix the form before submitting.",
          },
        ],
        action: { event: { name: "submit", context: { email: { path: "/email" } } } },
      },
      { id: "submit-label", component: "Text", text: "Submit" },
    ],
    { email: "" },
  );
  const policy = nativePolicy({
    allowedEventNames: ["submit"],
    allowedFunctionNames: ["required", "email", "and"],
  });

  const plan = createA2uiV1NativeRenderPlan(surface, policy);
  assert.equal(plan.children?.[0]?.props.invalid, true);
  assert.deepEqual(plan.children?.[0]?.props.validationMessages, [
    "Email is required.",
    "Enter a valid email.",
  ]);
  assert.equal(
    plan.children?.[0]?.props.accessibilityHint,
    "Account email. Email is required. Enter a valid email.",
  );
  assert.equal(plan.children?.[1]?.props.disabled, true);
  assert.throws(
    () => resolveA2uiV1NativeEvent(surface, policy, "submit", surface.dataModel),
    (error) =>
      error instanceof A2uiParseError && /disabled by failed renderer checks/.test(error.message),
  );

  const actions = [];
  const root = createRoot();
  await act(async () => {
    root.render(
      createElement(A2uiV1NativeSurface, {
        surface,
        policy,
        components: nativeComponents,
        now: () => "2026-08-27T08:00:00.000Z",
        onAction: (envelope) => actions.push(envelope),
      }),
    );
  });

  let input = root.container.queryAll((element) => element.type === "TextInput")[0];
  let button = root.container.queryAll((element) => element.type === "Button")[0];
  assert.equal(input.props.invalid, true);
  assert.deepEqual(input.props.validationMessages, ["Email is required.", "Enter a valid email."]);
  assert.equal(button.props.disabled, true);
  assert.deepEqual(button.props.accessibilityState, { disabled: true });
  button.props.onPress();
  assert.equal(actions.length, 0);

  await act(async () => input.props.onChangeText("ada@example.com"));
  input = root.container.queryAll((element) => element.type === "TextInput")[0];
  button = root.container.queryAll((element) => element.type === "Button")[0];
  assert.equal(input.props.invalid, undefined);
  assert.equal(input.props.validationMessages, undefined);
  assert.equal(input.props.accessibilityHint, "Account email.");
  assert.equal(button.props.disabled, undefined);
  assert.deepEqual(button.props.accessibilityState, { disabled: false });
  button.props.onPress();
  assert.equal(actions.length, 1);
  assert.deepEqual(actions[0].action.context, { email: "ada@example.com" });
  await act(async () => root.unmount());
});

test("failed renderer checks prevent local openUrl authorization and dispatch", async () => {
  const surface = createSurface(
    [
      {
        id: "root",
        component: "Button",
        child: "label",
        checks: [
          {
            condition: { call: "required", args: { value: { path: "/consent" } } },
            message: "Consent is required.",
          },
        ],
        action: {
          functionCall: { call: "openUrl", args: { url: "https://example.com/terms" } },
        },
      },
      { id: "label", component: "Text", text: "Terms" },
    ],
    { consent: "" },
  );
  const policy = nativePolicy({ allowedFunctionNames: ["openUrl", "required"] });
  assert.throws(
    () => resolveA2uiV1NativeOpenUrl(surface, policy, "root", surface.dataModel),
    (error) =>
      error instanceof A2uiParseError && /disabled by failed renderer checks/.test(error.message),
  );

  const policyCalls = [];
  const opened = [];
  const root = createRoot();
  await act(async () => {
    root.render(
      createElement(A2uiV1NativeSurface, {
        surface,
        policy,
        components: nativeComponents,
        onAction() {},
        openUrlPolicy: (request) => {
          policyCalls.push(request);
          return true;
        },
        onOpenUrl: (request) => opened.push(request),
      }),
    );
  });
  const button = root.container.queryAll((element) => element.type === "Button")[0];
  assert.equal(button.props.disabled, true);
  button.props.onPress();
  assert.deepEqual(policyCalls, []);
  assert.deepEqual(opened, []);
  await act(async () => root.unmount());
});

test("validation functions reject unsafe patterns, invalid bounds, and non-boolean checks", async (t) => {
  const cases = [
    {
      name: "potentially exponential regex",
      call: { call: "regex", args: { value: "aaaa", pattern: "(a+)+$" } },
      functions: ["regex"],
      message: /potentially expensive regex pattern/,
    },
    {
      name: "multiple variable regex repeats",
      call: { call: "regex", args: { value: "aaaa", pattern: "a+a+" } },
      functions: ["regex"],
      message: /potentially expensive regex pattern/,
    },
    {
      name: "invalid regex syntax",
      call: { call: "regex", args: { value: "a", pattern: "[" } },
      functions: ["regex"],
      message: /Invalid regex pattern/,
    },
    {
      name: "excessive regex pattern",
      call: { call: "regex", args: { value: "a", pattern: "a".repeat(257) } },
      functions: ["regex"],
      message: /exceeds maximum length of 256/,
    },
    {
      name: "reversed length bounds",
      call: { call: "length", args: { value: "abc", min: 4, max: 2 } },
      functions: ["length"],
      message: /min not to exceed max/,
    },
    {
      name: "reversed numeric bounds",
      call: { call: "numeric", args: { value: 3, min: 4, max: 2 } },
      functions: ["numeric"],
      message: /min not to exceed max/,
    },
  ];

  await Promise.all(
    cases.map((fixture) =>
      t.test(fixture.name, () => {
        const surface = createSurface([
          {
            id: "root",
            component: "Button",
            child: "label",
            checks: [{ condition: fixture.call }],
            action: { event: { name: "submit" } },
          },
          { id: "label", component: "Text", text: "Submit" },
        ]);
        assert.throws(
          () =>
            createA2uiV1NativeRenderPlan(
              surface,
              nativePolicy({
                allowedEventNames: ["submit"],
                allowedFunctionNames: fixture.functions,
              }),
            ),
          (error) => error instanceof A2uiParseError && fixture.message.test(error.message),
        );
      }),
    ),
  );

  const nonBoolean = createSurface(
    [
      {
        id: "root",
        component: "TextField",
        label: "Name",
        checks: [{ condition: { path: "/ready" } }],
      },
    ],
    { ready: "yes" },
  );
  assert.throws(
    () => createA2uiV1NativeRenderPlan(nonBoolean, nativePolicy()),
    (error) =>
      error instanceof A2uiParseError &&
      /Expected a boolean.*checks\[0\]\.condition/.test(error.message),
  );

  const longRegexInput = createSurface(
    [
      {
        id: "root",
        component: "TextField",
        label: "Code",
        checks: [
          {
            condition: {
              call: "regex",
              args: { value: { path: "/code" }, pattern: "^[a-z]+$" },
            },
            message: "Code is too long.",
          },
        ],
      },
    ],
    { code: "a".repeat(4_097) },
  );
  assert.equal(
    createA2uiV1NativeRenderPlan(longRegexInput, nativePolicy({ allowedFunctionNames: ["regex"] }))
      .props.invalid,
    true,
  );

  const repeatedChecks = Array.from({ length: 10 }, () => ({
    condition: { call: "required", args: { value: { path: "name" } } },
  }));
  const excessiveChecks = createSurface(
    [
      {
        id: "root",
        component: "List",
        children: { path: "/items", componentId: "item" },
      },
      {
        id: "item",
        component: "TextField",
        label: "Name",
        value: { path: "name" },
        checks: repeatedChecks,
      },
    ],
    { items: Array.from({ length: 1_001 }, () => ({ name: "Ada" })) },
  );
  assert.throws(
    () =>
      createA2uiV1NativeRenderPlan(
        excessiveChecks,
        nativePolicy({ allowedFunctionNames: ["required"] }),
      ),
    (error) =>
      error instanceof A2uiParseError && /maximum of 10000 renderer checks/.test(error.message),
  );
});

test("expanded validation output remains bounded before accessibility strings are built", () => {
  const oversizedHint = createSurface(
    [
      {
        id: "root",
        component: "TextField",
        label: "Name",
        accessibility: { description: "x".repeat(32_768) },
        checks: [
          {
            condition: { call: "required", args: { value: "" } },
            message: "y".repeat(32_768),
          },
        ],
      },
    ],
    {},
  );
  assert.throws(
    () =>
      createA2uiV1NativeRenderPlan(
        oversizedHint,
        nativePolicy({ allowedFunctionNames: ["required"] }),
      ),
    (error) =>
      error instanceof A2uiParseError &&
      /validation output.*exceeds maximum length of 65536/.test(error.message),
  );

  const amplifiedOutput = createSurface(
    [
      {
        id: "root",
        component: "List",
        children: { path: "/items", componentId: "item" },
      },
      {
        id: "item",
        component: "TextField",
        label: "Name",
        value: { path: "name" },
        checks: [
          {
            condition: { call: "required", args: { value: { path: "name" } } },
            message: "x".repeat(2_048),
          },
        ],
      },
    ],
    { items: Array.from({ length: 513 }, () => ({ name: "" })) },
  );
  assert.throws(
    () =>
      createA2uiV1NativeRenderPlan(
        amplifiedOutput,
        nativePolicy({ allowedFunctionNames: ["required"] }),
      ),
    (error) =>
      error instanceof A2uiParseError &&
      /maximum validation-output length of 1048576/.test(error.message),
  );
});

test("template instance keys remain unique for component IDs containing key delimiters", () => {
  const surface = createSurface(
    [
      { id: "root", component: "Row", children: ["a:1/item", "a"] },
      { id: "a:1/item", component: "Column", children: ["choose"] },
      {
        id: "a",
        component: "List",
        children: { path: "/items", componentId: "item" },
      },
      { id: "item", component: "Column", children: ["choose"] },
      {
        id: "choose",
        component: "Button",
        child: "choose-label",
        action: { event: { name: "choose_item" } },
      },
      { id: "choose-label", component: "Text", text: "Choose" },
    ],
    { items: [{}] },
  );
  const policy = nativePolicy({ allowedEventNames: ["choose_item"] });
  const plan = createA2uiV1NativeRenderPlan(surface, policy);
  const staticEvent = plan.children?.[0]?.children?.[0]?.props.event;
  const templateEvent = plan.children?.[1]?.children?.[0]?.children?.[0]?.props.event;

  assert.equal(staticEvent?.instanceKey, "root/a%3A1%2Fitem:0/choose:0");
  assert.equal(templateEvent?.instanceKey, "root/a:1/item:0/choose:0");
  assert.notEqual(staticEvent?.instanceKey, templateEvent?.instanceKey);
  assert.deepEqual(
    resolveA2uiV1NativeEvent(surface, policy, "choose", surface.dataModel, {
      instanceKey: staticEvent?.instanceKey,
    }),
    staticEvent,
  );
  assert.deepEqual(
    resolveA2uiV1NativeEvent(surface, policy, "choose", surface.dataModel, {
      instanceKey: templateEvent?.instanceKey,
    }),
    templateEvent,
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
      name: "validation result in string property",
      surface: createSurface([
        {
          id: "root",
          component: "Text",
          text: { call: "required", args: { value: "ready" } },
        },
      ]),
      policy: nativePolicy({ allowedFunctionNames: ["required"] }),
      message: /Expected a string.*root\.text/,
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
      name: "unsupported local button function",
      surface: createSurface([
        {
          id: "root",
          component: "Button",
          child: "label",
          action: {
            functionCall: {
              call: "formatString",
              args: { value: "hello" },
            },
          },
        },
        { id: "label", component: "Text", text: "Open" },
      ]),
      policy: nativePolicy({ allowedFunctionNames: ["formatString"] }),
      message: /does not support local function "formatString"/,
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

test("expanded formatString work and output remain bounded", () => {
  const expressionSurface = createSurface(
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
          args: { value: "${null}".repeat(20) },
        },
      },
    ],
    { items: Array.from({ length: 501 }, () => ({})) },
  );
  assert.throws(
    () =>
      createA2uiV1NativeRenderPlan(
        expressionSurface,
        nativePolicy({ allowedFunctionNames: ["formatString"] }),
      ),
    (error) =>
      error instanceof A2uiParseError &&
      /exceeds maximum of 10000 formatString expressions/.test(error.message),
  );

  let nestedExpression = "${null}";
  for (let depth = 1; depth < 64; depth += 1) {
    nestedExpression = `\${${nestedExpression}}`;
  }
  const nestedExpressionSurface = createSurface(
    [
      {
        id: "root",
        component: "List",
        children: { path: "/items", componentId: "item" },
      },
      {
        id: "item",
        component: "Text",
        text: { call: "formatString", args: { value: nestedExpression } },
      },
    ],
    { items: Array.from({ length: 157 }, () => ({})) },
  );
  assert.throws(
    () =>
      createA2uiV1NativeRenderPlan(
        nestedExpressionSurface,
        nativePolicy({ allowedFunctionNames: ["formatString"] }),
      ),
    (error) =>
      error instanceof A2uiParseError &&
      /exceeds maximum of 10000 formatString expressions/.test(error.message),
  );

  const outputSurface = createSurface(
    [
      {
        id: "root",
        component: "List",
        children: { path: "/items", componentId: "item" },
      },
      {
        id: "item",
        component: "Text",
        text: { call: "formatString", args: { value: "${value}" } },
      },
    ],
    {
      items: Array.from({ length: 513 }, () => ({ value: "x".repeat(2_048) })),
    },
  );
  assert.throws(
    () =>
      createA2uiV1NativeRenderPlan(
        outputSurface,
        nativePolicy({ allowedFunctionNames: ["formatString"] }),
      ),
    (error) =>
      error instanceof A2uiParseError &&
      /exceeds maximum formatted-string length of 1048576/.test(error.message),
  );
});
