import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parse } from "yaml";

import {
  isPackageVersionPublished,
  loadReleasePackages,
  publishMissingReleasePackages,
} from "../scripts/publish-release.mjs";
import { runReleaseVerification } from "../scripts/run-release-verification.mjs";

const packageInfo = { name: "@mcp-native/example", version: "0.1.0" };
const releaseVersion = JSON.parse(readFileSync("packages/core/package.json", "utf8")).version;

test("the coordinated release includes the host after all of its package dependencies", () => {
  assert.deepEqual(
    loadReleasePackages().map(({ name }) => name),
    [
      "@mcp-native/core",
      "@mcp-native/mcp",
      "@mcp-native/a2ui",
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

test("the recovery workflow resolves a published release to an immutable commit", () => {
  const workflow = parse(readFileSync(".github/workflows/release.yml", "utf8"));
  const publishJob = workflow.jobs.publish;
  const steps = publishJob.steps;
  const releaseCheckout = steps.find(({ name }) => name === "Check out immutable release commit");
  const verifyRelease = steps.find(
    ({ run }) => run === "node ../automation/scripts/run-release-verification.mjs",
  );

  assert.equal(publishJob.environment, "npm-release");
  assert.match(publishJob.if, /github\.ref == 'refs\/heads\/main'/);
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
    /exact stable semantic version/,
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
