import { loadReleasePackages } from "./publish-release.mjs";

const packages = loadReleasePackages();
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
