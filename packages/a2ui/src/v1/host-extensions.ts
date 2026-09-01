import {
  JSON_MAX_STRING_LENGTH,
  JSON_MAX_TOTAL_STRING_CODE_UNITS,
  JSON_MAX_VALUES,
  isMcpExtensionIdentifier,
  negotiateMcpExtension,
  parseJsonObject,
} from "@mcp-native/core";
import type { JsonObject, JsonValue, McpExtensionSettings } from "@mcp-native/core";
import type { ValidateFunction } from "ajv/dist/2020.js";
import Ajv2020Import from "ajv/dist/2020.js";
import addFormatsImport from "ajv-formats";

import { A2uiParseError } from "../errors.js";

export const A2UI_V1_HOST_EXTENSION_PROFILE_ID = "io.mcp-native/a2ui-host-extensions" as const;
export const A2UI_V1_HOST_EXTENSION_PROFILE_VERSION = "1" as const;
export const A2UI_V1_HOST_EXTENSION_MAX_MANIFESTS = 64;
export const A2UI_V1_HOST_EXTENSION_MAX_EVENTS = 64;
export const A2UI_V1_HOST_EXTENSION_MAX_NEEDS = 64;
export const A2UI_V1_HOST_EXTENSION_MAX_INSTANCES = 256;
export const A2UI_V1_HOST_EXTENSION_MAX_UPDATES = 4_096;

export type A2uiV1HostPlatform = "android" | "ios";

export interface A2uiV1HostExtensionEventManifest {
  readonly name: string;
  readonly payloadSchema: JsonObject;
  readonly requiresUserActivation: boolean;
}

export interface A2uiV1HostExtensionManifest {
  readonly profileVersion: typeof A2UI_V1_HOST_EXTENSION_PROFILE_VERSION;
  readonly extensionId: string;
  readonly catalogId: string;
  readonly catalogVersion: string;
  readonly schemaVersion: string;
  readonly componentName: string;
  readonly propsSchema: JsonObject;
  readonly events: readonly A2uiV1HostExtensionEventManifest[];
  readonly platforms: readonly A2uiV1HostPlatform[];
  readonly accessibility: {
    readonly ownership: "host";
    readonly requiresLabel: boolean;
    readonly behavior: string;
  };
  readonly resourceNeeds: readonly string[];
  readonly permissionNeeds: readonly string[];
  readonly limits: {
    readonly maximumInstances: number;
    readonly maximumEventPayloadValues: number;
    readonly maximumEventPayloadStringCodeUnits: number;
    readonly maximumPropsValues: number;
    readonly maximumPropsStringCodeUnits: number;
    readonly maximumUpdatesPerSurface: number;
  };
  readonly fallback: { readonly kind: "reject" };
  readonly compatibility: {
    readonly owner: string;
    readonly supportUrl?: string;
  };
}

export interface A2uiV1HostExtensionCapabilityEntry {
  readonly extensionId: string;
  readonly catalogId: string;
  readonly catalogVersion: string;
  readonly schemaVersion: string;
  readonly componentName: string;
}

export interface A2uiV1HostExtensionCapabilitySettings {
  readonly profileVersion: typeof A2UI_V1_HOST_EXTENSION_PROFILE_VERSION;
  readonly extensions: readonly A2uiV1HostExtensionCapabilityEntry[];
}

export type A2uiV1HostExtensionNegotiation =
  | {
      readonly kind: "fallback";
      readonly profileId: typeof A2UI_V1_HOST_EXTENSION_PROFILE_ID;
      readonly reason: "host-unsupported" | "server-unsupported" | "no-exact-extension-match";
    }
  | {
      readonly kind: "negotiated";
      readonly profileId: typeof A2UI_V1_HOST_EXTENSION_PROFILE_ID;
      readonly profileVersion: typeof A2UI_V1_HOST_EXTENSION_PROFILE_VERSION;
      readonly extensions: readonly A2uiV1HostExtensionCapabilityEntry[];
      readonly inlineCatalogsEnabled: false;
    };

export interface A2uiV1HostExtensionRegistry {
  readonly platform: A2uiV1HostPlatform;
  readonly manifests: readonly A2uiV1HostExtensionManifest[];
}

export interface A2uiV1HostExtensionRegistryOptions {
  readonly platform: A2uiV1HostPlatform;
  readonly manifests: readonly unknown[];
  readonly negotiation: A2uiV1HostExtensionNegotiation;
}

export interface A2uiV1ValidatedHostExtensionComponent {
  readonly manifest: A2uiV1HostExtensionManifest;
  readonly props: JsonObject;
  readonly manifestFingerprint: string;
}

type AjvInstance = {
  compile(schema: object): ValidateFunction;
};

type AjvConstructor = new (options?: {
  allErrors?: boolean;
  strict?: boolean;
  validateSchema?: boolean;
}) => AjvInstance;

type FormatsPlugin = (ajv: AjvInstance) => unknown;

