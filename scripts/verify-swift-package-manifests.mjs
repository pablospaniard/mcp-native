import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";

const root = fileURLToPath(new URL("../", import.meta.url));

function dumpPackage(packagePath) {
  const args = ["package", "dump-package"];
  if (packagePath !== undefined) args.push("--package-path", packagePath);
  return JSON.parse(execFileSync("swift", args, { cwd: root, encoding: "utf8" }));
}

export function normalizedManifest(manifest) {
  const copy = structuredClone(manifest);
  delete copy.packageKind;
  for (const target of copy.targets) delete target.path;
  return copy;
}

export function assertManifestParity(remoteManifest, localManifest) {
  assert.deepEqual(
    normalizedManifest(remoteManifest),
    normalizedManifest(localManifest),
    "Root and focused Swift package manifests expose different package semantics",
  );

  const expectedRemotePaths = new Map([
    ["MCPNativeSwiftUI", "packages/swiftui/Sources/MCPNativeSwiftUI"],
    ["MCPNativeSwiftUITests", "packages/swiftui/Tests/MCPNativeSwiftUITests"],
  ]);

  for (const target of remoteManifest.targets) {
    assert.equal(
      target.path,
      expectedRemotePaths.get(target.name),
      `Unexpected root Swift package path for ${target.name}`,
    );
  }

  for (const target of localManifest.targets) {
    assert.equal(
      target.path,
      undefined,
      `Focused Swift package target ${target.name} must use its default path`,
    );
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assertManifestParity(dumpPackage(), dumpPackage("packages/swiftui"));
  console.log("Swift package manifests expose matching package semantics.");
}
