import { execFileSync } from "node:child_process";
import { copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { suite, verifyReport } from "./fixtures.mjs";
import { runComparison } from "./run.mjs";

await runComparison();

const directory = fileURLToPath(new URL("./", import.meta.url));
const listing = JSON.parse(
  execFileSync("xcrun", ["simctl", "list", "devices", "available", "--json"], { encoding: "utf8" }),
);
const devices = Object.entries(listing.devices)
  .filter(([runtime]) => Number(runtime.match(/iOS-(\d+)/u)?.[1] ?? 0) >= 18)
  .flatMap(([runtime, values]) => values.map((device) => ({ ...device, runtime })))
  .filter((device) => device.isAvailable && device.name.startsWith("iPhone"));
const requested = process.argv[2];
const device = requested
  ? devices.find(({ udid }) => udid === requested)
  : (devices.find(({ state }) => state === "Booted") ?? devices[0]);
if (!device) throw new Error("No matching iPhone simulator installed");
console.log(`Simulator: ${device.name}, ${device.runtime}, ${device.udid}`);
// Own the boot before XCTest so cold CI devices remain available for report collection.
execFileSync("xcrun", ["simctl", "bootstatus", device.udid, "-b"], { stdio: "inherit" });
execFileSync(
  "xcodebuild",
  [
    "-project",
    `${directory}RuntimeComparison.xcodeproj`,
    "-scheme",
    "RuntimeComparison",
    "-destination",
    `platform=iOS Simulator,id=${device.udid}`,
    // Collect from this exact device rather than an XCTest parallel worker clone.
    "-parallel-testing-enabled",
    "NO",
    "-derivedDataPath",
    `${directory}dist/DerivedData`,
    "test",
  ],
  { stdio: "inherit" },
);
const container = execFileSync(
  "xcrun",
  ["simctl", "get_app_container", device.udid, "dev.mcpnative.runtimecomparison", "data"],
  { encoding: "utf8" },
).trim();
const source = `${container}/Documents/conformance.json`;
const report = verifyReport(source);
copyFileSync(source, `${directory}dist/simulator-report.json`);
console.log(
  JSON.stringify(
    {
      simulator: device.name,
      runtime: device.runtime,
      casesPerEngine: suite.cases.length,
      probe: report.probe,
    },
    null,
    2,
  ),
);
