import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseA2uiV1HostExtensionManifest } from "../packages/a2ui/dist/index.js";

const cli = join(process.cwd(), "packages/mcp-native/bin/mcp-native.mjs");

test("doctor emits stable machine-readable package and workspace findings", () => {
  const directory = mkdtempSync(join(tmpdir(), "mcp-native-doctor-"));
  try {
    writeFileSync(
      join(directory, "package.json"),
      JSON.stringify({
        name: "fixture",
        workspaces: ["packages/*"],
        dependencies: {
          "@mcp-native/host": "^0.9.3",
          "@mcp-native/react-native": "^0.9.2",
        },
      }),
    );
    const result = spawnSync(process.execPath, [cli, "doctor", directory, "--json"], {
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(
      report.findings.map((finding) => finding.code),
      [
        "version-ranges-mixed",
        "react-missing",
        "react-native-not-declared",
        "metro-workspace-config-missing",
        "typescript-config-missing",
      ],
    );
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test("catalog and extension scaffolds are valid and never overwrite", () => {
  const directory = mkdtempSync(join(tmpdir(), "mcp-native-scaffold-"));
  try {
    execFileSync(process.execPath, [cli, "scaffold-catalog", directory]);
    const catalogPath = join(directory, "mcpNativeCatalog.tsx");
    assert.match(readFileSync(catalogPath, "utf8"), /createA2uiV1NativeHost/);
    const duplicate = spawnSync(process.execPath, [cli, "scaffold-catalog", directory], {
      encoding: "utf8",
    });
    assert.equal(duplicate.status, 1);
    assert.match(duplicate.stderr, /Refusing to overwrite/);

    execFileSync(process.execPath, [
      cli,
      "scaffold-extension",
      "com.example/data-grid",
      "DataGrid",
      directory,
    ]);
    const manifest = JSON.parse(readFileSync(join(directory, "DataGrid.manifest.json"), "utf8"));
    const parsed = parseA2uiV1HostExtensionManifest(manifest);
    assert.equal(parsed.componentName, "com.example/data-grid:DataGrid");
    assert.match(readFileSync(join(directory, "DataGrid.tsx"), "utf8"), /semanticProps\.label/);

    const existingComponentPath = join(directory, "Existing.tsx");
    const pendingManifestPath = join(directory, "Existing.manifest.json");
    writeFileSync(existingComponentPath, "// keep\n");
    const partialCollision = spawnSync(
      process.execPath,
      [cli, "scaffold-extension", "com.example/existing", "Existing", directory],
      { encoding: "utf8" },
    );
    assert.equal(partialCollision.status, 1);
    assert.match(partialCollision.stderr, /Refusing to overwrite/);
    assert.equal(existsSync(pendingManifestPath), false);
    assert.equal(readFileSync(existingComponentPath, "utf8"), "// keep\n");
  } finally {
    rmSync(directory, { recursive: true });
  }
});
