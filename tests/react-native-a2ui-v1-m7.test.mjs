import assert from "node:assert/strict";
import test from "node:test";

import { act, createElement } from "react";
import { createRoot } from "test-renderer";

import { A2uiSurfaceStore, createA2uiV1BasicCatalogPolicy } from "../packages/a2ui/dist/index.js";
import {
  A2UI_V1_NATIVE_COMPONENT_NAMES,
  A2UI_V1_NATIVE_MAX_CHOICE_OPTIONS,
  A2UI_V1_NATIVE_MAX_IMAGE_BYTES,
  A2UI_V1_NATIVE_MAX_IMAGE_DIMENSION,
  A2UI_V1_NATIVE_MAX_IMAGE_REDIRECT_ORIGINS,
  A2UI_V1_NATIVE_MAX_IMAGE_REDIRECTS,
  A2UI_V1_NATIVE_MAX_IMAGES,
  A2UI_V1_NATIVE_MAX_TOTAL_IMAGE_BYTES,
  A2UI_V1_NATIVE_MAX_TOTAL_IMAGE_PIXELS,
  A2uiV1NativeSurface,
  createA2uiV1NativeRenderPlan,
  createNativeCheckBoxAdapter,
  createNativeChoicePickerAdapter,
  createNativeDateTimeInputAdapter,
  createNativeDividerAdapter,
  createNativeIconAdapter,
  createNativeImageAdapter,
  createNativeModalAdapter,
  createNativeSliderAdapter,
  createNativeTabsAdapter,
  getA2uiV1NativeSupportedComponentNames,
} from "../packages/react-native/dist/index.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function hostComponent(type) {
  return function HostComponent(props) {
    return createElement(type, props, props.children);
  };
}

function tabsHost(props) {
  return createElement(
    "Tabs",
    props,
    createElement("TabContent", {}, props.tabs[props.selectedIndex]?.content),
  );
}

function modalHost(props) {
  return createElement("Modal", props, props.trigger, props.open ? props.content : null);
}

const baseComponents = {
  View: hostComponent("View"),
  Text: hostComponent("Text"),
  Button: hostComponent("Button"),
  TextInput: hostComponent("TextInput"),
};

const milestone7Components = {
  ...baseComponents,
  Image: hostComponent("Image"),
  Icon: hostComponent("Icon"),
  Divider: hostComponent("Divider"),
  CheckBox: hostComponent("CheckBox"),
  ChoicePicker: hostComponent("ChoicePicker"),
  Slider: hostComponent("Slider"),
  DateTimeInput: hostComponent("DateTimeInput"),
  Tabs: tabsHost,
  Modal: modalHost,
};

const imageGrant = Object.freeze({
  allowedRedirectOrigins: Object.freeze(["https://cdn.example.com"]),
  cacheMode: "no-store",
  maximumBytes: 5_000_000,
  maximumDecodedHeight: 4_096,
  maximumDecodedPixels: 16_777_216,
  maximumDecodedWidth: 4_096,
  maximumRedirects: 2,
});

const minimumImageGrant = Object.freeze({
  allowedRedirectOrigins: Object.freeze([]),
  cacheMode: "no-store",
  maximumBytes: 1,
  maximumDecodedHeight: 1,
  maximumDecodedPixels: 1,
  maximumDecodedWidth: 1,
  maximumRedirects: 0,
});

function createSurface(components, dataModel = {}) {
  const store = new A2uiSurfaceStore();
  store.apply({
    version: "v1.0",
    createSurface: { surfaceId: "m7", components, dataModel },
  });
  return store.get("m7");
}

function policy(options = {}) {
  return createA2uiV1BasicCatalogPolicy({
    allowedComponentNames: A2UI_V1_NATIVE_COMPONENT_NAMES,
    allowedEventNames: ["open_details"],
    ...options,
  });
}

