import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parse as parseYaml } from "yaml";

import {
  A2uiSurfaceStore,
  createA2uiV1HostExtensionCapabilitySettings,
  createA2uiV1HostExtensionRegistry,
  negotiateA2uiV1HostExtensions,
} from "../packages/a2ui/dist/index.js";

import {
  addNativeHostFabricIosSources,
  createNativeHostPackageJson,
  enableNativeHostPhoneOrientations,
  NATIVE_HOST_REACT_NATIVE_MINIMUM_VERSION,
  NATIVE_HOST_WEBVIEW_VERSION,
  parseNativeHostArguments,
  registerNativeHostAndroidPackage,
  validateNativeHostOutput,
} from "../scripts/prepare-native-host.mjs";

test("native host arguments pin the minimum supported React Native version", () => {
  assert.equal(NATIVE_HOST_REACT_NATIVE_MINIMUM_VERSION, "0.86.0");
  assert.deepEqual(
    parseNativeHostArguments([
      "--output",
      "/tmp/mcp-native-host-test",
      "--react-native",
      NATIVE_HOST_REACT_NATIVE_MINIMUM_VERSION,
      "--skip-install",
    ]),
    {
      install: false,
      output: "/tmp/mcp-native-host-test",
      reactNativeVersion: NATIVE_HOST_REACT_NATIVE_MINIMUM_VERSION,
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
    /must be 0\.86\.0/,
  );
  assert.throws(
    () => parseNativeHostArguments(["--react-native", NATIVE_HOST_REACT_NATIVE_MINIMUM_VERSION]),
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
      dependencies: { react: "19.2.0", "react-native": "0.86.0" },
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
  assert.equal(packageJson.dependencies["react-native-webview"], NATIVE_HOST_WEBVIEW_VERSION);
  assert.match(packageJson.scripts["mcp-native:bundle:android"], /--platform android/);
  assert.match(packageJson.scripts["mcp-native:bundle:ios"], /--platform ios/);
  assert.equal(packageJson.scripts["mcp-native:typecheck"], "tsc --noEmit");
  assert.deepEqual(packageJson.codegenConfig, {
    name: "McpNativeFixtureSpec",
    type: "components",
    jsSrcsDir: "specs",
    android: {
      javaPackageName: "io.github.pablospaniard.mcpnativefixture.fabric",
    },
    ios: {
      componentProvider: {
        McpNativeStatusBadge: "RCTMcpNativeStatusBadge",
      },
    },
  });
});

test("generated hosts register the local Fabric component on Android and iOS", () => {
  const android =
    registerNativeHostAndroidPackage(`import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
}`);
  assert.match(android, /import io\.github\.pablospaniard.*McpNativeStatusBadgePackage/);
  assert.match(android, /add\(McpNativeStatusBadgePackage\(\)\)/);
  assert.throws(() => registerNativeHostAndroidPackage("class MainApplication"), /pinned template/);

  const ios = addNativeHostFabricIosSources(`
		761780ED2CA45674006654EE /* AppDelegate.swift in Sources */ = {isa = PBXBuildFile; fileRef = 761780EC2CA45674006654EE /* AppDelegate.swift */; };
		761780EC2CA45674006654EE /* AppDelegate.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; name = AppDelegate.swift; path = McpNativeAccessibilityHost/AppDelegate.swift; sourceTree = "<group>"; };
				761780EC2CA45674006654EE /* AppDelegate.swift */,
				761780ED2CA45674006654EE /* AppDelegate.swift in Sources */,
`);
  assert.match(ios, /RCTMcpNativeStatusBadge\.mm in Sources/);
  assert.match(ios, /RCTMcpNativeStatusBadge\.h/);
  assert.throws(() => addNativeHostFabricIosSources("// project"), /pinned template/);
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
  assert.match(source, /milestone-7-surface\.json/);
  assert.match(source, /milestone-8-surface\.json/);
  assert.match(source, /McpNativeStatusBadgeNativeComponent/);
  assert.match(source, /McpNativeMixedSurfaceCoordinator/);
  assert.match(source, /createMcpNativeMixedA2uiRegion/);
  assert.match(source, /createMcpNativeMixedMcpAppsRegion/);
  assert.match(source, /createMcpAppsReactNativeWebViewProps/);
  assert.match(source, /from "react-native-webview"/);
  assert.match(source, /Two sibling regions follow host-authored accessibility order/);
  assert.match(source, /onContentProcessDidTerminate/);
  assert.match(source, /hostExtensionPolicy=/);
  assert.match(source, /mediaPolicy=/);
  assert.match(source, /imagePolicy=/);
  assert.match(source, /Network loading is intentionally disabled/);
});

test("native fixture includes Codegen, UIKit, and Android View implementations", () => {
  const spec = readFileSync(
    "tests/native-host/specs/McpNativeStatusBadgeNativeComponent.ts",
    "utf8",
  );
  const iosHeader = readFileSync("tests/native-host/fabric/ios/RCTMcpNativeStatusBadge.h", "utf8");
  const ios = readFileSync("tests/native-host/fabric/ios/RCTMcpNativeStatusBadge.mm", "utf8");
  const android = readFileSync(
    "tests/native-host/fabric/android/McpNativeStatusBadgeViewManager.kt",
    "utf8",
  );
  assert.match(spec, /codegenNativeComponent<NativeProps>/);
  assert.match(iosHeader, /RCTViewComponentView/);
  assert.match(ios, /UILabel/);
  assert.match(android, /McpNativeStatusBadgeManagerInterface/);
  assert.match(android, /SimpleViewManager<McpNativeStatusBadgeView>/);
});

test("the Milestone 8 native fixture parses with its exact negotiated local extension", () => {
  const manifest = JSON.parse(
    readFileSync("tests/fixtures/a2ui-v1/status-badge-extension-manifest.json", "utf8"),
  );
  const fixture = JSON.parse(
    readFileSync("tests/fixtures/a2ui-v1/milestone-8-surface.json", "utf8"),
  );
  const settings = createA2uiV1HostExtensionCapabilitySettings([manifest], "ios");
  const negotiation = negotiateA2uiV1HostExtensions(settings, settings);
  const registry = createA2uiV1HostExtensionRegistry({
    platform: "ios",
    manifests: [manifest],
    negotiation,
  });
  const store = new A2uiSurfaceStore({ hostExtensions: registry });
  store.apply(fixture);
  assert.equal(store.get("milestone-8")?.components.size, 5);
});

test("CI builds the minimum supported React Native host with the default engine", () => {
  const ciSource = readFileSync(".github/workflows/ci.yml", "utf8");
  const platformSource = readFileSync(".github/workflows/native-platform.yml", "utf8");
  const ci = parseYaml(ciSource);
  const platform = parseYaml(platformSource);
  assert.match(ci.jobs["native-host-bundle"].steps[3].run, /--react-native 0\.86\.0/);
  assert.match(platform.jobs.android.steps[5].run, /--react-native 0\.86\.0/);
  assert.match(platform.jobs.ios.steps[3].run, /--react-native 0\.86\.0/);
  assert.equal(ci.jobs["native-host-bundle"].strategy, undefined);
  assert.equal(platform.jobs.android.strategy, undefined);
  assert.equal(platform.jobs.ios.strategy, undefined);
  assert.equal(Object.hasOwn(platform.on, "pull_request"), true);
  assert.equal(Object.hasOwn(platform.on, "workflow_dispatch"), true);
  const reactNativePackage = JSON.parse(readFileSync("packages/react-native/package.json", "utf8"));
  const umbrellaPackage = JSON.parse(readFileSync("packages/mcp-native/package.json", "utf8"));
  assert.equal(reactNativePackage.peerDependencies["react-native"], ">=0.86.0 <1");
  assert.equal(umbrellaPackage.peerDependencies["react-native"], ">=0.86.0 <1");
  const androidSdkStep = platform.jobs.android.steps.find(
    (step) => step.name === "Install Android 37 SDK",
  );
  assert.match(androidSdkStep.run, /ANDROID_HOME.*cmdline-tools\/latest\/bin\/sdkmanager/);
  assert.match(androidSdkStep.run, /platforms;android-37\.0/);
  assert.match(androidSdkStep.run, /build-tools;37\.0\.0/);
  assert.doesNotMatch(`${ciSource}\n${platformSource}`, /js-engine|JavaScriptCore|JSC/);
  assert.doesNotMatch(`${ciSource}\n${platformSource}`, /actions\/(?:checkout|setup-node)@v4/);
  assert.doesNotMatch(platformSource, /actions\/(?:setup-java|upload-artifact)@v4/);
});
