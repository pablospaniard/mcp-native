import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  COMPOSE_ARTIFACT,
  COMPOSE_GROUP,
  addChecksums,
  artifactDirectory,
  deploymentStatus,
  prepareBundle,
  requireCommand,
  requireDeploymentId,
  requireReleaseVersion,
  signPublication,
  verifyPublication,
  waitForPublication,
} from "../scripts/compose-maven-publication.mjs";

const version = "1.2.0";
const prefix = `${COMPOSE_ARTIFACT}-${version}`;
const artifacts = [
  `${prefix}.aar`,
  `${prefix}.pom`,
  `${prefix}-sources.jar`,
  `${prefix}-javadoc.jar`,
];

function portablePom({ repositories = "", bom = true } = {}) {
  return `<project>
  <groupId>${COMPOSE_GROUP}</groupId><artifactId>${COMPOSE_ARTIFACT}</artifactId><version>${version}</version>
  <name>MCP Native Compose</name><licenses></licenses><developers></developers><scm></scm>
  ${repositories}
  <dependencyManagement><dependencies>${
    bom
      ? "<dependency><groupId>androidx.compose</groupId><artifactId>compose-bom</artifactId><version>2025.10.00</version><type>pom</type><scope>import</scope></dependency>"
      : ""
  }</dependencies></dependencyManagement>
  <dependencies><dependency><groupId>androidx.compose.ui</groupId><artifactId>ui</artifactId><scope>compile</scope></dependency></dependencies>
</project>`;
}

async function writePublication(root, options) {
  const directory = artifactDirectory(root, version);
  await mkdir(directory, { recursive: true });
  await Promise.all(
    artifacts.map((artifact) =>
      writeFile(
        join(directory, artifact),
        artifact.endsWith(".pom") ? portablePom(options) : artifact,
      ),
    ),
  );
  return directory;
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

test("Compose Maven releases require exact semantic versions", () => {
  assert.equal(requireReleaseVersion("v1.2.0"), "1.2.0");
  assert.equal(requireReleaseVersion("1.2.0-rc.1"), "1.2.0-rc.1");
  for (const invalid of [
    undefined,
    "",
    "1.2",
    "01.2.0",
    "v1.2.0/latest",
    "1.2.0+build",
    "1.2.0-01",
    "1.2.0-rc.01",
  ]) {
    assert.throws(() => requireReleaseVersion(invalid), /exact semantic release version/);
  }
});

test("Compose Maven deployment IDs require canonical UUIDs", () => {
  const id = "28570f16-da32-4c14-bd2e-c1acc0782365";
  assert.equal(requireDeploymentId(id), id);
  for (const invalid of [undefined, "", "not-a-uuid", `${id}/status`]) {
    assert.throws(() => requireDeploymentId(invalid), /Invalid Maven deployment ID/);
  }
});

test("Compose Maven signing rejects absent credentials before invoking GPG", async () => {
  await assert.rejects(
    signPublication("unused", [], "", ""),
    /Maven publication signing credentials are required/,
  );
});

test("publication tools fail with an actionable missing-tool error", () => {
  assert.throws(
    () =>
      requireCommand("missing", {
        run: () => ({ error: Object.assign(new Error("missing"), { code: "ENOENT" }) }),
      }),
    /Required publication tool 'missing' is not installed/,
  );
});

test("Compose Maven publication validation requires exact non-empty artifacts and signatures", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mcp-native-compose-publication-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = await writePublication(root);

  await verifyPublication(directory, version, { requireSignatures: false });
  await assert.rejects(
    verifyPublication(directory, version, { requireSignatures: true }),
    /Missing Maven publication artifact .*\.asc/,
  );
  await Promise.all(
    artifacts.map((artifact) => writeFile(join(directory, `${artifact}.asc`), "signature")),
  );
  await verifyPublication(directory, version, { requireSignatures: true });
  await writeFile(join(directory, "unexpected.txt"), "untrusted output");
  await assert.rejects(
    verifyPublication(directory, version, { requireSignatures: true }),
    /Unexpected Maven publication artifact/,
  );
});

test("Compose Maven publication validation rejects unsafe or incomplete POM metadata", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mcp-native-compose-pom-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = await writePublication(root, {
    repositories: "<repositories></repositories>",
  });
  await assert.rejects(
    verifyPublication(directory, version, { requireSignatures: false }),
    /must not publish repositories/,
  );
  await writeFile(join(directory, `${prefix}.pom`), portablePom({ bom: false }));
  await assert.rejects(
    verifyPublication(directory, version, { requireSignatures: false }),
    /must import the pinned Compose BOM/,
  );
});

test("checksum generation covers artifacts but not signatures or prior checksums", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mcp-native-compose-checksums-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "artifact.aar"), "contents");
  await writeFile(join(directory, "artifact.aar.asc"), "signature");
  await addChecksums(directory);
  assert.equal(
    await readFile(join(directory, "artifact.aar.md5"), "utf8"),
    createHash("md5").update("contents").digest("hex"),
  );
  assert.equal(
    await readFile(join(directory, "artifact.aar.sha1"), "utf8"),
    createHash("sha1").update("contents").digest("hex"),
  );
  await addChecksums(directory);
  assert.deepEqual((await readdir(directory)).sort(), [
    "artifact.aar",
    "artifact.aar.asc",
    "artifact.aar.md5",
    "artifact.aar.sha1",
  ]);
});