interface CompiledManifest {
  readonly manifest: A2uiV1HostExtensionManifest;
  readonly fingerprint: string;
  readonly propsValidator: ValidateFunction;
  readonly eventValidators: ReadonlyMap<string, ValidateFunction>;
  readonly eventManifests: ReadonlyMap<string, A2uiV1HostExtensionEventManifest>;
}

interface RegistryState {
  readonly byComponentKey: ReadonlyMap<string, CompiledManifest>;
}

const Ajv2020 = Ajv2020Import as unknown as AjvConstructor;
const addFormats = addFormatsImport as unknown as FormatsPlugin;
const registryStates = new WeakMap<A2uiV1HostExtensionRegistry, RegistryState>();
const negotiatedResults = new WeakSet<object>();
const parsedManifests = new WeakSet<A2uiV1HostExtensionManifest>();
const compiledManifestCache = new WeakMap<A2uiV1HostExtensionManifest, CompiledManifest>();
const RESERVED_PROP_NAMES = new Set([
  "accessibility",
  "action",
  "catalogId",
  "child",
  "children",
  "component",
  "id",
  "metadata",
  "tabs",
  "weight",
]);
const FORBIDDEN_EXTENSION_COMPONENT_FIELDS = new Set(["action", "child", "children", "tabs"]);
const STABLE_VERSION_PATTERN = /^(?:0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*)){0,2}$/;
const NEED_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

/** Validates and freezes one locally authored host-extension compatibility manifest. */
export function parseA2uiV1HostExtensionManifest(
  input: unknown,
  path = "host extension manifest",
): A2uiV1HostExtensionManifest {
  const value = parseJsonObject(input, path);
  rejectKeys(
    value,
    [
      "accessibility",
      "catalogId",
      "catalogVersion",
      "compatibility",
      "componentName",
      "events",
      "extensionId",
      "fallback",
      "limits",
      "permissionNeeds",
      "platforms",
      "profileVersion",
      "propsSchema",
      "resourceNeeds",
      "schemaVersion",
    ],
    path,
  );
  if (value.profileVersion !== A2UI_V1_HOST_EXTENSION_PROFILE_VERSION) {
    throw new A2uiParseError(
      `Expected host-extension profile version ${A2UI_V1_HOST_EXTENSION_PROFILE_VERSION} at ${path}.profileVersion`,
    );
  }
  const extensionId = expectString(value.extensionId, `${path}.extensionId`);
  if (!isMcpExtensionIdentifier(extensionId)) {
    throw new A2uiParseError(`Expected a namespaced extension identifier at ${path}.extensionId`);
  }
  const catalogVersion = expectStableVersion(value.catalogVersion, `${path}.catalogVersion`);
  const schemaVersion = expectStableVersion(value.schemaVersion, `${path}.schemaVersion`);
  const catalogId = expectString(value.catalogId, `${path}.catalogId`);
  if (catalogId !== `${extensionId}@${catalogVersion}`) {
    throw new A2uiParseError(
      `Expected ${path}.catalogId to equal the exact extension and catalog version`,
    );
  }
  const componentName = expectString(value.componentName, `${path}.componentName`);
  if (
    !componentName.startsWith(`${extensionId}:`) ||
    !/^[A-Z][A-Za-z0-9]*$/.test(componentName.slice(extensionId.length + 1))
  ) {
    throw new A2uiParseError(
      `Expected a namespaced PascalCase component name at ${path}.componentName`,
    );
  }

  const propsSchema = parseClosedSchema(value.propsSchema, `${path}.propsSchema`, true);
  const events = parseEvents(value.events, extensionId, `${path}.events`);
  const platforms = parsePlatforms(value.platforms, `${path}.platforms`);
  const accessibilityValue = parseJsonObject(value.accessibility, `${path}.accessibility`);
  rejectKeys(
    accessibilityValue,
    ["behavior", "ownership", "requiresLabel"],
    `${path}.accessibility`,
  );
  if (accessibilityValue.ownership !== "host") {
    throw new A2uiParseError(`Expected the string "host" at ${path}.accessibility.ownership`);
  }
  const requiresLabel = expectBoolean(
    accessibilityValue.requiresLabel,
    `${path}.accessibility.requiresLabel`,
  );
  const behavior = expectNonEmptyBoundedString(
    accessibilityValue.behavior,
    `${path}.accessibility.behavior`,
  );
  const resourceNeeds = parseNeeds(value.resourceNeeds, `${path}.resourceNeeds`);
  const permissionNeeds = parseNeeds(value.permissionNeeds, `${path}.permissionNeeds`);

  const limitsValue = parseJsonObject(value.limits, `${path}.limits`);
  rejectKeys(
    limitsValue,
    [
      "maximumInstances",
      "maximumEventPayloadStringCodeUnits",
      "maximumEventPayloadValues",
      "maximumPropsStringCodeUnits",
      "maximumPropsValues",
      "maximumUpdatesPerSurface",
    ],
    `${path}.limits`,
  );
  const maximumInstances = expectInteger(
    limitsValue.maximumInstances,
    1,
    A2UI_V1_HOST_EXTENSION_MAX_INSTANCES,
    `${path}.limits.maximumInstances`,
  );
  const maximumEventPayloadValues = expectInteger(
    limitsValue.maximumEventPayloadValues,
    1,
    JSON_MAX_VALUES,
    `${path}.limits.maximumEventPayloadValues`,
  );
  const maximumEventPayloadStringCodeUnits = expectInteger(
    limitsValue.maximumEventPayloadStringCodeUnits,
    1,
    JSON_MAX_TOTAL_STRING_CODE_UNITS,
    `${path}.limits.maximumEventPayloadStringCodeUnits`,
  );
  const maximumPropsValues = expectInteger(
    limitsValue.maximumPropsValues,
    1,
    JSON_MAX_VALUES,
    `${path}.limits.maximumPropsValues`,
  );
  const maximumPropsStringCodeUnits = expectInteger(
    limitsValue.maximumPropsStringCodeUnits,
    1,
    JSON_MAX_TOTAL_STRING_CODE_UNITS,
    `${path}.limits.maximumPropsStringCodeUnits`,
  );
  const maximumUpdatesPerSurface = expectInteger(
    limitsValue.maximumUpdatesPerSurface,
    1,
    A2UI_V1_HOST_EXTENSION_MAX_UPDATES,
    `${path}.limits.maximumUpdatesPerSurface`,
  );

  const fallbackValue = parseJsonObject(value.fallback, `${path}.fallback`);
  rejectKeys(fallbackValue, ["kind"], `${path}.fallback`);
  if (fallbackValue.kind !== "reject") {
    throw new A2uiParseError(
      `Host-extension fallback must be the fail-closed "reject" behavior at ${path}.fallback.kind`,
    );
  }

  const compatibilityValue = parseJsonObject(value.compatibility, `${path}.compatibility`);
  rejectKeys(compatibilityValue, ["owner", "supportUrl"], `${path}.compatibility`);
  const owner = expectNonEmptyBoundedString(
    compatibilityValue.owner,
    `${path}.compatibility.owner`,
  );
  const supportUrl =
    compatibilityValue.supportUrl === undefined
      ? undefined
      : parseHttpsUrl(compatibilityValue.supportUrl, `${path}.compatibility.supportUrl`);

  const manifest = Object.freeze({
    profileVersion: A2UI_V1_HOST_EXTENSION_PROFILE_VERSION,
    extensionId,
    catalogId,
    catalogVersion,
    schemaVersion,
    componentName,
    propsSchema,
    events,
    platforms,
    accessibility: Object.freeze({ ownership: "host", requiresLabel, behavior }),
    resourceNeeds,
    permissionNeeds,
    limits: Object.freeze({
      maximumInstances,
      maximumEventPayloadValues,
      maximumEventPayloadStringCodeUnits,
      maximumPropsValues,
      maximumPropsStringCodeUnits,
      maximumUpdatesPerSurface,
    }),
    fallback: Object.freeze({ kind: "reject" }),
    compatibility: Object.freeze({
      owner,
      ...(supportUrl === undefined ? {} : { supportUrl }),
    }),
  });
  parsedManifests.add(manifest);
  return manifest;
}

