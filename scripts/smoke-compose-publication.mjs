import { execFileSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { artifactDirectory, verifyPublication } from "./compose-maven-publication.mjs";

const root = resolve(import.meta.dirname, "..");
const composeRoot = join(root, "packages", "compose");
const version = "0.0.0-local";
const repository = join(composeRoot, "library", "build", "maven-repository");
const gradleEnvironment = {
  ...process.env,
  ...(process.env.ANDROID_HOME || !process.env.ANDROID_SDK
    ? {}
    : { ANDROID_HOME: process.env.ANDROID_SDK }),
};
const composeGradleProperties = await readFile(join(composeRoot, "gradle.properties"), "utf8");
const property = (name) => {
  const match = new RegExp(`^${name}=(.+)$`, "m").exec(composeGradleProperties);
  if (!match) throw new Error(`Missing Compose Gradle property ${name}`);
  return match[1].trim();
};

await rm(repository, { recursive: true, force: true });
execFileSync(
  join(composeRoot, "gradlew"),
  [
    ":library:publishReleasePublicationToReleaseBundleRepository",
    `-PmcpNativeVersion=${version}`,
    "--no-daemon",
  ],
  { cwd: composeRoot, env: gradleEnvironment, stdio: "inherit" },
);
const publicationDirectory = artifactDirectory(repository, version);
await verifyPublication(publicationDirectory, version, {
  requireSignatures: false,
});
const documentationEntries = execFileSync(
  "jar",
  ["tf", join(publicationDirectory, `mcp-native-compose-${version}-javadoc.jar`)],
  { encoding: "utf8" },
);
if (!documentationEntries.split(/\r?\n/).includes("README.md")) {
  throw new Error("Compose Maven documentation artifact must contain README.md");
}
execFileSync(
  join(composeRoot, "gradlew"),
  [
    "-p",
    join(root, "tests", "fixtures", "compose-consumer"),
    "compileDebugKotlin",
    `-PandroidGradlePluginVersion=${property("androidGradlePluginVersion")}`,
    `-PkotlinVersion=${property("kotlinVersion")}`,
    "--no-daemon",
  ],
  {
    cwd: composeRoot,
    env: { ...gradleEnvironment, MCP_NATIVE_COMPOSE_REPOSITORY: repository },
    stdio: "inherit",
  },
);
console.log("Compose Maven publication smoke test passed");
