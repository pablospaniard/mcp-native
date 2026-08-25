import assert from "node:assert/strict";
import test from "node:test";

import { A2UI_VERSION, A2uiParseError, parseA2uiSurface } from "../packages/a2ui/dist/index.js";
import { createNativeRenderPlan } from "../packages/react-native/dist/index.js";

test("a validated A2UI surface becomes a native render plan for every node type", () => {
  const surface = parseA2uiSurface({
    version: A2UI_VERSION,
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
          id: "display-name",
          type: "text-input",
          label: "Display name",
          value: "Ada",
          binding: "/profile/displayName",
        },
        { id: "email", type: "text-input", label: "Email" },
      ],
    },
  });

  const plan = createNativeRenderPlan(surface);
  assert.equal(plan.component, "View");
  assert.deepEqual(
    plan.children?.map((child) => child.component),
    ["Text", "Button", "TextInput", "TextInput"],
  );
  assert.deepEqual(plan.children?.[0]?.props, { children: "Profile" });
  assert.equal(plan.children?.[1]?.props.action.name, "save_profile");
  assert.deepEqual(plan.children?.[2]?.props, {
    label: "Display name",
    value: "Ada",
    binding: "/profile/displayName",
  });
  assert.deepEqual(plan.children?.[3]?.props, { label: "Email" });
});

test("a JSON string preserves nested tool arguments", () => {
  const surface = parseA2uiSurface(
    JSON.stringify({
      version: "0.1",
      root: {
        id: "save",
        type: "button",
        label: "Save",
        action: {
          type: "tool",
          name: "save_profile",
          arguments: {
            active: true,
            aliases: ["Ada", null, 42],
            profile: { role: "admin" },
          },
        },
      },
    }),
  );

  assert.deepEqual(surface.root, {
    id: "save",
    type: "button",
    label: "Save",
    action: {
      type: "tool",
      name: "save_profile",
      arguments: {
        active: true,
        aliases: ["Ada", null, 42],
        profile: { role: "admin" },
      },
    },
  });
});

test("a tool action may omit arguments", () => {
  const surface = parseA2uiSurface({
    version: "0.1",
    root: {
      id: "refresh",
      type: "button",
      label: "Refresh",
      action: { type: "tool", name: "refresh" },
    },
  });

  assert.deepEqual(surface.root, {
    id: "refresh",
    type: "button",
    label: "Refresh",
    action: { type: "tool", name: "refresh" },
  });
});

test("invalid A2UI input fails closed with a parse error", () => {
  const invalidInputs = [
    "{not-json",
    null,
    { version: "1.0", root: { id: "x", type: "text", text: "x" } },
    { version: "0.1", root: { id: 1, type: "text", text: "x" } },
    { version: "0.1", root: { id: "x", type: "container", children: {} } },
    { version: "0.1", root: { id: "x", type: "text", text: 1 } },
    {
      version: "0.1",
      root: {
        id: "x",
        type: "button",
        label: "Run",
        action: { type: "navigation", name: "next" },
      },
    },
    {
      version: "0.1",
      root: {
        id: "x",
        type: "button",
        label: "Run",
        action: { type: "tool", name: "run", arguments: [] },
      },
    },
    { version: "0.1", root: { id: "x", type: "text-input", label: "X", value: 1 } },
    { version: "0.1", root: { id: "x", type: "script" } },
  ];

  for (const input of invalidInputs) {
    assert.throws(() => parseA2uiSurface(input), A2uiParseError);
  }
});
