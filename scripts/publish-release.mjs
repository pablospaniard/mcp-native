import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { loadWorkspacePackages } from "./workspace-packages.mjs";

export function loadReleasePackages(root = process.cwd()) {
  const entries = loadWorkspacePackages(root);
  const privateNames = new Set(
    entries
      .filter(({ manifest }) => manifest.private === true)
      .map(({ manifest }) => manifest.name),
  );
  const manifests = entries
    .map(({ manifest }) => manifest)
    .filter((manifest) => manifest.private !== true);
  for (const manifest of manifests) {
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      if (privateNames.has(dependency)) {
        throw new Error(
          `${manifest.name} depends on private workspace ${dependency}; a packaging decision is required before release`,
        );
      }
    }
  }
  const precedingPackages = new Set();
  for (const manifest of manifests) {
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      if (
        (dependency.startsWith("@mcp-native/") || dependency === "mcp-native") &&
        !precedingPackages.has(dependency)
      ) {
        throw new Error(`${manifest.name} requires earlier release package ${dependency}`);
      }
    }
    precedingPackages.add(manifest.name);
  }
  return manifests.map(({ name, version }) => ({ name, version }));
}

export async function isPackageVersionPublished(
  { name, version },
  {
    fetchImpl = globalThis.fetch,
    registryUrl = process.env.npm_config_registry ??
      process.env.NPM_CONFIG_REGISTRY ??
      "https://registry.npmjs.org/",
  } = {},
) {
  const registry = new URL(registryUrl);
  const packageUrl = new URL(
    `${encodeURIComponent(name)}/${encodeURIComponent(version)}`,
    registry,
  );
  const response = await fetchImpl(packageUrl, {
    headers: { accept: "application/json" },
  });

  if (response.status === 404) {
    return false;
  }

  if (!response.ok) {
    throw new Error(`Registry lookup failed for ${name}@${version}: HTTP ${response.status}`);
  }

  const metadata = await response.json();
  if (metadata?.version !== version) {
    throw new Error(`Registry returned unexpected metadata for ${name}@${version}`);
  }

  return true;
}

export function publishWorkspace({ name, version }, { run = spawnSync } = {}) {
  const distTag = getNpmReleaseDistTag(version);
  const result = run(
    "npm",
    ["publish", "--workspace", name, "--access", "public", "--tag", distTag],
    {
      stdio: "inherit",
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Publishing ${name}@${version} failed with exit code ${result.status}`);
  }
}

/** Returns an explicit npm dist-tag without allowing a prerelease to become `latest`. */
export function getNpmReleaseDistTag(version) {
  const match =
    /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-((?:0|[1-9][0-9]*|[0-9]*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[a-zA-Z-][0-9a-zA-Z-]*))*))?$/u.exec(
      version,
    );
  if (match === null) {
    throw new Error(`Cannot select an npm dist-tag for invalid release version ${version}`);
  }
  const prerelease = match[4];
  if (prerelease === undefined) return "latest";
  const [channel] = prerelease.split(".");
  return channel === "alpha" || channel === "beta" || channel === "rc" ? channel : "next";
}

export async function publishMissingReleasePackages({
  packages = loadReleasePackages(),
  fetchImpl = globalThis.fetch,
  registryUrl,
  publish = publishWorkspace,
  logger = console,
} = {}) {
  for (const packageInfo of packages) {
    // Release order is intentional because later workspaces depend on earlier packages.
    // eslint-disable-next-line no-await-in-loop
    const published = await isPackageVersionPublished(packageInfo, {
      fetchImpl,
      registryUrl,
    });

    if (published) {
      logger.log(`${packageInfo.name}@${packageInfo.version} is already published; skipping.`);
      continue;
    }

    publish(packageInfo);
  }
}

const invokedPath = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href;
if (import.meta.url === invokedPath) {
  await publishMissingReleasePackages();
}
