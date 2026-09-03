import { readFileSync } from "node:fs";
import { basename, join } from "node:path";

function collectExportTargets(value, targets = new Set()) {
  if (typeof value === "string") {
    if (value.startsWith("./")) {
      targets.add(value.slice(2));
    }
    return targets;
  }

  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) {
      collectExportTargets(child, targets);
    }
  }

  return targets;
}

function requirePackedFile(packageName, packedFiles, path) {
  if (!packedFiles.has(path)) {
    throw new Error(`${packageName} tarball is missing ${path}`);
  }
}

function collectBinTargets(value) {
  const targets = typeof value === "string" ? [value] : Object.values(value ?? {});
  return targets.map((path) =>
    typeof path === "string" && path.startsWith("./") ? path.slice(2) : path,
  );
}

export function verifyPackageArtifacts({
  packageName,
  packageDirectory,
  packedFiles,
  rootLicenseText,
  additionalRequiredFiles = [],
  readText = (path) => readFileSync(join(packageDirectory, path), "utf8"),
}) {
  const filePaths = new Set(
    packedFiles.map((file) => (typeof file === "string" ? file : file.path)),
  );
  const manifest = JSON.parse(readText("package.json"));

  if (manifest.name !== packageName) {
    throw new Error(`${packageName} tarball has manifest name ${String(manifest.name)}`);
  }
  if (manifest.license !== "MIT") {
    throw new Error(`${packageName} manifest must declare the MIT license`);
  }
  for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
    if (
      target === null ||
      typeof target !== "object" ||
      typeof target.import !== "string" ||
      target.default !== target.import
    ) {
      throw new Error(
        `${packageName} export ${subpath} must provide a default runtime fallback matching import`,
      );
    }
  }

  const requiredFiles = new Set([
    "LICENSE",
    "README.md",
    "package.json",
    ...collectExportTargets(manifest.exports),
    ...collectBinTargets(manifest.bin),
    ...additionalRequiredFiles,
  ]);
  for (const path of requiredFiles) {
    requirePackedFile(packageName, filePaths, path);
  }

  if (readText("LICENSE") !== rootLicenseText) {
    throw new Error(`${packageName} LICENSE does not match the repository license`);
  }

  let runtimeFiles = 0;
  let declarationFiles = 0;
  for (const path of filePaths) {
    const isDeclaration = path.startsWith("dist/") && path.endsWith(".d.ts");
    const isRuntime = path.startsWith("dist/") && path.endsWith(".js");
    if (!isDeclaration && !isRuntime) {
      continue;
    }

    runtimeFiles += Number(isRuntime);
    declarationFiles += Number(isDeclaration);
    const mapPath = `${path}.map`;
    requirePackedFile(packageName, filePaths, mapPath);

    const expectedDirective = `//# sourceMappingURL=${basename(mapPath)}`;
    if (!readText(path).trimEnd().endsWith(expectedDirective)) {
      throw new Error(`${packageName} ${path} does not reference ${basename(mapPath)}`);
    }

    let sourceMap;
    try {
      sourceMap = JSON.parse(readText(mapPath));
    } catch {
      throw new Error(`${packageName} ${mapPath} is not valid JSON`);
    }
    if (
      sourceMap.version !== 3 ||
      sourceMap.file !== basename(path) ||
      !Array.isArray(sourceMap.sources) ||
      sourceMap.sources.length === 0 ||
      typeof sourceMap.mappings !== "string"
    ) {
      throw new Error(`${packageName} ${mapPath} is not a valid source map for ${path}`);
    }
  }

  if (runtimeFiles === 0 || declarationFiles === 0) {
    throw new Error(`${packageName} tarball must include runtime and declaration files`);
  }

  return manifest;
}
