import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  COMPOSE_ARTIFACT,
  COMPOSE_GROUP,
  requireReleaseVersion,
  signPublication,
  verifyPublication,
} from "../scripts/compose-maven-publication.mjs";

test("Compose Maven releases require exact semantic versions", () => {
  assert.equal(requireReleaseVersion("v1.2.0"), "1.2.0");
  assert.equal(requireReleaseVersion("1.2.0-rc.1"), "1.2.0-rc.1");
  for (const invalid of [undefined, "", "1.2", "01.2.0", "v1.2.0/latest", "1.2.0+build"]) {
    assert.throws(() => requireReleaseVersion(invalid), /exact semantic release version/);
  }
});

test("Compose Maven signing rejects absent credentials before invoking GPG", async () => {
  await assert.rejects(
    signPublication("unused", [], "", ""),
    /Maven publication signing credentials are required/,
  );
});

test("Compose Maven publication validation requires artifacts, metadata, and signatures", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mcp-native-compose-publication-"));
  const version = "1.2.0";
  const prefix = `${COMPOSE_ARTIFACT}-${version}`;
  const artifacts = [
    `${prefix}.aar`,
    `${prefix}.pom`,
    `${prefix}-sources.jar`,
    `${prefix}-javadoc.jar`,
  ];
  const pom = `<project><groupId>${COMPOSE_GROUP}</groupId><artifactId>${COMPOSE_ARTIFACT}</artifactId><version>${version}</version><name>MCP Native Compose</name><licenses></licenses><developers></developers><scm></scm></project>`;
  await Promise.all(
    artifacts.map((artifact) =>
      writeFile(join(directory, artifact), artifact.endsWith(".pom") ? pom : artifact),
    ),
  );

  await verifyPublication(directory, version, { requireSignatures: false });
  await assert.rejects(
    verifyPublication(directory, version, { requireSignatures: true }),
    /Missing Maven publication signature/,
  );
  await Promise.all(
    artifacts.map((artifact) => writeFile(join(directory, `${artifact}.asc`), "signature")),
  );
  await verifyPublication(directory, version, { requireSignatures: true });
});

test("Compose Maven publication validation rejects repository injection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mcp-native-compose-pom-"));
  const version = "1.2.0";
  const prefix = `${COMPOSE_ARTIFACT}-${version}`;
  await Promise.all(
    [".aar", "-sources.jar", "-javadoc.jar"].map((suffix) =>
      writeFile(join(directory, `${prefix}${suffix}`), "artifact"),
    ),
  );
  await writeFile(
    join(directory, `${prefix}.pom`),
    `<project><groupId>${COMPOSE_GROUP}</groupId><artifactId>${COMPOSE_ARTIFACT}</artifactId><version>${version}</version><name>MCP Native Compose</name><licenses></licenses><developers></developers><scm></scm><repositories></repositories></project>`,
  );
  await assert.rejects(
    verifyPublication(directory, version, { requireSignatures: false }),
    /must not publish repositories/,
  );
});
