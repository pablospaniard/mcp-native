// Synthetic interoperability fixture. This package makes no upstream standards claim.
import { createReviewedStandardAdapter } from "@mcp-native/host/contracts";
import { createContractSchemaBundle } from "@mcp-native/host/contracts/authoring";
export const schema = {
  type: "object",
  properties: { title: { type: "string", maxLength: 80 } },
  required: ["title"],
  additionalProperties: false,
};
export const eventSchema = {
  type: "object",
  properties: { name: { type: "string", maxLength: 7, enum: ["confirm"] } },
  required: ["name"],
  additionalProperties: false,
};
export const binding = {
  extensionId: "com.example/inline-standard",
  settings: { version: "2026-09-14", profile: "bounded" },
  resultMetaKey: "com.example/inline-standard",
  resultMeta: { version: "2026-09-14" },
};
export const evidence = {
  specification: "fixture:synthetic-inline-json",
  revision: "2026-09-14",
  review: "tests/reviewed-standard.test.mjs",
  fixtures: "tests/fixtures/reviewed-standard-package/index.mjs",
  exclusions: ["Synthetic fixture, not an upstream standard", "No resources or streaming"],
};
export async function createFixtureAdapter(overrides = {}) {
  const bundle = await createContractSchemaBundle({
    inputSchema: schema,
    modelSchema: schema,
    eventSchema,
  });
  return createReviewedStandardAdapter({
    descriptor: {
      id: "com.example/inline-standard",
      version: "1.0.0",
      schemaRevision: bundle.schemaRevision,
      transport: "structured-content",
      mimeType: "application/vnd.example.inline-standard+json",
    },
    ...bundle.schemas,
    binding,
    evidence,
    prepare: (input) => input,
    ...overrides,
  });
}