/** Constructs the exact MCP capability map a host may advertise for local manifests. */
export function createA2uiV1HostExtensionCapabilitySettings(
  manifests: readonly unknown[],
  platform: A2uiV1HostPlatform,
): McpExtensionSettings {
  const parsedPlatform = parsePlatform(platform, "host platform");
  const parsed = parseManifestList(manifests).filter((manifest) =>
    manifest.platforms.includes(parsedPlatform),
  );
  const settings = freezeCapabilitySettings(parsed.map(toCapabilityEntry));
  return Object.freeze({
    [A2UI_V1_HOST_EXTENSION_PROFILE_ID]: settings as unknown as JsonObject,
  });
}

/** Parses the project-owned settings value carried under the profile extension ID. */
export function parseA2uiV1HostExtensionCapabilityValue(
  input: unknown,
  path = "host extension capabilities",
): A2uiV1HostExtensionCapabilitySettings {
  const value = parseJsonObject(input, path);
  rejectKeys(value, ["extensions", "profileVersion"], path);
  if (value.profileVersion !== A2UI_V1_HOST_EXTENSION_PROFILE_VERSION) {
    throw new A2uiParseError(
      `Expected host-extension profile version ${A2UI_V1_HOST_EXTENSION_PROFILE_VERSION} at ${path}.profileVersion`,
    );
  }
  if (
    !Array.isArray(value.extensions) ||
    value.extensions.length > A2UI_V1_HOST_EXTENSION_MAX_MANIFESTS
  ) {
    throw new A2uiParseError(
      `Expected at most ${A2UI_V1_HOST_EXTENSION_MAX_MANIFESTS} entries at ${path}.extensions`,
    );
  }
  const seen = new Set<string>();
  const extensions = value.extensions.map((entry, index) => {
    const entryPath = `${path}.extensions[${index}]`;
    const object = parseJsonObject(entry, entryPath);
    rejectKeys(
      object,
      ["catalogId", "catalogVersion", "componentName", "extensionId", "schemaVersion"],
      entryPath,
    );
    const extensionId = expectString(object.extensionId, `${entryPath}.extensionId`);
    if (!isMcpExtensionIdentifier(extensionId)) {
      throw new A2uiParseError(`Expected a namespaced identifier at ${entryPath}.extensionId`);
    }
    const catalogVersion = expectStableVersion(
      object.catalogVersion,
      `${entryPath}.catalogVersion`,
    );
    const schemaVersion = expectStableVersion(object.schemaVersion, `${entryPath}.schemaVersion`);
    const catalogId = expectString(object.catalogId, `${entryPath}.catalogId`);
    const componentName = expectString(object.componentName, `${entryPath}.componentName`);
    if (
      catalogId !== `${extensionId}@${catalogVersion}` ||
      !componentName.startsWith(`${extensionId}:`) ||
      !/^[A-Z][A-Za-z0-9]*$/.test(componentName.slice(extensionId.length + 1))
    ) {
      throw new A2uiParseError(`Inconsistent namespaced identity at ${entryPath}`);
    }
    const parsed = Object.freeze({
      extensionId,
      catalogId,
      catalogVersion,
      schemaVersion,
      componentName,
    });
    const key = capabilityKey(parsed);
    if (seen.has(key)) {
      throw new A2uiParseError(`Duplicate host-extension capability at ${entryPath}`);
    }
    seen.add(key);
    return parsed;
  });
  return freezeCapabilitySettings(extensions);
}

