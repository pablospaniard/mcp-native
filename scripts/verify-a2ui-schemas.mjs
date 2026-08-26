import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const revision = "7541f953050cd58b80f0bf5d85fe2d63192af305";
const schemaDirectory = join("packages", "a2ui", "schemas", revision);
const checksumPath = join(schemaDirectory, "CHECKSUMS.sha256");

const expected = new Map(
  readFileSync(checksumPath, "utf8")
    .trim()
    .split("\n")
    .map((line, index) => {
      const match = /^([a-f0-9]{64})  (.+\.json)$/.exec(line);
      if (match === null) {
        throw new Error(`Invalid A2UI checksum entry at line ${index + 1}`);
      }
      return [match[2], match[1]];
    }),
);

const actualFiles = readdirSync(schemaDirectory, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
  .map((entry) => relative(schemaDirectory, join(entry.parentPath, entry.name)))
  .sort();

if (actualFiles.length !== expected.size) {
  throw new Error(
    `Expected ${expected.size} pinned A2UI JSON schemas, found ${actualFiles.length}`,
  );
}

for (const file of actualFiles) {
  const expectedHash = expected.get(file);
  if (expectedHash === undefined) {
    throw new Error(`Untracked A2UI schema file: ${file}`);
  }
  const actualHash = createHash("sha256")
    .update(readFileSync(join(schemaDirectory, file)))
    .digest("hex");
  if (actualHash !== expectedHash) {
    throw new Error(`Pinned A2UI schema checksum mismatch: ${file}`);
  }
}

const runtimeCopies = new Map([
  ["json/agent_to_renderer.json", "agent_to_renderer.json"],
  ["json/common_types.json", "common_types.json"],
  ["json/renderer_to_agent.json", "renderer_to_agent.json"],
  ["catalogs/basic/catalog.json", "catalog.json"],
]);
const runtimeDirectory = join("packages", "a2ui", "src", "v1", "vendor");
for (const [canonical, runtime] of runtimeCopies) {
  const canonicalBytes = readFileSync(join(schemaDirectory, canonical));
  const runtimeBytes = readFileSync(join(runtimeDirectory, runtime));
  if (!canonicalBytes.equals(runtimeBytes)) {
    throw new Error(`Runtime A2UI schema copy differs from pinned source: ${runtime}`);
  }
}

const revisionSource = readFileSync(join("packages", "a2ui", "src", "schema-revision.ts"), "utf8");
if (!revisionSource.includes(`A2UI_MCP_SCHEMA_REVISION = "${revision}"`)) {
  throw new Error("A2UI schema directory and exported revision are inconsistent");
}

console.log(`Verified ${actualFiles.length} A2UI schemas at ${revision}.`);
