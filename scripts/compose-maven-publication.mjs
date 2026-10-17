import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const COMPOSE_GROUP = "io.github.pablospaniard";
export const COMPOSE_ARTIFACT = "mcp-native-compose";

// Release automation executes this trusted script from a separate checkout while the immutable
// release commit is the working directory. Resolve artifacts from that working directory.
const projectRoot = resolve(process.cwd());
const composeRoot = join(projectRoot, "packages", "compose");
const repositoryRoot = join(composeRoot, "library", "build", "maven-repository");
const bundleRoot = join(composeRoot, "library", "build", "central-bundle");
const bundlePath = join(composeRoot, "library", "build", "mcp-native-compose-central.zip");
const portalBase = "https://central.sonatype.com/api/v1/publisher";

function gradleEnvironment() {
  const environment = {
    ...process.env,
    ...(process.env.ANDROID_HOME || !process.env.ANDROID_SDK
      ? {}
      : { ANDROID_HOME: process.env.ANDROID_SDK }),
  };
  for (const secret of [
    "MAVEN_CENTRAL_USERNAME",
    "MAVEN_CENTRAL_PASSWORD",
    "MAVEN_SIGNING_KEY",
    "MAVEN_SIGNING_PASSWORD",
    "ORG_GRADLE_PROJECT_signingKey",
    "ORG_GRADLE_PROJECT_signingPassword",
  ]) {
    delete environment[secret];
  }
  return environment;
}

export function requireReleaseVersion(value) {
  const version = value?.startsWith("v") ? value.slice(1) : value;
  if (
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
      version ?? "",
    )
  ) {
    throw new Error("Compose publication requires an exact semantic release version");
  }
  return version;
}

export function artifactDirectory(root, version) {
  return join(root, ...COMPOSE_GROUP.split("."), COMPOSE_ARTIFACT, version);
}

export async function verifyPublication(directory, version, { requireSignatures }) {
  const prefix = `${COMPOSE_ARTIFACT}-${version}`;
  const required = [
    `${prefix}.aar`,
    `${prefix}.pom`,
    `${prefix}-sources.jar`,
    `${prefix}-javadoc.jar`,
  ];
  const files = new Set(await readdir(directory));
  for (const name of required) {
    if (!files.has(name)) throw new Error(`Missing Maven publication artifact ${name}`);
    if (requireSignatures && !files.has(`${name}.asc`)) {
      throw new Error(`Missing Maven publication signature ${name}.asc`);
    }
  }

  const pom = await readFile(join(directory, `${prefix}.pom`), "utf8");
  for (const expected of [
    `<groupId>${COMPOSE_GROUP}</groupId>`,
    `<artifactId>${COMPOSE_ARTIFACT}</artifactId>`,
    `<version>${version}</version>`,
    "<name>MCP Native Compose</name>",
    "<licenses>",
    "<developers>",
    "<scm>",
  ]) {
    if (!pom.includes(expected)) throw new Error(`Maven POM is missing ${expected}`);
  }
  if (pom.includes("<repositories>")) throw new Error("Maven POM must not publish repositories");
  return required;
}

export async function signPublication(directory, names, signingKey, signingPassword) {
  if (!signingKey || !signingPassword)
    throw new Error("Maven publication signing credentials are required");
  const keyring = await mkdtemp(join(tmpdir(), "mcp-native-maven-signing-"));
  try {
    execFileSync("gpg", ["--batch", "--homedir", keyring, "--import"], {
      input: signingKey,
      stdio: ["pipe", "ignore", "pipe"],
    });
    for (const name of names) {
      execFileSync(
        "gpg",
        [
          "--batch",
          "--yes",
          "--homedir",
          keyring,
          "--pinentry-mode",
          "loopback",
          "--passphrase-fd",
          "0",
          "--armor",
          "--detach-sign",
          "--output",
          join(directory, `${name}.asc`),
          join(directory, name),
        ],
        { input: `${signingPassword}\n`, stdio: ["pipe", "ignore", "pipe"] },
      );
    }
  } finally {
    await rm(keyring, { recursive: true, force: true });
  }
}

async function copyArtifacts(source, destination, names) {
  await mkdir(destination, { recursive: true });
  await Promise.all(
    names.map(async (name) => {
      await writeFile(join(destination, name), await readFile(join(source, name)));
    }),
  );
}

async function addChecksums(directory) {
  const names = (await readdir(directory)).filter((name) => !name.endsWith(".asc"));
  await Promise.all(
    names.flatMap((name) =>
      ["md5", "sha1"].map(async (algorithm) => {
        const path = join(directory, name);
        const contents = await readFile(path);
        await writeFile(
          `${path}.${algorithm}`,
          createHash(algorithm).update(contents).digest("hex"),
        );
      }),
    ),
  );
}

