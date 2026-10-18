import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { A2UI_MCP_SCHEMA_REVISION } from "../packages/a2ui/dist/index.js";
import { MCP_NATIVE_PROTOCOL_REVISION } from "../packages/mcp/dist/index.js";
import {
  MCP_APPS_PROTOCOL_VERSION,
  MCP_APPS_SOURCE_REVISION,
} from "../packages/webview/dist/index.js";

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

assert.equal(MCP_NATIVE_PROTOCOL_REVISION, mcp.selectedProtocol);
assert.equal(A2UI_MCP_SCHEMA_REVISION, a2ui.selectedSource);
assert.equal(MCP_APPS_PROTOCOL_VERSION, apps.selectedProtocol);
assert.equal(MCP_APPS_SOURCE_REVISION, apps.selectedSource);

const a2uiConformance = readFileSync("docs/a2ui-v1-conformance.md", "utf8");
for (const unsupported of ["callRendererFunction", "agentFunctionResponse"]) {
  assert.ok(
    a2uiConformance.includes(unsupported),
    `A2UI deferral must document unsupported ${unsupported}`,
  );
}

console.log(`Verified protocol profile audit from ${audit.reviewedOn}.`);
