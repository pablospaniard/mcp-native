import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL, URL } from "node:url";

export const NATIVE_OAUTH_EVIDENCE_PATH = "docs/evidence/native-oauth-m6.json";

export const NATIVE_OAUTH_CASES = Object.freeze([
  "secure-storage-backend",
  "persistence-restart",
  "issuer-isolation",
  "atomic-state-consumption",
  "credential-deletion",
  "system-browser-session",
  "callback-success",
  "callback-cancellation",
  "invalid-state-rejection",
  "background-resume",
  "secret-redaction",
]);

export const NATIVE_OAUTH_ROWS = Object.freeze([
  "ios-current-simulator",
  "android-current-emulator",
]);

const requiredRowMetadata = Object.freeze({
  "ios-current-simulator": Object.freeze({
    authorizationSession: "ASWebAuthenticationSession",
    environment: "simulator",
    platform: "iOS",
    reactNative: "0.87.1",
    secureStorage: "iOS Keychain",
  }),
  "android-current-emulator": Object.freeze({
    authorizationSession: "Android Custom Tab",
    environment: "Google Play emulator",
    platform: "Android",
    reactNative: "0.87.1",
    secureStorage: "Android Keystore-backed encryption",
  }),
});

const resultValues = new Set(["fail", "not-run", "pass"]);
const rootKeys = new Set(["matrix", "milestone", "plan", "schemaVersion"]);
const rowKeys = new Set([
  "authorizationSession",
  "backendLibrary",
  "backendVersion",
  "cases",
  "date",
  "device",
  "environment",
  "evidence",
  "id",
  "issues",
  "operatingSystem",
  "platform",
  "reactNative",
  "result",
  "revision",
  "secureStorage",
  "tester",
]);

export function validateNativeOAuthEvidence(
  value,
  { strict = false, evidenceRoot = process.cwd() } = {},
) {
  const document = expectObject(value, "evidence");
  expectExactKeys(document, rootKeys, "evidence");
  if (document.schemaVersion !== 1) {
    throw new Error("evidence.schemaVersion must be exactly 1");
  }
  if (document.milestone !== "M6") {
    throw new Error('evidence.milestone must be exactly "M6"');
  }
  if (document.plan !== "docs/native-oauth-testing.md") {
    throw new Error("evidence.plan must identify the native OAuth test plan");
  }
  validateEvidenceReference(document.plan, "evidence.plan", evidenceRoot);
  if (!Array.isArray(document.matrix) || document.matrix.length !== NATIVE_OAUTH_ROWS.length) {
    throw new Error(
      `evidence.matrix must contain exactly ${NATIVE_OAUTH_ROWS.length} required rows`,
    );
  }

  const seenRows = new Set();
  let passedRows = 0;
  for (const [index, candidate] of document.matrix.entries()) {
    const path = `evidence.matrix[${index}]`;
    const row = expectObject(candidate, path);
    expectExactKeys(row, rowKeys, path);
    const id = expectBoundedString(row.id, `${path}.id`);
    if (!NATIVE_OAUTH_ROWS.includes(id))
      throw new Error(`${path}.id is not a required platform row`);
    if (seenRows.has(id)) throw new Error(`Duplicate native OAuth row ${JSON.stringify(id)}`);
    seenRows.add(id);

    for (const [key, expected] of Object.entries(requiredRowMetadata[id])) {
      if (row[key] !== expected) {
        throw new Error(`${path}.${key} must be exactly ${JSON.stringify(expected)}`);
      }
    }
    for (const key of [
      "backendLibrary",
      "backendVersion",
      "date",
      "device",
      "operatingSystem",
      "revision",
      "tester",
    ]) {
      expectBoundedString(row[key], `${path}.${key}`);
    }
    const result = expectResult(row.result, `${path}.result`);
    validateCases(row.cases, `${path}.cases`, strict);
    validateStringArray(row.evidence, `${path}.evidence`);
    validateStringArray(row.issues, `${path}.issues`);
    for (const [evidenceIndex, reference] of row.evidence.entries()) {
      validateEvidenceReference(reference, `${path}.evidence[${evidenceIndex}]`, evidenceRoot);
    }
    if (strict || result === "pass") validateCompletedRow(row, path);
    if (strict && result !== "pass") {
      throw new Error(`${path}.result must be "pass" for a release candidate`);
    }
    if (result === "pass") passedRows += 1;
  }
  for (const requiredRow of NATIVE_OAUTH_ROWS) {
    if (!seenRows.has(requiredRow)) {
      throw new Error(`Missing native OAuth row ${JSON.stringify(requiredRow)}`);
    }
  }
  return Object.freeze({
    complete: passedRows === NATIVE_OAUTH_ROWS.length,
    passedRows,
    requiredRows: NATIVE_OAUTH_ROWS.length,
  });
}

