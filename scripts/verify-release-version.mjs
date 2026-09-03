import { readFileSync } from "node:fs";

const packageJsonPaths = [
  "packages/core/package.json",
  "packages/mcp/package.json",
  "packages/a2ui/package.json",
  "packages/webview/package.json",
  "packages/react-native/package.json",
  "packages/host/package.json",
  "packages/mcp-native/package.json",
];

const packages = packageJsonPaths.map((path) => JSON.parse(readFileSync(path, "utf8")));
const versions = new Set(packages.map(({ version }) => version));

if (versions.size !== 1) {
  throw new Error(
    `All public packages must share one release version: ${[...versions].join(", ")}`,
  );
}

const [version] = versions;
const releaseTag = process.env.MCP_NATIVE_RELEASE_TAG ?? process.env.GITHUB_REF_NAME;

if (releaseTag !== undefined && releaseTag !== `v${version}`) {
  throw new Error(`Release tag ${releaseTag} does not match package version v${version}`);
}

console.log(`Verified release version ${version}${releaseTag ? ` for tag ${releaseTag}` : ""}.`);
