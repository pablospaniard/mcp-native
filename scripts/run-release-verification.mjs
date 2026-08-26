import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const stableReleaseTagPattern = /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

export function runReleaseVerification({
  releaseTag = process.env.MCP_NATIVE_RELEASE_TAG,
  run = spawnSync,
} = {}) {
  if (typeof releaseTag !== "string" || !stableReleaseTagPattern.test(releaseTag)) {
    throw new Error("Release tag must be an exact stable semantic version.");
  }

  const result = run("npm", ["run", "release:verify"], {
    env: {
      ...process.env,
      GITHUB_REF_NAME: releaseTag,
      MCP_NATIVE_RELEASE_TAG: releaseTag,
    },
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Release verification failed with exit code ${result.status}`);
  }
}

const invokedPath = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href;
if (import.meta.url === invokedPath) {
  runReleaseVerification();
}