/** Negotiates only byte-for-byte identity/version tuples advertised by both MCP peers. */
export function negotiateA2uiV1HostExtensions(
  hostExtensions: unknown,
  serverExtensions: unknown,
): A2uiV1HostExtensionNegotiation {
  const generic = negotiateMcpExtension(
    A2UI_V1_HOST_EXTENSION_PROFILE_ID,
    hostExtensions,
    serverExtensions,
  );
  if (generic.kind === "fallback") {
    return Object.freeze({
      kind: "fallback",
      profileId: A2UI_V1_HOST_EXTENSION_PROFILE_ID,
      reason: generic.reason === "client-unsupported" ? "host-unsupported" : "server-unsupported",
    });
  }
  const host = parseA2uiV1HostExtensionCapabilityValue(
    generic.clientSettings,
    "host extension settings",
  );
  const server = parseA2uiV1HostExtensionCapabilityValue(
    generic.serverSettings,
    "server extension settings",
  );
  const serverKeys = new Set(server.extensions.map(capabilityKey));
  const extensions = host.extensions.filter((entry) => serverKeys.has(capabilityKey(entry)));
  if (extensions.length === 0) {
    return Object.freeze({
      kind: "fallback",
      profileId: A2UI_V1_HOST_EXTENSION_PROFILE_ID,
      reason: "no-exact-extension-match",
    });
  }
  const result = Object.freeze({
    kind: "negotiated",
    profileId: A2UI_V1_HOST_EXTENSION_PROFILE_ID,
    profileVersion: A2UI_V1_HOST_EXTENSION_PROFILE_VERSION,
    extensions: Object.freeze(extensions),
    inlineCatalogsEnabled: false,
  });
  negotiatedResults.add(result);
  return result;
}

/** Creates an opaque registry containing only local, platform-available, exactly negotiated entries. */
export function createA2uiV1HostExtensionRegistry(
  options: A2uiV1HostExtensionRegistryOptions,
): A2uiV1HostExtensionRegistry {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new A2uiParseError("Expected host-extension registry options to be an object");
  }
  const platform = parsePlatform(options.platform, "registry platform");
  if (options.negotiation?.kind !== "negotiated" || !negotiatedResults.has(options.negotiation)) {
    throw new A2uiParseError("Host-extension registry requires an exact negotiated capability set");
  }
  const negotiatedKeys = new Set(options.negotiation.extensions.map(capabilityKey));
  const manifests = parseManifestList(options.manifests).filter(
    (manifest) =>
      manifest.platforms.includes(platform) && negotiatedKeys.has(capabilityKey(manifest)),
  );
  if (manifests.length !== options.negotiation.extensions.length) {
    throw new A2uiParseError(
      "Every negotiated host extension must have one exact locally available manifest",
    );
  }
  const byComponentKey = new Map<string, CompiledManifest>();
  for (const manifest of manifests) {
    const key = componentKey(manifest.catalogId, manifest.componentName);
    if (byComponentKey.has(key)) {
      throw new A2uiParseError(
        `Duplicate local host-extension component ${manifest.componentName}`,
      );
    }
    byComponentKey.set(key, compileManifest(manifest));
  }
  const registry = Object.freeze({ platform, manifests: Object.freeze(manifests) });
  registryStates.set(registry, { byComponentKey });
  return registry;
}

export function isA2uiV1HostExtensionRegistry(
  value: unknown,
): value is A2uiV1HostExtensionRegistry {
  return (
    value !== null &&
    typeof value === "object" &&
    registryStates.has(value as A2uiV1HostExtensionRegistry)
  );
}

