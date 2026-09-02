import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const snackReferencePattern = /^\[expo-snack-todo\]: (https:\/\/snack\.expo\.dev\/\?\S+)$/m;
const expectedFiles = [
  "App.tsx",
  "src/catalog.tsx",
  "src/domain.ts",
  "src/storage.ts",
  "src/surface.ts",
];

function readSnackUrl(path) {
  const markdown = readFileSync(path, "utf8");
  const match = markdown.match(snackReferencePattern);
  assert.ok(match, `${path} must define the Expo Snack launch URL`);
  return match[1];
}

test("the root and example READMEs launch the same complete Expo Snack", () => {
  const rootUrl = readSnackUrl("README.md");
  const exampleUrl = readSnackUrl("examples/expo-go-todolist/README.md");
  assert.equal(exampleUrl, rootUrl);

  const snack = new URL(rootUrl);
  assert.equal(snack.origin, "https://snack.expo.dev");
  assert.equal(snack.searchParams.get("sdkVersion"), "57.0.0");
  assert.equal(snack.searchParams.get("platform"), "mydevice");
  assert.equal(snack.searchParams.get("supportedPlatforms"), "ios,android,mydevice");

  const files = JSON.parse(snack.searchParams.get("files"));
  assert.deepEqual(Object.keys(files), expectedFiles);
  const revisions = new Set();
  for (const [path, source] of Object.entries(files)) {
    assert.equal(source.type, "CODE");
    const match = source.url.match(
      /^https:\/\/raw\.githubusercontent\.com\/pablospaniard\/mcp-native\/([0-9a-f]{40})\/examples\/expo-go-todolist\/(.+)$/,
    );
    assert.ok(match, `Snack source URL is not immutable for ${path}`);
    revisions.add(match[1]);
    assert.equal(match[2], path);
  }
  assert.equal(revisions.size, 1, "all Snack source files must use one immutable revision");

  assert.deepEqual(
    new Set(snack.searchParams.get("dependencies").split(",")),
    new Set([
      "@mcp-native/a2ui@latest",
      "@mcp-native/core@latest",
      "@mcp-native/react-native@latest",
      "expo-sqlite@~57.0.2",
      "expo-status-bar@~57.0.1",
      "react-native-safe-area-context@~5.7.0",
    ]),
  );
});
