import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  A2UI_MCP_EXTENSION_CAPABILITIES,
  A2UI_MIME_TYPE,
  A2uiParseError,
  A2uiResourceError,
  A2uiSurfaceStore,
  createA2uiV1ActionEnvelope,
  createA2uiV1RendererCapabilities,
  isA2uiMcpBindingGrant,
  negotiateA2uiMcpBinding,
  negotiateA2uiV1Capabilities,
  parseA2uiSurface,
  parseA2uiV1AgentCapabilities,
  parseA2uiV1Envelope,
  parseA2uiV1Jsonl,
  parseA2uiV1RendererCapabilities,
  parseA2uiV1RendererToAgentEnvelope,
  resolveA2uiV1JsonlFromToolResult,
} from "../packages/a2ui/dist/index.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures/a2ui-v1");
const bindingGrant = negotiateA2uiMcpBinding(
  A2UI_MCP_EXTENSION_CAPABILITIES,
  A2UI_MCP_EXTENSION_CAPABILITIES,
);
assert.equal(bindingGrant.kind, "negotiated");

test("v1 capabilities normalize explicit metadata and negotiate exact catalog overlap", () => {
  const renderer = createA2uiV1RendererCapabilities({
    supportedCatalogIds: ["catalog://native", "catalog://shared"],
  });
  const agent = parseA2uiV1AgentCapabilities(
    JSON.stringify({
      "v1.0": {
        supportedCatalogIds: ["catalog://shared", "catalog://agent"],
        acceptsInlineCatalogs: true,
      },
    }),
  );

  assert.deepEqual(renderer, {
    "v1.0": { supportedCatalogIds: ["catalog://native", "catalog://shared"] },
  });
  assert.deepEqual(agent, {
    "v1.0": {
      supportedCatalogIds: ["catalog://shared", "catalog://agent"],
      acceptsInlineCatalogs: true,
    },
  });
  assert.deepEqual(negotiateA2uiV1Capabilities(agent, renderer), {
    kind: "negotiated",
    protocolVersion: "v1.0",
    supportedCatalogIds: ["catalog://shared"],
    inlineCatalogsEnabled: false,
  });
  assert.equal(Object.isFrozen(renderer), true);
  assert.equal(Object.isFrozen(renderer["v1.0"]), true);
  assert.equal(Object.isFrozen(renderer["v1.0"].supportedCatalogIds), true);
});

test("v1 capabilities default agent inline-catalog acceptance to false and fall back cleanly", () => {
  const agent = parseA2uiV1AgentCapabilities({
    "v1.0": { supportedCatalogIds: ["catalog://agent"] },
  });
  const renderer = parseA2uiV1RendererCapabilities({
    "v1.0": { supportedCatalogIds: ["catalog://renderer"] },
  });

  assert.equal(agent["v1.0"].acceptsInlineCatalogs, false);
  assert.deepEqual(negotiateA2uiV1Capabilities(agent, renderer), {
    kind: "fallback",
    protocolVersion: "v1.0",
    reason: "no-shared-catalog",
  });
});

test("v1 capability parsing fails closed beyond the permissive pinned schemas", async (t) => {
  const cases = [
    {
      name: "agent omits normative catalog list",
      parse: parseA2uiV1AgentCapabilities,
      input: { "v1.0": {} },
      message: /must declare supportedCatalogIds/,
    },
    {
      name: "unknown protocol version",
      parse: parseA2uiV1AgentCapabilities,
      input: { "v0.9": { supportedCatalogIds: [] } },
      message: /Unexpected field "v0\.9"/,
    },
    {
      name: "unknown agent setting",
      parse: parseA2uiV1AgentCapabilities,
      input: { "v1.0": { supportedCatalogIds: [], executable: true } },
      message: /Unexpected field "executable"/,
    },
    {
      name: "duplicate catalog",
      parse: parseA2uiV1RendererCapabilities,
      input: { "v1.0": { supportedCatalogIds: ["catalog://same", "catalog://same"] } },
      message: /Duplicate A2UI catalog ID/,
    },
    {
      name: "empty catalog identifier",
      parse: parseA2uiV1RendererCapabilities,
      input: { "v1.0": { supportedCatalogIds: [""] } },
      message: /Expected a non-empty string/,
    },
    {
      name: "inline renderer catalog",
      parse: parseA2uiV1RendererCapabilities,
      input: { "v1.0": { supportedCatalogIds: [], inlineCatalogs: [] } },
      message: /inline renderer catalogs are not supported/,
    },
    {
      name: "non-JSON catalog value",
      parse: parseA2uiV1AgentCapabilities,
      input: { "v1.0": { supportedCatalogIds: [Number.NaN] } },
      message: /agent capabilities.*supportedCatalogIds\[0\]/,
    },
  ];

  await Promise.all(
    cases.map((fixture) =>
      t.test(fixture.name, () => {
        assert.throws(
          () => fixture.parse(fixture.input),
          (error) => error instanceof A2uiParseError && fixture.message.test(error.message),
        );
      }),
    ),
  );
});

