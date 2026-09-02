import type { JsonObject } from "@mcp-native/core";

export const MAX_TODOS = 200;
export const MAX_TODO_TITLE_LENGTH = 120;

export type TodoFilter = "active" | "all" | "completed";

export interface Todo {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
}

export interface TodoState {
  readonly todos: readonly Todo[];
  readonly draft: string;
  readonly filter: TodoFilter;
}

export interface TodoCounts {
  readonly active: number;
  readonly completed: number;
  readonly total: number;
}

export interface TodoReset {
  readonly state: TodoState;
  readonly persistenceCleared: Promise<boolean>;
}

const FILTERS = new Set<TodoFilter>(["all", "active", "completed"]);
const TODO_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,128}$/;
const RESERVED_IDS = new Set(["__proto__", "constructor", "prototype"]);

export function createInitialTodoState(): TodoState {
  return {
    draft: "",
    filter: "all",
    todos: [
      { id: "welcome-1", title: "Try the A2UI-powered composer", completed: true },
      { id: "welcome-2", title: "Filter and edit renderer-local state", completed: false },
      { id: "welcome-3", title: "Inspect the official action envelopes", completed: false },
    ],
  };
}

export function startTodoReset(clearPersistedState: () => Promise<void>): TodoReset {
  const state = createInitialTodoState();
  try {
    return {
      state,
      persistenceCleared: clearPersistedState().then(
        () => true,
        () => false,
      ),
    };
  } catch {
    return { state, persistenceCleared: Promise.resolve(false) };
  }
}

export function getTodoCounts(todos: readonly Todo[]): TodoCounts {
  const completed = todos.reduce((count, todo) => count + (todo.completed ? 1 : 0), 0);
  return { active: todos.length - completed, completed, total: todos.length };
}

export function getVisibleTodos(state: TodoState): readonly Todo[] {
  if (state.filter === "active") return state.todos.filter((todo) => !todo.completed);
  if (state.filter === "completed") return state.todos.filter((todo) => todo.completed);
  return state.todos;
}

export function addTodo(state: TodoState, title: string, createId: () => string): TodoState {
  const normalizedTitle = title.trim();
  if (
    normalizedTitle.length === 0 ||
    normalizedTitle.length > MAX_TODO_TITLE_LENGTH ||
    state.todos.length >= MAX_TODOS
  ) {
    return state;
  }
  const id = createId();
  if (
    !TODO_ID_PATTERN.test(id) ||
    RESERVED_IDS.has(id) ||
    state.todos.some((todo) => todo.id === id)
  ) {
    return state;
  }
  return {
    ...state,
    draft: "",
    todos: [...state.todos, { id, title: normalizedTitle, completed: false }],
  };
}

export function applyTodoAction(
  state: TodoState,
  name: string,
  context: JsonObject,
  dataModel: JsonObject | undefined,
  createId: () => string,
): TodoState {
  if (name === "add_todo") {
    const draft = dataModel?.draft;
    return typeof draft === "string" ? addTodo(state, draft, createId) : state;
  }
  if (name === "delete_todo") {
    const id = context.id;
    if (typeof id !== "string") return state;
    const todos = state.todos.filter((todo) => todo.id !== id);
    return todos.length === state.todos.length ? state : { ...state, todos };
  }
  if (name === "clear_completed") {
    const todos = state.todos.filter((todo) => !todo.completed);
    return todos.length === state.todos.length ? state : { ...state, todos };
  }
  return state;
}

export function reconcileRendererModel(state: TodoState, model: JsonObject): TodoState {
  const draft = typeof model.draft === "string" ? model.draft : state.draft;
  const filter = parseRendererFilter(model.filter) ?? state.filter;
  const updates = parseRendererTodos(model.todos, state.todos);
  if (updates === undefined || draft.length > MAX_TODO_TITLE_LENGTH) return state;

  const byId = new Map(updates.map((todo) => [todo.id, todo]));
  return {
    draft,
    filter,
    todos: state.todos.map((todo) => byId.get(todo.id) ?? todo),
  };
}

export function parsePersistedTodoState(value: unknown): TodoState | undefined {
  if (!isRecord(value) || !Array.isArray(value.todos) || value.todos.length > MAX_TODOS) {
    return undefined;
  }
  const filter = parseFilter(value.filter);
  if (filter === undefined) return undefined;
  const todos: Todo[] = [];
  const ids = new Set<string>();
  for (const candidate of value.todos) {
    const todo = parseTodo(candidate);
    if (todo === undefined || ids.has(todo.id)) return undefined;
    ids.add(todo.id);
    todos.push(todo);
  }
  return { draft: "", filter, todos };
}

export function toPersistedTodoState(state: TodoState): JsonObject {
  return {
    filter: state.filter,
    todos: state.todos.map((todo) => ({ ...todo })),
  };
}

function parseRendererFilter(value: unknown): TodoFilter | undefined {
  return Array.isArray(value) && value.length === 1 ? parseFilter(value[0]) : undefined;
}

function parseRendererTodos(
  value: unknown,
  knownTodos: readonly Todo[],
): readonly Todo[] | undefined {
  if (!Array.isArray(value) || value.length > knownTodos.length) return undefined;
  const knownIds = new Set(knownTodos.map((todo) => todo.id));
  const ids = new Set<string>();
  const todos: Todo[] = [];
  for (const candidate of value) {
    const todo = parseTodo(candidate);
    if (todo === undefined || !knownIds.has(todo.id) || ids.has(todo.id)) return undefined;
    ids.add(todo.id);
    todos.push(todo);
  }
  return todos;
}

function parseTodo(value: unknown): Todo | undefined {
  if (!isRecord(value)) return undefined;
  const { completed, id, title } = value;
  if (
    typeof completed !== "boolean" ||
    typeof id !== "string" ||
    !TODO_ID_PATTERN.test(id) ||
    RESERVED_IDS.has(id) ||
    typeof title !== "string" ||
    title.trim().length === 0 ||
    title.length > MAX_TODO_TITLE_LENGTH
  ) {
    return undefined;
  }
  return { completed, id, title };
}

function parseFilter(value: unknown): TodoFilter | undefined {
  return typeof value === "string" && FILTERS.has(value as TodoFilter)
    ? (value as TodoFilter)
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
