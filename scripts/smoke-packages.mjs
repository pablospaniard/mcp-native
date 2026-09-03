import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { verifyPackageArtifacts } from "./verify-package-artifacts.mjs";
import {
  verifyLocalUpgradeInstallation,
  verifyPublishedUpgradeBaseline,
} from "./verify-package-upgrade.mjs";

const packages = [
  "@mcp-native/core",
  "@mcp-native/mcp",
  "@mcp-native/a2ui",
  "@mcp-native/webview",
  "@mcp-native/react-native",
  "@mcp-native/host",
  "mcp-native",
];
const publishedUpgradePackages = packages.filter(
  (packageName) => packageName !== "@mcp-native/host",
);
const workspacePackageNames = new Set(packages);
const workspacePackageDirectories = [
  "packages/core",
  "packages/mcp",
  "packages/a2ui",
  "packages/webview",
  "packages/react-native",
  "packages/host",
  "packages/mcp-native",
];
const expectedVersion = JSON.parse(readFileSync("packages/core/package.json", "utf8")).version;
const rootLicenseText = readFileSync("LICENSE", "utf8");
const publishedUpgradeRange = "^0.9.0";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "mcp-native-packages-"));
const npmEnvironment = {
  ...process.env,
  npm_config_cache: join(temporaryDirectory, "npm-cache"),
};