function milestone7Surface() {
  return createSurface(
    [
      {
        id: "root",
        component: "Column",
        children: [
          "image",
          "icon",
          "divider",
          "checkbox",
          "picker",
          "slider",
          "date",
          "tabs",
          "modal",
        ],
      },
      {
        id: "image",
        component: "Image",
        url: { path: "/imageUrl" },
        description: "Product preview",
        fit: "cover",
        variant: "largeFeature",
      },
      { id: "icon", component: "Icon", name: "favorite" },
      { id: "divider", component: "Divider", axis: "vertical" },
      {
        id: "checkbox",
        component: "CheckBox",
        label: "Enabled",
        value: { path: "/enabled" },
      },
      {
        id: "picker",
        component: "ChoicePicker",
        label: "Colors",
        variant: "multipleSelection",
        displayStyle: "chips",
        filterable: true,
        options: [
          { label: "Red", value: "red" },
          { label: "Blue", value: "blue" },
        ],
        value: { path: "/colors" },
      },
      {
        id: "slider",
        component: "Slider",
        label: "Volume",
        min: 0,
        max: 10,
        steps: 5,
        value: { path: "/volume" },
      },
      {
        id: "date",
        component: "DateTimeInput",
        label: "Day",
        enableDate: true,
        min: "2026-01-01",
        max: "2026-12-31",
        value: { path: "/day" },
      },
      {
        id: "tabs",
        component: "Tabs",
        tabs: [
          { title: "First", child: "first-tab" },
          { title: "Second", child: "second-tab" },
        ],
      },
      { id: "first-tab", component: "Text", text: "First content" },
      { id: "second-tab", component: "Text", text: "Second content" },
      { id: "modal", component: "Modal", trigger: "modal-trigger", content: "modal-content" },
      {
        id: "modal-trigger",
        component: "Button",
        child: "modal-trigger-label",
        action: { event: { name: "open_details" } },
      },
      { id: "modal-trigger-label", component: "Text", text: "Details" },
      { id: "modal-content", component: "Text", text: "Modal content" },
    ],
    {
      imageUrl: "https://images.example.com/product.png",
      enabled: false,
      colors: ["red"],
      volume: 4,
      day: "2026-09-01",
    },
  );
}

function surfaceWithImages(count) {
  const imageIds = Array.from({ length: count }, (_, index) => `image-${index}`);
  return createSurface([
    { id: "root", component: "Column", children: imageIds },
    ...imageIds.map((id, index) => ({
      id,
      component: "Image",
      url: `https://images.example.com/${index}.png`,
      description: `Image ${index}`,
    })),
  ]);
}

test("installed host slots determine the exact advertisable native component subset", () => {
  assert.deepEqual(getA2uiV1NativeSupportedComponentNames(baseComponents), [
    "Button",
    "Card",
    "Column",
    "List",
    "Row",
    "Text",
    "TextField",
  ]);
  assert.deepEqual(
    getA2uiV1NativeSupportedComponentNames(milestone7Components),
    A2UI_V1_NATIVE_COMPONENT_NAMES.filter(
      (name) => name !== "AudioPlayer" && name !== "Image" && name !== "Video",
    ),
  );
  assert.deepEqual(
    getA2uiV1NativeSupportedComponentNames(milestone7Components, {
      imagePolicy: ({ url }) =>
        url.startsWith("https://images.example.com/") ? imageGrant : false,
    }),
    A2UI_V1_NATIVE_COMPONENT_NAMES.filter((name) => name !== "AudioPlayer" && name !== "Video"),
  );
});

test("the complete non-media catalog becomes a closed trusted native plan", () => {
  const requests = [];
  const plan = createA2uiV1NativeRenderPlan(milestone7Surface(), policy(), {
    imagePolicy(request) {
      assert.equal(Object.isFrozen(request), true);
      assert.throws(() => {
        request.url = "https://attacker.example/image.png";
      }, TypeError);
      requests.push(request);
      return request.url.startsWith("https://images.example.com/") ? imageGrant : false;
    },
  });
  assert.deepEqual(
    plan.children.map((child) => child.component),
    [
      "Image",
      "Icon",
      "Divider",
      "CheckBox",
      "ChoicePicker",
      "Slider",
      "DateTimeInput",
      "Tabs",
      "Modal",
    ],
  );
  assert.deepEqual(plan.children[0].props, {
    uri: "https://images.example.com/product.png",
    fit: "cover",
    variant: "largeFeature",
    description: "Product preview",
    accessibilityLabel: "Product preview",
    resourcePolicy: imageGrant,
  });
  assert.equal(plan.children[5].props.step, 2);
  assert.equal(plan.children[7].children.length, 2);
  assert.equal(plan.children[8].children[0].component, "Button");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].sourceComponentId, "image");
});