/** Returns the exact local manifest for a component, or undefined for a basic/unknown component. */
export function getA2uiV1HostExtensionManifest(
  registry: A2uiV1HostExtensionRegistry,
  catalogId: unknown,
  componentName: unknown,
): A2uiV1HostExtensionManifest | undefined {
  const state = requireRegistry(registry);
  if (typeof catalogId !== "string" || typeof componentName !== "string") {
    return undefined;
  }
  return state.byComponentKey.get(componentKey(catalogId, componentName))?.manifest;
}

/** Exact negotiated catalog IDs available on this registry's selected native platform. */
export function getA2uiV1HostExtensionCatalogIds(
  registry: A2uiV1HostExtensionRegistry,
): readonly string[] {
  requireRegistry(registry);
  return Object.freeze([...new Set(registry.manifests.map((manifest) => manifest.catalogId))]);
}

/** Validates one leaf extension component and reconstructs only its declared semantic props. */
export function validateA2uiV1HostExtensionComponent(
  registry: A2uiV1HostExtensionRegistry,
  input: unknown,
  path = "host extension component",
): A2uiV1ValidatedHostExtensionComponent {
  const component = parseJsonObject(input, path);
  const catalogId = expectString(component.catalogId, `${path}.catalogId`);
  const componentName = expectString(component.component, `${path}.component`);
  const compiled = requireRegistry(registry).byComponentKey.get(
    componentKey(catalogId, componentName),
  );
  if (compiled === undefined) {
    throw new A2uiParseError(
      `Unknown, unavailable, or unnegotiated host extension ${JSON.stringify(componentName)} at ${path}`,
    );
  }
  const props: Record<string, JsonValue> = {};
  for (const [name, value] of Object.entries(component)) {
    if (FORBIDDEN_EXTENSION_COMPONENT_FIELDS.has(name)) {
      throw new A2uiParseError(
        `Host-extension components are leaves and cannot declare ${JSON.stringify(name)} at ${path}`,
      );
    }
    if (!RESERVED_PROP_NAMES.has(name)) {
      Object.defineProperty(props, name, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  }
  const parsedProps = parseJsonObject(props, `${path}.props`, {
    maxTotalStringCodeUnits: compiled.manifest.limits.maximumPropsStringCodeUnits,
  });
  const budget = measureJson(parsedProps);
  if (budget.values > compiled.manifest.limits.maximumPropsValues) {
    throw new A2uiParseError(
      `Host-extension props exceed maximum of ${compiled.manifest.limits.maximumPropsValues} values at ${path}`,
    );
  }
  if (!compiled.propsValidator(parsedProps)) {
    throw new A2uiParseError(
      `Host-extension props schema validation failed at ${path}: ${formatAjvErrors(compiled.propsValidator)}`,
    );
  }
  const frozenProps = deepFreezeJson(parsedProps);
  return Object.freeze({
    manifest: compiled.manifest,
    props: frozenProps,
    manifestFingerprint: compiled.fingerprint,
  });
}

/** Revalidates a locally emitted extension event before it reaches a host transport callback. */
export function validateA2uiV1HostExtensionEvent(
  manifest: A2uiV1HostExtensionManifest,
  eventName: unknown,
  payload: unknown,
  userActivated: unknown,
): JsonObject {
  const parsedManifest = parsedManifests.has(manifest)
    ? manifest
    : parseA2uiV1HostExtensionManifest(manifest);
  const compiled = compileManifest(parsedManifest);
  if (typeof eventName !== "string") {
    throw new A2uiParseError("Expected a string host-extension event name");
  }
  const event = compiled.eventManifests.get(eventName);
  const validator = compiled.eventValidators.get(eventName);
  if (event === undefined || validator === undefined) {
    throw new A2uiParseError(`Unknown host-extension event ${JSON.stringify(eventName)}`);
  }
  if (event.requiresUserActivation && userActivated !== true) {
    throw new A2uiParseError(
      `Host-extension event ${JSON.stringify(eventName)} requires explicit user activation`,
    );
  }
  if (userActivated !== true && userActivated !== false) {
    throw new A2uiParseError("Expected a boolean host-extension user-activation marker");
  }
  const parsedPayload = parseJsonObject(payload, `host extension event ${eventName}`, {
    maxTotalStringCodeUnits: parsedManifest.limits.maximumEventPayloadStringCodeUnits,
  });
  if (measureJson(parsedPayload).values > parsedManifest.limits.maximumEventPayloadValues) {
    throw new A2uiParseError(
      `Host-extension event exceeds maximum of ${parsedManifest.limits.maximumEventPayloadValues} values`,
    );
  }
  if (!validator(parsedPayload)) {
    throw new A2uiParseError(
      `Host-extension event schema validation failed: ${formatAjvErrors(validator)}`,
    );
  }
  return parsedPayload;
}

export function getA2uiV1HostExtensionManifestFingerprint(
  manifest: A2uiV1HostExtensionManifest,
): string {
  const parsed = parsedManifests.has(manifest)
    ? manifest
    : parseA2uiV1HostExtensionManifest(manifest);
  return canonicalizeJson(parsed as unknown as JsonValue);
}

/** Internal parser seam: validates extension leaves while preserving the pinned envelope schema. */
export function validateA2uiV1EnvelopeHostExtensions(
  envelope: JsonObject,
  registry: A2uiV1HostExtensionRegistry,
  validateBaseEnvelope: ValidateFunction,
): boolean {
  requireRegistry(registry);
  const messageName = Object.hasOwn(envelope, "createSurface")
    ? "createSurface"
    : Object.hasOwn(envelope, "updateComponents")
      ? "updateComponents"
      : undefined;
  if (messageName === undefined) {
    return false;
  }
  const message = parseJsonObject(envelope[messageName], `envelope.${messageName}`);
  if (!Array.isArray(message.components)) {
    return false;
  }
  let extensionCount = 0;
  const components = message.components.map((input, index) => {
    const path = `envelope.${messageName}.components[${index}]`;
    const component = parseJsonObject(input, path);
    const manifest = getA2uiV1HostExtensionManifest(
      registry,
      component.catalogId,
      component.component,
    );
    if (manifest === undefined) {
      return component;
    }
    validateA2uiV1HostExtensionComponent(registry, component, path);
    extensionCount += 1;
    return {
      id: component.id,
      component: "Text",
      text: "",
      ...(component.accessibility === undefined ? {} : { accessibility: component.accessibility }),
      ...(component.metadata === undefined ? {} : { metadata: component.metadata }),
      ...(component.weight === undefined ? {} : { weight: component.weight }),
    };
  });
  if (extensionCount === 0) {
    return false;
  }
  const substituted = {
    ...envelope,
    [messageName]: { ...message, components },
  };
  if (!validateBaseEnvelope(substituted)) {
    throw new A2uiParseError(
      `A2UI v1 host-extension envelope validation failed: ${formatAjvErrors(validateBaseEnvelope)}`,
    );
  }
  return true;
}

function parseManifestList(value: readonly unknown[]): A2uiV1HostExtensionManifest[] {
  if (!Array.isArray(value) || value.length > A2UI_V1_HOST_EXTENSION_MAX_MANIFESTS) {
    throw new A2uiParseError(
      `Expected at most ${A2UI_V1_HOST_EXTENSION_MAX_MANIFESTS} host-extension manifests`,
    );
  }
  const manifests = value.map((manifest, index) =>
    parseA2uiV1HostExtensionManifest(manifest, `host extension manifests[${index}]`),
  );
  const keys = new Set<string>();
  for (const manifest of manifests) {
    const key = capabilityKey(manifest);
    if (keys.has(key)) {
      throw new A2uiParseError(`Duplicate host-extension manifest ${manifest.componentName}`);
    }
    keys.add(key);
  }
  return manifests;
}

function parseEvents(
  value: JsonValue | undefined,
  extensionId: string,
  path: string,
): readonly A2uiV1HostExtensionEventManifest[] {
  if (!Array.isArray(value) || value.length > A2UI_V1_HOST_EXTENSION_MAX_EVENTS) {
    throw new A2uiParseError(
      `Expected at most ${A2UI_V1_HOST_EXTENSION_MAX_EVENTS} entries at ${path}`,
    );
  }
  const names = new Set<string>();
  return Object.freeze(
    value.map((entry, index) => {
      const entryPath = `${path}[${index}]`;
      const object = parseJsonObject(entry, entryPath);
      rejectKeys(object, ["name", "payloadSchema", "requiresUserActivation"], entryPath);
      const name = expectString(object.name, `${entryPath}.name`);
      if (
        !name.startsWith(`${extensionId}:`) ||
        !/^[a-z][A-Za-z0-9]*$/.test(name.slice(extensionId.length + 1))
      ) {
        throw new A2uiParseError(`Expected a namespaced event name at ${entryPath}.name`);
      }
      if (names.has(name)) {
        throw new A2uiParseError(`Duplicate host-extension event ${JSON.stringify(name)}`);
      }
      names.add(name);
      return Object.freeze({
        name,
        payloadSchema: parseClosedSchema(object.payloadSchema, `${entryPath}.payloadSchema`, false),
        requiresUserActivation: expectBoolean(
          object.requiresUserActivation,
          `${entryPath}.requiresUserActivation`,
        ),
      });
    }),
  );
}

function parseClosedSchema(value: unknown, path: string, rejectReservedProps: boolean): JsonObject {
  const schema = parseJsonObject(value, path);
  if (schema.type !== "object") {
    throw new A2uiParseError(`Expected an object JSON Schema at ${path}`);
  }
  const properties = parseJsonObject(schema.properties, `${path}.properties`);
  if (rejectReservedProps) {
    for (const name of Object.keys(properties)) {
      if (RESERVED_PROP_NAMES.has(name)) {
        throw new A2uiParseError(`Reserved host-extension prop ${JSON.stringify(name)} at ${path}`);
      }
    }
  }
  assertClosedObjectSchemas(schema, path);
  rejectRemoteReferences(schema, path);
  compileSchema(schema, path);
  return deepFreezeJson(schema);
}

function assertClosedObjectSchemas(value: JsonValue, path: string): void {
  const pending: { readonly value: JsonValue; readonly path: string }[] = [{ value, path }];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (Array.isArray(current.value)) {
      current.value.forEach((child, index) =>
        pending.push({ value: child, path: `${current.path}[${index}]` }),
      );
      continue;
    }
    if (current.value === null || typeof current.value !== "object") {
      continue;
    }
    const schema = current.value as JsonObject;
    const typeIncludesObject =
      schema.type === "object" || (Array.isArray(schema.type) && schema.type.includes("object"));
    const declaresObjectShape =
      typeIncludesObject ||
      Object.hasOwn(schema, "properties") ||
      Object.hasOwn(schema, "patternProperties") ||
      Object.hasOwn(schema, "required");
    if (declaresObjectShape) {
      const hasAdditionalProperties = Object.hasOwn(schema, "additionalProperties");
      if (
        (hasAdditionalProperties && schema.additionalProperties !== false) ||
        (!hasAdditionalProperties && schema.unevaluatedProperties !== false)
      ) {
        throw new A2uiParseError(`Expected a closed JSON Schema at ${current.path}`);
      }
      if (
        Object.hasOwn(schema, "patternProperties") &&
        Object.keys(parseJsonObject(schema.patternProperties, `${current.path}.patternProperties`))
          .length > 0
      ) {
        throw new A2uiParseError(
          `Pattern-based host-extension properties are not allowed at ${current.path}.patternProperties`,
        );
      }
    }
    for (const [name, child] of Object.entries(schema)) {
      pending.push({ value: child, path: `${current.path}.${name}` });
    }
  }
}

function rejectRemoteReferences(value: JsonValue, path: string): void {
  const pending: { readonly value: JsonValue; readonly path: string }[] = [{ value, path }];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (Array.isArray(current.value)) {
      current.value.forEach((child, index) =>
        pending.push({ value: child, path: `${current.path}[${index}]` }),
      );
      continue;
    }
    if (current.value === null || typeof current.value !== "object") {
      continue;
    }
    for (const [name, child] of Object.entries(current.value)) {
      if (
        (name === "$ref" || name === "$dynamicRef") &&
        typeof child === "string" &&
        !child.startsWith("#")
      ) {
        throw new A2uiParseError(
          `Remote JSON Schema references are not allowed at ${current.path}.${name}`,
        );
      }
      pending.push({ value: child, path: `${current.path}.${name}` });
    }
  }
}