try {
  const reactNativeDeclarations = readFileSync("packages/react-native/dist/index.d.ts", "utf8");
  for (const typeName of ["NativeAccessibilityRole", "NativeAccessibilityState"]) {
    if (!reactNativeDeclarations.includes(typeName)) {
      throw new Error(`@mcp-native/react-native declarations are missing ${typeName}`);
    }
  }
  const webviewDeclarations = ["index", "apps", "bridge", "sandbox"]
    .map((moduleName) => readFileSync(`packages/webview/dist/${moduleName}.d.ts`, "utf8"))
    .join("\n");
  for (const typeName of [
    "McpAppsBridge",
    "McpAppsNativeSandboxConfiguration",
    "McpAppsReactNativeWebViewProps",
  ]) {
    if (!webviewDeclarations.includes(typeName)) {
      throw new Error(`@mcp-native/webview declarations are missing ${typeName}`);
    }
  }
  const mixedDeclarations = readFileSync("packages/mcp-native/dist/mixed-surfaces.d.ts", "utf8");
  for (const typeName of [
    "McpNativeMixedSurfaceCoordinator",
    "McpNativeMixedSurfaceEnvironment",
    "McpNativeMixedSurfaceSnapshot",
  ]) {
    if (!mixedDeclarations.includes(typeName)) {
      throw new Error(`mcp-native declarations are missing ${typeName}`);
    }
  }
  const hostDeclarations = ["index", "controller", "results"]
    .map((moduleName) => readFileSync(`packages/host/dist/${moduleName}.d.ts`, "utf8"))
    .join("\n");
  for (const typeName of [
    "McpNativeHostController",
    "McpNativeHostSnapshot",
    "McpNativeHostClient",
    "McpNativeHostResult",
    "MCP_NATIVE_HOST_EXTENSION_CAPABILITIES",
    "resolveMcpNativeHostResult",
  ]) {
    if (!hostDeclarations.includes(typeName)) {
      throw new Error(`@mcp-native/host declarations are missing ${typeName}`);
    }
  }
  const mcpDeclarations = readFileSync("packages/mcp/dist/index.d.ts", "utf8");
  for (const typeName of [
    "MCP_SDK_MAX_RESOURCE_TEXT_LENGTH",
    "MCP_SDK_MAX_RESOURCE_BLOB_LENGTH",
    "MCP_SDK_MAX_RESOURCE_RESULT_STRING_CODE_UNITS",
    "McpSdkCacheMode",
    "McpSdkListToolsOptions",
    "McpSdkRequestOptions",
    "parseMcpSdkListToolsResult",
    "parseMcpSdkReadResourceResult",
  ]) {
    if (!mcpDeclarations.includes(typeName)) {
      throw new Error(`@mcp-native/mcp declarations are missing ${typeName}`);
    }
  }
  const oauthDeclarations = ["oauth", "oauth-error", "oauth-native"]
    .map((moduleName) => readFileSync(`packages/mcp/dist/${moduleName}.d.ts`, "utf8"))
    .join("\n");
  for (const typeName of [
    "McpNativeOAuthAuthorizationSession",
    "McpNativeOAuthPlatformSecureStore",
    "McpNativeOAuthSecretBackend",
  ]) {
    if (!oauthDeclarations.includes(typeName)) {
      throw new Error(`@mcp-native/mcp OAuth declarations are missing ${typeName}`);
    }
  }

  const localTarballs = new Map();
  const tarballs = packages.map((packageName) => {
    const output = execFileSync(
      "npm",
      ["pack", "--json", "--pack-destination", temporaryDirectory, "--workspace", packageName],
      { encoding: "utf8", env: npmEnvironment },
    );
    const [packed] = JSON.parse(output);

    if (!packed?.filename) {
      throw new Error(`npm pack did not return a filename for ${packageName}`);
    }

    const additionalRequiredFiles = [];
    if (packageName === "@mcp-native/mcp") {
      additionalRequiredFiles.push(
        "dist/oauth.d.ts",
        "dist/oauth.js",
        "dist/oauth-error.d.ts",
        "dist/oauth-error.js",
        "dist/oauth-native.d.ts",
        "dist/oauth-native.js",
      );
    }
    if (packageName === "@mcp-native/a2ui") {
      additionalRequiredFiles.push(
        "dist/legacy.d.ts",
        "dist/legacy.js",
        "schemas/7541f953050cd58b80f0bf5d85fe2d63192af305/CHECKSUMS.sha256",
        "schemas/7541f953050cd58b80f0bf5d85fe2d63192af305/PROVENANCE.md",
      );
    }
    if (packageName === "@mcp-native/react-native" || packageName === "mcp-native") {
      additionalRequiredFiles.push("dist/legacy.d.ts", "dist/legacy.js");
    }
    if (packageName === "mcp-native") {
      additionalRequiredFiles.push("dist/mixed-surfaces.d.ts", "dist/mixed-surfaces.js");
    }
    verifyPackageArtifacts({
      packageName,
      packageDirectory: workspacePackageDirectories[packages.indexOf(packageName)],
      packedFiles: packed.files,
      rootLicenseText,
      additionalRequiredFiles,
    });

    const tarball = join(temporaryDirectory, packed.filename);
    localTarballs.set(packageName, tarball);
    return tarball;
  });
  const reactOutput = execFileSync(
    "npm",
    ["pack", "--json", "--pack-destination", temporaryDirectory, "."],
    { cwd: join(process.cwd(), "node_modules", "react"), encoding: "utf8", env: npmEnvironment },
  );
  const [packedReact] = JSON.parse(reactOutput);

  if (!packedReact?.filename) {
    throw new Error("npm pack did not return a filename for the React peer dependency");
  }
  const reactTarball = join(temporaryDirectory, packedReact.filename);

  const externalDependencies = new Map();
  const collectExternalDependencies = (packageDirectory) => {
    const manifest = JSON.parse(readFileSync(join(packageDirectory, "package.json"), "utf8"));
    for (const dependencyName of Object.keys(manifest.dependencies ?? {})) {
      if (workspacePackageNames.has(dependencyName) || externalDependencies.has(dependencyName)) {
        continue;
      }
      const dependencyDirectory = join(process.cwd(), "node_modules", ...dependencyName.split("/"));
      externalDependencies.set(dependencyName, dependencyDirectory);
      collectExternalDependencies(dependencyDirectory);
    }
  };
  for (const packageDirectory of workspacePackageDirectories) {
    collectExternalDependencies(join(process.cwd(), packageDirectory));
  }
  const externalTarballs = [...externalDependencies.entries()].map(
    ([dependencyName, dependencyDirectory]) => {
      const output = execFileSync(
        "npm",
        ["pack", "--json", "--pack-destination", temporaryDirectory, "."],
        { cwd: dependencyDirectory, encoding: "utf8", env: npmEnvironment },
      );
      const [packed] = JSON.parse(output);
      if (!packed?.filename) {
        throw new Error(`npm pack did not return a filename for ${dependencyName}`);
      }
      return join(temporaryDirectory, packed.filename);
    },
  );

  const consumerDirectory = join(temporaryDirectory, "consumer");
  mkdirSync(consumerDirectory);
  writeFileSync(
    join(consumerDirectory, "package.json"),
    `${JSON.stringify({ name: "mcp-native-package-smoke", private: true, type: "module" }, null, 2)}\n`,
  );
  const smokeEntryPoint = join(consumerDirectory, "smoke.mjs");
  writeFileSync(
    smokeEntryPoint,
    `const packageNames = process.argv[2] === "local" ? ${JSON.stringify(packages)} : ${JSON.stringify(publishedUpgradePackages)};
const loaded = new Map(await Promise.all(packageNames.map(async (specifier) => [specifier, await import(specifier)])));
const core = loaded.get("@mcp-native/core");
const mcp = loaded.get("@mcp-native/mcp");
const a2ui = loaded.get("@mcp-native/a2ui");
const webview = loaded.get("@mcp-native/webview");
const reactNative = loaded.get("@mcp-native/react-native");
const umbrella = loaded.get("mcp-native");
const host = loaded.get("@mcp-native/host");
for (const [name, value] of [
  ["McpNativeRuntime", core.McpNativeRuntime],
  ["McpSdkClientAdapter", mcp.McpSdkClientAdapter],
  ["A2uiSurfaceStore", a2ui.A2uiSurfaceStore],
  ["createWebViewDocument", webview.createWebViewDocument],
  ["A2uiV1NativeSurface", reactNative.A2uiV1NativeSurface],
  ["McpNativeMixedSurfaceCoordinator", umbrella.McpNativeMixedSurfaceCoordinator],
  ...(host === undefined
    ? []
    : [
        ["createMcpNativeHostController", host.createMcpNativeHostController],
        ["resolveMcpNativeHostResult", host.resolveMcpNativeHostResult],
      ]),
]) {
  if (typeof value !== "function") {
    throw new Error(\`Missing migrated public API: \${name}\`);
  }
}
const oauthEntryPoint = import.meta.resolve("@mcp-native/mcp/oauth");
if (!oauthEntryPoint.endsWith("/dist/oauth.js")) {
  throw new Error(\`Unexpected @mcp-native/mcp/oauth entry point: \${oauthEntryPoint}\`);
}
for (const specifier of ["@mcp-native/a2ui/legacy", "@mcp-native/react-native/legacy", "mcp-native/legacy"]) {
  const legacy = await import(specifier);
  const expectedA2ui = specifier !== "@mcp-native/react-native/legacy";
  const expectedRenderer = specifier !== "@mcp-native/a2ui/legacy";
  if (
    (expectedA2ui && typeof legacy.parseA2uiSurface !== "function") ||
    (expectedRenderer && typeof legacy.McpNativeSurface !== "function")
  ) {
    throw new Error(\`Unexpected legacy entry point: \${specifier}\`);
  }
}\n`,
  );
  const runConsumerSmoke = (mode) =>
    execFileSync(process.execPath, [smokeEntryPoint, mode], {
      cwd: consumerDirectory,
      env: npmEnvironment,
      stdio: "inherit",
    });
  const readInstalledManifest = (packageName) =>
    JSON.parse(
      readFileSync(join(consumerDirectory, "node_modules", packageName, "package.json"), "utf8"),
    );

  execFileSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--legacy-peer-deps",
      "--fetch-retries=5",
      "--fetch-retry-maxtimeout=120000",
      reactTarball,
      ...externalTarballs,
      ...publishedUpgradePackages.map((packageName) => `${packageName}@${publishedUpgradeRange}`),
    ],
    {
      cwd: consumerDirectory,
      env: npmEnvironment,
      stdio: "inherit",
    },
  );
  const upgradeFromVersion = verifyPublishedUpgradeBaseline({
    packageNames: publishedUpgradePackages,
    readInstalledManifest,
  });
  runConsumerSmoke("published");

  execFileSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--offline",
      "--legacy-peer-deps",
      reactTarball,
      ...externalTarballs,
      ...tarballs,
    ],
    {
      cwd: consumerDirectory,
      env: npmEnvironment,
      stdio: "inherit",
    },
  );

  verifyLocalUpgradeInstallation({
    packageNames: packages,
    expectedVersion,
    localTarballs,
    consumerManifest: JSON.parse(readFileSync(join(consumerDirectory, "package.json"), "utf8")),
    readInstalledManifest,
  });

  for (const packageName of packages) {
    const installedPackageDirectory = join(consumerDirectory, "node_modules", packageName);
    const packageJsonPath = join(installedPackageDirectory, "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    if (packageJson.version !== expectedVersion) {
      throw new Error(`${packageName} has unexpected version ${packageJson.version}`);
    }
    if (readFileSync(join(installedPackageDirectory, "LICENSE"), "utf8") !== rootLicenseText) {
      throw new Error(`${packageName} installed LICENSE does not match the repository license`);
    }
  }
  runConsumerSmoke("local");

  console.log(
    `Verified ${packages.length} installable package tarballs and the ${upgradeFromVersion} upgrade path.`,
  );
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