test("renderer actions are reconstructed as exact official v1 envelopes", () => {
  const context = JSON.parse('{"name":"Grace","__proto__":{"polluted":true}}');
  const envelope = createA2uiV1ActionEnvelope({
    name: "save_profile",
    surfaceId: "profile",
    sourceComponentId: "save",
    timestamp: "2026-08-26T16:00:00.000Z",
    userMessage: "Saved Grace",
    context,
    metadata: { extensions: { auditSession: "session-1" } },
  });

  assert.deepEqual(envelope, {
    version: "v1.0",
    action: {
      name: "save_profile",
      surfaceId: "profile",
      sourceComponentId: "save",
      timestamp: "2026-08-26T16:00:00.000Z",
      userMessage: "Saved Grace",
      context,
      metadata: { extensions: { auditSession: "session-1" } },
    },
  });
  assert.equal(Object.getPrototypeOf(envelope.action.context), Object.prototype);
  assert.equal(Object.hasOwn(envelope.action.context, "__proto__"), true);
  assert.equal(envelope.action.context.polluted, undefined);
});

test("schema-derived renderer-to-agent fixtures cover every pinned message kind", () => {
  const messages = JSON.parse(
    readFileSync(join(fixturesDir, "renderer-to-agent-messages.json"), "utf8"),
  );
  const parsed = messages.map((message, index) =>
    parseA2uiV1RendererToAgentEnvelope(index === 0 ? JSON.stringify(message) : message),
  );

  assert.equal(parsed.length, 4);
  assert.deepEqual(
    parsed.map((message) => Object.keys(message).find((key) => key !== "version")),
    ["action", "callAgentFunction", "rendererFunctionResponse", "error"],
  );

  messages[0].action.context.name = "mutated";
  assert.equal(parsed[0].action.context.name, "Grace");
});

test("renderer-to-agent parsing preserves bounded generic error data without granting behavior", () => {
  const envelope = parseA2uiV1RendererToAgentEnvelope({
    version: "v1.0",
    error: {
      code: "RENDER_FAILED",
      surfaceId: "profile",
      message: "The renderer could not mount the surface.",
      diagnostic: { retryable: false },
    },
  });

  assert.deepEqual(envelope.error.diagnostic, { retryable: false });
});

