import {
  A2uiSurfaceStore,
  createA2uiV1BasicCatalogPolicy,
  type A2uiV1Component,
  type A2uiV1CreateSurfaceEnvelope,
  type A2uiV1SurfaceState,
} from "@mcp-native/a2ui";
import type { JsonObject } from "@mcp-native/core";

import {
  getTodoCounts,
  getVisibleTodos,
  MAX_TODOS,
  MAX_TODO_TITLE_LENGTH,
  type TodoState,
} from "./domain";

export const TODO_SURFACE_ID = "expo-go-todos";

export function createTodoActionMetadata(host: string): JsonObject {
  return { extensions: { example: "expo-go-todolist", host } };
}

export const todoSurfacePolicy = createA2uiV1BasicCatalogPolicy({
  allowedComponentNames: [
    "Button",
    "Card",
    "CheckBox",
    "ChoicePicker",
    "Column",
    "Divider",
    "List",
    "Row",
    "Text",
    "TextField",
  ],
  allowedEventNames: ["add_todo", "clear_completed", "delete_todo"],
  allowedFunctionNames: ["length", "required"],
});

export function createTodoSurfaceEnvelope(state: TodoState): A2uiV1CreateSurfaceEnvelope {
  if (state.todos.length > MAX_TODOS)
    throw new Error(`Todo surfaces are limited to ${MAX_TODOS} tasks`);
  const counts = getTodoCounts(state.todos);
  const visibleTodos = getVisibleTodos(state);
  const contentChildren = [
    "intro",
    "composer",
    "filter",
    "summary",
    "divider",
    visibleTodos.length === 0 ? "empty" : "todo-list",
    ...(counts.completed > 0 ? ["clear-completed"] : []),
  ];
  const components: A2uiV1Component[] = [
    { id: "root", component: "Card", child: "content" },
    { id: "content", component: "Column", children: contentChildren },
    {
      id: "intro",
      component: "Text",
      text: "This surface is described by validated A2UI v1 data and mounted with local React Native components.",
      variant: "body",
    },
    { id: "composer", component: "Row", align: "end", children: ["draft", "add"] },
    {
      id: "draft",
      component: "TextField",
      label: "New task",
      placeholder: "What needs to be done?",
      value: { path: "/draft" },
      variant: "shortText",
      weight: 1,
      checks: [
        {
          condition: { call: "length", args: { value: { path: "/draft" }, max: 120 } },
          message: `Keep tasks under ${MAX_TODO_TITLE_LENGTH} characters.`,
        },
      ],
    },
    {
      id: "add",
      component: "Button",
      child: "add-label",
      variant: "primary",
      checks: [
        {
          condition: { call: "required", args: { value: { path: "/draft" } } },
          message: "Enter a task before adding it.",
        },
        {
          condition: { call: "length", args: { value: { path: "/draft" }, max: 120 } },
          message: `Keep tasks under ${MAX_TODO_TITLE_LENGTH} characters.`,
        },
      ],
      action: { event: { name: "add_todo" } },
      accessibility: { description: "Adds the task from the new task field" },
    },
    { id: "add-label", component: "Text", text: "Add" },
    {
      id: "filter",
      component: "ChoicePicker",
      label: "Show tasks",
      variant: "mutuallyExclusive",
      displayStyle: "chips",
      options: [
        { label: "All", value: "all" },
        { label: "Active", value: "active" },
        { label: "Completed", value: "completed" },
      ],
      value: { path: "/filter" },
    },
    {
      id: "summary",
      component: "Text",
      text: `${counts.active} active · ${counts.completed} completed · ${counts.total} total`,
      variant: "caption",
      accessibility: { live: "polite" },
    },
    { id: "divider", component: "Divider", axis: "horizontal" },
    {
      id: "todo-list",
      component: "List",
      children: { path: "/todos", componentId: "todo-item" },
      accessibility: { label: "Todo list" },
    },
    { id: "todo-item", component: "Card", child: "todo-content" },
    {
      id: "todo-content",
      component: "Column",
      children: ["todo-check", "todo-title", "todo-actions"],
    },
    {
      id: "todo-check",
      component: "CheckBox",
      label: { path: "title" },
      value: { path: "completed" },
      accessibility: { description: "Marks this task complete or active" },
    },
    {
      id: "todo-title",
      component: "TextField",
      label: "Task title",
      value: { path: "title" },
      variant: "shortText",
      checks: [
        {
          condition: { call: "required", args: { value: { path: "title" } } },
          message: "Task titles cannot be empty.",
        },
        {
          condition: { call: "length", args: { value: { path: "title" }, max: 120 } },
          message: `Keep tasks under ${MAX_TODO_TITLE_LENGTH} characters.`,
        },
      ],
    },
    { id: "todo-actions", component: "Row", children: ["delete"] },
    {
      id: "delete",
      component: "Button",
      child: "delete-label",
      variant: "borderless",
      action: { event: { name: "delete_todo", context: { id: { path: "id" } } } },
      accessibility: { description: "Deletes this task" },
    },
    { id: "delete-label", component: "Text", text: "Delete" },
    {
      id: "empty",
      component: "Text",
      text:
        state.filter === "all"
          ? "Your list is empty. Add a task to get started."
          : `No ${state.filter} tasks. Try another filter.`,
      variant: "body",
      accessibility: { live: "polite" },
    },
    {
      id: "clear-completed",
      component: "Button",
      child: "clear-completed-label",
      variant: "borderless",
      action: { event: { name: "clear_completed" } },
    },
    { id: "clear-completed-label", component: "Text", text: "Clear completed" },
  ];

  return {
    version: "v1.0",
    createSurface: {
      surfaceId: TODO_SURFACE_ID,
      sendDataModel: true,
      components,
      dataModel: {
        draft: state.draft,
        filter: [state.filter],
        todos: visibleTodos.map((todo) => ({ ...todo })),
      },
    },
  };
}

export function createValidatedTodoSurface(state: TodoState): A2uiV1SurfaceState {
  const store = new A2uiSurfaceStore();
  store.apply(createTodoSurfaceEnvelope(state));
  const surface = store.getValidated(TODO_SURFACE_ID, todoSurfacePolicy);
  if (surface === undefined) throw new Error("The todo lifecycle did not create its surface");
  return surface;
}
