import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parse as parseYaml } from "yaml";

import {
  createNativeHostPackageJson,
  enableNativeHostPhoneOrientations,
  NATIVE_HOST_REACT_NATIVE_VERSIONS,
  parseNativeHostArguments,
  validateNativeHostOutput,
} from "../scripts/prepare-native-host.mjs";
import {
  NATIVE_ACCESSIBILITY_CASES,
  NATIVE_ACCESSIBILITY_EVIDENCE_PATH,
  validateNativeAccessibilityEvidence,
} from "../scripts/verify-native-accessibility-evidence.mjs";

const nativeEvidence = JSON.parse(readFileSync(NATIVE_ACCESSIBILITY_EVIDENCE_PATH, "utf8"));

test("native host arguments pin maintained React Native lines and require temporary output", () => {
  assert.deepEqual(
    parseNativeHostArguments([
      "--output",
      "/tmp/mcp-native-host-test",
      "--react-native",
      NATIVE_HOST_REACT_NATIVE_VERSIONS[0],
      "--skip-install",
    ]),
    {
      install: false,
      output: "/tmp/mcp-native-host-test",
      reactNativeVersion: NATIVE_HOST_REACT_NATIVE_VERSIONS[0],
    },
  );
  assert.throws(
    () =>
      parseNativeHostArguments([
        "--output",
        "/tmp/mcp-native-host-test",
        "--react-native",
        "latest",
      ]),
    /must be one of/,
  );
  assert.throws(
    () => parseNativeHostArguments(["--react-native", NATIVE_HOST_REACT_NATIVE_VERSIONS[0]]),
    /requires --output/,
  );
});

test("native host output cannot replace repository or existing paths", () => {
  assert.throws(() => validateNativeHostOutput(process.cwd()), /outside the repository/);
  assert.throws(() => validateNativeHostOutput("package.json"), /outside the repository/);
  assert.throws(() => validateNativeHostOutput("/tmp"), /Refusing to replace existing/);
});

test("generated host manifests install local tarballs and expose reproducible checks", () => {
  const packageJson = createNativeHostPackageJson(
    {
      name: "host",
      dependencies: { react: "19.2.0", "react-native": "0.87.1" },
      scripts: { start: "react-native start" },
    },
    {
      "@mcp-native/a2ui": "mcp-native-a2ui-0.4.0.tgz",
      "@mcp-native/core": "mcp-native-core-0.4.0.tgz",
      "@mcp-native/react-native": "mcp-native-react-native-0.4.0.tgz",
    },
  );
  assert.equal(
    packageJson.dependencies["@mcp-native/react-native"],
    "file:./mcp-native-packages/mcp-native-react-native-0.4.0.tgz",
  );
  assert.match(packageJson.scripts["mcp-native:bundle:android"], /--platform android/);
  assert.match(packageJson.scripts["mcp-native:bundle:ios"], /--platform ios/);
  assert.equal(packageJson.scripts["mcp-native:typecheck"], "tsc --noEmit");
});

test("generated iPhone hosts support both landscape orientations", () => {
  const source = `\t<key>UISupportedInterfaceOrientations</key>
\t<array>
\t\t<string>UIInterfaceOrientationPortrait</string>
\t</array>`;
  const updated = enableNativeHostPhoneOrientations(source);
  assert.match(updated, /UIInterfaceOrientationLandscapeLeft/);
  assert.match(updated, /UIInterfaceOrientationLandscapeRight/);
  assert.throws(() => enableNativeHostPhoneOrientations("<plist/>"), /pinned portrait-only block/);
});

test("native fixture respects platform safe areas without an extra root focus target", () => {
  const source = readFileSync("tests/native-host/App.tsx", "utf8");
  assert.match(
    source,
    /import \{ SafeAreaProvider, SafeAreaView \} from "react-native-safe-area-context"/,
  );
  assert.match(source, /<SafeAreaProvider>/);
  assert.match(source, /<SafeAreaView edges=\{\["top", "right", "bottom", "left"\]\}/);
  assert.doesNotMatch(source, /<ScrollView\s+accessibilityLabel=/);
});

test("recorded native evidence completes the scoped release gate", () => {
  assert.deepEqual(validateNativeAccessibilityEvidence(nativeEvidence, { strict: true }), {
    complete: true,
    passedRows: 2,
    requiredRows: 2,
  });

  const incomplete = structuredClone(nativeEvidence);
  incomplete.matrix[0].result = "not-run";
  incomplete.matrix[0].cases.announcements = "not-run";
  assert.throws(
    () => validateNativeAccessibilityEvidence(incomplete, { strict: true }),
    /must be "pass" for a release/,
  );
});

