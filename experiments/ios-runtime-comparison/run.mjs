import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { suite, writeInputs, verifyReport } from "./fixtures.mjs";
import { buildBundle } from "./build-bundle.mjs";

export async function runComparison() {
  await buildBundle();
  const directory = fileURLToPath(new URL("./", import.meta.url));
  const dist = `${directory}dist`;
  mkdirSync(dist, { recursive: true });
  writeInputs(`${dist}/inputs.json`);
  const sources = ["JSON", "NativeSession", "JavaScriptSession", "Host", "Corpus"].map(
    (name) => `${directory}Sources/${name}.swift`,
  );
  execFileSync(
    "swiftc",
    [
      "-O",
      "-framework",
      "JavaScriptCore",
      ...sources,
      `${directory}Sources/Runner.swift`,
      "-o",
      `${dist}/runner`,
    ],
    { stdio: "inherit" },
  );
  const output = execFileSync(
    `${dist}/runner`,
    [`${dist}/runtime.js`, `${dist}/inputs.json`, `${directory}tool-result.json`],
    {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  writeFileSync(`${dist}/report.json`, output);
  const report = verifyReport(`${dist}/report.json`);
  report.bundleBytes = statSync(`${dist}/runtime.js`).size;
  report.runnerBytes = statSync(`${dist}/runner`).size;
  writeFileSync(`${dist}/report.json`, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        casesPerEngine: suite.cases.length,
        probe: report.probe,
        lifecycle: report.lifecycle,
        bundleBytes: report.bundleBytes,
        runnerBytes: report.runnerBytes,
      },
      null,
      2,
    ),
  );
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await runComparison();
