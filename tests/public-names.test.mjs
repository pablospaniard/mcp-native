import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import * as a2ui from "../packages/a2ui/dist/index.js";
import * as native from "../packages/react-native/dist/index.js";
import * as umbrella from "../packages/mcp-native/dist/index.js";

test("concise A2UI names preserve the prefixed runtime exports", () => {
  const exports = { ...a2ui };
  const prefixedNames = Object.keys(exports).filter(
    (name) =>
      name.startsWith("A2ui") ||
      name.startsWith("A2UI_") ||
      name.includes("A2uiV1") ||
      name.includes("A2uiMcp"),
  );
  assert.ok(prefixedNames.length > 0);

  for (const prefixedName of prefixedNames) {
    const conciseName = prefixedName
      .replace(/^A2UI_V1_/, "")
      .replace(/^A2UI_/, "")
      .replace(/^A2ui/, "")
      .replace("A2uiV1", "")
      .replace("A2uiMcp", "Mcp");
    assert.ok(conciseName in exports, `${prefixedName} must have concise export ${conciseName}`);
    assert.equal(exports[conciseName], exports[prefixedName]);
  }
});

test("concise React Native names preserve the prefixed runtime exports", () => {
  const exports = { ...native };
  const prefixedNames = Object.keys(exports).filter(
    (name) =>
      name.startsWith("A2uiV1Native") ||
      name.includes("A2uiV1Native") ||
      name.startsWith("A2UI_V1_NATIVE_"),
  );
  assert.ok(prefixedNames.length > 0);

  for (const prefixedName of prefixedNames) {
    const conciseName = prefixedName.replace(/^A2UI_V1_NATIVE_/, "").replace("A2uiV1Native", "");
    assert.ok(conciseName in exports, `${prefixedName} must have concise export ${conciseName}`);
    assert.equal(exports[conciseName], exports[prefixedName]);
  }
});

test("the convenience package exposes explicit concise namespaces", () => {
  assert.equal(umbrella.a2ui.SurfaceStore, a2ui.SurfaceStore);
  assert.equal(umbrella.reactNative.Surface, native.Surface);
  assert.equal(umbrella.A2uiSurfaceStore, a2ui.SurfaceStore);
  assert.equal(umbrella.A2uiV1NativeSurface, native.Surface);
});

test("every exported prefixed declaration has a concise type or value alias", () => {
  const cases = [
    {
      declarations: [
        readFileSync(new URL("../packages/a2ui/dist/index.d.ts", import.meta.url), "utf8"),
        readFileSync(new URL("../packages/a2ui/dist/names.d.ts", import.meta.url), "utf8"),
      ].join("\n"),
      isPrefixed: (name) => name.startsWith("A2ui") || name.startsWith("A2UI_"),
      conciseName: (name) =>
        name
          .replace(/^A2UI_V1_/, "")
          .replace(/^A2UI_/, "")
          .replace("A2uiV1", "")
          .replace("A2uiMcp", "Mcp")
          .replace(/^A2ui/, ""),
    },
    {
      declarations: readFileSync(
        new URL("../packages/react-native/dist/index.d.ts", import.meta.url),
        "utf8",
      ),
      isPrefixed: (name) => name.includes("A2uiV1Native") || name.startsWith("A2UI_V1_NATIVE_"),
      conciseName: (name) => name.replace(/^A2UI_V1_NATIVE_/, "").replace("A2uiV1Native", ""),
    },
    {
      declarations: readFileSync(
        new URL("../packages/react-native/dist/testing.d.ts", import.meta.url),
        "utf8",
      ),
      isPrefixed: (name) => name.includes("A2uiV1Native"),
      conciseName: (name) => name.replace("A2uiV1Native", ""),
    },
  ];

  for (const { declarations, isPrefixed, conciseName } of cases) {
    const names = collectExportedNames(declarations).filter(isPrefixed);
    assert.ok(names.length > 0);
    for (const name of names) {
      const concise = conciseName(name);
      assert.match(
        declarations,
        new RegExp(`\\b${name}\\s+as\\s+${concise}\\b`, "u"),
        `${name} must export concise alias ${concise}`,
      );
    }
  }
});

function collectExportedNames(declarations) {
  const names = new Set();
  for (const match of declarations.matchAll(
    /^export\s+(?:declare\s+)?(?:class|const|function|interface|type)\s+([A-Za-z0-9_]+)/gmu,
  )) {
    names.add(match[1]);
  }
  for (const match of declarations.matchAll(/export\s+(?:type\s+)?\{([^}]+)\}/gsu)) {
    for (const item of match[1].split(",")) {
      const name = item
        .trim()
        .replace(/^type\s+/u, "")
        .split(/\s+as\s+/u)[0];
      if (/^[A-Za-z0-9_]+$/u.test(name)) names.add(name);
    }
  }
  return [...names];
}