test("renderer-to-agent parsing fails closed beyond the permissive pinned schema", async (t) => {
  const cases = [
    {
      name: "malformed JSON",
      input: "{not-json}",
      message: /Invalid renderer-to-agent JSON/,
    },
    {
      name: "unknown version",
      input: {
        version: "v0.9",
        error: { code: "FAILED", surfaceId: "surface", message: "no" },
      },
      message: /Unsupported A2UI renderer-to-agent protocol version/,
    },
    {
      name: "multiple message kinds",
      input: {
        version: "v1.0",
        error: { code: "FAILED", surfaceId: "surface", message: "no" },
        action: {
          name: "save",
          surfaceId: "surface",
          sourceComponentId: "button",
          timestamp: "2026-08-26T16:00:00.000Z",
          context: {},
        },
      },
      message: /Expected exactly one of/,
    },
    {
      name: "unknown root field",
      input: { version: "v1.0", executable: {} },
      message: /Expected exactly one of/,
    },
    {
      name: "unknown action field",
      input: {
        version: "v1.0",
        action: {
          name: "save",
          surfaceId: "surface",
          sourceComponentId: "button",
          timestamp: "2026-08-26T16:00:00.000Z",
          context: {},
          executable: true,
        },
      },
      message: /Unexpected field "executable"/,
    },
    {
      name: "empty call identifier",
      input: {
        version: "v1.0",
        callAgentFunction: {
          surfaceId: "surface",
          functionCallId: "",
          callFunction: { call: "formatString", args: { value: "Hi" } },
        },
      },
      message: /Expected a non-empty string.*functionCallId/,
    },
    {
      name: "unknown function",
      input: {
        version: "v1.0",
        callAgentFunction: {
          surfaceId: "surface",
          functionCallId: "call-1",
          callFunction: { call: "executeJavaScript", args: {} },
        },
      },
      message: /schema validation failed/,
    },
    {
      name: "response has both result forms",
      input: {
        version: "v1.0",
        rendererFunctionResponse: {
          functionCallId: "call-1",
          value: true,
          error: { code: "FAILED", message: "no" },
        },
      },
      message: /schema validation failed/,
    },
    {
      name: "invalid validation-error pointer",
      input: {
        version: "v1.0",
        error: {
          code: "VALIDATION_FAILED",
          surfaceId: "surface",
          path: "/invalid~2escape",
          message: "no",
        },
      },
      message: /Invalid JSON Pointer escape/,
    },
    {
      name: "generic error has conflicting targets",
      input: {
        version: "v1.0",
        error: {
          code: "FAILED",
          surfaceId: "surface",
          functionCallId: "call-1",
          message: "no",
        },
      },
      message: /schema validation failed/,
    },
    {
      name: "non-JSON value",
      input: {
        version: "v1.0",
        error: {
          code: "FAILED",
          surfaceId: "surface",
          message: "no",
          diagnostic: Number.NaN,
        },
      },
      message: /renderer-to-agent envelope\.error\.diagnostic/,
    },
  ];

  await Promise.all(
    cases.map((fixture) =>
      t.test(fixture.name, () => {
        assert.throws(
          () => parseA2uiV1RendererToAgentEnvelope(fixture.input),
          (error) => error instanceof A2uiParseError && fixture.message.test(error.message),
        );
      }),
    ),
  );

  assert.doesNotThrow(() =>
    parseA2uiV1RendererToAgentEnvelope({
      version: "v1.0",
      error: {
        code: "VALIDATION_FAILED",
        surfaceId: "surface",
        path: "",
        message: "The root is invalid.",
      },
    }),
  );
});

test("renderer-to-agent parsing bounds serialized input", () => {
  assert.throws(
    () => parseA2uiV1RendererToAgentEnvelope(" ".repeat(1_048_576 + 1)),
    (error) => error instanceof A2uiParseError && /exceeds maximum length/.test(error.message),
  );
});

test("renderer action construction fails closed for malformed host input", async (t) => {
  const cases = [
    {
      name: "invalid timestamp",
      input: {
        name: "save",
        surfaceId: "surface",
        sourceComponentId: "button",
        timestamp: "not-a-date",
        context: {},
      },
      message: /schema validation failed.*format/,
    },
    {
      name: "unknown field",
      input: {
        name: "save",
        surfaceId: "surface",
        sourceComponentId: "button",
        context: {},
        executable: "no",
      },
      message: /Unexpected field "executable"/,
    },
    {
      name: "invalid metadata extension",
      input: {
        name: "save",
        surfaceId: "surface",
        sourceComponentId: "button",
        context: {},
        metadata: { extensions: { "not allowed": true } },
      },
      message: /schema validation failed/,
    },
    {
      name: "non-JSON context",
      input: {
        name: "save",
        surfaceId: "surface",
        sourceComponentId: "button",
        context: { invalid: Number.NaN },
      },
      message: /action\.context\.invalid/,
    },
  ];

  await Promise.all(
    cases.map((fixture) =>
      t.test(fixture.name, () => {
        assert.throws(
          () => createA2uiV1ActionEnvelope(fixture.input),
          (error) => error instanceof Error && fixture.message.test(error.message),
        );
      }),
    ),
  );
});

