import assert from "node:assert/strict";
import test from "node:test";

import { verifyPackageArtifacts } from "../scripts/verify-package-artifacts.mjs";

const rootLicenseText = "MIT License\n\nExample license text.\n";

function createFixture() {
  const artifacts = new Map([
    [
      "package.json",
      `${JSON.stringify({
        name: "@mcp-native/example",
        license: "MIT",
        exports: {
          ".": {
            types: "./dist/index.d.ts",
            import: "./dist/index.js",
            default: "./dist/index.js",
          },
          "./feature": {
            types: "./dist/feature.d.ts",
            import: "./dist/feature.js",
            default: "./dist/feature.js",
          },
        },
      })}\n`,
    ],
    ["README.md", "# Example\n"],
    ["LICENSE", rootLicenseText],
    ["dist/index.js", "export {};\n//# sourceMappingURL=index.js.map\n"],
    ["dist/index.d.ts", "export {};\n//# sourceMappingURL=index.d.ts.map\n"],
    ["dist/feature.js", "export {};\n//# sourceMappingURL=feature.js.map\n"],
    ["dist/feature.d.ts", "export {};\n//# sourceMappingURL=feature.d.ts.map\n"],
    [
      "dist/index.js.map",
      JSON.stringify({ version: 3, file: "index.js", sources: ["../src/index.ts"], mappings: "" }),
    ],
    [
      "dist/index.d.ts.map",
      JSON.stringify({
        version: 3,
        file: "index.d.ts",
        sources: ["../src/index.ts"],
        mappings: "",
      }),
    ],
    [
      "dist/feature.js.map",
      JSON.stringify({
        version: 3,
        file: "feature.js",
        sources: ["../src/feature.ts"],
        mappings: "",
      }),
    ],
    [
      "dist/feature.d.ts.map",
      JSON.stringify({
        version: 3,
        file: "feature.d.ts",
        sources: ["../src/feature.ts"],
        mappings: "",
      }),
    ],
  ]);

  return {
    artifacts,
    verify() {
      return verifyPackageArtifacts({
        packageName: "@mcp-native/example",
        packageDirectory: ".",
        packedFiles: [...artifacts.keys()],
        rootLicenseText,
        readText(path) {
          const content = artifacts.get(path);
          if (content === undefined) {
            throw new Error(`Fixture is missing ${path}`);
          }
          return content;
        },
      });
    },
  };
}

test("package artifacts include matching licenses, exports, and source maps", () => {
  const fixture = createFixture();

  assert.equal(fixture.verify().name, "@mcp-native/example");
});

test("package artifacts reject a missing license", () => {
  const fixture = createFixture();
  fixture.artifacts.delete("LICENSE");

  assert.throws(() => fixture.verify(), /tarball is missing LICENSE/);
});

test("package artifacts reject a license that differs from the repository", () => {
  const fixture = createFixture();
  fixture.artifacts.set("LICENSE", "Different license\n");

  assert.throws(() => fixture.verify(), /does not match the repository license/);
});

test("package artifacts reject a missing exported file", () => {
  const fixture = createFixture();
  fixture.artifacts.delete("dist/feature.js");

  assert.throws(() => fixture.verify(), /tarball is missing dist\/feature\.js/);
});

test("package artifacts reject a missing executable", () => {
  const fixture = createFixture();
  const manifest = JSON.parse(fixture.artifacts.get("package.json"));
  manifest.bin = { example: "bin/example.mjs" };
  fixture.artifacts.set("package.json", `${JSON.stringify(manifest)}\n`);

  assert.throws(() => fixture.verify(), /tarball is missing bin\/example\.mjs/);
});

test("package artifacts reject bin targets npm would remove during publication", () => {
  const fixture = createFixture();
  const manifest = JSON.parse(fixture.artifacts.get("package.json"));
  manifest.bin = { example: "./bin/example.mjs" };
  fixture.artifacts.set("package.json", `${JSON.stringify(manifest)}\n`);

  assert.throws(() => fixture.verify(), /npm-normalized relative paths without/);
});

test("package artifacts reject exports without a matching default runtime fallback", () => {
  const fixture = createFixture();
  const manifest = JSON.parse(fixture.artifacts.get("package.json"));
  delete manifest.exports["./feature"].default;
  fixture.artifacts.set("package.json", `${JSON.stringify(manifest)}\n`);

  assert.throws(() => fixture.verify(), /default runtime fallback matching import/);
});

test("package artifacts reject a missing declaration map", () => {
  const fixture = createFixture();
  fixture.artifacts.delete("dist/index.d.ts.map");

  assert.throws(() => fixture.verify(), /tarball is missing dist\/index\.d\.ts\.map/);
});

test("package artifacts reject an invalid source map target", () => {
  const fixture = createFixture();
  fixture.artifacts.set(
    "dist/index.js.map",
    JSON.stringify({ version: 3, file: "other.js", sources: ["../src/index.ts"], mappings: "" }),
  );

  assert.throws(() => fixture.verify(), /is not a valid source map for dist\/index\.js/);
});

test("package artifacts reject a missing source map directive", () => {
  const fixture = createFixture();
  fixture.artifacts.set("dist/index.js", "export {};\n");

  assert.throws(() => fixture.verify(), /does not reference index\.js\.map/);
});
