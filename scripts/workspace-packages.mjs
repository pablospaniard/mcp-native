import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Dependency order and historical membership live here; package names/privacy come from manifests.
export const workspaceInventory = Object.freeze([
  { directory: "packages/core", upgradeBaseline: true },
  { directory: "packages/mcp", upgradeBaseline: true },
  { directory: "packages/a2ui", upgradeBaseline: true },
  {
    directory: "packages/renderer-core",
    upgradeBaseline: false,
    optionalInHistoricalCheckout: true,
  },
  { directory: "packages/webview", upgradeBaseline: true },
  { directory: "packages/react-native", upgradeBaseline: true },
  { directory: "packages/host", upgradeBaseline: true },
  { directory: "packages/mcp-native", upgradeBaseline: true },
]);

export function loadWorkspacePackages(root = process.cwd()) {
  return workspaceInventory.flatMap((entry) => {
    const path = resolve(root, entry.directory, "package.json");
    if (entry.optionalInHistoricalCheckout && !existsSync(path)) return [];
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    if (typeof manifest.name !== "string" || typeof manifest.version !== "string") {
      throw new Error(`Invalid workspace package manifest: ${path}`);
    }
    return [{ ...entry, manifest }];
  });
}

export function workspaceDependencyClosure(name, entries = loadWorkspacePackages()) {
  const byName = new Map(entries.map((entry) => [entry.manifest.name, entry]));
  const selected = new Set();
  function visit(dependency) {
    if (selected.has(dependency)) return;
    const entry = byName.get(dependency);
    if (!entry) throw new Error(`Missing workspace dependency ${dependency}`);
    selected.add(dependency);
    for (const child of Object.keys(entry.manifest.dependencies ?? {})) {
      if (child.startsWith("@mcp-native/") || child === "mcp-native") visit(child);
    }
  }
  visit(name);
  return entries.filter(({ manifest }) => selected.has(manifest.name));
}