test("official simple-text JSONL creates a surface with a root Text component", () => {
  const jsonl = readFileSync(join(fixturesDir, "00_simple-text.jsonl"), "utf8");
  const envelopes = parseA2uiV1Jsonl(jsonl);
  assert.equal(envelopes.length, 2);

  const store = new A2uiSurfaceStore();
  store.applyAll(envelopes);
  const surface = store.get("gallery-simple-text");
  assert.ok(surface);
  assert.equal(
    surface.catalogId,
    "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json",
  );
  assert.equal(surface.components.get("root")?.component, "Text");
  assert.deepEqual(surface.dataModel, {});
});

test("official incremental messages replace the root model and append an array item", () => {
  const fixture = JSON.parse(readFileSync(join(fixturesDir, "00_incremental.json"), "utf8"));
  const store = new A2uiSurfaceStore();
  store.applyAll(fixture.messages);

  const surface = store.get("gallery-incremental");
  assert.ok(surface);
  assert.equal(surface.components.get("root")?.component, "Column");
  assert.equal(surface.dataModel.restaurants.length, 4);
  assert.equal(surface.dataModel.restaurants[3].title, "Spice Route");
});

test("surface store applies create, component update, data-model update, and delete", () => {
  const store = new A2uiSurfaceStore();
  store.apply(
    parseA2uiV1Envelope({
      version: "v1.0",
      createSurface: {
        surfaceId: "main",
        components: [{ id: "root", component: "Text", text: "Hello" }],
        dataModel: { name: "Ada" },
      },
    }),
  );
  store.apply(
    parseA2uiV1Envelope({
      version: "v1.0",
      updateComponents: {
        surfaceId: "main",
        components: [{ id: "root", component: "Text", text: "Hi" }],
      },
    }),
  );
  store.apply(
    parseA2uiV1Envelope({
      version: "v1.0",
      updateDataModel: { surfaceId: "main", path: "/name", value: "Grace" },
    }),
  );

  let surface = store.get("main");
  assert.equal(surface?.components.get("root")?.text, "Hi");
  assert.deepEqual(surface?.dataModel, { name: "Grace" });
  assert.equal(surface?.dataModelRevision, 1);

  store.apply(parseA2uiV1Envelope({ version: "v1.0", deleteSurface: { surfaceId: "main" } }));
  assert.equal(store.has("main"), false);
});

test("applyAll rolls back the store when a later envelope fails", () => {
  const store = new A2uiSurfaceStore();
  store.apply(
    parseA2uiV1Envelope({
      version: "v1.0",
      createSurface: {
        surfaceId: "keep",
        components: [{ id: "root", component: "Text", text: "x" }],
      },
    }),
  );

  assert.throws(
    () =>
      store.applyAll([
        parseA2uiV1Envelope({
          version: "v1.0",
          createSurface: {
            surfaceId: "temp",
            components: [{ id: "root", component: "Text", text: "y" }],
          },
        }),
        parseA2uiV1Envelope({
          version: "v1.0",
          updateComponents: {
            surfaceId: "missing",
            components: [{ id: "root", component: "Text", text: "z" }],
          },
        }),
      ]),
    (error) => error instanceof A2uiParseError && /does not exist/.test(error.message),
  );

  assert.equal(store.has("keep"), true);
  assert.equal(store.has("temp"), false);
});

test("surface store validates its public input even when callers bypass the parser", () => {
  const store = new A2uiSurfaceStore();

  assert.throws(
    () =>
      store.apply({
        version: "0.1",
        createSurface: {
          surfaceId: "unsafe",
          components: [{ id: "root", component: "Arbitrary", unchecked: true }],
        },
      }),
    (error) => error instanceof A2uiParseError && /protocol version/.test(error.message),
  );
  assert.equal(store.has("unsafe"), false);
  assert.throws(
    () => store.applyAll(null),
    (error) => error instanceof A2uiParseError && /array/.test(error.message),
  );
});

