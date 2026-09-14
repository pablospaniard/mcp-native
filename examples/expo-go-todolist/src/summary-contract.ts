import {
  CONTRACT_EXTENSION_ID,
  createContractAdapter,
  createContractHostController,
  type ContractRegistry,
  type ContractSchema,
} from "@mcp-native/host/contracts";
import type { TodoCounts } from "./domain";

export const summarySchema: ContractSchema = {
  type: "object",
  properties: {
    active: { type: "integer", minimum: 0, maximum: 200 },
    completed: { type: "integer", minimum: 0, maximum: 200 },
    total: { type: "integer", minimum: 0, maximum: 200 },
  },
  required: ["active", "completed", "total"],
  additionalProperties: false,
};
export const summaryEventSchema: ContractSchema = {
  type: "object",
  properties: { name: { type: "string", maxLength: 11, enum: ["acknowledge"] } },
  required: ["name"],
  additionalProperties: false,
};
export const summarySchemaBundle = {
  inputSchema: summarySchema,
  modelSchema: summarySchema,
  eventSchema: summaryEventSchema,
};
export const summaryAdapter = createContractAdapter({
  descriptor: {
    id: "com.example/todo-summary",
    version: "1.0.0",
    transport: "structured-content",
    mimeType: "application/vnd.example.todo-summary+json",
    schemaRevision: "sha256:af880a398c404a2d1cc4c54ac0fba59c095fa808a9618c80b178c55a32aa41f8",
  },
  ...summarySchemaBundle,
  prepare(input, budget) {
    budget.consume(1);
    if (Number(input.active) + Number(input.completed) !== input.total)
      throw new Error("Invalid task counts");
    return input;
  },
});

/** In-process MCP fixture: a fresh controller and immutable count snapshot on each modal opening. */
export function createSummaryController(registry: ContractRegistry, counts: TodoCounts) {
  const snapshot = { active: counts.active, completed: counts.completed, total: counts.total };
  return createContractHostController({
    registry,
    classifyError: () => ({ kind: "terminal", code: "summary-unavailable" }),
    createConnection: (extensions) => ({
      connect: async () => {},
      close: async () => {},
      client: {
        getClientExtensionSettings: () => extensions,
        getServerExtensionSettings: () => extensions,
        listTools: async () => ({
          tools: [{ name: "task_summary", inputSchema: { type: "object" } }],
        }),
        callTool: async () => ({
          content: [],
          structuredContent: snapshot,
          _meta: { [CONTRACT_EXTENSION_ID]: { ...summaryAdapter.descriptor } },
        }),
        readResource: async () => {
          throw new Error("Summary resources are unavailable");
        },
      },
    }),
  });
}
