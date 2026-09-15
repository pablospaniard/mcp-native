import { createHash } from "node:crypto";
import {
  CONTRACT_EXTENSION_ID,
  createContractAdapter,
  createContractRegistry,
} from "../../packages/host/dist/contracts.js";

const schema = {
  type: "object",
  properties: { title: { type: "string", maxLength: 80 } },
  required: ["title"],
  additionalProperties: false,
};
export const descriptor = {
  id: "com.example/lifecycle",
  version: "1.0.0",
  transport: "structured-content",
  mimeType: "application/vnd.example.lifecycle+json",
  schemaRevision: `sha256:${createHash("sha256")
    .update(JSON.stringify({ inputSchema: schema, modelSchema: schema }))
    .digest("hex")}`,
};
export const tool = { name: "receipt", inputSchema: { type: "object" } };
export const classifyError = () => ({ kind: "retryable", code: "network-unavailable" });
export function registry(prepare = (input) => input) {
  return createContractRegistry([
    createContractAdapter({ descriptor, inputSchema: schema, modelSchema: schema, prepare }),
  ]);
}
export function result(title = "Paid") {
  return {
    content: [{ type: "text", text: title }],
    structuredContent: { title },
    _meta: { [CONTRACT_EXTENSION_ID]: descriptor },
  };
}
export function client(extensions, overrides = {}) {
  return {
    listTools: async () => ({ tools: [tool] }),
    callTool: async () => result(),
    readResource: async () => ({ contents: [] }),
    getClientExtensionSettings: () => extensions,
    getServerExtensionSettings: () => extensions,
    ...overrides,
  };
}
export function unit(adapted, overrides = {}) {
  return { client: adapted, connect() {}, close() {}, ...overrides };
}
export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export async function turn() {
  await new Promise((resolve) => setImmediate(resolve));
}
export async function until(predicate, remaining = 30) {
  if (predicate()) return;
  if (remaining === 0) throw new Error("Condition never became true");
  await turn();
  await until(predicate, remaining - 1);
}
