import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const packages = [
  "@mcp-native/core",
  "@mcp-native/a2ui",
  "@mcp-native/webview",
  "@mcp-native/react-native",
  "mcp-native",
];
const expectedVersion = JSON.parse(readFileSync("packages/core/package.json", "utf8")).version;

const temporaryDirectory = mkdtempSync(join(tmpdir(), "mcp-native-packages-"));
const npmEnvironment = {
  ...process.env,
  npm_config_cache: join(temporaryDirectory, "npm-cache"),
};

try {
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
    for (const requiredFile of ["README.md", "dist/index.d.ts", "dist/index.js", "package.json"]) {
      if (!files.has(requiredFile)) {
        throw new Error(`${packageName} tarball is missing ${requiredFile}`);
      }
    }

    return join(temporaryDirectory, packed.filename);
  });

  const consumerDirectory = join(temporaryDirectory, "consumer");
  mkdirSync(consumerDirectory);
  writeFileSync(
    join(consumerDirectory, "package.json"),
    `${JSON.stringify({ name: "mcp-native-package-smoke", private: true, type: "module" }, null, 2)}\n`,
  );
  execFileSync(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline", ...tarballs],
    { cwd: consumerDirectory, env: npmEnvironment, stdio: "inherit" },
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

  await Promise.all(importPromises);

  console.log(`Verified ${packages.length} installable package tarballs.`);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
