import { negotiateMcpExtension } from "@mcp-native/core";
import type { JsonObject, McpExtensionSettings } from "@mcp-native/core";

import { A2UI_MIME_TYPE } from "./mime.js";
import { A2UI_MCP_SCHEMA_REVISION } from "./schema-revision.js";

/** Project-owned MCP binding for carrying ordered official A2UI messages. */
export const A2UI_MCP_EXTENSION_ID = "io.github.pablospaniard/mcp-native-a2ui" as const;
export const A2UI_MCP_BINDING_VERSION = "0.1" as const;
export const A2UI_MCP_PROTOCOL_VERSION = "v1.0" as const;
export const A2UI_MCP_TRANSPORT = "resource-text-jsonl" as const;

const a2uiMcpSettings = Object.freeze({
  bindingVersion: A2UI_MCP_BINDING_VERSION,
  protocolVersion: A2UI_MCP_PROTOCOL_VERSION,
  schemaRevision: A2UI_MCP_SCHEMA_REVISION,
  transport: A2UI_MCP_TRANSPORT,
  mimeType: A2UI_MIME_TYPE,
}) satisfies JsonObject;

const A2UI_MCP_BINDING_GRANT_KEYS = [
  "kind",
  "identifier",
  "bindingVersion",
  "protocolVersion",
  "schemaRevision",
  "transport",
  "mimeType",
] as const;

/** Reuse this exact map for SDK advertisement and local negotiation. */
export const A2UI_MCP_EXTENSION_CAPABILITIES: McpExtensionSettings = Object.freeze({
  [A2UI_MCP_EXTENSION_ID]: a2uiMcpSettings,
});

export type A2uiMcpBindingNegotiation =
  | {
      readonly kind: "fallback";
      readonly identifier: typeof A2UI_MCP_EXTENSION_ID;
      readonly reason: "client-unsupported" | "server-unsupported" | "incompatible-settings";
    }
  | {
      readonly kind: "negotiated";
      readonly identifier: typeof A2UI_MCP_EXTENSION_ID;
      readonly bindingVersion: typeof A2UI_MCP_BINDING_VERSION;
      readonly protocolVersion: typeof A2UI_MCP_PROTOCOL_VERSION;
      readonly schemaRevision: typeof A2UI_MCP_SCHEMA_REVISION;
      readonly transport: typeof A2UI_MCP_TRANSPORT;
      readonly mimeType: typeof A2UI_MIME_TYPE;
    };

export type A2uiMcpBindingGrant = Extract<A2uiMcpBindingNegotiation, { kind: "negotiated" }>;

/**
 * Enables the project A2UI binding only for an exact, mutual settings match.
 * A fallback result means callers must use ordinary MCP text/structured data.
 */
export function negotiateA2uiMcpBinding(
  clientExtensions: unknown,
  serverExtensions: unknown,
): A2uiMcpBindingNegotiation {
  const negotiation = negotiateMcpExtension(
    A2UI_MCP_EXTENSION_ID,
    clientExtensions,
    serverExtensions,
  );
  if (negotiation.kind === "fallback") {
    return {
      kind: "fallback",
      identifier: A2UI_MCP_EXTENSION_ID,
      reason: negotiation.reason,
    };
  }
  if (
    !matchesA2uiMcpSettings(negotiation.clientSettings) ||
    !matchesA2uiMcpSettings(negotiation.serverSettings)
  ) {
    return {
      kind: "fallback",
      identifier: A2UI_MCP_EXTENSION_ID,
      reason: "incompatible-settings",
    };
  }
  return {
    kind: "negotiated",
    identifier: A2UI_MCP_EXTENSION_ID,
    bindingVersion: A2UI_MCP_BINDING_VERSION,
    protocolVersion: A2UI_MCP_PROTOCOL_VERSION,
    schemaRevision: A2UI_MCP_SCHEMA_REVISION,
    transport: A2UI_MCP_TRANSPORT,
    mimeType: A2UI_MIME_TYPE,
  };
}

export function isA2uiMcpBindingGrant(value: unknown): value is A2uiMcpBindingGrant {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const grant = value as Record<string, unknown>;
  return (
    Object.keys(grant).length === A2UI_MCP_BINDING_GRANT_KEYS.length &&
    A2UI_MCP_BINDING_GRANT_KEYS.every((key) => Object.hasOwn(grant, key)) &&
    grant.kind === "negotiated" &&
    grant.identifier === A2UI_MCP_EXTENSION_ID &&
    grant.bindingVersion === A2UI_MCP_BINDING_VERSION &&
    grant.protocolVersion === A2UI_MCP_PROTOCOL_VERSION &&
    grant.schemaRevision === A2UI_MCP_SCHEMA_REVISION &&
    grant.transport === A2UI_MCP_TRANSPORT &&
    grant.mimeType === A2UI_MIME_TYPE
  );
}

function matchesA2uiMcpSettings(settings: JsonObject): boolean {
  return (
    Object.keys(settings).length === 5 &&
    settings.bindingVersion === A2UI_MCP_BINDING_VERSION &&
    settings.protocolVersion === A2UI_MCP_PROTOCOL_VERSION &&
    settings.schemaRevision === A2UI_MCP_SCHEMA_REVISION &&
    settings.transport === A2UI_MCP_TRANSPORT &&
    settings.mimeType === A2UI_MIME_TYPE
  );
}
