import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

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
const requirements = parseYaml(
  readFileSync(
    new URL(
      `../node_modules/@modelcontextprotocol/conformance/${manifest.requirementsFixture}`,
      import.meta.url,
    ),
    "utf8",
  ),
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
assertOfficialRequirementsAccountedFor(manifest, requirements);

function assertOfficialRequirementsAccountedFor(pinnedManifest, officialRequirements) {
  assert.ok(
    officialRequirements && typeof officialRequirements === "object",
    "Official requirements fixture must contain an object",
  );
  assert.ok(Array.isArray(officialRequirements.client), "Official client requirements are missing");
  assert.ok(
    Array.isArray(officialRequirements.not_scored),
    "Official not_scored requirements are missing",
  );
  assert.ok(
    Array.isArray(pinnedManifest.excludedRequirements),
    "The pinned manifest must explain excluded requirements",
  );

  const selected = new Set(pinnedManifest.scenarios);
  const scored = new Set(officialRequirements.client);
  const visibleUnscored = new Set(
    officialRequirements.not_scored
      .filter((entry) => entry?.leg === "client")
      .map((entry) => entry.scenario),
  );

  for (const scenario of selected) {
    assert.ok(
      scored.has(scenario) || visibleUnscored.has(scenario),
      `Pinned scenario ${scenario} is absent from the official requirements fixture`,
    );
  }

  const exclusionMatches = new Map(
    pinnedManifest.excludedRequirements.map((exclusion) => {
      assert.equal(typeof exclusion.reason, "string");
      assert.ok(exclusion.reason.length > 0, "Each requirements exclusion needs a reason");
      assert.ok(
        typeof exclusion.scenario === "string" || typeof exclusion.prefix === "string",
        "Each requirements exclusion needs a scenario or prefix",
      );
      return [exclusion, 0];
    }),
  );

  for (const scenario of scored) {
    if (selected.has(scenario)) {
      continue;
    }
    const exclusion = pinnedManifest.excludedRequirements.find(
      (candidate) =>
        candidate.scenario === scenario ||
        (typeof candidate.prefix === "string" && scenario.startsWith(candidate.prefix)),
    );
    assert.ok(
      exclusion,
      `Official client requirement ${scenario} is neither selected nor excluded`,
    );
    exclusionMatches.set(exclusion, exclusionMatches.get(exclusion) + 1);
  }

  for (const [exclusion, matches] of exclusionMatches) {
    assert.ok(
      matches > 0,
      `Requirements exclusion ${exclusion.scenario ?? exclusion.prefix} matches no scored scenario`,
    );
  }
}

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
