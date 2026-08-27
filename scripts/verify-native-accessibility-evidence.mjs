import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL, URL } from "node:url";

export const NATIVE_ACCESSIBILITY_EVIDENCE_PATH = "docs/evidence/native-accessibility-0.4.0.json";

export const NATIVE_ACCESSIBILITY_CASES = Object.freeze([
  "focus-navigation",
  "announcements",
  "screen-reader-actions",
  "input-editing",
  "dynamic-type",
  "orientation-motion-contrast",
  "wcag-inspection",
  "catalog-parity",
]);

export const NATIVE_ACCESSIBILITY_ROWS = Object.freeze([
  "ios-minimum",
  "ios-current",
  "android-minimum",
  "android-current-device",
  "android-current-emulator",
  "ios-previous-react-native",
  "android-previous-react-native",
]);

const requiredRowMetadata = Object.freeze({
  "ios-minimum": Object.freeze({
    assistiveTechnology: "VoiceOver",
    environment: "physical device",
    operatingSystem: "iOS 15.1",
    reactNative: "0.87.1",
  }),
  "ios-current": Object.freeze({
    assistiveTechnology: "VoiceOver",
    environment: "physical device",
    operatingSystem: "iOS 26.6.1",
    reactNative: "0.87.1",
  }),
  "android-minimum": Object.freeze({
    assistiveTechnology: "TalkBack",
    environment: "physical device",
    operatingSystem: "Android 7 / API 24",
    reactNative: "0.87.1",
  }),
  "android-current-device": Object.freeze({
    assistiveTechnology: "TalkBack",
    environment: "physical device",
    operatingSystem: "Android 17 / API 37",
    reactNative: "0.87.1",
  }),
  "android-current-emulator": Object.freeze({
    assistiveTechnology: "TalkBack",
    environment: "Google Play emulator",
    operatingSystem: "Android 17 / API 37",
    reactNative: "0.87.1",
  }),
  "ios-previous-react-native": Object.freeze({
    assistiveTechnology: "VoiceOver",
    environment: "physical device",
    operatingSystem: "iOS 26.6.1",
    reactNative: "0.86.3",
  }),
  "android-previous-react-native": Object.freeze({
    assistiveTechnology: "TalkBack",
    environment: "physical device",
    operatingSystem: "Android 17 / API 37",
    reactNative: "0.86.3",
  }),
});

const allowedCatalogPaths = Object.freeze(["adapters", "primitives", "variants"]);
const resultValues = new Set(["fail", "not-run", "pass"]);
const rootKeys = new Set(["fixture", "matrix", "release", "schemaVersion", "wcagAssessment"]);
const rowKeys = new Set([
  "assistiveTechnology",
  "assistiveTechnologyVersion",
  "catalogPaths",
  "cases",
  "date",
  "device",
  "environment",
  "evidence",
  "id",
  "issues",
  "locale",
  "operatingSystem",
  "reactNative",
  "result",
  "revision",
  "tester",
  "textSize",
]);

export function validateNativeAccessibilityEvidence(
  value,
  { strict = false, evidenceRoot = process.cwd() } = {},
) {
  const document = expectObject(value, "evidence");
  expectExactKeys(document, rootKeys, "evidence");
  if (document.schemaVersion !== 1) {
    throw new Error("evidence.schemaVersion must be exactly 1");
  }
  if (document.release !== "0.4.0") {
    throw new Error('evidence.release must be exactly "0.4.0"');
  }
  if (document.fixture !== "tests/fixtures/a2ui-v1/accessibility-surface.json") {
    throw new Error("evidence.fixture must identify the pinned accessibility fixture");
  }
  expectNonEmptyString(document.wcagAssessment, "evidence.wcagAssessment");
  validateEvidenceReference(document.wcagAssessment, "evidence.wcagAssessment", evidenceRoot);

  if (
    !Array.isArray(document.matrix) ||
    document.matrix.length !== NATIVE_ACCESSIBILITY_ROWS.length
  ) {
    throw new Error(
      `evidence.matrix must contain exactly ${NATIVE_ACCESSIBILITY_ROWS.length} required rows`,
    );
  }

  const seenRows = new Set();
  let passedRows = 0;
  for (const [index, candidate] of document.matrix.entries()) {
    const path = `evidence.matrix[${index}]`;
    const row = expectObject(candidate, path);
    expectExactKeys(row, rowKeys, path);
    const id = expectNonEmptyString(row.id, `${path}.id`);
    if (!NATIVE_ACCESSIBILITY_ROWS.includes(id)) {
      throw new Error(`${path}.id is not a required platform row`);
    }
    if (seenRows.has(id)) {
      throw new Error(`Duplicate native accessibility row ${JSON.stringify(id)}`);
    }
    seenRows.add(id);

    validateRequiredRowMetadata(row, requiredRowMetadata[id], path);
    expectExactStringArray(row.catalogPaths, allowedCatalogPaths, `${path}.catalogPaths`);
    const result = expectResult(row.result, `${path}.result`);
    validateCases(row.cases, `${path}.cases`, strict);
    validateStringArray(row.evidence, `${path}.evidence`);
    validateStringArray(row.issues, `${path}.issues`);

    for (const [evidenceIndex, reference] of row.evidence.entries()) {
      validateEvidenceReference(reference, `${path}.evidence[${evidenceIndex}]`, evidenceRoot);
    }

    if (strict || result === "pass") {
      expectReleaseEvidenceFields(row, path);
    }
    if (strict && result !== "pass") {
      throw new Error(`${path}.result must be "pass" for a release`);
    }
    if (result === "pass") {
      passedRows += 1;
    }
  }

  for (const requiredRow of NATIVE_ACCESSIBILITY_ROWS) {
    if (!seenRows.has(requiredRow)) {
      throw new Error(`Missing native accessibility row ${JSON.stringify(requiredRow)}`);
    }
  }

  return Object.freeze({
    complete: passedRows === NATIVE_ACCESSIBILITY_ROWS.length,
    passedRows,
    requiredRows: NATIVE_ACCESSIBILITY_ROWS.length,
  });
}

