import limits from "./limits.json" with { type: "json" };
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export async function buildBundle() {
  const directory = fileURLToPath(new URL("./", import.meta.url));
  await mkdir(`${directory}dist`, { recursive: true });
  if (
    !Number.isSafeInteger(limits.maxComponentDepth) ||
    limits.maxComponentDepth < 1 ||
    limits.maxComponentDepth > 64
  ) {
    throw new Error("Invalid experiment component-depth limit");
  }
  await writeFile(
    `${directory}dist/ExperimentLimits.swift`,
    `// Generated from limits.json by build-bundle.mjs.
enum ExperimentLimits {
  static let maxComponentDepth = ${limits.maxComponentDepth}
}
`,
  );
  const result = await build({
    entryPoints: [`${directory}shared-runtime.mjs`],
    outfile: `${directory}dist/runtime.js`,
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "NativeExperiment",
    inject: [`${directory}engine-globals.mjs`],
    target: "es2022",
    minify: true,
    legalComments: "eof",
    metafile: true,
  });
  if (
    Object.keys(result.metafile.inputs).some((path) =>
      /node_modules\/(react|react-native)\//u.test(path),
    )
  ) {
    throw new Error("The shared runtime must not import React");
  }
  await writeFile(`${directory}dist/bundle-meta.json`, JSON.stringify(result.metafile, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await buildBundle();