test("typed adapters map the new trusted semantics into a local design system", async () => {
  const designComponents = {
    ...baseComponents,
    Image: createNativeImageAdapter(hostComponent("DesignImage"), (props) => ({
      source: props.uri,
      fitMode: props.fit,
      byteBudget: props.resourcePolicy.maximumBytes,
      assistiveLabel: props.accessibilityLabel,
    })),
    Icon: createNativeIconAdapter(hostComponent("DesignIcon"), (props) => ({
      symbol: props.name,
      assistiveLabel: props.accessibilityLabel,
    })),
    Divider: createNativeDividerAdapter(hostComponent("DesignDivider"), (props) => ({
      orientation: props.axis,
    })),
    CheckBox: createNativeCheckBoxAdapter(hostComponent("DesignCheckBox"), (props) => ({
      checked: props.value,
      title: props.label,
      onToggle: props.onValueChange,
    })),
    ChoicePicker: createNativeChoicePickerAdapter(hostComponent("DesignChoicePicker"), (props) => ({
      items: props.options,
      selected: props.value,
      mode: props.variant,
      onSelect: props.onValueChange,
    })),
    Slider: createNativeSliderAdapter(hostComponent("DesignSlider"), (props) => ({
      current: props.value,
      lower: props.minimumValue,
      upper: props.maximumValue,
      increment: props.step,
      onSlide: props.onValueChange,
    })),
    DateTimeInput: createNativeDateTimeInputAdapter(
      hostComponent("DesignDateTimeInput"),
      (props) => ({
        isoValue: props.value,
        date: props.enableDate,
        time: props.enableTime,
        onPick: props.onValueChange,
      }),
    ),
    Tabs: createNativeTabsAdapter(hostComponent("DesignTabs"), (props) => ({
      items: props.tabs,
      active: props.selectedIndex,
      onActivate: props.onSelect,
    })),
    Modal: createNativeModalAdapter(hostComponent("DesignModal"), (props) => ({
      visible: props.open,
      opener: props.trigger,
      body: props.content,
      onDismiss: props.onRequestClose,
    })),
  };
  const root = createRoot();
  await act(async () => {
    root.render(
      createElement(A2uiV1NativeSurface, {
        surface: milestone7Surface(),
        policy: policy(),
        components: designComponents,
        imagePolicy: () => imageGrant,
        onAction() {},
      }),
    );
  });
  const find = (type) => root.container.queryAll((element) => element.type === type)[0];
  assert.equal(find("DesignImage").props.source, "https://images.example.com/product.png");
  assert.equal(find("DesignImage").props.byteBudget, imageGrant.maximumBytes);
  assert.equal(find("DesignIcon").props.symbol, "favorite");
  assert.equal(find("DesignDivider").props.orientation, "vertical");
  assert.equal(find("DesignCheckBox").props.checked, false);
  assert.equal(find("DesignChoicePicker").props.mode, "multipleSelection");
  assert.equal(find("DesignSlider").props.increment, 2);
  assert.equal(find("DesignDateTimeInput").props.date, true);
  assert.equal(find("DesignTabs").props.active, 0);
  assert.equal(find("DesignModal").props.visible, false);
});

