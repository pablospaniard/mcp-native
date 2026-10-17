import { execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";
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
await verifyPublication(artifactDirectory(repository, version), version, {
  requireSignatures: false,
});
execFileSync(
  join(composeRoot, "gradlew"),
  ["-p", join(root, "tests", "fixtures", "compose-consumer"), "compileDebugKotlin", "--no-daemon"],
  {
    cwd: composeRoot,
    env: { ...gradleEnvironment, MCP_NATIVE_COMPOSE_REPOSITORY: repository },
    stdio: "inherit",
  },
);
console.log("Compose Maven publication smoke test passed");