function compileManifest(manifest: A2uiV1HostExtensionManifest): CompiledManifest {
  const cached = compiledManifestCache.get(manifest);
  if (cached !== undefined) {
    return cached;
  }
  const eventValidators = new Map<string, ValidateFunction>();
  const eventManifests = new Map<string, A2uiV1HostExtensionEventManifest>();
  for (const event of manifest.events) {
    eventValidators.set(event.name, compileSchema(event.payloadSchema, `event ${event.name}`));
    eventManifests.set(event.name, event);
  }
  const compiled = {
    manifest,
    fingerprint: canonicalizeJson(manifest as unknown as JsonValue),
    propsValidator: compileSchema(manifest.propsSchema, `props for ${manifest.componentName}`),
    eventValidators,
    eventManifests,
  };
  compiledManifestCache.set(manifest, compiled);
  return compiled;
}

function compileSchema(schema: JsonObject, path: string): ValidateFunction {
  try {
    const ajv = new Ajv2020({ allErrors: true, strict: false, validateSchema: true });
    addFormats(ajv);
    return ajv.compile(schema as object);
  } catch (cause) {
    throw new A2uiParseError(`Invalid host-extension JSON Schema at ${path}`, { cause });
  }
}

function parsePlatforms(value: JsonValue | undefined, path: string): readonly A2uiV1HostPlatform[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 2) {
    throw new A2uiParseError(`Expected one or two host platforms at ${path}`);
  }
  const platforms = value.map((entry, index) => parsePlatform(entry, `${path}[${index}]`));
  if (new Set(platforms).size !== platforms.length) {
    throw new A2uiParseError(`Expected unique host platforms at ${path}`);
  }
  return Object.freeze(platforms);
}

