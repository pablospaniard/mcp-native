import assert from "node:assert/strict";
import test from "node:test";

import { assertManifestParity } from "../scripts/verify-swift-package-manifests.mjs";

function manifests() {
  const shared = {
    name: "MCPNativeSwiftUI",
    platforms: [{ platformName: "ios", version: "18.0", options: [] }],
    products: [
      {
        name: "MCPNativeSwiftUI",
        targets: ["MCPNativeSwiftUI"],
        type: { library: ["automatic"] },
        settings: [],
      },
    ],
    targets: [
      {
        name: "MCPNativeSwiftUI",
        type: "regular",
        dependencies: [],
        exclude: [],
        resources: [{ path: "Resources", rule: { process: {} } }],
        settings: [],
        packageAccess: true,
      },
      {
        name: "MCPNativeSwiftUITests",
        type: "test",
        dependencies: [{ byName: ["MCPNativeSwiftUI", null] }],
        exclude: [],
        resources: [],
        settings: [],
        packageAccess: true,
      },
    ],
    toolsVersion: { _version: "6.0.0" },
  };
  const remote = structuredClone(shared);
  remote.packageKind = { root: ["/repo"] };
  remote.targets[0].path = "packages/swiftui/Sources/MCPNativeSwiftUI";
  remote.targets[1].path = "packages/swiftui/Tests/MCPNativeSwiftUITests";
  const local = structuredClone(shared);
  local.packageKind = { root: ["/repo/packages/swiftui"] };
  return { remote, local };
}

test("Swift package manifest parity permits only the intentional root paths", () => {
  const { remote, local } = manifests();
  assert.doesNotThrow(() => assertManifestParity(remote, local));

  remote.targets[0].path = "Sources/MCPNativeSwiftUI";
  assert.throws(() => assertManifestParity(remote, local), /Unexpected root Swift package path/);
});

test("Swift package manifest parity rejects semantic drift", () => {
  const { remote, local } = manifests();
  local.platforms[0].version = "17.0";
  assert.throws(() => assertManifestParity(remote, local), /different package semantics/);
});
