import Storage from "expo-sqlite/kv-store";

import {
  createInitialTodoState,
  parsePersistedTodoState,
  toPersistedTodoState,
  type TodoState,
} from "./domain";

const STORAGE_KEY = "mcp-native.todos.v1";

export async function loadTodoState(): Promise<TodoState> {
  const stored = await Storage.getItem(STORAGE_KEY);
  if (stored === null) return createInitialTodoState();
  try {
    return parsePersistedTodoState(JSON.parse(stored)) ?? createInitialTodoState();
  } catch {
    return createInitialTodoState();
  }
}

export async function saveTodoState(state: TodoState): Promise<void> {
  await Storage.setItem(STORAGE_KEY, JSON.stringify(toPersistedTodoState(state)));
}

export async function resetTodoState(): Promise<TodoState> {
  await Storage.removeItem(STORAGE_KEY);
  return createInitialTodoState();
}