function validateCases(value, path, strict) {
  const cases = expectObject(value, path);
  expectExactKeys(cases, new Set(NATIVE_OAUTH_CASES), path);
  for (const caseName of NATIVE_OAUTH_CASES) {
    const result = expectResult(cases[caseName], `${path}.${caseName}`);
    if (strict && result !== "pass") {
      throw new Error(`${path}.${caseName} must be "pass" for a release candidate`);
    }
  }
}

function validateCompletedRow(row, path) {
  for (const key of ["backendLibrary", "backendVersion", "device", "operatingSystem", "tester"]) {
    if (row[key] === "not-run") throw new Error(`${path}.${key} must record the tested value`);
  }
  if (!/^[0-9a-f]{40}$/.test(row.revision)) {
    throw new Error(`${path}.revision must be a full lowercase Git commit SHA`);
  }
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(row.date);
  if (dateParts === null || !isExactCalendarDate(dateParts)) {
    throw new Error(`${path}.date must be an ISO calendar date`);
  }
  if (row.evidence.length === 0) {
    throw new Error(`${path}.evidence must contain at least one reviewable artifact`);
  }
}

function validateEvidenceReference(value, path, evidenceRoot) {
  const reference = expectBoundedString(value, path);
  if (reference.startsWith("https://")) {
    let url;
    try {
      url = new URL(reference);
    } catch {
      throw new Error(`${path} must be a valid HTTPS URL`);
    }
    if (
      url.protocol !== "https:" ||
      url.hostname.length === 0 ||
      url.username.length !== 0 ||
      url.password.length !== 0
    ) {
      throw new Error(`${path} must be a credential-free HTTPS URL`);
    }
    return;
  }
  if (isAbsolute(reference) || reference.includes("\\") || reference.split("/").includes("..")) {
    throw new Error(`${path} must be an HTTPS URL or a safe repository-relative path`);
  }
  if (!existsSync(resolve(evidenceRoot, reference))) {
    throw new Error(`${path} references missing evidence ${JSON.stringify(reference)}`);
  }
}

function isExactCalendarDate([, yearText, monthText, dayText]) {
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const normalized = new Date(0);
  normalized.setUTCHours(0, 0, 0, 0);
  normalized.setUTCFullYear(year, month - 1, day);
  return (
    normalized.getUTCFullYear() === year &&
    normalized.getUTCMonth() === month - 1 &&
    normalized.getUTCDate() === day
  );
}

function expectObject(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${path} must be a plain object`);
  }
  return value;
}

function expectExactKeys(value, expected, path) {
  for (const key of Object.keys(value)) {
    if (!expected.has(key))
      throw new Error(`${path} contains unknown field ${JSON.stringify(key)}`);
  }
  for (const key of expected) {
    if (!Object.hasOwn(value, key)) {
      throw new Error(`${path} is missing required field ${JSON.stringify(key)}`);
    }
  }
}

function expectBoundedString(value, path) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 4_096) {
    throw new Error(`${path} must be a non-empty bounded string`);
  }
  return value;
}

function expectResult(value, path) {
  if (!resultValues.has(value)) {
    throw new Error(`${path} must be "pass", "fail", or "not-run"`);
  }
  return value;
}

function validateStringArray(value, path) {
  if (!Array.isArray(value) || value.length > 32) {
    throw new Error(`${path} must be a bounded string array`);
  }
  for (const [index, item] of value.entries()) expectBoundedString(item, `${path}[${index}]`);
}

function runFromCommandLine(arguments_) {
  const strict = arguments_.includes("--strict");
  const paths = arguments_.filter((argument) => argument !== "--strict");
  if (paths.length > 1) throw new Error("Expected at most one native OAuth evidence path");
  const evidencePath = paths[0] ?? NATIVE_OAUTH_EVIDENCE_PATH;
  const value = JSON.parse(readFileSync(evidencePath, "utf8"));
  const result = validateNativeOAuthEvidence(value, { strict });
  console.log(
    `Verified native OAuth evidence structure: ${result.passedRows}/${result.requiredRows} rows pass${strict ? " (release-candidate gate)" : ""}.`,
  );
}

const invokedPath = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href;
if (import.meta.url === invokedPath) runFromCommandLine(process.argv.slice(2));