test("surface store owns component snapshots at ingress and egress", () => {
  const store = new A2uiSurfaceStore();
  store.apply(parseA2uiV1Envelope({ version: "v1.0", createSurface: { surfaceId: "safe" } }));
  const update = parseA2uiV1Envelope({
    version: "v1.0",
    updateComponents: {
      surfaceId: "safe",
      components: [{ id: "root", component: "Text", text: "original" }],
    },
  });
  store.apply(update);

  update.updateComponents.components[0].text = "mutated-input";
  const returned = store.get("safe");
  returned.components.get("root").text = "mutated-output";

  assert.equal(store.get("safe").components.get("root").text, "original");
});

test("data-model updates are safe RFC 6901 upserts", () => {
  delete Object.prototype.polluted;
  const store = new A2uiSurfaceStore();
  store.apply(
    parseA2uiV1Envelope({
      version: "v1.0",
      createSurface: { surfaceId: "model", dataModel: {} },
    }),
  );
  store.apply(
    parseA2uiV1Envelope({
      version: "v1.0",
      updateDataModel: { surfaceId: "model", path: "/user/name", value: "Ada" },
    }),
  );
  store.apply(
    parseA2uiV1Envelope({
      version: "v1.0",
      updateDataModel: {
        surfaceId: "model",
        path: "/__proto__/polluted",
        value: "contained",
      },
    }),
  );

  const dataModel = store.get("model").dataModel;
  assert.deepEqual(dataModel.user, { name: "Ada" });
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal(Object.hasOwn(dataModel, "__proto__"), true);
  assert.equal(dataModel["__proto__"].polluted, "contained");

  assert.throws(
    () =>
      store.apply(
        parseA2uiV1Envelope({
          version: "v1.0",
          updateDataModel: { surfaceId: "model", path: "/invalid~2escape", value: true },
        }),
      ),
    (error) => error instanceof A2uiParseError && /JSON Pointer escape/.test(error.message),
  );
});

test("a cumulative data-model limit failure preserves the previous valid state", () => {
  const store = new A2uiSurfaceStore();
  store.apply({
    version: "v1.0",
    createSurface: { surfaceId: "bounded", dataModel: { stable: true } },
  });
  const values = Array.from({ length: 6_000 }, () => 0);
  store.apply({
    version: "v1.0",
    updateDataModel: { surfaceId: "bounded", path: "/first", value: values },
  });

  assert.throws(
    () =>
      store.apply({
        version: "v1.0",
        updateDataModel: { surfaceId: "bounded", path: "/second", value: values },
      }),
    (error) => error instanceof A2uiParseError && /maximum of 10000 values/.test(error.message),
  );

  const surface = store.get("bounded");
  assert.ok(surface);
  assert.equal(surface.dataModel.stable, true);
  assert.equal(surface.dataModel.first.length, 6_000);
  assert.equal(Object.hasOwn(surface.dataModel, "second"), false);
});

test("v1 parser rejects custom 0.1 surfaces and unsupported function envelopes", () => {
  assert.throws(
    () =>
      parseA2uiV1Envelope({
        version: "0.1",
        root: { id: "root", type: "text", text: "nope" },
      }),
    (error) => error instanceof A2uiParseError,
  );
  assert.throws(
    () =>
      parseA2uiV1Envelope({
        version: "v1.0",
        callRendererFunction: {
          functionCallId: "1",
          callFunction: {
            catalogId: "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json",
            call: "required",
          },
        },
      }),
    (error) =>
      error instanceof A2uiParseError && /Unsupported A2UI v1 envelope message/.test(error.message),
  );
  // Custom 0.1 path remains available separately.
  assert.equal(
    parseA2uiSurface({
      version: "0.1",
      root: { id: "root", type: "text", text: "ok" },
    }).version,
    "0.1",
  );
});

test("JSONL rejects an invalid line without returning a partial batch", () => {
  assert.throws(
    () =>
      parseA2uiV1Jsonl(
        `${JSON.stringify({ version: "v1.0", createSurface: { surfaceId: "a" } })}\n{not-json}\n`,
      ),
    (error) => error instanceof A2uiParseError && /line 2/.test(error.message),
  );
});

