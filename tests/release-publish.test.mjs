import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import { parse } from "yaml";

import {
  getNpmReleaseDistTag,
  isPackageVersionPublished,
  loadReleasePackages,
  publishMissingReleasePackages,
  publishWorkspace,
  releasePackagePaths,
} from "../scripts/publish-release.mjs";
import { runReleaseVerification } from "../scripts/run-release-verification.mjs";

const packageInfo = { name: "@mcp-native/example", version: "0.1.0" };
const releaseVersion = JSON.parse(readFileSync("packages/core/package.json", "utf8")).version;

function createReleaseFixture(t, { omitRenderer = false, editManifest = () => {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), "mcp-native-release-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const manifestPath of releasePackagePaths) {
    if (omitRenderer && manifestPath === "packages/renderer-core/package.json") continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    editManifest(manifest);
    const destination = join(root, manifestPath);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, JSON.stringify(manifest));
  }
  return root;
}

test("current automation recovers a seven-package release predating renderer-core", async (t) => {
  const root = createReleaseFixture(t, {
    omitRenderer: true,
    editManifest(manifest) {
      delete manifest.dependencies?.["@mcp-native/renderer-core"];
    },
  });
  const packages = loadReleasePackages(root);
  assert.equal(packages.length, 7);
  assert.ok(packages.every(({ name }) => name !== "@mcp-native/renderer-core"));
  const published = [];
  await publishMissingReleasePackages({
    packages,
    fetchImpl: async () => new Response(null, { status: 404 }),
    publish: (value) => published.push(value),
  });
  assert.deepEqual(published, packages);
});

test("recovery rejects a missing renderer-core required by the target release", (t) => {
  const root = createReleaseFixture(t, { omitRenderer: true });
  assert.throws(
    () => loadReleasePackages(root),
    /@mcp-native\/react-native requires earlier release package @mcp-native\/renderer-core/,
  );
});

test("recovery rejects workspace dependencies appearing after their consumer", (t) => {
  const root = createReleaseFixture(t, {
    editManifest(manifest) {
      if (manifest.name === "@mcp-native/renderer-core") {
        manifest.dependencies["@mcp-native/react-native"] = `^${releaseVersion}`;
      }
    },
  });
  assert.throws(
    () => loadReleasePackages(root),
    /@mcp-native\/renderer-core requires earlier release package @mcp-native\/react-native/,
  );
});

test("release version verification includes renderer-core", (t) => {
  const root = createReleaseFixture(t, {
    editManifest(manifest) {
      if (manifest.name === "@mcp-native/renderer-core") manifest.version = "0.0.0";
    },
  });
  const result = spawnSync(process.execPath, [resolve("scripts/verify-release-version.mjs")], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, MCP_NATIVE_RELEASE_TAG: `v${releaseVersion}` },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /All public packages must share one release version/);
});

test("the coordinated release includes the host after all of its package dependencies", () => {
  assert.deepEqual(
    loadReleasePackages().map(({ name }) => name),
    [
      "@mcp-native/core",
      "@mcp-native/mcp",
      "@mcp-native/a2ui",
      "@mcp-native/renderer-core",
      "@mcp-native/webview",
      "@mcp-native/react-native",
      "@mcp-native/host",
      "mcp-native",
    ],
  );
});

