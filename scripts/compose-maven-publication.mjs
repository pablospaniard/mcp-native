import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const COMPOSE_GROUP = "io.github.pablospaniard";
export const COMPOSE_ARTIFACT = "mcp-native-compose";

// Trusted automation receives build output from the immutable release commit only as an artifact.
const projectRoot = resolve(process.cwd());
const composeRoot = join(projectRoot, "packages", "compose");
const defaultRepositoryRoot = join(composeRoot, "library", "build", "maven-repository");
const defaultBundleRoot = join(composeRoot, "library", "build", "central-bundle");
const defaultBundlePath = join(composeRoot, "library", "build", "mcp-native-compose-central.zip");
const portalBase = "https://central.sonatype.com/api/v1/publisher";
const deploymentIdPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const retryableStatuses = new Set([408, 429, 500, 502, 503, 504]);
const activeDeploymentStates = new Set(["PENDING", "VALIDATING", "VALIDATED", "PUBLISHING"]);

function gradleEnvironment() {
  return {
    ...process.env,
    ...(process.env.ANDROID_HOME || !process.env.ANDROID_SDK
      ? {}
      : { ANDROID_HOME: process.env.ANDROID_SDK }),
  };
}

export function requireReleaseVersion(value) {
  const version = value?.startsWith("v") ? value.slice(1) : value;
  const identifier = "(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)";
  const semanticVersion = new RegExp(
    `^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-${identifier}(?:\\.${identifier})*)?$`,
  );
  if (!semanticVersion.test(version ?? "")) {
    throw new Error("Compose publication requires an exact semantic release version");
  }
  return version;
}

export function requireDeploymentId(value) {
  if (!deploymentIdPattern.test(value ?? "")) throw new Error("Invalid Maven deployment ID");
  return value;
}

export function artifactDirectory(root, version) {
  return join(root, ...COMPOSE_GROUP.split("."), COMPOSE_ARTIFACT, version);
}

function requiredArtifactNames(version) {
  const prefix = `${COMPOSE_ARTIFACT}-${version}`;
  return [`${prefix}.aar`, `${prefix}.pom`, `${prefix}-sources.jar`, `${prefix}-javadoc.jar`];
}

function assertPortablePom(pom, version) {
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
  if (
    !/<artifactId>compose-bom<\/artifactId>[\s\S]*?<version>[^<]+<\/version>[\s\S]*?<scope>import<\/scope>/.test(
      pom,
    )
  ) {
    throw new Error("Maven POM must import the pinned Compose BOM");
  }
  if (
    !/<groupId>androidx\.compose\.ui<\/groupId>\s*<artifactId>ui<\/artifactId>\s*<scope>compile<\/scope>/.test(
      pom,
    )
  ) {
    throw new Error("Maven POM must expose Compose UI as a compile dependency");
  }
}

export async function verifyPublication(directory, version, { requireSignatures }) {
  const required = requiredArtifactNames(version);
  const requiredFiles = new Set(
    requireSignatures ? required.flatMap((name) => [name, `${name}.asc`]) : required,
  );
  const allowed = new Set([
    ...requiredFiles,
    ...required.flatMap((name) =>
      ["md5", "sha1", "sha256", "sha512"].map((algorithm) => `${name}.${algorithm}`),
    ),
  ]);
  const files = await readdir(directory);
  await Promise.all(
    files.map(async (name) => {
      if (!allowed.has(name)) throw new Error(`Unexpected Maven publication artifact ${name}`);
      const metadata = await lstat(join(directory, name));
      if (!metadata.isFile() || metadata.size === 0) {
        throw new Error(`Maven publication artifact ${name} must be a non-empty regular file`);
      }
    }),
  );
  for (const name of requiredFiles) {
    if (!files.includes(name)) throw new Error(`Missing Maven publication artifact ${name}`);
  }

  const prefix = `${COMPOSE_ARTIFACT}-${version}`;
  const pom = await readFile(join(directory, `${prefix}.pom`), "utf8");
  assertPortablePom(pom, version);
  return required;
}

