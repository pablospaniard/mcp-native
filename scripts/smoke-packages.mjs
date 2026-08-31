import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

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

    const files = new Set(packed.files.map(({ path }) => path));
    const requiredFiles = ["README.md", "dist/index.d.ts", "dist/index.js", "package.json"];
    if (packageName === "@mcp-native/mcp") {
      requiredFiles.push(
        "dist/oauth.d.ts",
        "dist/oauth.js",
        "dist/oauth-error.d.ts",
        "dist/oauth-error.js",
        "dist/oauth-native.d.ts",
        "dist/oauth-native.js",
      );
    }
    if (packageName === "@mcp-native/a2ui") {
      requiredFiles.push(
        "schemas/7541f953050cd58b80f0bf5d85fe2d63192af305/CHECKSUMS.sha256",
        "schemas/7541f953050cd58b80f0bf5d85fe2d63192af305/PROVENANCE.md",
      );
    }
    for (const requiredFile of requiredFiles) {
      if (!files.has(requiredFile)) {
        throw new Error(`${packageName} tarball is missing ${requiredFile}`);
      }
    }

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

  const importPromises = packages.map((packageName) => {
    const packageJsonPath = join(consumerDirectory, "node_modules", packageName, "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    if (packageJson.version !== expectedVersion) {
      throw new Error(`${packageName} has unexpected version ${packageJson.version}`);
    }
    const entryPoint = join(consumerDirectory, "node_modules", packageName, "dist", "index.js");
    return import(pathToFileURL(entryPoint).href);
  });
  importPromises.push(
    import(
      pathToFileURL(
        join(consumerDirectory, "node_modules", "@mcp-native", "mcp", "dist", "oauth-native.js"),
      ).href
    ),
  );

  await Promise.all(importPromises);

  console.log(`Verified ${packages.length} installable package tarballs.`);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
