import { basename } from "node:path";

const PUBLISHED_RELEASE_CANDIDATE_PATTERN = /^0\.9\.[0-9]+$/;

export function verifyPublishedUpgradeBaseline({ packageNames, readInstalledManifest }) {
  const versions = new Set();
  for (const packageName of packageNames) {
    const manifest = readInstalledManifest(packageName);
    if (
      manifest.name !== packageName ||
      typeof manifest.version !== "string" ||
      !PUBLISHED_RELEASE_CANDIDATE_PATTERN.test(manifest.version)
    ) {
      throw new Error(`${packageName} did not resolve to a stable published 0.9.x package`);
    }
    versions.add(manifest.version);
  }

  if (versions.size !== 1) {
    throw new Error(`Published 0.9.x packages are not coordinated: ${[...versions].join(", ")}`);
  }

  return [...versions][0];
}

export function verifyLocalUpgradeInstallation({
  packageNames,
  expectedVersion,
  localTarballs,
  consumerManifest,
  readInstalledManifest,
}) {
  for (const packageName of packageNames) {
    const manifest = readInstalledManifest(packageName);
    if (manifest.name !== packageName || manifest.version !== expectedVersion) {
      throw new Error(`${packageName} did not upgrade to the local candidate ${expectedVersion}`);
    }

    const tarball = localTarballs.get(packageName);
    const dependency = consumerManifest.dependencies?.[packageName];
    if (
      typeof tarball !== "string" ||
      typeof dependency !== "string" ||
      !dependency.endsWith(basename(tarball))
    ) {
      throw new Error(`${packageName} is not installed from its local candidate tarball`);
    }
  }
}