test("complete native evidence passes only with exact cases and reviewable artifacts", () => {
  const complete = structuredClone(nativeEvidence);
  for (const [index, row] of complete.matrix.entries()) {
    row.assistiveTechnologyVersion = "test-version";
    row.locale = "en-US";
    row.textSize = "normal and all supported larger sizes";
    row.device = `Test device ${index}`;
    row.revision = "a".repeat(40);
    row.date = "2026-08-27";
    row.tester = "Test operator";
    row.result = "pass";
    row.evidence = [`https://example.com/evidence/${row.id}`];
    row.cases = Object.fromEntries(NATIVE_ACCESSIBILITY_CASES.map((name) => [name, "pass"]));
  }
  assert.deepEqual(validateNativeAccessibilityEvidence(complete, { strict: true }), {
    complete: true,
    passedRows: 2,
    requiredRows: 2,
  });

  complete.matrix[0].cases["remote-code"] = "pass";
  assert.throws(
    () => validateNativeAccessibilityEvidence(complete, { strict: true }),
    /unknown field "remote-code"/,
  );
});

test("native evidence rejects unsafe or missing artifact references", () => {
  const invalid = structuredClone(nativeEvidence);
  invalid.matrix[0].evidence = ["../outside.mov"];
  assert.throws(
    () => validateNativeAccessibilityEvidence(invalid),
    /safe repository-relative path/,
  );

  invalid.matrix[0].evidence = ["https://"];
  assert.throws(() => validateNativeAccessibilityEvidence(invalid), /valid HTTPS URL/);
});

test("native evidence rejects normalized impossible calendar dates", () => {
  const invalid = structuredClone(nativeEvidence);
  const row = invalid.matrix[0];
  row.assistiveTechnologyVersion = "test-version";
  row.locale = "en-US";
  row.textSize = "normal and all supported larger sizes";
  row.device = "Test device";
  row.revision = "a".repeat(40);
  row.date = "2026-02-30";
  row.tester = "Test operator";
  row.result = "pass";
  row.evidence = ["https://example.com/evidence/ios-minimum"];
  row.cases = Object.fromEntries(NATIVE_ACCESSIBILITY_CASES.map((name) => [name, "pass"]));

  assert.throws(() => validateNativeAccessibilityEvidence(invalid), /ISO calendar date/);
});

test("native evidence cannot relabel a required platform row", () => {
  const invalid = structuredClone(nativeEvidence);
  invalid.matrix[0].reactNative = "0.86.3";
  assert.throws(
    () => validateNativeAccessibilityEvidence(invalid),
    /reactNative must be exactly "0.87.1"/,
  );

  invalid.matrix[0].reactNative = "0.87.1";
  invalid.matrix[0].environment = "physical device";
  assert.throws(
    () => validateNativeAccessibilityEvidence(invalid),
    /environment must be exactly "simulator"/,
  );
});

test("CI pins both maintained React Native host lines and release evidence", () => {
  const ci = parseYaml(readFileSync(".github/workflows/ci.yml", "utf8"));
  const platform = parseYaml(readFileSync(".github/workflows/native-platform.yml", "utf8"));
  assert.deepEqual(ci.jobs["native-host-bundle"].strategy.matrix["react-native"], [
    "0.87.1",
    "0.86.3",
  ]);
  assert.deepEqual(platform.jobs.android.strategy.matrix["react-native"], ["0.87.1", "0.86.3"]);
  assert.deepEqual(platform.jobs.ios.strategy.matrix["react-native"], ["0.87.1", "0.86.3"]);
  const androidSdkStep = platform.jobs.android.steps.find(
    (step) => step.name === "Install Android 37 SDK",
  );
  assert.match(androidSdkStep.run, /ANDROID_HOME.*cmdline-tools\/latest\/bin\/sdkmanager/);
  assert.match(androidSdkStep.run, /platforms;android-37\.0/);
  assert.match(androidSdkStep.run, /build-tools;37\.0\.0/);

  const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
  assert.match(rootPackage.scripts["release:verify"], /native:evidence:verify/);
  assert.match(rootPackage.scripts["release:verify"], /oauth:evidence:verify/);
});