export async function prepareBundle(version, { requireSignatures = true } = {}) {
  const source = artifactDirectory(repositoryRoot, version);
  const required = await verifyPublication(source, version, { requireSignatures });
  await rm(bundleRoot, { recursive: true, force: true });
  await rm(bundlePath, { force: true });
  const destination = artifactDirectory(bundleRoot, version);
  await mkdir(dirname(destination), { recursive: true });
  await copyArtifacts(
    source,
    destination,
    requireSignatures ? required.flatMap((name) => [name, `${name}.asc`]) : required,
  );
  await addChecksums(destination);
  execFileSync("zip", ["-q", "-r", bundlePath, COMPOSE_GROUP.split(".")[0]], {
    cwd: bundleRoot,
    stdio: "inherit",
  });
  return bundlePath;
}

function authorizationHeader() {
  const username = process.env.MAVEN_CENTRAL_USERNAME;
  const password = process.env.MAVEN_CENTRAL_PASSWORD;
  if (!username || !password) throw new Error("Maven Central token credentials are required");
  return `Bearer ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

async function deploymentStatus(deploymentId, authorization) {
  const response = await fetch(`${portalBase}/status?id=${encodeURIComponent(deploymentId)}`, {
    method: "POST",
    headers: { Authorization: authorization },
  });
  if (!response.ok)
    throw new Error(`Maven Central status failed: ${response.status} ${await response.text()}`);
  return response.json();
}

async function waitForPublication(
  deploymentId,
  authorization,
  deadline = Date.now() + 30 * 60 * 1_000,
  previous,
) {
  if (Date.now() >= deadline) {
    throw new Error(`Timed out waiting for Maven Central deployment ${deploymentId}`);
  }
  const current = await deploymentStatus(deploymentId, authorization);
  if (current.deploymentState !== previous) {
    console.log(`Maven Central deployment ${deploymentId}: ${current.deploymentState}`);
  }
  if (current.deploymentState === "PUBLISHED") return;
  if (current.deploymentState === "FAILED") {
    throw new Error(
      `Maven Central deployment failed: ${JSON.stringify(current.errors ?? current)}`,
    );
  }
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 10_000));
  return waitForPublication(deploymentId, authorization, deadline, current.deploymentState);
}

async function alreadyPublished(version) {
  const path = `${COMPOSE_GROUP.replaceAll(".", "/")}/${COMPOSE_ARTIFACT}/${version}/${COMPOSE_ARTIFACT}-${version}.pom`;
  const response = await fetch(`https://repo1.maven.org/maven2/${path}`, { method: "HEAD" });
  if (response.ok) return true;
  if (response.status === 404) return false;
  throw new Error(`Maven Central existence check failed: ${response.status}`);
}

async function publish() {
  const version = requireReleaseVersion(process.env.MCP_NATIVE_RELEASE_TAG);
  const authorization = authorizationHeader();
  const resumeId = process.env.MAVEN_CENTRAL_DEPLOYMENT_ID;
  if (resumeId) {
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(resumeId)) {
      throw new Error("Invalid Maven deployment ID");
    }
    await waitForPublication(resumeId, authorization);
    return;
  }
  if (await alreadyPublished(version)) {
    console.log(`${COMPOSE_GROUP}:${COMPOSE_ARTIFACT}:${version} is already published`);
    return;
  }
  if (!process.env.MAVEN_SIGNING_KEY || !process.env.MAVEN_SIGNING_PASSWORD) {
    throw new Error("Maven publication signing credentials are required");
  }

  await rm(repositoryRoot, { recursive: true, force: true });
  execFileSync(
    join(composeRoot, "gradlew"),
    [
      ":library:publishReleasePublicationToReleaseBundleRepository",
      `-PmcpNativeVersion=${version}`,
      "--no-daemon",
    ],
    { cwd: composeRoot, env: gradleEnvironment(), stdio: "inherit" },
  );
  const publicationDirectory = artifactDirectory(repositoryRoot, version);
  const artifacts = await verifyPublication(publicationDirectory, version, {
    requireSignatures: false,
  });
  await signPublication(
    publicationDirectory,
    artifacts,
    process.env.MAVEN_SIGNING_KEY,
    process.env.MAVEN_SIGNING_PASSWORD,
  );
  const archive = await prepareBundle(version);
  const form = new FormData();
  form.append("bundle", new Blob([await readFile(archive)]), basename(archive));
  const endpoint = new URL(`${portalBase}/upload`);
  endpoint.searchParams.set("name", `${COMPOSE_GROUP}:${COMPOSE_ARTIFACT}:${version}`);
  endpoint.searchParams.set("publishingType", "AUTOMATIC");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: authorization },
    body: form,
  });
  if (!response.ok)
    throw new Error(`Maven Central upload failed: ${response.status} ${await response.text()}`);
  const deploymentId = (await response.text()).trim();
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(deploymentId)) {
    throw new Error(`Maven Central returned an invalid deployment ID: ${deploymentId}`);
  }
  console.log(`Maven Central deployment ID: ${deploymentId}`);
  await waitForPublication(deploymentId, authorization);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  publish().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