function parsePlatform(value: unknown, path: string): A2uiV1HostPlatform {
  if (value !== "android" && value !== "ios") {
    throw new A2uiParseError(`Expected "android" or "ios" at ${path}`);
  }
  return value;
}

function parseNeeds(value: JsonValue | undefined, path: string): readonly string[] {
  if (!Array.isArray(value) || value.length > A2UI_V1_HOST_EXTENSION_MAX_NEEDS) {
    throw new A2uiParseError(
      `Expected at most ${A2UI_V1_HOST_EXTENSION_MAX_NEEDS} capability needs at ${path}`,
    );
  }
  const needs = value.map((entry, index) => {
    const need = expectString(entry, `${path}[${index}]`);
    if (!NEED_PATTERN.test(need)) {
      throw new A2uiParseError(`Expected a closed capability identifier at ${path}[${index}]`);
    }
    return need;
  });
  if (new Set(needs).size !== needs.length) {
    throw new A2uiParseError(`Expected unique capability needs at ${path}`);
  }
  return Object.freeze(needs);
}

function freezeCapabilitySettings(
  extensions: readonly A2uiV1HostExtensionCapabilityEntry[],
): A2uiV1HostExtensionCapabilitySettings {
  return Object.freeze({
    profileVersion: A2UI_V1_HOST_EXTENSION_PROFILE_VERSION,
    extensions: Object.freeze([...extensions]),
  });
}

