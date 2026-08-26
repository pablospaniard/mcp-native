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
  isA2uiMcpBindingGrant,
  negotiateA2uiMcpBinding,
  parseA2uiSurface,
  parseA2uiV1Envelope,
  parseA2uiV1Jsonl,
  resolveA2uiV1JsonlFromToolResult,
} from "../packages/a2ui/dist/index.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures/a2ui-v1");
const bindingGrant = negotiateA2uiMcpBinding(
  A2UI_MCP_EXTENSION_CAPABILITIES,
  A2UI_MCP_EXTENSION_CAPABILITIES,
);
assert.equal(bindingGrant.kind, "negotiated");

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
