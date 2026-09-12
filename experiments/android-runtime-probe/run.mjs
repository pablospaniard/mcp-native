import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildBundle } from "../ios-runtime-comparison/build-bundle.mjs";
import { suite, writeInputs } from "../ios-runtime-comparison/fixtures.mjs";

const directory = fileURLToPath(new URL("./", import.meta.url));
const packageName = "dev.mcpnative.androidprobe";
const dist = `${directory}dist`;

export function verifyAndroidReport(report, { runId, bundleSha256 }) {
  assert.equal(report.runId, runId, "The report must come from this invocation");
  assert.equal(report.bundleSha256, bundleSha256, "Android must execute the exact shared bundle");
  assert.deepEqual(Object.keys(report.cases).sort(), suite.cases.map(({ id }) => id).sort());
  for (const fixture of suite.cases) {
    assert.deepEqual(
      report.cases[fixture.id],
      fixture.steps.map(({ expect }) => expect),
      fixture.id,
    );
  }
  assert.deepEqual(report.checks, {
    malformedEnvelopesPreserveSession: true,
    inertUnicodeRoundTrip: true,
    unknownMimeRejected: true,
    closedAndStaleTickets: true,
    strictJsonAndDepthLimits: true,
    nestedLayoutBoundary: true,
    runningIsolateTermination: true,
    freshSessionAfterTermination: true,
    bridgeFailureClosesSession: true,
    singleInFlightAndPendingClose: true,
  });
  for (const feature of [
    "MESSAGE_PORTS",
    "PROMISE_RETURN",
    "ISOLATE_TERMINATION",
    "ISOLATE_MAX_HEAP_SIZE",
    "EVALUATE_WITHOUT_TRANSACTION_LIMIT",
  ]) {
    assert.equal(report.features[`JS_FEATURE_${feature}`], true, feature);
  }
  assert.equal(report.probe.number, "1.234,5");
  assert.equal(report.probe.plural, "other");
  assert.equal(report.probe.date, "09/12/2026");
  return report;
}

export async function runProbe(serial) {
  await buildBundle();
  mkdirSync(`${dist}/assets`, { recursive: true });
  writeInputs(`${dist}/assets/inputs.json`);
  for (const [from, to] of [
    ["../ios-runtime-comparison/dist/runtime.js", "runtime.js"],
    ["../ios-runtime-comparison/tool-result.json", "tool-result.json"],
    ["bridge.js", "bridge.js"],
  ])
    copyFileSync(new URL(from, import.meta.url), `${dist}/assets/${to}`);
  const bundle = readFileSync(`${dist}/assets/runtime.js`);
  const bundleSha256 = createHash("sha256").update(bundle).digest("hex");
  const devices = execFileSync("adb", ["devices"], { encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim().split(/\s+/u))
    .filter(([, state]) => state === "device")
    .map(([id]) => id);
  if (!serial) {
    assert.equal(
      devices.length,
      1,
      "Select one connected emulator: npm run experiment:android -- SERIAL",
    );
    [serial] = devices;
  }
  assert.ok(devices.includes(serial), "Selected Android device is not connected");
  // Performance remains deferred; avoid silently installing this experiment onto physical hardware.
  assert.match(serial, /^emulator-\d+$/u, "This command targets an Android emulator");
  execFileSync(`${directory}gradlew`, ["assembleDebug", "--no-daemon", "--console=plain"], {
    cwd: directory,
    stdio: "inherit",
    timeout: 600_000,
  });
  const adb = (args, options = {}) =>
    execFileSync("adb", ["-s", serial, ...args], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: 180_000,
      ...options,
    });
  adb(
    ["install", "-r", "-t", `${directory}build/outputs/apk/debug/android-runtime-probe-debug.apk`],
    { stdio: "inherit" },
  );
  const runId = randomUUID();
  const output = adb([
    "shell",
    "am",
    "instrument",
    "-w",
    "-e",
    "runId",
    runId,
    `${packageName}/.ProbeInstrumentation`,
  ]);
  writeFileSync(`${dist}/instrumentation.txt`, output);
  assert.match(output, /Android runtime probe passed; report.json written/u, output);
  const report = verifyAndroidReport(
    JSON.parse(adb(["exec-out", "run-as", packageName, "cat", "files/report.json"])),
    { runId, bundleSha256 },
  );
  writeFileSync(`${dist}/report.json`, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        cases: suite.cases.length,
        bundleBytes: bundle.length,
        bundleSha256,
        environment: report.environment,
        features: report.features,
        probe: report.probe,
        checks: report.checks,
      },
      null,
      2,
    ),
  );
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await runProbe(process.argv[2]);
