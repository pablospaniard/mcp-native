import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { verifyPackageArtifacts } from "./verify-package-artifacts.mjs";

const packages = [
  "@mcp-native/core",
  "@mcp-native/mcp",
  "@mcp-native/a2ui",
  "@mcp-native/webview",
  "@mcp-native/react-native",
  "mcp-native",
];
const workspacePackageNames = new Set(packages);
const workspacePackageDirectories = [
  "packages/core",
  "packages/mcp",
  "packages/a2ui",
  "packages/webview",
  "packages/react-native",
  "packages/mcp-native",
];
const expectedVersion = JSON.parse(readFileSync("packages/core/package.json", "utf8")).version;
const rootLicenseText = readFileSync("LICENSE", "utf8");

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

    return join(temporaryDirectory, packed.filename);
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
  const smokeEntryPoint = join(consumerDirectory, "smoke.mjs");
  writeFileSync(
    smokeEntryPoint,
    `await Promise.all(${JSON.stringify(packages)}.map((specifier) => import(specifier)));
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
  execFileSync(process.execPath, [smokeEntryPoint], {
    cwd: consumerDirectory,
    env: npmEnvironment,
    stdio: "inherit",
  });

  console.log(`Verified ${packages.length} installable package tarballs.`);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