test("mounted controls update typed local bindings and tabs and modal keep host-local state", async () => {
  const changes = [];
  const actions = [];
  const root = createRoot();
  await act(() =>
    root.render(
      createElement(A2uiV1NativeSurface, {
        surface: milestone7Surface(),
        policy: policy(),
        components: milestone7Components,
        imagePolicy: () => imageGrant,
        onAction: (envelope) => actions.push(envelope),
        onDataModelChange: (model) => changes.push(model),
      }),
    ),
  );

  const find = (type) => root.container.queryAll((element) => element.type === type)[0];
  await act(() => find("CheckBox").props.onValueChange(true));
  await act(() => find("ChoicePicker").props.onValueChange(["blue"]));
  await act(() => find("Slider").props.onValueChange(8));
  await act(() => find("DateTimeInput").props.onValueChange("2026-10-02"));
  assert.equal(changes.at(-1).enabled, true);
  assert.deepEqual(changes.at(-1).colors, ["blue"]);
  assert.equal(changes.at(-1).volume, 8);
  assert.equal(changes.at(-1).day, "2026-10-02");

  const tabs = find("Tabs");
  assert.equal(tabs.props.selectedIndex, 0);
  await act(() => tabs.props.onSelect(1));
  assert.equal(find("Tabs").props.selectedIndex, 1);

  assert.equal(find("Modal").props.open, false);
  await act(() => find("Button").props.onPress());
  assert.equal(find("Modal").props.open, true);
  assert.equal(actions.length, 1);
  await act(() => find("Modal").props.onRequestClose());
  assert.equal(find("Modal").props.open, false);
});

test("mounted semantic callbacks reject malformed host values before changing local state", async () => {
  const changes = [];
  const root = createRoot();
  await act(() =>
    root.render(
      createElement(A2uiV1NativeSurface, {
        surface: milestone7Surface(),
        policy: policy(),
        components: milestone7Components,
        imagePolicy: () => imageGrant,
        onAction() {},
        onDataModelChange: (model) => changes.push(model),
      }),
    ),
  );
  const find = (type) => root.container.queryAll((element) => element.type === type)[0];
  assert.throws(() => find("CheckBox").props.onValueChange("yes"), /boolean checkbox/);
  for (const value of ["blue", ["blue", "blue"], ["unknown"]]) {
    assert.throws(() => find("ChoicePicker").props.onValueChange(value), /choice value/);
  }
  for (const value of [Number.NaN, -1, 11, 3]) {
    assert.throws(() => find("Slider").props.onValueChange(value), /finite slider value/);
  }
  assert.throws(() => find("DateTimeInput").props.onValueChange(20260901), /string date\/time/);
  for (const value of ["2026-02-30", "2025-12-31", "2027-01-01"]) {
    assert.throws(
      () => find("DateTimeInput").props.onValueChange(value),
      /calendar date|earlier than minimum|later than maximum/,
    );
  }
  for (const value of [-1, 0.5, 2]) {
    assert.throws(() => find("Tabs").props.onSelect(value), /in-range tab index/);
  }
  assert.deepEqual(changes, []);
});

test("event and openUrl presses do not reauthorize unrelated images", async () => {
  let eventImagePolicyCalls = 0;
  const eventRoot = createRoot();
  await act(() =>
    eventRoot.render(
      createElement(A2uiV1NativeSurface, {
        surface: milestone7Surface(),
        policy: policy(),
        components: milestone7Components,
        imagePolicy() {
          eventImagePolicyCalls += 1;
          return imageGrant;
        },
        onAction() {},
      }),
    ),
  );
  assert.equal(eventImagePolicyCalls, 1);
  await act(() =>
    eventRoot.container.queryAll((element) => element.type === "Button")[0].props.onPress(),
  );
  assert.equal(eventImagePolicyCalls, 1);

  const openUrlSurface = createSurface(
    [
      { id: "root", component: "Column", children: ["image", "open"] },
      {
        id: "image",
        component: "Image",
        url: "https://images.example.com/product.png",
        description: "Product",
      },
      {
        id: "open",
        component: "Button",
        child: "open-label",
        action: {
          functionCall: { call: "openUrl", args: { url: "https://example.com/details" } },
        },
      },
      { id: "open-label", component: "Text", text: "Open" },
    ],
    {},
  );
  let openUrlImagePolicyCalls = 0;
  const opened = [];
  const openUrlRoot = createRoot();
  await act(() =>
    openUrlRoot.render(
      createElement(A2uiV1NativeSurface, {
        surface: openUrlSurface,
        policy: policy({ allowedFunctionNames: ["openUrl"] }),
        components: milestone7Components,
        imagePolicy() {
          openUrlImagePolicyCalls += 1;
          return imageGrant;
        },
        onAction() {},
        openUrlPolicy: () => true,
        onOpenUrl: (request) => opened.push(request),
      }),
    ),
  );
  assert.equal(openUrlImagePolicyCalls, 1);
  openUrlRoot.container.queryAll((element) => element.type === "Button")[0].props.onPress();
  assert.equal(openUrlImagePolicyCalls, 1);
  assert.equal(opened.length, 1);
});

