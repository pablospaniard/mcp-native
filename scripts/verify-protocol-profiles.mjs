import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const audit = JSON.parse(readFileSync("docs/protocol-profile-audit.json", "utf8"));
const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));

assert.equal(audit.formatVersion, 1);
assert.match(audit.reviewedOn, /^\d{4}-\d{2}-\d{2}$/);
assert.deepEqual(Object.keys(audit.profiles), ["mcp", "a2ui", "mcpApps"]);

const mcp = audit.profiles.mcp;
const a2ui = audit.profiles.a2ui;
const apps = audit.profiles.mcpApps;
assert.equal(mcp.selectedProtocol, "2026-07-28");
assert.equal(a2ui.selectedSource, "8ff4651232ab0e02b0123730b502711170637a3a");
assert.equal(a2ui.decision, "defer");
assert.equal(apps.selectedProtocol, "2026-01-26");
assert.equal(apps.selectedPackage, "2.0.3");
assert.equal(apps.selectedSource, "82221c0c8ce7661efa6771c9d461511b1650495f");

assert.equal(manifest.devDependencies["@modelcontextprotocol/ext-apps"], apps.selectedPackage);
assert.equal(
  lock.packages["node_modules/@modelcontextprotocol/ext-apps"].version,
  apps.selectedPackage,
);

const sources = [
  readFileSync("packages/mcp/src/index.ts", "utf8"),
  readFileSync("packages/a2ui/src/schema-revision.ts", "utf8"),
  readFileSync("packages/webview/src/apps.ts", "utf8"),
];
for (const [value, source] of [
  [mcp.selectedProtocol, sources[0]],
  [a2ui.selectedSource, sources[1]],
  [apps.selectedProtocol, sources[2]],
  [apps.selectedSource, sources[2]],
]) {
  assert.ok(source.includes(value), `Runtime source is missing audited profile value ${value}`);
}

const a2uiConformance = readFileSync("docs/a2ui-v1-conformance.md", "utf8");
for (const unsupported of ["callRendererFunction", "agentFunctionResponse"]) {
  assert.ok(
    a2uiConformance.includes(unsupported),
    `A2UI deferral must document unsupported ${unsupported}`,
  );
}

console.log(`Verified protocol profile audit from ${audit.reviewedOn}.`);