export function requireCommand(command, { run = spawnSync } = {}) {
  const result = run(command, ["--version"], { stdio: "ignore" });
  if (result.error?.code === "ENOENT") {
    throw new Error(`Required publication tool '${command}' is not installed`);
  }
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Required publication tool '${command}' is not usable`);
}

export async function signPublication(directory, names, signingKey, signingPassword) {
  if (!signingKey || !signingPassword) {
    throw new Error("Maven publication signing credentials are required");
  }
  requireCommand("gpg");
  // Keep the homedir short enough for macOS Unix-domain socket limits as well as Linux runners.
  const keyring = await mkdtemp(join(tmpdir(), "mcp-gpg-"));
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
    spawnSync("gpgconf", ["--homedir", keyring, "--kill", "gpg-agent"], { stdio: "ignore" });
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

export async function addChecksums(directory) {
  const names = (await readdir(directory)).filter(
    (name) => !name.endsWith(".asc") && !name.endsWith(".md5") && !name.endsWith(".sha1"),
  );
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

export async function prepareBundle(
  version,
  {
    repositoryRoot = defaultRepositoryRoot,
    bundleRoot = defaultBundleRoot,
    bundlePath = defaultBundlePath,
    signingKey,
    signingPassword,
  } = {},
) {
  await rm(bundleRoot, { recursive: true, force: true });
  await rm(bundlePath, { force: true });
  // Check both tools before signing or creating new staging output.
  requireCommand("zip");
  requireCommand("gpg");
  const source = artifactDirectory(repositoryRoot, version);
  const required = await verifyPublication(source, version, { requireSignatures: false });
  try {
    const destination = artifactDirectory(bundleRoot, version);
    await mkdir(dirname(destination), { recursive: true });
    await copyArtifacts(source, destination, required);
    await signPublication(destination, required, signingKey, signingPassword);
    await verifyPublication(destination, version, { requireSignatures: true });
    await addChecksums(destination);
    execFileSync("zip", ["-q", "-r", bundlePath, COMPOSE_GROUP.split(".")[0]], {
      cwd: bundleRoot,
      stdio: "inherit",
    });
    return bundlePath;
  } catch (error) {
    await rm(bundleRoot, { recursive: true, force: true });
    await rm(bundlePath, { force: true });
    throw error;
  }
}

function authorizationHeader() {
  const username = process.env.MAVEN_CENTRAL_USERNAME;
  const password = process.env.MAVEN_CENTRAL_PASSWORD;
  if (!username || !password) throw new Error("Maven Central token credentials are required");
  return `Bearer ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function retryDelay(response, attempt) {
  const retryAfter = Number(response?.headers?.get?.("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(retryAfter * 1_000, 30_000);
  return Math.min(1_000 * 2 ** attempt, 10_000);
}

/* eslint-disable no-await-in-loop -- retries and status polling must remain sequential */
export async function deploymentStatus(
  deploymentId,
  authorization,
  {
    fetchImpl = globalThis.fetch,
    sleep = (milliseconds) =>
      new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
    attempts = 5,
  } = {},
) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchImpl(
        `${portalBase}/status?id=${encodeURIComponent(deploymentId)}`,
        { method: "POST", headers: { Authorization: authorization } },
      );
      if (response.ok) return response.json();
      const body = await response.text();
      if (!retryableStatuses.has(response.status)) {
        throw new Error(`Maven Central status failed: ${response.status} ${body}`);
      }
      lastError = new Error(`Maven Central status failed: ${response.status} ${body}`);
      if (attempt < attempts - 1) await sleep(retryDelay(response, attempt));
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("Maven Central status failed:") &&
        !/status failed: (408|429|500|502|503|504)\b/.test(error.message)
      ) {
        throw error;
      }
      lastError = error;
      if (attempt < attempts - 1) await sleep(Math.min(1_000 * 2 ** attempt, 10_000));
    }
  }
  throw lastError;
}