test("image loading is canonical, bounded, and denied without an affirmative host policy", () => {
  const surface = milestone7Surface();
  assert.throws(
    () => createA2uiV1NativeRenderPlan(surface, policy()),
    /requires an explicit host image policy/,
  );
  assert.throws(
    () => createA2uiV1NativeRenderPlan(surface, policy(), { imagePolicy: () => false }),
    /denied by host policy/,
  );
  assert.throws(
    () => createA2uiV1NativeRenderPlan(surface, policy(), { imagePolicy: () => true }),
    /Expected an object.*imagePolicy/,
  );
  assert.throws(
    () =>
      createA2uiV1NativeRenderPlan(surface, policy(), {
        imagePolicy() {
          throw new Error("policy unavailable");
        },
      }),
    /host policy failed/,
  );
  assert.throws(
    () =>
      createA2uiV1NativeRenderPlan(surface, policy(), {
        imagePolicy: () => ({
          ...imageGrant,
          allowedRedirectOrigins: ["https://cdn.example.com/path"],
        }),
      }),
    /exact HTTP\(S\) origin/,
  );
  assert.throws(
    () =>
      createA2uiV1NativeRenderPlan(surface, policy(), {
        imagePolicy: () => ({
          ...imageGrant,
          maximumDecodedPixels: imageGrant.maximumDecodedPixels + 1,
        }),
      }),
    /maximumDecodedPixels not to exceed the declared dimensions/,
  );
  const invalidGrants = [
    [{ ...imageGrant, unexpected: true }, /Unexpected field/],
    [{ ...imageGrant, allowedRedirectOrigins: "https://cdn.example.com" }, /redirect origins/],
    [
      {
        ...imageGrant,
        allowedRedirectOrigins: ["https://cdn.example.com", "https://cdn.example.com"],
      },
      /unique redirect origins/,
    ],
    [{ ...imageGrant, cacheMode: "forever" }, /closed cache mode/],
    [{ ...imageGrant, maximumBytes: 0 }, /maximumBytes/],
    [{ ...imageGrant, maximumBytes: A2UI_V1_NATIVE_MAX_IMAGE_BYTES + 1 }, /maximumBytes/],
    [
      { ...imageGrant, maximumDecodedWidth: A2UI_V1_NATIVE_MAX_IMAGE_DIMENSION + 1 },
      /maximumDecodedWidth/,
    ],
    [{ ...imageGrant, maximumRedirects: -1 }, /maximumRedirects/],
    [
      { ...imageGrant, maximumRedirects: A2UI_V1_NATIVE_MAX_IMAGE_REDIRECTS + 1 },
      /maximumRedirects/,
    ],
    [
      {
        ...imageGrant,
        allowedRedirectOrigins: Array.from(
          { length: A2UI_V1_NATIVE_MAX_IMAGE_REDIRECT_ORIGINS + 1 },
          (_, index) => `https://cdn-${index}.example.com`,
        ),
      },
      /redirect origins/,
    ],
  ];
  for (const [grant, error] of invalidGrants) {
    assert.throws(
      () =>
        createA2uiV1NativeRenderPlan(surface, policy(), {
          imagePolicy: () => grant,
        }),
      error,
    );
  }
  const unsafe = milestone7Surface();
  unsafe.dataModel.imageUrl = "file:///private/data.png";
  assert.throws(
    () => createA2uiV1NativeRenderPlan(unsafe, policy(), { imagePolicy: () => imageGrant }),
    /Expected an HTTP\(S\) URL/,
  );
});

