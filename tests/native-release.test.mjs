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

test("CI pins both maintained React Native host lines without gating releases on app results", () => {
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
  assert.doesNotMatch(rootPackage.scripts.check, /evidence/);
  assert.doesNotMatch(rootPackage.scripts["release:verify"], /evidence/);
});