function validateRequiredRowMetadata(row, expected, path) {
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (row[key] !== expectedValue) {
      throw new Error(`${path}.${key} must be exactly ${JSON.stringify(expectedValue)}`);
    }
  }
}

function validateCases(value, path, strict) {
  const cases = expectObject(value, path);
  expectExactKeys(cases, new Set(NATIVE_ACCESSIBILITY_CASES), path);
  for (const caseName of NATIVE_ACCESSIBILITY_CASES) {
    const result = expectResult(cases[caseName], `${path}.${caseName}`);
    if (strict && result !== "pass") {
      throw new Error(`${path}.${caseName} must be "pass" for a release`);
    }
  }
}

function expectReleaseEvidenceFields(row, path) {
  const revision = expectNonEmptyString(row.revision, `${path}.revision`);
  if (!/^[0-9a-f]{40}$/.test(revision)) {
    throw new Error(`${path}.revision must be a full lowercase Git commit SHA`);
  }
  const date = expectNonEmptyString(row.date, `${path}.date`);
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (dateParts === null || !isExactCalendarDate(dateParts)) {
    throw new Error(`${path}.date must be an ISO calendar date`);
  }
  expectNonEmptyString(row.tester, `${path}.tester`);
  expectNonEmptyString(row.device, `${path}.device`);
  expectNonEmptyString(row.assistiveTechnologyVersion, `${path}.assistiveTechnologyVersion`);
  expectNonEmptyString(row.locale, `${path}.locale`);
  expectNonEmptyString(row.textSize, `${path}.textSize`);
  if (row.evidence.length === 0) {
    throw new Error(`${path}.evidence must contain at least one reviewable artifact`);
  }
}

function validateEvidenceReference(value, path, evidenceRoot) {
  const reference = expectNonEmptyString(value, path);
  if (/^https:\/\//.test(reference)) {
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

function expectExactKeys(value, allowedKeys, path) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${path} contains unknown field ${JSON.stringify(key)}`);
    }
  }
  for (const key of allowedKeys) {
    if (!Object.hasOwn(value, key)) {
      throw new Error(`${path} is missing required field ${JSON.stringify(key)}`);
    }
  }
}

function expectNonEmptyString(value, path) {
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
  for (const [index, item] of value.entries()) {
    expectNonEmptyString(item, `${path}[${index}]`);
  }
}

function expectExactStringArray(value, expected, path) {
  validateStringArray(value, path);
  if (value.length !== expected.length || value.some((item, index) => item !== expected[index])) {
    throw new Error(`${path} must be exactly ${JSON.stringify(expected)}`);
  }
}

function runFromCommandLine(arguments_) {
  const strict = arguments_.includes("--strict");
  const paths = arguments_.filter((argument) => argument !== "--strict");
  if (paths.length > 1) {
    throw new Error("Expected at most one native accessibility evidence path");
  }
  const evidencePath = paths[0] ?? NATIVE_ACCESSIBILITY_EVIDENCE_PATH;
  const value = JSON.parse(readFileSync(evidencePath, "utf8"));
  const result = validateNativeAccessibilityEvidence(value, { strict });
  console.log(
    `Verified native accessibility evidence structure: ${result.passedRows}/${result.requiredRows} rows pass${strict ? " (release gate)" : ""}.`,
  );
}

const invokedPath = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href;
if (import.meta.url === invokedPath) {
  runFromCommandLine(process.argv.slice(2));
}
