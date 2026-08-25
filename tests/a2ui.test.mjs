import assert from "node:assert/strict";
import test from "node:test";

import { A2uiParseError, parseA2uiSurface } from "../packages/a2ui/dist/index.js";
import { createNativeRenderPlan } from "../packages/react-native/dist/index.js";

test("a validated A2UI surface becomes a native render plan", () => {
  const surface = parseA2uiSurface({
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
      ],
    },
  });

  const plan = createNativeRenderPlan(surface);
  assert.equal(plan.component, "View");
  assert.deepEqual(
    plan.children?.map((child) => child.component),
    ["Text", "Button"],
  );
  assert.equal(plan.children?.[1]?.props.action.name, "save_profile");
});

test("unknown A2UI nodes fail closed", () => {
  assert.throws(
    () => parseA2uiSurface({ version: "0.1", root: { id: "x", type: "script" } }),
    A2uiParseError,
  );
});
