import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const packageDirectories = [
  "packages/core",
  "packages/mcp",
  "packages/a2ui",
  "packages/webview",
  "packages/react-native",
  "packages/mcp-native",
];

const actual = { formatVersion: 1, packages: {} };
for (const packageDirectory of packageDirectories) {
  const manifest = JSON.parse(readFileSync(join(packageDirectory, "package.json"), "utf8"));
  const declarationFiles = listFiles(join(packageDirectory, "dist"))
    .filter((filename) => filename.endsWith(".d.ts"))
    .sort();
  const declarationHash = createHash("sha256");
  for (const filename of declarationFiles) {
    declarationHash.update(relative(packageDirectory, filename));
    declarationHash.update("\0");
    declarationHash.update(readFileSync(filename));
    declarationHash.update("\0");
  }

  const exports = {};
  for (const [subpath, target] of Object.entries(manifest.exports)) {
    if (
      target === null ||
      typeof target !== "object" ||
      typeof target.import !== "string" ||
      typeof target.types !== "string" ||
      target.default !== target.import
    ) {
      throw new Error(`${manifest.name} has an unsupported export-map shape at ${subpath}`);
    }
    // eslint-disable-next-line no-await-in-loop -- import one built package surface at a time
    const module = await import(pathToFileURL(resolve(packageDirectory, target.import)).href);
    exports[subpath] = {
      import: target.import,
      runtimeSha256: sha256Json(Object.keys(module).sort()),
      types: target.types,
    };
  }
  actual.packages[manifest.name] = {
    declarationSha256: declarationHash.digest("hex"),
    exports,
  };
}

if (process.argv.includes("--print")) {
  process.stdout.write(`${JSON.stringify(actual, null, 2)}\n`);
} else {
  const baseline = JSON.parse(readFileSync("docs/public-api-baseline.json", "utf8"));
  assert.deepEqual(
    actual,
    baseline,
    "Public API changed. Review compatibility and migration, then intentionally update docs/public-api-baseline.json.",
  );
  console.log("Public API matches the Milestone 9 release-candidate baseline.");
}

function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function listFiles(directory) {
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...listFiles(path));
    else result.push(path);
  }
  return result;
}