test("duplicate create and update-before-create fail closed", () => {
  const store = new A2uiSurfaceStore();
  store.apply(parseA2uiV1Envelope({ version: "v1.0", createSurface: { surfaceId: "a" } }));
  assert.throws(
    () => store.apply(parseA2uiV1Envelope({ version: "v1.0", createSurface: { surfaceId: "a" } })),
    (error) => error instanceof A2uiParseError && /already exists/.test(error.message),
  );
  assert.throws(
    () =>
      store.apply(
        parseA2uiV1Envelope({
          version: "v1.0",
          updateDataModel: { surfaceId: "missing", value: {} },
        }),
      ),
    (error) => error instanceof A2uiParseError && /does not exist/.test(error.message),
  );
  assert.throws(
    () =>
      store.apply(parseA2uiV1Envelope({ version: "v1.0", deleteSurface: { surfaceId: "gone" } })),
    (error) => error instanceof A2uiParseError && /does not exist/.test(error.message),
  );
});

test("resolveA2uiV1JsonlFromToolResult reads JSONL and never uses the 0.1 parser", async () => {
  const jsonl = readFileSync(join(fixturesDir, "00_simple-text.jsonl"), "utf8");
  const resolved = await resolveA2uiV1JsonlFromToolResult(
    {
      async readResource(uri) {
        return {
          contents: [{ uri, mimeType: A2UI_MIME_TYPE, text: jsonl }],
        };
      },
    },
    {
      content: [
        {
          type: "resource_link",
          name: "surface",
          uri: "ui://v1",
          mimeType: A2UI_MIME_TYPE,
        },
      ],
    },
    bindingGrant,
  );

  assert.equal(resolved.uri, "ui://v1");
  assert.equal(resolved.envelopes.length, 2);
  assert.equal("createSurface" in resolved.envelopes[0], true);

  await assert.rejects(
    () =>
      resolveA2uiV1JsonlFromToolResult(
        {
          async readResource(uri) {
            return {
              contents: [
                {
                  uri,
                  mimeType: A2UI_MIME_TYPE,
                  text: JSON.stringify({
                    version: "0.1",
                    root: { id: "root", type: "text", text: "legacy" },
                  }),
                },
              ],
            };
          },
        },
        {
          content: [
            {
              type: "resource_link",
              name: "surface",
              uri: "ui://legacy",
              mimeType: A2UI_MIME_TYPE,
            },
          ],
        },
        bindingGrant,
      ),
    (error) => error instanceof A2uiParseError,
  );

  await assert.rejects(
    () =>
      resolveA2uiV1JsonlFromToolResult(
        {
          async readResource() {
            return { contents: [] };
          },
        },
        {
          content: [
            {
              type: "resource_link",
              name: "surface",
              uri: "ui://missing",
              mimeType: A2UI_MIME_TYPE,
            },
            {
              type: "resource_link",
              name: "other",
              uri: "ui://other",
              mimeType: A2UI_MIME_TYPE,
            },
          ],
        },
        bindingGrant,
      ),
    (error) => error instanceof A2uiResourceError && /exactly one/.test(error.message),
  );
});

test("v1 resource resolution requires the exact mutual binding grant", async () => {
  let reads = 0;
  await assert.rejects(
    () =>
      resolveA2uiV1JsonlFromToolResult(
        {
          async readResource() {
            reads += 1;
            return { contents: [] };
          },
        },
        {
          content: [
            {
              type: "resource_link",
              name: "surface",
              uri: "ui://not-negotiated",
              mimeType: A2UI_MIME_TYPE,
            },
          ],
        },
        negotiateA2uiMcpBinding(A2UI_MCP_EXTENSION_CAPABILITIES, {}),
      ),
    (error) =>
      error instanceof A2uiResourceError && /without the exact negotiated/.test(error.message),
  );
  assert.equal(reads, 0);

  const inheritedGrant = Object.assign(Object.create(bindingGrant), {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
  });
  assert.equal(isA2uiMcpBindingGrant(inheritedGrant), false);
});
