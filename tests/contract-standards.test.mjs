/* eslint-disable no-await-in-loop -- Verify the complete standard-selection matrix sequentially. */
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import {
  createContractRegistry,
  createMcpOrdinaryContract,
  createA2uiStandardContract,
  createMcpAppsStandardContract,
  createContractHostController,
  resolveContractResult,
  createContractAdapter,
  CONTRACT_EXTENSION_ID,
} from "../packages/host/dist/contracts.js";
import { createContractNativeRegistry } from "../packages/host/dist/contracts-react-native.js";
import { MCP_NATIVE_HOST_EXTENSION_CAPABILITIES } from "../packages/host/dist/index.js";
import {
  MCP_EXTENSION_ID,
  MCP_SCHEMA_REVISION,
  MIME_TYPE,
  MAX_SOURCE_LENGTH,
} from "../packages/a2ui/dist/index.js";
import {
  MCP_APPS_EXTENSION_ID,
  MCP_APPS_MIME_TYPE,
  MCP_APPS_MAX_HTML_LENGTH,
} from "../packages/webview/dist/index.js";
import {
  tool,
  client,
  unit,
  classifyError,
  result as customResult,
} from "./fixtures/contract-lifecycle.mjs";
const all = [
  createMcpOrdinaryContract(),
  createA2uiStandardContract(),
  createMcpAppsStandardContract(),
];
const link = { type: "resource_link", name: "surface", uri: "ui://surface", mimeType: MIME_TYPE };
const appsTool = { ...tool, _meta: { ui: { resourceUri: "ui://app" } } };

test("maintained inventory pins profiles, limits, responsibilities, and qualified evidence", () => {
  const registry = createContractRegistry([]);
  assert.deepEqual(registry.extensionSettings, MCP_NATIVE_HOST_EXTENSION_CAPABILITIES);
  assert.deepEqual(
    registry.standards,
    all.map((entry) => entry.profile),
  );
  assert.equal(registry.standards[0].protocolVersion, "2026-07-28");
  assert.equal(registry.standards[1].schemaRevision, MCP_SCHEMA_REVISION);
  assert.equal(registry.standards[1].limits.maxSourceCodeUnits, MAX_SOURCE_LENGTH);
  assert.equal(registry.standards[2].schemaRevision, "92f46a574568a3ddac7600343b7d3c4c4ed7b588");
  assert.equal(registry.standards[2].limits.maxHtmlCodeUnits, MCP_APPS_MAX_HTML_LENGTH);
  for (const entry of registry.standards) {
    assert.ok(Object.isFrozen(entry));
    assert.ok(Object.isFrozen(entry.limits));
    assert.ok(Object.isFrozen(entry.exclusions));
    assert.equal(Object.keys(entry.responsibilities).length, 7);
    for (const evidence of entry.evidence)
      if (evidence.startsWith("docs/")) assert.ok(existsSync(evidence), evidence);
  }
});

test("standard selection is immutable, deterministic, factory-only, and always retains inert fallback", () => {
  const choices = [all[2], all[1]];
  const selected = createContractRegistry([], { standards: choices });
  choices.length = 0;
  assert.deepEqual(
    selected.standards,
    all.map((entry) => entry.profile),
  );
  const only = createContractRegistry([], { standards: [] });
  assert.deepEqual(only.extensionSettings, {});
  assert.equal(only.standards.length, 1);
  assert.deepEqual(
    createContractNativeRegistry([], { standards: [] }).registry.standards,
    only.standards,
  );
  for (const standards of [
    [{ ...all[1] }],
    [{ profile: all[1].profile }],
    [all[1], all[1]],
    [...all, all[0]],
    "all",
    null,
  ])
    assert.throws(() => createContractRegistry([], { standards }), /invalid-registry/);
  assert.throws(() => createContractRegistry([], { standard: all }), /invalid-registry/);
  assert.throws(
    () =>
      createContractAdapter({
        descriptor: { ...customResult()["_meta"][CONTRACT_EXTENSION_ID], id: all[1].profile.id },
      }),
    /invalid-registration/,
  );
});

