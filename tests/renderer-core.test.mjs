import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import * as renderer from "../packages/renderer-core/dist/index.js";
import * as native from "../packages/react-native/dist/index.js";
import * as rendererTesting from "../packages/renderer-core/dist/testing.js";
import * as nativeTesting from "../packages/react-native/dist/testing.js";

test("React Native keeps the extracted planner, error, and fixture identities", () => {
  assert.equal(native.createRenderPlan, renderer.createRenderPlan);
  assert.equal(native.MountError, renderer.MountError);
  assert.equal(native.ICON_NAMES, renderer.ICON_NAMES);
  assert.equal(
    nativeTesting.createCatalogConformanceCases,
    rendererTesting.createCatalogConformanceCases,
  );
});

test("concise renderer exports preserve every existing compatibility alias identity", () => {
  for (const [compatibilityName, value] of Object.entries(renderer)) {
    if (!compatibilityName.includes("V1")) continue;
    const conciseName = compatibilityName
      .replace("A2UI_V1_NATIVE_", "")
      .replace("A2uiV1Native", "");
    assert.ok(Object.hasOwn(renderer, conciseName), `Missing ${conciseName}`);
    assert.equal(renderer[conciseName], value, compatibilityName);
    if (Object.hasOwn(native, compatibilityName)) assert.equal(native[compatibilityName], value);
  }
  assert.equal(
    rendererTesting.createCatalogConformanceCases,
    rendererTesting.createA2uiV1NativeCatalogConformanceCases,
  );
});

test("the public renderer-core entry points build a plan without loading React", () => {
  const loader = `export function resolve(specifier, context, nextResolve) {
    if (/^(react|react-native|@mcp-native\\/react-native)(\\/|$)/u.test(specifier)) {
      throw new Error('Unexpected renderer platform dependency: ' + specifier);
    }
    return nextResolve(specifier, context);
  }`;
  const source = `
    import { register } from 'node:module';
    register(${JSON.stringify(`data:text/javascript,${encodeURIComponent(loader)}`)});
    const { createBasicCatalogPolicy } = await import('@mcp-native/a2ui');
    const { createRenderPlan, COMPONENT_NAMES } =
      await import('@mcp-native/renderer-core');
    const { createCatalogConformanceCases } =
      await import('@mcp-native/renderer-core/testing');
    const fixture = createCatalogConformanceCases().find(c => c.id === 'divider-axes');
    const policy = createBasicCatalogPolicy({
      allowedComponentNames: COMPONENT_NAMES,
    });
    const plan = createRenderPlan(fixture.surface, policy);
    process.stdout.write(JSON.stringify({
      component: plan.component,
      axes: plan.children.map(child => child.props.axis),
    }));
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", source], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    component: "View",
    axes: ["horizontal", "vertical"],
  });
});
