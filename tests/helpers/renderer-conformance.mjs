import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { act, createElement, Fragment } from "react";
import { createRoot } from "test-renderer";

import {
  A2uiParseError,
  A2uiSurfaceStore,
  createA2uiV1ActionDeliveryHandler,
  createA2uiV1BasicCatalogPolicy,
  MCP_SCHEMA_REVISION,
} from "../../packages/a2ui/dist/index.js";
import {
  A2uiV1NativeSurface,
  A2uiV1NativeSurfaceBoundary,
} from "../../packages/react-native/dist/index.js";
import { resolveA2uiV1NativeEvent } from "../../packages/renderer-core/dist/index.js";

const fixtureDirectory = new URL("../fixtures/renderer-conformance/", import.meta.url);
const schema = JSON.parse(readFileSync(new URL("suite.schema.json", fixtureDirectory), "utf8"));
const validateSuite = new Ajv2020({ strict: true, allErrors: true }).compile(schema);

export function parseRendererConformanceSuite(source) {
  assert.ok(Buffer.byteLength(source, "utf8") <= 262_144, "Fixture exceeds 256 KiB");
  const suite = JSON.parse(source);
  assert.ok(validateSuite(suite), JSON.stringify(validateSuite.errors));
  assert.equal(suite.schemaRevision, MCP_SCHEMA_REVISION, "Corpus and implementation pins differ");
  assert.equal(
    new Set(suite.cases.map(({ id }) => id)).size,
    suite.cases.length,
    "Duplicate case id",
  );
  return suite;
}

export function loadRendererConformanceSuite() {
  return parseRendererConformanceSuite(
    readFileSync(new URL("basic-form.json", fixtureDirectory), "utf8"),
  );
}

function hostComponent(type) {
  return function HostComponent(props) {
    return createElement(type, props, props.children);
  };
}

const components = Object.freeze({
  View: hostComponent("View"),
  Text: hostComponent("Text"),
  TextInput: hostComponent("TextInput"),
  CheckBox: hostComponent("CheckBox"),
  Button: hostComponent("Button"),
});

function projectView(node) {
  const props = node.props;
  switch (node.type) {
    case "View":
      assert.equal(props.style?.flexDirection, "column");
      return { kind: "group", children: node.children.map(projectView) };
    case "Text":
      assert.ok(node.children.every((child) => typeof child === "string"));
      assert.equal(props.accessibilityRole, "text");
      assert.equal(props.allowFontScaling, true);
      return { kind: "text", text: node.children.join("") };
    case "TextInput":
      assert.equal(props.allowFontScaling, true);
      return {
        kind: "text-field",
        label: props.accessibilityLabel,
        value: props.value,
        invalid: props.invalid === true,
        validationMessages: props.validationMessages ?? [],
      };
    case "CheckBox":
      assert.equal(props.accessibilityRole, "checkbox");
      assert.equal(props.accessibilityState.checked, props.value);
      return {
        kind: "checkbox",
        label: props.accessibilityLabel,
        value: props.value,
        invalid: props.invalid === true,
        validationMessages: props.validationMessages ?? [],
      };
    case "Button":
      assert.equal(props.accessibilityRole, "button");
      assert.equal(props.accessibilityState.disabled, props.disabled === true);
      return {
        kind: "button",
        label: props.accessibilityLabel,
        disabled: props.disabled === true,
        validationMessages: props.validationMessages ?? [],
      };
    default:
      throw new Error(`Unmapped conformance view ${node.type}`);
  }
}

function actionRecord(envelope, dataModel) {
  return structuredClone({ envelope, ...(dataModel === undefined ? {} : { dataModel }) });
}