test("each enabled profile resolves through its existing parser; disabled profiles cannot load resources", async () => {
  for (const standards of [[], [all[1]], [all[2]], all]) {
    const registry = createContractRegistry([], { standards });
    for (const apps of [false, true]) {
      let reads = 0;
      const value = await resolveContractResult({
        registry,
        tool: apps ? appsTool : tool,
        result: { content: apps ? [] : [link] },
        client: client(registry.extensionSettings, {
          getServerExtensionSettings: () => MCP_NATIVE_HOST_EXTENSION_CAPABILITIES,
          readResource: async (uri) => {
            reads++;
            return {
              contents: [
                {
                  uri,
                  mimeType: apps ? MCP_APPS_MIME_TYPE : MIME_TYPE,
                  text: apps
                    ? "<!doctype html><html><body>App</body></html>"
                    : JSON.stringify({ version: "v1.0", createSurface: { surfaceId: "main" } }),
                },
              ],
            };
          },
        }),
      });
      const selected = standards.includes(apps ? all[2] : all[1]);
      assert.equal(value.kind, selected ? (apps ? "mcp-app" : "a2ui") : "ordinary");
      assert.equal(reads, selected ? 1 : 0);
    }
  }
});

test("uninstalled client advertisements fail closed and cannot enable resource callbacks", async () => {
  for (const standards of [[], [all[1]], [all[2]]]) {
    const registry = createContractRegistry([], { standards });
    let reads = 0;
    assert.deepEqual(
      await resolveContractResult({
        registry,
        tool: appsTool,
        result: { content: [link] },
        client: client(MCP_NATIVE_HOST_EXTENSION_CAPABILITIES, {
          readResource: async () => {
            reads++;
            return { contents: [] };
          },
        }),
      }),
      { kind: "contract-error", code: "invalid-standard-settings" },
    );
    assert.equal(reads, 0);
  }
});

test("selected standard failures and ambiguous claims never become custom or ordinary success", async () => {
  const registry = createContractRegistry([], { standards: all });
  const bad = await resolveContractResult({
    registry,
    tool,
    result: { content: [link] },
    client: client(registry.extensionSettings, {
      readResource: async (uri) => ({
        contents: [{ uri, mimeType: MIME_TYPE, text: "invalid JSON" }],
      }),
    }),
  });
  assert.deepEqual(bad, { kind: "invalid", code: "a2ui-resolution-failed" });
  assert.deepEqual(
    await resolveContractResult({
      registry,
      tool: appsTool,
      result: { content: [link] },
      client: client(registry.extensionSettings),
    }),
    { kind: "invalid", code: "ambiguous-standard-result" },
  );
  let preparations = 0;
  const schema = { type: "object", properties: {}, required: [], additionalProperties: false };
  const installed = createContractRegistry(
    [
      createContractAdapter({
        descriptor: customResult()["_meta"][CONTRACT_EXTENSION_ID],
        inputSchema: schema,
        modelSchema: schema,
        prepare: () => {
          preparations++;
          return {};
        },
      }),
    ],
    { standards: [] },
  );
  // Reserved-marker checks remain ahead of custom preparation even when both UI standards are excluded.
  assert.deepEqual(
    await resolveContractResult({
      registry: installed,
      tool: appsTool,
      result: customResult(),
      client: client({
        [CONTRACT_EXTENSION_ID]: installed.extensionSettings[CONTRACT_EXTENSION_ID],
      }),
    }),
    { kind: "contract-error", code: "conflicting-contract-claims" },
  );
  assert.equal(preparations, 0);
});

test("controller advertises the selected standard map on every fresh connection", async () => {
  const registry = createContractRegistry([], { standards: [all[1]] });
  const snapshots = [];
  const controller = createContractHostController({
    registry,
    classifyError,
    createConnection: (extensions) => {
      snapshots.push(extensions);
      return unit(client(extensions));
    },
  });
  await controller.start();
  await controller.setOnline(false);
  await controller.setOnline(true);
  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[0], registry.extensionSettings);
  assert.ok(Object.hasOwn(snapshots[1], MCP_EXTENSION_ID));
  assert.equal(Object.hasOwn(snapshots[1], MCP_APPS_EXTENSION_ID), false);
  await controller.shutdown();
});
