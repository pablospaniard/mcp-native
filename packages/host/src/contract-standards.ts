import {
  JSON_MAX_DEPTH,
  JSON_MAX_VALUES,
  JSON_MAX_STRING_LENGTH,
  JSON_MAX_TOTAL_STRING_CODE_UNITS,
  type McpExtensionSettings,
} from "@mcp-native/core";
import {
  MCP_NATIVE_PROTOCOL_REVISION,
  MCP_NATIVE_LEGACY_PROTOCOL_REVISION,
  MCP_SDK_MAX_RESULT_ITEMS,
} from "@mcp-native/mcp";
import {
  MCP_EXTENSION_CAPABILITIES,
  MCP_EXTENSION_ID,
  MCP_BINDING_VERSION,
  MCP_SCHEMA_REVISION,
  PROTOCOL_VERSION,
  MIME_TYPE,
  MAX_SOURCE_LENGTH,
  MAX_COMPONENTS,
  MAX_ENVELOPES,
} from "@mcp-native/a2ui";
import {
  MCP_APPS_EXTENSION_CAPABILITIES,
  MCP_APPS_EXTENSION_ID,
  MCP_APPS_PROTOCOL_VERSION,
  MCP_APPS_MIME_TYPE,
  MCP_APPS_MAX_HTML_LENGTH,
  MCP_APPS_MAX_CSP_DOMAINS,
  MCP_APPS_MAX_TOOLS,
} from "@mcp-native/webview";
import { fail } from "./contracts-schema.js";

export type StandardContractId =
  | "io.modelcontextprotocol/ordinary"
  | "org.a2ui/native"
  | "io.modelcontextprotocol/apps";