export async function waitForPublication(
  deploymentId,
  authorization,
  {
    deadline = Date.now() + 30 * 60 * 1_000,
    fetchImpl = globalThis.fetch,
    sleep = (milliseconds) =>
      new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
    now = Date.now,
    pollInterval = 10_000,
    logger = console,
  } = {},
) {
  let previous;
  while (now() < deadline) {
    const current = await deploymentStatus(deploymentId, authorization, { fetchImpl, sleep });
    if (current.deploymentState !== previous) {
      logger.log(`Maven Central deployment ${deploymentId}: ${current.deploymentState}`);
    }
    if (current.deploymentState === "PUBLISHED") return current;
    if (current.deploymentState === "FAILED") {
      throw new Error(
        `Maven Central deployment failed: ${JSON.stringify(current.errors ?? current)}`,
      );
    }
    if (!activeDeploymentStates.has(current.deploymentState)) {
      throw new Error(`Maven Central returned unknown deployment state ${current.deploymentState}`);
    }
    previous = current.deploymentState;
    await sleep(pollInterval);
  }
  throw new Error(`Timed out waiting for Maven Central deployment ${deploymentId}`);
}
/* eslint-enable no-await-in-loop */

export async function buildPublication(
  version,
  { repositoryRoot = defaultRepositoryRoot, run = execFileSync } = {},
) {
  await rm(repositoryRoot, { recursive: true, force: true });
  run(
    join(composeRoot, "gradlew"),
    [
      ":library:publishReleasePublicationToReleaseBundleRepository",
      `-PmcpNativeVersion=${version}`,
      "--no-daemon",
    ],
    { cwd: composeRoot, env: gradleEnvironment(), stdio: "inherit" },
  );
  await verifyPublication(artifactDirectory(repositoryRoot, version), version, {
    requireSignatures: false,
  });
}

async function uploadPublication(version, authorization, repositoryRoot) {
  const bundleWorkspace = await mkdtemp(join(tmpdir(), "mcp-native-central-bundle-"));
  try {
    const archive = await prepareBundle(version, {
      repositoryRoot,
      bundleRoot: join(bundleWorkspace, "contents"),
      bundlePath: join(bundleWorkspace, "mcp-native-compose-central.zip"),
      signingKey: process.env.MAVEN_SIGNING_KEY,
      signingPassword: process.env.MAVEN_SIGNING_PASSWORD,
    });
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
    if (!response.ok) {
      const detail = await response.text();
      const hint =
        response.status === 409
          ? " The coordinate may already exist; resume the recorded deployment ID instead of uploading again."
          : "";
      throw new Error(`Maven Central upload failed: ${response.status} ${detail}${hint}`);
    }
    const deploymentId = requireDeploymentId((await response.text()).trim());
    console.log(`Maven Central deployment ID: ${deploymentId}`);
    return deploymentId;
  } finally {
    await rm(bundleWorkspace, { recursive: true, force: true });
  }
}

async function publish() {
  const version = requireReleaseVersion(process.env.MCP_NATIVE_RELEASE_TAG);
  const authorization = authorizationHeader();
  const resumeId = process.env.MAVEN_CENTRAL_DEPLOYMENT_ID;
  if (resumeId) {
    await waitForPublication(requireDeploymentId(resumeId), authorization);
    return;
  }
  const repository = process.env.MAVEN_PUBLICATION_REPOSITORY;
  if (!repository) {
    throw new Error(
      "MAVEN_PUBLICATION_REPOSITORY must identify output from the credential-free build job",
    );
  }
  const deploymentId = await uploadPublication(version, authorization, resolve(repository));
  await waitForPublication(deploymentId, authorization);
}

const invokedPath = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href;
if (import.meta.url === invokedPath) {
  const command = process.argv[2] ?? "publish";
  const operation =
    command === "build"
      ? buildPublication(requireReleaseVersion(process.env.MCP_NATIVE_RELEASE_TAG))
      : command === "publish"
        ? publish()
        : Promise.reject(new Error(`Unknown Compose publication command '${command}'`));
  operation.catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
