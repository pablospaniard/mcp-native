import assert from "node:assert/strict";
import test from "node:test";

import {
  addTodo,
  applyTodoAction,
  createInitialTodoState,
  getTodoCounts,
  getVisibleTodos,
  MAX_TODO_TITLE_LENGTH,
  parsePersistedTodoState,
  reconcileRendererModel,
  startTodoReset,
  toPersistedTodoState,
} from "./domain";

test("the todo domain supports add, edit, toggle, filter, delete, and clear", () => {
  let state = createInitialTodoState();
  state = addTodo(state, "  Ship the proof  ", () => "todo-new");
  assert.equal(state.todos.at(-1)?.title, "Ship the proof");
  assert.equal(state.draft, "");

  state = reconcileRendererModel(state, {
    draft: "Next task",
    filter: ["active"],
    todos: state.todos.map((todo) =>
      todo.id === "todo-new" ? { ...todo, completed: true, title: "Ship proof" } : { ...todo },
    ),
  });
  assert.equal(state.filter, "active");
  assert.equal(state.todos.at(-1)?.completed, true);
  assert.equal(state.todos.at(-1)?.title, "Ship proof");
  assert.ok(getVisibleTodos(state).every((todo) => !todo.completed));

  state = applyTodoAction(state, "delete_todo", { id: "welcome-2" }, undefined, () => "unused");
  assert.equal(
    state.todos.some((todo) => todo.id === "welcome-2"),
    false,
  );
  state = applyTodoAction(state, "clear_completed", {}, undefined, () => "unused");
  assert.equal(getTodoCounts(state.todos).completed, 0);
});

test("add actions resolve the renderer-local draft at dispatch time", () => {
  const initial = createInitialTodoState();
  const state = applyTodoAction(
    initial,
    "add_todo",
    {},
    { draft: "Renderer-local task", filter: ["all"], todos: [] },
    () => "todo-local",
  );
  assert.equal(state.todos.at(-1)?.title, "Renderer-local task");
  assert.equal(state.todos.at(-1)?.id, "todo-local");
});

test("invalid and excessive renderer input cannot mutate host state", () => {
  const initial = createInitialTodoState();
  assert.equal(
    addTodo(initial, "", () => "empty"),
    initial,
  );
  assert.equal(
    addTodo(initial, "x".repeat(MAX_TODO_TITLE_LENGTH + 1), () => "long"),
    initial,
  );
  assert.equal(
    addTodo(initial, "Valid", () => "welcome-1"),
    initial,
  );
  assert.equal(
    reconcileRendererModel(initial, {
      draft: "ok",
      filter: ["all"],
      todos: [{ id: "server-forged", title: "Injected", completed: false }],
    }),
    initial,
  );
});

test("persisted state round-trips and malformed storage falls back safely", () => {
  const initial = createInitialTodoState();
  assert.deepEqual(parsePersistedTodoState(toPersistedTodoState(initial)), initial);
  assert.equal(parsePersistedTodoState({ filter: "all", todos: "not-an-array" }), undefined);
  assert.equal(
    parsePersistedTodoState({
      filter: "all",
      todos: [{ id: "__proto__", title: "Unsafe identifier", completed: false }],
    }),
    undefined,
  );
});

test("reset restores in-memory state even when persisted cleanup fails", async () => {
  const failedReset = startTodoReset(() => Promise.reject(new Error("storage unavailable")));
  assert.deepEqual(failedReset.state, createInitialTodoState());
  assert.equal(await failedReset.persistenceCleared, false);

  const successfulReset = startTodoReset(() => Promise.resolve());
  assert.deepEqual(successfulReset.state, createInitialTodoState());
  assert.equal(await successfulReset.persistenceCleared, true);
});
