import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parse } from "yaml";

import {
  isPackageVersionPublished,
  publishMissingReleasePackages,
} from "../scripts/publish-release.mjs";

const packageInfo = { name: "@mcp-native/example", version: "0.1.0" };

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

  assert.equal(publishJob.environment, "npm-release");
  assert.match(publishJob.if, /github\.ref == 'refs\/heads\/main'/);
  assert.equal(releaseCheckout.with.ref, "${{ steps.release.outputs.commit }}");
  assert.equal(releaseCheckout.with["persist-credentials"], false);
});