/** Executes only fixture inputs. Expected observations are consumed by the test, never this adapter. */
export async function runReactNativeConformanceCase(
  fixture,
  timestamp,
  { components: hostComponents = components } = {},
) {
  const store = new A2uiSurfaceStore();
  const policy = createA2uiV1BasicCatalogPolicy({
    allowedComponentNames: fixture.host.componentNames,
    allowedEventNames: fixture.host.eventNames,
    allowedFunctionNames: fixture.host.functionNames,
  });
  const renderErrors = [];
  const unexpectedErrors = [];
  const root = createRoot({
    textComponentTypes: ["Text"],
    onCaughtError: (error) => renderErrors.push(error),
    onUncaughtError: (error) => unexpectedErrors.push(error),
    onRecoverableError: (error) => unexpectedErrors.push(error),
  });
  let renderAttempt = 0;
  const localChanges = [];
  const actions = [];
  const deliveries = [];
  const deliveryResults = [];
  const pendingDeliveries = [];
  const delivery = createA2uiV1ActionDeliveryHandler({
    authorize: () => fixture.host.authorizeActions,
    deliver: (envelope, dataModel) => deliveries.push(actionRecord(envelope, dataModel)),
  });
  const surfaceProps = {
    policy,
    components: hostComponents,
    now: () => timestamp,
    onDataModelChange: (model) => localChanges.push(structuredClone(model)),
    onAction(envelope, dataModel) {
      actions.push(actionRecord(envelope, dataModel));
      pendingDeliveries.push(
        delivery(envelope, dataModel).then((result) => deliveryResults.push(result)),
      );
    },
  };

  async function renderCurrentSurface() {
    const surface = store.get(fixture.surfaceId);
    renderAttempt += 1;
    await act(async () => {
      root.render(
        surface === undefined
          ? createElement(Fragment)
          : createElement(
              A2uiV1NativeSurfaceBoundary,
              {
                // Retry a failed mount, while preserving local state in a healthy child.
                resetKey: String(renderAttempt),
                // The root observer receives the original error before boundary wrapping.
                onError: () => {},
              },
              createElement(A2uiV1NativeSurface, { ...surfaceProps, surface }),
            ),
      );
    });
    return "accepted";
  }

  async function perform(step) {
    if (step.op === "message") {
      try {
        store.apply(step.message);
      } catch (error) {
        if (!(error instanceof A2uiParseError)) throw error;
        return "message-rejected";
      }
      return renderCurrentSurface();
    }
    if (step.op === "render") return renderCurrentSurface();
    if (step.op === "resolve-event") {
      const surface = store.get(fixture.surfaceId);
      assert.ok(surface, "Resolver probe requires an existing surface");
      try {
        resolveA2uiV1NativeEvent(surface, policy, step.sourceComponentId, surface.dataModel);
      } catch (error) {
        if (!(error instanceof A2uiParseError)) throw error;
        return "event-rejected";
      }
      return "accepted";
    }
    const type = { "text-field": "TextInput", checkbox: "CheckBox", button: "Button" }[
      step.target.kind
    ];
    const matches = root.container.queryAll(
      (node) => node.type === type && node.props.accessibilityLabel === step.target.label,
    );
    assert.equal(matches.length, 1, "Interaction target must identify exactly one mounted control");
    const props = matches[0].props;
    const callback =
      step.op === "press"
        ? props.onPress
        : step.target.kind === "text-field"
          ? props.onChangeText
          : props.onValueChange;
    assert.equal(typeof callback, "function", "Interaction callback must be installed");
    // Catch only errors thrown by the production callback, not target lookup or React assertions.
    let result = "accepted";
    await act(async () => {
      try {
        if (step.op === "press") callback();
        else callback(step.value);
      } catch (error) {
        if (step.op !== "input" || !(error instanceof TypeError)) throw error;
        result = "input-rejected";
      }
    });
    await Promise.all(pendingDeliveries.splice(0));
    return result;
  }

  const observations = [];
  try {
    for (const step of fixture.steps) {
      // Steps are deliberately ordered and each observation is detached before the next mutation.
      // eslint-disable-next-line no-await-in-loop
      const result = await perform(step);
      if (unexpectedErrors.length > 0) throw unexpectedErrors[0];
      const errors = renderErrors.splice(0);
      for (const error of errors) {
        if (!(error instanceof A2uiParseError)) throw error;
      }
      // Input callbacks can also trigger a render failure after accepting a local edit.
      const outcome = errors.length > 0 ? "surface-rejected" : result;
      observations.push(
        structuredClone({
          outcome,
          serverDataModel: store.get(fixture.surfaceId)?.dataModel ?? null,
          view: root.container.children.map(projectView),
          localChanges,
          actions,
          deliveries,
          deliveryResults,
        }),
      );
    }
  } finally {
    await act(async () => root.unmount());
  }
  return observations;
}
