import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL("./", import.meta.url));
const outputDirectory = `${directory}Sources/MCPNativeSwiftUI/Resources`;
await mkdir(outputDirectory, { recursive: true });
const result = await build({
  entryPoints: [`${directory}Runtime/bridge.ts`],
  outfile: `${outputDirectory}/runtime.js`,
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "MCPNativeApple",
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
  throw new Error("The Apple runtime must not import React or React Native");
}
