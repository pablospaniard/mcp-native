import assert from "node:assert/strict";
import test from "node:test";

import {
  verifyLocalUpgradeInstallation,
  verifyPublishedUpgradeBaseline,
} from "../scripts/verify-package-upgrade.mjs";

const packageNames = ["@mcp-native/core", "mcp-native"];

function createInstalledManifests(version = "0.9.1") {
  return new Map(packageNames.map((name) => [name, { name, version }]));
}

test("published upgrade packages resolve to one coordinated stable 0.9.x version", () => {
  const manifests = createInstalledManifests();

  assert.equal(
    verifyPublishedUpgradeBaseline({
      packageNames,
      readInstalledManifest: (name) => manifests.get(name),
    }),
    "0.9.1",
  );
});

test("published upgrade packages reject mixed release-candidate versions", () => {
  const manifests = createInstalledManifests();
  manifests.set("mcp-native", { name: "mcp-native", version: "0.9.2" });

  assert.throws(
    () =>
      verifyPublishedUpgradeBaseline({
        packageNames,
        readInstalledManifest: (name) => manifests.get(name),
      }),
    /not coordinated/,
  );
});

test("published upgrade packages reject non-0.9 versions", () => {
  const manifests = createInstalledManifests("1.0.0");

  assert.throws(
    () =>
      verifyPublishedUpgradeBaseline({
        packageNames,
        readInstalledManifest: (name) => manifests.get(name),
      }),
    /stable published 0\.9\.x package/,
  );
});

test("local candidate packages replace the published dependencies", () => {
  const manifests = createInstalledManifests("1.0.0");
  const localTarballs = new Map([
    ["@mcp-native/core", "/tmp/mcp-native-core-1.0.0.tgz"],
    ["mcp-native", "/tmp/mcp-native-1.0.0.tgz"],
  ]);

  assert.doesNotThrow(() =>
    verifyLocalUpgradeInstallation({
      packageNames,
      expectedVersion: "1.0.0",
      localTarballs,
      consumerManifest: {
        dependencies: {
          "@mcp-native/core": "file:../mcp-native-core-1.0.0.tgz",
          "mcp-native": "file:../mcp-native-1.0.0.tgz",
        },
      },
      readInstalledManifest: (name) => manifests.get(name),
    }),
  );
});

test("local candidate verification rejects a retained registry dependency", () => {
  const manifests = createInstalledManifests("1.0.0");

  assert.throws(
    () =>
      verifyLocalUpgradeInstallation({
        packageNames,
        expectedVersion: "1.0.0",
        localTarballs: new Map([
          ["@mcp-native/core", "/tmp/mcp-native-core-1.0.0.tgz"],
          ["mcp-native", "/tmp/mcp-native-1.0.0.tgz"],
        ]),
        consumerManifest: {
          dependencies: {
            "@mcp-native/core": "file:../mcp-native-core-1.0.0.tgz",
            "mcp-native": "^1.0.0",
          },
        },
        readInstalledManifest: (name) => manifests.get(name),
      }),
    /mcp-native is not installed from its local candidate tarball/,
  );
});

test("local candidate verification rejects a stale installed version", () => {
  const manifests = createInstalledManifests("0.9.1");

  assert.throws(
    () =>
      verifyLocalUpgradeInstallation({
        packageNames,
        expectedVersion: "1.0.0",
        localTarballs: new Map([
          ["@mcp-native/core", "/tmp/mcp-native-core-1.0.0.tgz"],
          ["mcp-native", "/tmp/mcp-native-1.0.0.tgz"],
        ]),
        consumerManifest: {
          dependencies: {
            "@mcp-native/core": "file:../mcp-native-core-1.0.0.tgz",
            "mcp-native": "file:../mcp-native-1.0.0.tgz",
          },
        },
        readInstalledManifest: (name) => manifests.get(name),
      }),
    /did not upgrade to the local candidate/,
  );
});