test("bundle preparation performs real signing and creates the Maven-layout archive", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mcp-native-compose-bundle-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repositoryRoot = join(root, "repository");
  const directory = await writePublication(repositoryRoot);
  const gpgHome = await mkdtemp("/tmp/mcp-gpg-");
  t.after(() => rm(gpgHome, { recursive: true, force: true }));
  const passphrase = "test-only-passphrase";
  const agent = spawnSync("gpg-agent", ["--homedir", gpgHome, "--daemon"], {
    stdio: "ignore",
  });
  if (agent.status !== 0) {
    t.skip("sandbox does not permit the GPG agent socket required for real signing");
    return;
  }
  t.after(() => {
    spawnSync("gpgconf", ["--homedir", gpgHome, "--kill", "gpg-agent"], { stdio: "ignore" });
  });
  const generated = spawnSync(
    "gpg",
    [
      "--batch",
      "--homedir",
      gpgHome,
      "--pinentry-mode",
      "loopback",
      "--passphrase",
      passphrase,
      "--quick-generate-key",
      "MCP Native Test <test@example.invalid>",
      "rsa2048",
      "sign",
      "1d",
    ],
    { encoding: "utf8" },
  );
  if (generated.status !== 0) {
    throw generated.error ?? new Error(`GPG test-key generation failed: ${generated.stderr}`);
  }
  const signingKey = execFileSync(
    "gpg",
    [
      "--batch",
      "--homedir",
      gpgHome,
      "--pinentry-mode",
      "loopback",
      "--passphrase",
      passphrase,
      "--armor",
      "--export-secret-keys",
    ],
    { encoding: "utf8" },
  );
  const bundleRoot = join(root, "bundle");
  const bundlePath = join(root, "central.zip");
  assert.equal(
    await prepareBundle(version, {
      repositoryRoot,
      bundleRoot,
      bundlePath,
      signingKey,
      signingPassword: passphrase,
    }),
    bundlePath,
  );
  const signedDirectory = artifactDirectory(bundleRoot, version);
  for (const artifact of artifacts) {
    execFileSync(
      "gpg",
      [
        "--batch",
        "--homedir",
        gpgHome,
        "--verify",
        join(signedDirectory, `${artifact}.asc`),
        join(signedDirectory, artifact),
      ],
      { stdio: "ignore" },
    );
  }
  const archiveEntries = execFileSync("unzip", ["-Z1", bundlePath], { encoding: "utf8" });
  assert.match(
    archiveEntries,
    new RegExp(`io/github/pablospaniard/${COMPOSE_ARTIFACT}/${version}/${prefix}\\.aar$`, "m"),
  );
  assert.equal((await readdir(directory)).length, artifacts.length, "source output stays unsigned");
});

test("deployment status retries transient responses", async () => {
  const statuses = [response(503, "temporary"), response(200, { deploymentState: "PUBLISHED" })];
  const sleeps = [];
  const result = await deploymentStatus("id", "Bearer token", {
    fetchImpl: async () => statuses.shift(),
    sleep: async (milliseconds) => sleeps.push(milliseconds),
  });
  assert.equal(result.deploymentState, "PUBLISHED");
  assert.equal(sleeps.length, 1);
});

test("deployment status does not retry permanent failures", async () => {
  let calls = 0;
  await assert.rejects(
    deploymentStatus("id", "Bearer token", {
      fetchImpl: async () => {
        calls += 1;
        return response(401, "unauthorized");
      },
      sleep: async () => {},
    }),
    /status failed: 401/,
  );
  assert.equal(calls, 1);
});

test("publication polling handles success, failure, unknown state, and timeout", async () => {
  const id = "28570f16-da32-4c14-bd2e-c1acc0782365";
  const quiet = { log() {} };
  const states = [
    response(200, { deploymentState: "PENDING" }),
    response(200, { deploymentState: "PUBLISHED" }),
  ];
  await waitForPublication(id, "Bearer token", {
    fetchImpl: async () => states.shift(),
    sleep: async () => {},
    deadline: 10,
    now: () => 0,
    logger: quiet,
  });
  await assert.rejects(
    waitForPublication(id, "Bearer token", {
      fetchImpl: async () => response(200, { deploymentState: "FAILED", errors: ["bad"] }),
      sleep: async () => {},
      deadline: 10,
      now: () => 0,
      logger: quiet,
    }),
    /deployment failed.*bad/,
  );
  await assert.rejects(
    waitForPublication(id, "Bearer token", {
      fetchImpl: async () => response(200, { deploymentState: "SURPRISE" }),
      sleep: async () => {},
      deadline: 10,
      now: () => 0,
      logger: quiet,
    }),
    /unknown deployment state SURPRISE/,
  );
  await assert.rejects(
    waitForPublication(id, "Bearer token", {
      deadline: 0,
      now: () => 0,
      logger: quiet,
    }),
    /Timed out waiting/,
  );
});
