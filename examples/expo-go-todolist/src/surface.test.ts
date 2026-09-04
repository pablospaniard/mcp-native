import assert from "node:assert/strict";
import test from "node:test";

import { createActionEnvelope } from "@mcp-native/a2ui";
import { createRenderPlan } from "@mcp-native/react-native";

import { createInitialTodoState, MAX_TODOS } from "./domain";
import {
  createTodoSurfaceEnvelope,
  createTodoActionMetadata,
  createValidatedTodoSurface,
  TODO_SURFACE_ID,
  todoSurfacePolicy,
} from "./surface";

test("the example creates a validated A2UI v1 lifecycle surface", () => {
  const envelope = createTodoSurfaceEnvelope(createInitialTodoState());
  assert.equal(envelope.version, "v1.0");
  assert.equal(envelope.createSurface.surfaceId, TODO_SURFACE_ID);
  assert.equal(envelope.createSurface.sendDataModel, true);

  const surface = createValidatedTodoSurface(createInitialTodoState());
  assert.equal(surface.surfaceId, TODO_SURFACE_ID);
  assert.equal(surface.components.get("todo-list")?.component, "List");
  assert.equal(surface.components.get("todo-check")?.component, "CheckBox");
  assert.equal(surface.components.get("add")?.component, "Button");
  assert.equal(surface.components.get("composer")?.align, "end");
});

test("the example action metadata fits the official renderer envelope", () => {
  const envelope = createActionEnvelope({
    context: {},
    metadata: createTodoActionMetadata("ios"),
    name: "add_todo",
    sourceComponentId: "add",
    surfaceId: TODO_SURFACE_ID,
    timestamp: "2026-09-02T00:00:00.000Z",
  });
  assert.deepEqual(envelope.action.metadata, {
    extensions: { example: "expo-go-todolist", host: "ios" },
  });
});

test("the full todo surface expands into a bounded trusted native plan", () => {
  const surface = createValidatedTodoSurface(createInitialTodoState());
  const plan = createRenderPlan(surface, todoSurfacePolicy);
  assert.equal(plan.component, "View");
  assert.equal(plan.key, "root");
  assert.ok(JSON.stringify(plan).includes("delete_todo"));
});

test("the example rejects state beyond its application-level list bound", () => {
  const initial = createInitialTodoState();
  const todos = Array.from({ length: MAX_TODOS + 1 }, (_, index) => ({
    id: `todo-${index}`,
    title: `Todo ${index}`,
    completed: false,
  }));
  assert.throws(() => createTodoSurfaceEnvelope({ ...initial, todos }), /limited to 200 tasks/);
});