/** Library-maintained inventory, not a custom wire descriptor or a renderer/policy grant. */
export interface StandardContractProfile {
  readonly manifestVersion: "1";
  readonly id: StandardContractId;
  readonly protocolVersion: string;
  readonly schemaRevision: string;
  readonly compatibility: "verified-boundary" | "candidate-profile" | "stable-profile";
  readonly conformance: "selected-scenarios" | "pinned-schema-fixtures" | "official-schema-interop";
  readonly mimeTypes: readonly string[];
  readonly extensions: McpExtensionSettings;
  readonly limits: Readonly<Record<string, number>>;
  readonly responsibilities: Readonly<
    Record<
      | "recognition"
      | "validation"
      | "resources"
      | "rendering"
      | "actions"
      | "lifecycle"
      | "fallback",
      string
    >
  >;
  readonly evidence: readonly string[];
  readonly exclusions: readonly string[];
}
/** Only maintained factory-issued registrations are accepted. */
export interface StandardContractRegistration {
  readonly profile: StandardContractProfile;
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const ordinary = freeze<StandardContractRegistration>({
  profile: {
    manifestVersion: "1",
    id: "io.modelcontextprotocol/ordinary",
    protocolVersion: MCP_NATIVE_PROTOCOL_REVISION,
    schemaRevision: MCP_NATIVE_PROTOCOL_REVISION,
    compatibility: "verified-boundary",
    conformance: "selected-scenarios",
    mimeTypes: [],
    extensions: {},
    limits: {
      maxDepth: JSON_MAX_DEPTH,
      maxValues: JSON_MAX_VALUES,
      maxStringCodeUnits: JSON_MAX_STRING_LENGTH,
      maxTotalStringCodeUnits: JSON_MAX_TOTAL_STRING_CODE_UNITS,
      maxResultItems: MCP_SDK_MAX_RESULT_ITEMS,
    },
    responsibilities: {
      recognition: "Unclaimed or unnegotiated validated MCP tool content",
      validation: "MCP SDK adapter and bounded core JSON reconstruction",
      resources: "No resource loading on ordinary fallback",
      rendering: "Host-owned bounded inert fallback; no executable renderer",
      actions: "No action authority",
      lifecycle: "Connection-bound controller snapshot",
      fallback: "Invalid MCP input fails closed",
    },
    evidence: ["docs/protocol-support.md", "docs/mcp-conformance.md"],
    exclusions: [
      `Compatibility lane ${MCP_NATIVE_LEGACY_PROTOCOL_REVISION} is documented separately`,
      "Not full MCP feature coverage",
      "No MIME-based execution",
    ],
  },
});
const a2ui = freeze<StandardContractRegistration>({
  profile: {
    manifestVersion: "1",
    id: "org.a2ui/native",
    protocolVersion: PROTOCOL_VERSION,
    schemaRevision: MCP_SCHEMA_REVISION,
    compatibility: "candidate-profile",
    conformance: "pinned-schema-fixtures",
    mimeTypes: [MIME_TYPE],
    extensions: MCP_EXTENSION_CAPABILITIES,
    limits: {
      maxSourceCodeUnits: MAX_SOURCE_LENGTH,
      maxComponents: MAX_COMPONENTS,
      maxEnvelopes: MAX_ENVELOPES,
    },
    responsibilities: {
      recognition: `Mutual ${MCP_EXTENSION_ID} binding ${MCP_BINDING_VERSION} plus exact resource-link MIME`,
      validation: "Existing pinned A2UI JSONL parser and surface/catalog validation",
      resources: "Connection-bound resource-text-jsonl reader",
      rendering: "Existing A2UI view and explicitly installed host catalog",
      actions: "Existing A2UI envelope validation and host authorization",
      lifecycle: "Existing surface store and host view disposal",
      fallback: "Unnegotiated claims stay ordinary; selected validation failure stays invalid",
    },
    evidence: ["docs/a2ui-mcp-binding.md", "docs/standards-compatibility.md"],
    exclusions: [
      "Candidate revision only; no v0.9.1 or later revision inference",
      "No automatic renderer/catalog installation",
      "No custom retry after standard failure",
    ],
  },
});
const apps = freeze<StandardContractRegistration>({
  profile: {
    manifestVersion: "1",
    id: "io.modelcontextprotocol/apps",
    protocolVersion: MCP_APPS_PROTOCOL_VERSION,
    schemaRevision: "92f46a574568a3ddac7600343b7d3c4c4ed7b588",
    compatibility: "stable-profile",
    conformance: "official-schema-interop",
    mimeTypes: [MCP_APPS_MIME_TYPE],
    extensions: MCP_APPS_EXTENSION_CAPABILITIES,
    limits: {
      maxHtmlCodeUnits: MCP_APPS_MAX_HTML_LENGTH,
      maxCspDomains: MCP_APPS_MAX_CSP_DOMAINS,
      maxTools: MCP_APPS_MAX_TOOLS,
    },
    responsibilities: {
      recognition: `Mutual ${MCP_APPS_EXTENSION_ID} exact MIME and tool _meta.ui.resourceUri`,
      validation: "Existing MCP Apps tool/resource and bridge schemas",
      resources: "Connection-bound resources/read with CSP metadata validation",
      rendering:
        "Existing MCP Apps view with an explicitly installed isolated native WebView sandbox",
      actions: "Existing bridge validation and host authorization",
      lifecycle: "Existing bridge initialization, cancellation, and teardown",
      fallback: "Unnegotiated claims stay ordinary; selected validation failure stays invalid",
    },
    evidence: ["docs/mcp-apps-compatibility.md", "@modelcontextprotocol/ext-apps@1.7.5"],
    exclusions: [
      "Native profile, not browser double-iframe hosting",
      "Source commit manually verified against pinned official package",
      "No implicit WebView installation or permission grants",
    ],
  },
});

export function createMcpOrdinaryContract(): StandardContractRegistration {
  return ordinary;
}
export function createA2uiStandardContract(): StandardContractRegistration {
  return a2ui;
}
export function createMcpAppsStandardContract(): StandardContractRegistration {
  return apps;
}
const maintained = Object.freeze([ordinary, a2ui, apps]);

export interface ContractRegistryOptions {
  /** Omission retains all current built-ins. Ordinary inert fallback is always included. */
  readonly standards?: readonly StandardContractRegistration[];
}

// Private selection: callers cannot supply recognition, parser, renderer, or policy callbacks.
export function selectStandards(
  input: readonly StandardContractRegistration[] | undefined,
): readonly StandardContractProfile[] {
  const selected = input === undefined ? maintained : input;
  if (!Array.isArray(selected) || selected.length > maintained.length) fail("invalid-registry");
  const seen = new Set<StandardContractRegistration>();
  for (const registration of selected) {
    if (!maintained.includes(registration) || seen.has(registration)) fail("invalid-registry");
    seen.add(registration);
  }
  seen.add(ordinary);
  return Object.freeze(maintained.filter((entry) => seen.has(entry)).map((entry) => entry.profile));
}
export function hasUninstalledStandard(
  client: McpExtensionSettings,
  installed: McpExtensionSettings,
): boolean {
  return [MCP_EXTENSION_ID, MCP_APPS_EXTENSION_ID].some(
    (key) => Object.hasOwn(client, key) && !Object.hasOwn(installed, key),
  );
}
