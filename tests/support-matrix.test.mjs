import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parse as parseYaml } from "yaml";

const publicManifestPaths = [
  "packages/core/package.json",
  "packages/mcp/package.json",
  "packages/a2ui/package.json",
  "packages/webview/package.json",
  "packages/react-native/package.json",
  "packages/host/package.json",
  "packages/mcp-native/package.json",
];

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const publicManifests = publicManifestPaths.map(readJson);
const publicManifestByName = new Map(publicManifests.map((manifest) => [manifest.name, manifest]));

test("the repository toolchain matches the documented support matrix", () => {
  const rootManifest = readJson("package.json");
  const lockfile = readJson("package-lock.json");
  const ci = parseYaml(readFileSync(".github/workflows/ci.yml", "utf8"));
  const verifySteps = ci.jobs.verify.steps;
  const setupNodeStep = verifySteps.find((step) => step.uses === "actions/setup-node@v6");

  assert.equal(rootManifest.engines?.node, ">=22.12");
  assert.equal(setupNodeStep?.with?.["node-version"], "22.12.0");
  assert.equal(rootManifest.devDependencies?.typescript, "^7.0.2");
  assert.equal(lockfile.packages?.["node_modules/typescript"]?.version, "7.0.2");
  assert.equal(rootManifest.devDependencies?.["@modelcontextprotocol/ext-apps"], "1.7.5");
  assert.equal(
    lockfile.packages?.["node_modules/@modelcontextprotocol/ext-apps"]?.version,
    "1.7.5",
  );
  assert.equal(rootManifest.devDependencies?.["react-18-1"], "npm:react@18.1.0");
  assert.equal(
    verifySteps.some((step) => step.run === "npm run check"),
    true,
  );
  assert.equal(
    verifySteps.some((step) => step.run === "npm run package:smoke"),
    true,
  );
});

test("public package manifests preserve the documented dependency boundaries", () => {
  const uiPackageNames = ["@mcp-native/react-native", "@mcp-native/host", "mcp-native"];
  const forbiddenFrameworkDependencies = new Set(["expo", "react-native", "react-native-webview"]);

  for (const packageName of uiPackageNames) {
    const manifest = publicManifestByName.get(packageName);
    assert.ok(manifest, `Missing public manifest for ${packageName}`);
    assert.deepEqual(manifest.peerDependencies, { react: ">=18.1.0" });
    assert.equal(manifest.peerDependenciesMeta, undefined);
    assert.equal(manifest.dependencies?.react, undefined);
  }

  for (const manifest of publicManifests) {
    for (const dependencyField of ["dependencies", "optionalDependencies", "peerDependencies"]) {
      for (const dependencyName of Object.keys(manifest[dependencyField] ?? {})) {
        assert.equal(
          forbiddenFrameworkDependencies.has(dependencyName),
          false,
          `${manifest.name} declares ${dependencyName} in ${dependencyField}`,
        );
      }
    }
  }

  const mcpManifest = publicManifestByName.get("@mcp-native/mcp");
  assert.deepEqual(mcpManifest.peerDependencies, { "@modelcontextprotocol/client": "^2.0.0" });
  assert.equal(mcpManifest.dependencies?.["@modelcontextprotocol/core"], "2.0.0");
});