test("expanded image resources are cumulatively bounded before host loading", () => {
  let imagePolicyCalls = 0;
  assert.throws(
    () =>
      createA2uiV1NativeRenderPlan(surfaceWithImages(A2UI_V1_NATIVE_MAX_IMAGES + 1), policy(), {
        imagePolicy() {
          imagePolicyCalls += 1;
          return minimumImageGrant;
        },
      }),
    /exceeds maximum.*images/,
  );
  assert.equal(imagePolicyCalls, A2UI_V1_NATIVE_MAX_IMAGES);

  const excessiveBytes = Math.floor(A2UI_V1_NATIVE_MAX_TOTAL_IMAGE_BYTES / 2) + 1;
  assert.throws(
    () =>
      createA2uiV1NativeRenderPlan(surfaceWithImages(2), policy(), {
        imagePolicy: () => ({ ...minimumImageGrant, maximumBytes: excessiveBytes }),
      }),
    /maximum total image transfer budget/,
  );

  const excessivePixels = Math.floor(A2UI_V1_NATIVE_MAX_TOTAL_IMAGE_PIXELS / 2) + 1;
  assert.throws(
    () =>
      createA2uiV1NativeRenderPlan(surfaceWithImages(2), policy(), {
        imagePolicy: () => ({
          ...minimumImageGrant,
          maximumDecodedHeight: A2UI_V1_NATIVE_MAX_IMAGE_DIMENSION,
          maximumDecodedPixels: excessivePixels,
          maximumDecodedWidth: A2UI_V1_NATIVE_MAX_IMAGE_DIMENSION,
        }),
      }),
    /maximum total decoded image budget/,
  );
});

test("new semantic components reject ambiguous or unsafe values", async (t) => {
  const fixtures = [
    {
      name: "SVG icon payload",
      components: [{ id: "root", component: "Icon", name: { svgPath: "M0 0" } }],
      error: /semantic icon name.*svgPath/,
    },
    {
      name: "duplicate choices",
      components: [
        {
          id: "root",
          component: "ChoicePicker",
          options: [
            { label: "A", value: "same" },
            { label: "B", value: "same" },
          ],
          value: [],
        },
      ],
      error: /duplicate option value/,
    },
    {
      name: "unknown selected choice",
      components: [
        {
          id: "root",
          component: "ChoicePicker",
          options: [{ label: "A", value: "a" }],
          value: ["missing"],
        },
      ],
      error: /selects unknown value/,
    },
    {
      name: "duplicate selected choices",
      components: [
        {
          id: "root",
          component: "ChoicePicker",
          options: [{ label: "A", value: "a" }],
          value: ["a", "a"],
        },
      ],
      error: /duplicate selected values/,
    },
    {
      name: "multiple values in mutually exclusive choice",
      components: [
        {
          id: "root",
          component: "ChoicePicker",
          options: [
            { label: "A", value: "a" },
            { label: "B", value: "b" },
          ],
          value: ["a", "b"],
        },
      ],
      error: /at most one selected value/,
    },
    {
      name: "unlabelled choice",
      components: [{ id: "root", component: "ChoicePicker", options: [], value: [] }],
      error: /requires label or accessibility.label/,
    },
    {
      name: "invalid slider range",
      components: [{ id: "root", component: "Slider", min: 5, max: 5, value: 5 }],
      error: /min to be less than max/,
    },
    {
      name: "slider outside range",
      components: [{ id: "root", component: "Slider", label: "Value", max: 5, value: 6 }],
      error: /value to be within min and max/,
    },
    {
      name: "invalid slider steps",
      components: [{ id: "root", component: "Slider", label: "Value", max: 5, steps: 0, value: 1 }],
      error: /schema validation failed|steps/,
    },
    {
      name: "misaligned slider step",
      components: [
        { id: "root", component: "Slider", label: "Value", max: 10, steps: 4, value: 3 },
      ],
      error: /does not align with its steps/,
    },
    {
      name: "unlabelled slider",
      components: [{ id: "root", component: "Slider", max: 5, value: 1 }],
      error: /requires label or accessibility.label/,
    },
    {
      name: "disabled date and time",
      components: [{ id: "root", component: "DateTimeInput", value: "" }],
      error: /must enable date, time, or both/,
    },
    {
      name: "invalid calendar day",
      components: [
        {
          id: "root",
          component: "DateTimeInput",
          enableDate: true,
          value: "2026-02-30",
        },
      ],
      error: /Invalid calendar date/,
    },
    {
      name: "invalid date-time",
      components: [
        {
          id: "root",
          component: "DateTimeInput",
          label: "Moment",
          enableDate: true,
          enableTime: true,
          value: "2026-09-01",
        },
      ],
      error: /RFC 3339 date-time/,
    },
    {
      name: "invalid time",
      components: [
        {
          id: "root",
          component: "DateTimeInput",
          label: "Time",
          enableTime: true,
          value: "25:00:00Z",
        },
      ],
      error: /Invalid ISO 8601 time/,
    },
    {
      name: "reversed date bounds",
      components: [
        {
          id: "root",
          component: "DateTimeInput",
          label: "Day",
          enableDate: true,
          min: "2026-09-02",
          max: "2026-09-01",
          value: "",
        },
      ],
      error: /min not to exceed max/,
    },
    {
      name: "date before minimum",
      components: [
        {
          id: "root",
          component: "DateTimeInput",
          label: "Day",
          enableDate: true,
          min: "2026-09-02",
          value: "2026-09-01",
        },
      ],
      error: /not to be earlier than min/,
    },
    {
      name: "date after maximum",
      components: [
        {
          id: "root",
          component: "DateTimeInput",
          label: "Day",
          enableDate: true,
          max: "2026-09-01",
          value: "2026-09-02",
        },
      ],
      error: /not to be later than max/,
    },
    {
      name: "unlabelled date input",
      components: [
        { id: "root", component: "DateTimeInput", enableDate: true, value: "2026-09-01" },
      ],
      error: /requires label or accessibility.label/,
    },
    {
      name: "non-button modal trigger",
      components: [
        { id: "root", component: "Modal", trigger: "trigger", content: "content" },
        { id: "trigger", component: "Text", text: "Open" },
        { id: "content", component: "Text", text: "Content" },
      ],
      error: /requires a Button trigger/,
    },
  ];
  await Promise.all(
    fixtures.map((fixture) =>
      t.test(fixture.name, () => {
        assert.throws(
          () => createA2uiV1NativeRenderPlan(createSurface(fixture.components), policy()),
          fixture.error,
        );
      }),
    ),
  );
});

