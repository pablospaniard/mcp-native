import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const NATIVE_HOST_CLI_VERSION = "20.2.0";
export const NATIVE_HOST_REACT_NATIVE_VERSIONS = Object.freeze(["0.87.1", "0.86.3"]);
export const NATIVE_HOST_NAME = "McpNativeAccessibilityHost";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = realpathSync(resolve(scriptDirectory, ".."));
const packageDirectories = Object.freeze({
  "@mcp-native/a2ui": "packages/a2ui",
  "@mcp-native/core": "packages/core",
  "@mcp-native/react-native": "packages/react-native",
});

export function parseNativeHostArguments(arguments_) {
  const options = { install: true };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--output") {
      options.output = arguments_[++index];
      continue;
    }
    if (argument === "--react-native") {
      options.reactNativeVersion = arguments_[++index];
      continue;
    }
    if (argument === "--skip-install") {
      options.install = false;
      continue;
    }
    throw new Error(`Unknown native-host argument ${JSON.stringify(argument)}`);
  }

  if (typeof options.output !== "string" || options.output.length === 0) {
    throw new Error("Native-host preparation requires --output <temporary-directory>");
  }
  if (!NATIVE_HOST_REACT_NATIVE_VERSIONS.includes(options.reactNativeVersion)) {
    throw new Error(
      `--react-native must be one of ${NATIVE_HOST_REACT_NATIVE_VERSIONS.join(", ")}`,
    );
  }
  return options;
}

export function validateNativeHostOutput(output, root = repositoryRoot) {
  const resolvedOutput = resolve(output);
  const relativeToRepository = relative(root, resolvedOutput);
  if (
    relativeToRepository === "" ||
    (!relativeToRepository.startsWith(`..${sep}`) && relativeToRepository !== "..")
  ) {
    throw new Error("The generated native host must live outside the repository workspace");
  }
  if (existsSync(resolvedOutput)) {
    throw new Error(`Refusing to replace existing native-host output ${resolvedOutput}`);
  }
  return resolvedOutput;
}

export function createNativeHostPackageJson(source, tarballs) {
  const dependencies = { ...source.dependencies };
  for (const [packageName, filename] of Object.entries(tarballs)) {
    dependencies[packageName] = `file:./mcp-native-packages/${filename}`;
  }
  return {
    ...source,
    private: true,
    dependencies,
    scripts: {
      ...source.scripts,
      "mcp-native:bundle:android":
        "react-native bundle --platform android --dev false --entry-file index.js --bundle-output build/mcp-native/android/index.bundle --assets-dest build/mcp-native/android/assets",
      "mcp-native:bundle:ios":
        "react-native bundle --platform ios --dev false --entry-file index.js --bundle-output build/mcp-native/ios/main.jsbundle --assets-dest build/mcp-native/ios/assets",
      "mcp-native:typecheck": "tsc --noEmit",
    },
  };
}

export function enableNativeHostPhoneOrientations(source) {
  const portraitOnly = `\t<key>UISupportedInterfaceOrientations</key>
\t<array>
\t\t<string>UIInterfaceOrientationPortrait</string>
\t</array>`;
  const allPhoneOrientations = `\t<key>UISupportedInterfaceOrientations</key>
\t<array>
\t\t<string>UIInterfaceOrientationPortrait</string>
\t\t<string>UIInterfaceOrientationLandscapeLeft</string>
\t\t<string>UIInterfaceOrientationLandscapeRight</string>
\t</array>`;
  if (!source.includes(portraitOnly)) {
    throw new Error("Generated native host Info.plist must contain the pinned portrait-only block");
  }
  return source.replace(portraitOnly, allPhoneOrientations);
}

export function prepareNativeHost({ output, reactNativeVersion, install = true, run = spawnSync }) {
  const resolvedOutput = validateNativeHostOutput(output);
  mkdirSync(dirname(resolvedOutput), { recursive: true });

  runChecked(run, "npm", ["run", "build"], repositoryRoot);
  runChecked(
    run,
    "npx",
    [
      "--yes",
      `@react-native-community/cli@${NATIVE_HOST_CLI_VERSION}`,
      "init",
      NATIVE_HOST_NAME,
      "--version",
      reactNativeVersion,
      "--directory",
      resolvedOutput,
      "--title",
      "MCP Native Accessibility Fixture",
      "--package-name",
      "io.github.pablospaniard.mcpnativefixture",
      "--pm",
      "npm",
      "--skip-install",
      "--install-pods",
      "false",
      "--skip-git-init",
      "true",
    ],
    repositoryRoot,
  );

  const artifactDirectory = resolve(resolvedOutput, "mcp-native-packages");
  mkdirSync(artifactDirectory);
  const tarballs = {};
  for (const [packageName, packageDirectory] of Object.entries(packageDirectories)) {
    const result = runChecked(
      run,
      "npm",
      [
        "pack",
        resolve(repositoryRoot, packageDirectory),
        "--json",
        "--pack-destination",
        artifactDirectory,
      ],
      repositoryRoot,
      { capture: true },
    );
    const packResult = JSON.parse(result.stdout);
    if (!Array.isArray(packResult) || packResult.length !== 1) {
      throw new Error(`Expected one packed artifact for ${packageName}`);
    }
    const [{ filename }] = packResult;
    if (typeof filename !== "string" || filename.length === 0) {
      throw new Error(`npm pack did not return a filename for ${packageName}`);
    }
    tarballs[packageName] = filename;
  }

  cpSync(resolve(repositoryRoot, "tests/native-host/App.tsx"), resolve(resolvedOutput, "App.tsx"));
  cpSync(
    resolve(repositoryRoot, "tests/fixtures/a2ui-v1/accessibility-surface.json"),
    resolve(resolvedOutput, "accessibility-surface.json"),
  );
  cpSync(
    resolve(repositoryRoot, "tests/fixtures/a2ui-v1/milestone-7-surface.json"),
    resolve(resolvedOutput, "milestone-7-surface.json"),
  );

  const infoPlistPath = resolve(resolvedOutput, "ios", NATIVE_HOST_NAME, "Info.plist");
  writeFileSync(
    infoPlistPath,
    enableNativeHostPhoneOrientations(readFileSync(infoPlistPath, "utf8")),
  );

  const packageJsonPath = resolve(resolvedOutput, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  writeFileSync(
    packageJsonPath,
    `${JSON.stringify(createNativeHostPackageJson(packageJson, tarballs), null, 2)}\n`,
  );

  if (install) {
    runChecked(run, "npm", ["install"], resolvedOutput);
    runChecked(run, "npm", ["run", "mcp-native:typecheck"], resolvedOutput);
  }

  const result = {
    cliVersion: NATIVE_HOST_CLI_VERSION,
    installed: install,
    output: resolvedOutput,
    reactNativeVersion,
    tarballs,
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function runChecked(run, command, arguments_, cwd, { capture = false } = {}) {
  const result = run(command, arguments_, {
    cwd,
    encoding: capture ? "utf8" : undefined,
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${arguments_.join(" ")} failed with exit code ${result.status}`);
  }
  return result;
}

const invokedPath = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href;
if (import.meta.url === invokedPath) {
  prepareNativeHost(parseNativeHostArguments(process.argv.slice(2)));
}
