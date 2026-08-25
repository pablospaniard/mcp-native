import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const conformanceEntry = fileURLToPath(
  new URL("../node_modules/@modelcontextprotocol/conformance/dist/index.js", import.meta.url),
);
const conformancePackage = JSON.parse(
  readFileSync(
    new URL("../node_modules/@modelcontextprotocol/conformance/package.json", import.meta.url),
    "utf8",
  ),
);
const manifest = JSON.parse(
  readFileSync(new URL("../tests/conformance/client-scenarios.json", import.meta.url), "utf8"),
);
const clientPath = fileURLToPath(
  new URL("../tests/conformance/mcp-native-client.mjs", import.meta.url),
);

assert.equal(
  conformancePackage.version,
  manifest.packageVersion,
  `Expected @modelcontextprotocol/conformance ${manifest.packageVersion}, received ${conformancePackage.version}`,
);
assert.match(manifest.protocolVersion, /^\d{4}-\d{2}-\d{2}$/u);
assert.ok(manifest.scenarios.length > 0, "At least one conformance scenario must be pinned");

const quoteCommandArgument = (value) =>
  `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
const clientCommand = `${quoteCommandArgument(process.execPath)} ${quoteCommandArgument(clientPath)}`;

for (const scenario of manifest.scenarios) {
  console.log(`\n[mcp conformance] ${scenario} (${manifest.protocolVersion})`);
  const result = spawnSync(
    process.execPath,
    [
      conformanceEntry,
      "client",
      "--command",
      clientCommand,
      "--scenario",
      scenario,
      "--spec-version",
      manifest.protocolVersion,
      "--timeout",
      "30000",
    ],
    { cwd: repositoryRoot, env: process.env, stdio: "inherit" },
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