test("choice option expansion is cumulatively bounded", () => {
  const options = Array.from({ length: A2UI_V1_NATIVE_MAX_CHOICE_OPTIONS + 1 }, (_, index) => ({
    label: `Option ${index}`,
    value: `value-${index}`,
  }));
  const surface = createSurface([{ id: "root", component: "ChoicePicker", options, value: [] }]);
  assert.throws(
    () => createA2uiV1NativeRenderPlan(surface, policy()),
    /exceeds maximum.*choice options/,
  );
});

test("date-time inputs accept the supported date, time, and timestamp shapes", () => {
  const fixtures = [
    { enableDate: true, value: "2026-09-01" },
    { enableTime: true, value: "12:30:45.123Z" },
    { enableDate: true, enableTime: true, value: "2026-09-01T12:30:45+02:00" },
    { enableDate: true, min: "2026-01-01", max: "2026-12-31", value: "" },
  ];
  for (const fixture of fixtures) {
    const plan = createA2uiV1NativeRenderPlan(
      createSurface([{ id: "root", component: "DateTimeInput", label: "When", ...fixture }]),
      policy(),
    );
    assert.equal(plan.component, "DateTimeInput");
    assert.equal(plan.props.value, fixture.value);
  }
});

test("mounting fails closed when a used semantic component is absent from the host catalog", async () => {
  const surface = createSurface([
    { id: "root", component: "CheckBox", label: "Enabled", value: false },
  ]);
  const root = createRoot();
  await assert.rejects(async () => {
    await act(async () => {
      root.render(
        createElement(A2uiV1NativeSurface, {
          surface,
          policy: policy(),
          components: baseComponents,
          onAction() {},
        }),
      );
    });
  }, /Missing host component "CheckBox"/);
});