function toCapabilityEntry(
  manifest: A2uiV1HostExtensionManifest,
): A2uiV1HostExtensionCapabilityEntry {
  return Object.freeze({
    extensionId: manifest.extensionId,
    catalogId: manifest.catalogId,
    catalogVersion: manifest.catalogVersion,
    schemaVersion: manifest.schemaVersion,
    componentName: manifest.componentName,
  });
}

function capabilityKey(entry: A2uiV1HostExtensionCapabilityEntry): string {
  return [
    entry.extensionId,
    entry.catalogId,
    entry.catalogVersion,
    entry.schemaVersion,
    entry.componentName,
  ].join("\u0000");
}

function componentKey(catalogId: string, componentName: string): string {
  return `${catalogId}\u0000${componentName}`;
}

function requireRegistry(registry: A2uiV1HostExtensionRegistry): RegistryState {
  const state = registryStates.get(registry);
  if (state === undefined) {
    throw new A2uiParseError("Expected an opaque host-extension registry created by this package");
  }
  return state;
}

function parseHttpsUrl(value: JsonValue, path: string): string {
  const source = expectString(value, path);
  const UrlConstructor = (
    globalThis as unknown as {
      readonly URL?: new (source: string) => {
        readonly hash: string;
        readonly href: string;
        readonly password: string;
        readonly protocol: string;
        readonly username: string;
      };
    }
  ).URL;
  if (UrlConstructor === undefined) {
    throw new A2uiParseError(`The host runtime cannot validate an HTTPS URL at ${path}`);
  }
  let parsed: InstanceType<typeof UrlConstructor>;
  try {
    parsed = new UrlConstructor(source);
  } catch (cause) {
    throw new A2uiParseError(`Expected an absolute HTTPS URL at ${path}`, { cause });
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.hash.length > 0
  ) {
    throw new A2uiParseError(`Expected a credential-free HTTPS URL without a fragment at ${path}`);
  }
  return parsed.href;
}

function expectStableVersion(value: JsonValue | undefined, path: string): string {
  const version = expectString(value, path);
  if (!STABLE_VERSION_PATTERN.test(version)) {
    throw new A2uiParseError(`Expected a stable numeric version at ${path}`);
  }
  return version;
}

function expectString(value: JsonValue | undefined, path: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > JSON_MAX_STRING_LENGTH) {
    throw new A2uiParseError(`Expected a non-empty bounded string at ${path}`);
  }
  return value;
}

function expectNonEmptyBoundedString(value: JsonValue | undefined, path: string): string {
  return expectString(value, path);
}

function expectBoolean(value: JsonValue | undefined, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new A2uiParseError(`Expected a boolean at ${path}`);
  }
  return value;
}

function expectInteger(
  value: JsonValue | undefined,
  minimum: number,
  maximum: number,
  path: string,
): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new A2uiParseError(`Expected an integer from ${minimum} through ${maximum} at ${path}`);
  }
  return value;
}

function rejectKeys(value: JsonObject, allowed: readonly string[], path: string): void {
  const names = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!names.has(key)) {
      throw new A2uiParseError(`Unexpected field ${JSON.stringify(key)} at ${path}`);
    }
  }
}

function formatAjvErrors(validate: ValidateFunction): string {
  return (
    validate.errors?.map((error) => `${error.instancePath || "/"} ${error.message}`).join("; ") ??
    "schema validation failed"
  );
}

function measureJson(value: JsonValue): { readonly values: number; readonly strings: number } {
  let values = 0;
  let strings = 0;
  const pending: JsonValue[] = [value];
  while (pending.length > 0) {
    const current = pending.pop()!;
    values += 1;
    if (typeof current === "string") {
      strings += current.length;
    } else if (Array.isArray(current)) {
      pending.push(...current);
    } else if (current !== null && typeof current === "object") {
      for (const [key, child] of Object.entries(current)) {
        strings += key.length;
        pending.push(child);
      }
    }
  }
  return { values, strings };
}

function deepFreezeJson<T extends JsonValue>(value: T): T {
  const pending: JsonValue[] = [value];
  const seen = new WeakSet<object>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current === null || typeof current !== "object" || seen.has(current)) {
      continue;
    }
    seen.add(current);
    if (Array.isArray(current)) {
      pending.push(...current);
    } else {
      pending.push(...Object.values(current));
    }
    Object.freeze(current);
  }
  return value;
}

function canonicalizeJson(value: JsonValue): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeJson).join(",")}]`;
  }
  const object = value as JsonObject;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalizeJson(object[key]!)}`)
    .join(",")}}`;
}