test("release recovery skips an exact version that is already published", async () => {
  const published = [];

  await publishMissingReleasePackages({
    packages: [packageInfo],
    fetchImpl: async () =>
      new Response(JSON.stringify({ version: packageInfo.version }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    publish: (value) => published.push(value),
    logger: { log() {} },
  });

  assert.deepEqual(published, []);
});

test("release recovery publishes only after a confirmed missing-version response", async () => {
  const published = [];

  await publishMissingReleasePackages({
    packages: [packageInfo],
    fetchImpl: async () => new Response(null, { status: 404 }),
    publish: (value) => published.push(value),
  });

  assert.deepEqual(published, [packageInfo]);
});

test("release recovery aborts on registry failures without publishing", async () => {
  let publishCalled = false;

  await assert.rejects(
    publishMissingReleasePackages({
      packages: [packageInfo],
      fetchImpl: async () => new Response(null, { status: 503 }),
      publish: () => {
        publishCalled = true;
      },
    }),
    /Registry lookup failed.*HTTP 503/,
  );

  assert.equal(publishCalled, false);
});

test("registry metadata must match the exact requested version", async () => {
  await assert.rejects(
    isPackageVersionPublished(packageInfo, {
      fetchImpl: async () =>
        new Response(JSON.stringify({ version: "0.1.1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    }),
    /unexpected metadata/,
  );
});

test("publishing selects explicit stable and prerelease npm dist-tags", () => {
  const invocations = [];
  const run = (command, args, options) => {
    invocations.push({ command, args, options });
    return { status: 0 };
  };

  publishWorkspace({ name: "@mcp-native/example", version: "1.0.0-beta.1" }, { run });
  publishWorkspace({ name: "@mcp-native/example", version: "1.0.0" }, { run });

  assert.deepEqual(invocations, [
    {
      command: "npm",
      args: [
        "publish",
        "--workspace",
        "@mcp-native/example",
        "--access",
        "public",
        "--tag",
        "beta",
      ],
      options: { stdio: "inherit" },
    },
    {
      command: "npm",
      args: [
        "publish",
        "--workspace",
        "@mcp-native/example",
        "--access",
        "public",
        "--tag",
        "latest",
      ],
      options: { stdio: "inherit" },
    },
  ]);
  assert.equal(getNpmReleaseDistTag("1.0.0-1"), "next");
  assert.equal(getNpmReleaseDistTag("1.0.0-v1.2"), "next");
  assert.throws(() => getNpmReleaseDistTag("not-semver"), /invalid release version/);
});

test("prerelease installation commands select the matching npm dist-tag", () => {
  const distTag = getNpmReleaseDistTag(releaseVersion);
  if (distTag === "latest") return;

  const releasePackageNames = loadReleasePackages().map(({ name }) => name);
  const readmePaths = [
    "README.md",
    ...releasePackagePaths.map((manifestPath) => manifestPath.replace("package.json", "README.md")),
  ];

  for (const readmePath of readmePaths) {
    const installCommands = readFileSync(readmePath, "utf8")
      .split("\n")
      .filter((line) => line.startsWith("npm install "));

    for (const command of installCommands) {
      const dependencies = command.split(/\s+/u).slice(2);
      for (const packageName of releasePackageNames) {
        const documentedDependency = dependencies.find(
          (dependency) => dependency === packageName || dependency.startsWith(`${packageName}@`),
        );
        if (documentedDependency !== undefined) {
          assert.equal(
            documentedDependency,
            `${packageName}@${distTag}`,
            `${readmePath}: ${command}`,
          );
        }
      }
    }
  }
});

test("the recovery workflow resolves a published release to an immutable commit", () => {
  const workflow = parse(readFileSync(".github/workflows/release.yml", "utf8"));
  const publishJob = workflow.jobs.publish;
  const steps = publishJob.steps;
  const resolveRelease = steps.find(({ name }) => name === "Resolve published release");
  const releaseCheckout = steps.find(({ name }) => name === "Check out immutable release commit");
  const verifyRelease = steps.find(
    ({ run }) => run === "node ../automation/scripts/run-release-verification.mjs",
  );

  assert.equal(publishJob.environment, "npm-release");
  assert.match(publishJob.if, /github\.ref == 'refs\/heads\/main'/);
  const patternLine = resolveRelease.run
    .split("\n")
    .find((line) => line.includes('REQUESTED_TAG}" =~ '));
  const workflowPatternSource = patternLine
    ?.slice(patternLine.indexOf(" =~ ") + 4)
    .split(" ", 1)[0];
  assert.ok(workflowPatternSource, "release workflow must expose its exact tag pattern");
  const workflowTagPattern = new RegExp(workflowPatternSource, "u");
  assert.match("v1.0.0", workflowTagPattern);
  assert.match("v1.0.0-beta.1", workflowTagPattern);
  assert.doesNotMatch("v1.0.0-beta.01", workflowTagPattern);
  assert.equal(releaseCheckout.with.ref, "${{ steps.release.outputs.commit }}");
  assert.equal(releaseCheckout.with["persist-credentials"], false);
  assert.equal(verifyRelease.env.MCP_NATIVE_RELEASE_TAG, "${{ steps.release.outputs.tag }}");
});

test("release recovery supplies the resolved tag to legacy and current verifiers", () => {
  let invocation;

  runReleaseVerification({
    releaseTag: `v${releaseVersion}`,
    run(command, args, options) {
      invocation = { command, args, options };
      return { status: 0 };
    },
  });

  assert.equal(invocation.command, "npm");
  assert.deepEqual(invocation.args, ["run", "release:verify"]);
  assert.equal(invocation.options.env.GITHUB_REF_NAME, `v${releaseVersion}`);
  assert.equal(invocation.options.env.MCP_NATIVE_RELEASE_TAG, `v${releaseVersion}`);
  assert.equal(invocation.options.stdio, "inherit");
});

test("release recovery rejects an invalid tag before starting verification", () => {
  assert.throws(
    () =>
      runReleaseVerification({
        releaseTag: "main",
        run() {
          throw new Error("must not run");
        },
      }),
    /exact semantic version/,
  );
});

test("release verification prefers the explicitly resolved tag", () => {
  const result = spawnSync(process.execPath, ["scripts/verify-release-version.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      GITHUB_REF_NAME: "main",
      MCP_NATIVE_RELEASE_TAG: `v${releaseVersion}`,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.ok(
    result.stdout.includes(`Verified release version ${releaseVersion} for tag v${releaseVersion}`),
  );
});
