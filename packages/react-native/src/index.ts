import {
  createA2uiV1BasicCatalogPolicy,
  createA2uiV1ActionEnvelope,
  getA2uiV1HostExtensionManifestFingerprint,
  isA2uiV1HostExtensionRegistry,
  validateA2uiV1HostExtensionEvent,
  validateA2uiV1SurfaceState,
} from "@mcp-native/a2ui";
import type {
  A2uiV1ActionEnvelope,
  A2uiV1HostExtensionManifest,
  A2uiV1HostExtensionRegistry,
  A2uiV1SurfaceState,
  A2uiV1SurfaceValidationPolicy,
} from "@mcp-native/a2ui";
import { parseJsonObject, parseJsonValue } from "@mcp-native/core";
import type { JsonObject, JsonValue } from "@mcp-native/core";
import {
  Component,
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from "react";

import type {
  NativeAccessibilityProps,
  NativeButtonComponentProps,
  NativeChoicePickerComponentProps,
  NativeChoicePickerOption,
  NativeComponentCatalog,
  NativeComponentLayoutContract,
  NativeComponentLayoutContracts,
  NativeIconComponentProps,
  NativeImageComponentProps,
  NativeImageResourcePolicy,
  NativeImageVariant,
  NativeHostExtensionComponentProps,
  NativeHostExtensionRegistration,
  NativeMediaResourcePolicy,
  NativeTextComponentProps,
  NativeTextInputComponentProps,
  NativeViewComponentProps,
  NativeViewStyle,
  NativeViewVariant,
  NativeSurfaceParentLayout,
} from "./component-adapters.js";
import {
  A2UI_V1_NATIVE_ICON_NAMES,
  isNativeHostExtensionRegistration,
  renderNativeHostExtensionRegistration,
} from "./component-adapters.js";

import {
  A2UI_V1_NATIVE_COMPONENT_NAMES,
  createA2uiV1NativeRenderPlan,
  createA2uiV1NativeRenderPlanForLocalEdits,
  createA2uiV1NativeStructuralRenderPlan,
  parseA2uiV1NativeOpenUrlDescriptor,
  resolveA2uiV1NativeEvent,
  resolveA2uiV1NativeOpenUrl,
  validateA2uiV1NativeDateTimeInputChange,
  type A2uiV1NativeEventDescriptor,
  type A2uiV1NativeImagePolicy,
  type A2uiV1NativeHostExtensionPolicy,
  type A2uiV1NativeMediaPolicy,
  type A2uiV1NativeOpenUrlDescriptor,
} from "./v1.js";

export {
  A2UI_V1_NATIVE_ICON_NAMES,
  createNativeButtonAdapter,
  createNativeAudioPlayerAdapter,
  createNativeCheckBoxAdapter,
  createNativeChoicePickerAdapter,
  createNativeDateTimeInputAdapter,
  createNativeDividerAdapter,
  createNativeIconAdapter,
  createNativeImageAdapter,
  createNativeHostExtensionRegistration,
  createNativeModalAdapter,
  createNativeSliderAdapter,
  createNativeTabsAdapter,
  createNativeTextAdapter,
  createNativeTextInputAdapter,
  createNativeViewAdapter,
  createNativeVideoAdapter,
} from "./component-adapters.js";
export type { NativeComponentPropMapper } from "./component-adapters.js";
export type {
  NativeAccessibilityProps,
  NativeAccessibilityRole,
  NativeAccessibilityState,
  NativeAudioPlayerComponentProps,
  NativeButtonComponentProps,
  NativeButtonVariant,
  NativeCheckBoxComponentProps,
  NativeChoicePickerComponentProps,
  NativeChoicePickerDisplayStyle,
  NativeChoicePickerOption,
  NativeChoicePickerVariant,
  NativeComponentCatalog,
  NativeCatalogComponentName,
  NativeComponentLayoutContract,
  NativeComponentLayoutContracts,
  NativeComponentVariants,
  NativeDateTimeInputComponentProps,
  NativeDividerComponentProps,
  NativeIconComponentProps,
  NativeIconName,
  NativeImageComponentProps,
  NativeImageFit,
  NativeImageResourcePolicy,
  NativeImageVariant,
  NativeHostExtensionCapabilityGrant,
  NativeHostExtensionComponentProps,
  NativeHostExtensionEventOptions,
  NativeHostExtensionRegistration,
  NativeMediaResourcePolicy,
  NativeModalComponentProps,
  NativeSliderComponentProps,
  NativeTabItem,
  NativeTabsComponentProps,
  NativeTextComponentProps,
  NativeTextInputComponentProps,
  NativeTextInputVariant,
  NativeTextVariant,
  NativeViewComponentProps,
  NativeViewStyle,
  NativeViewVariant,
  NativeVideoComponentProps,
  NativeSurfaceParentLayout,
} from "./component-adapters.js";

export type NativeComponentName =
  | "AudioPlayer"
  | "Button"
  | "CheckBox"
  | "ChoicePicker"
  | "DateTimeInput"
  | "Divider"
  | "Icon"
  | "Image"
  | "HostExtension"
  | "Modal"
  | "Slider"
  | "Tabs"
  | "Text"
  | "TextInput"
  | "Video"
  | "View";

const A2UI_V1_NATIVE_BASE_COMPONENT_NAMES = Object.freeze([
  "Button",
  "Card",
  "Column",
  "List",
  "Row",
  "Text",
  "TextField",
] as const);

const A2UI_V1_NATIVE_OPTIONAL_COMPONENT_SLOTS = Object.freeze([
  "AudioPlayer",
  "CheckBox",
  "ChoicePicker",
  "DateTimeInput",
  "Divider",
  "Icon",
  "Image",
  "Modal",
  "Slider",
  "Tabs",
  "Video",
] as const);

export interface A2uiV1NativeCatalogCapabilities {
  /** Required before Image can be advertised as an installed capability. */
  readonly imagePolicy?: A2uiV1NativeImagePolicy;
  /** Required before Video or AudioPlayer can be advertised as installed capabilities. */
  readonly mediaPolicy?: A2uiV1NativeMediaPolicy;
}

/** Returns the exact A2UI subset backed by one locally installed and policy-ready host catalog. */
export function getA2uiV1NativeSupportedComponentNames(
  components: NativeComponentCatalog,
  capabilities: A2uiV1NativeCatalogCapabilities = {},
): readonly string[] {
  const installed = new Set<string>(A2UI_V1_NATIVE_BASE_COMPONENT_NAMES);
  for (const name of A2UI_V1_NATIVE_OPTIONAL_COMPONENT_SLOTS) {
    if (
      components[name] !== undefined &&
      (name !== "Image" || capabilities.imagePolicy !== undefined) &&
      ((name !== "Video" && name !== "AudioPlayer") || capabilities.mediaPolicy !== undefined)
    ) {
      installed.add(name);
    }
  }
  return Object.freeze(A2UI_V1_NATIVE_COMPONENT_NAMES.filter((name) => installed.has(name)));
}

/**
 * Returns only extension catalogs backed by an exact helper-created local registration and a host
 * capability policy. These IDs can be combined with the basic catalog in renderer capabilities.
 */
export function getA2uiV1NativeSupportedHostExtensionCatalogIds(
  components: NativeComponentCatalog,
  registry: A2uiV1HostExtensionRegistry,
  hostExtensionPolicy: A2uiV1NativeHostExtensionPolicy | undefined,
): readonly string[] {
  if (!isA2uiV1HostExtensionRegistry(registry)) {
    throw new TypeError("Expected an opaque negotiated host-extension registry");
  }
  if (hostExtensionPolicy === undefined || typeof hostExtensionPolicy !== "function") {
    return Object.freeze([]);
  }
  const catalogIds = new Set<string>();
  for (const manifest of registry.manifests) {
    const registrations =
      components.hostExtensions?.filter(
        (registration) =>
          isNativeHostExtensionRegistration(registration) &&
          registration.manifest.extensionId === manifest.extensionId &&
          registration.manifest.catalogId === manifest.catalogId &&
          registration.manifest.schemaVersion === manifest.schemaVersion &&
          registration.manifest.componentName === manifest.componentName,
      ) ?? [];
    if (
      registrations.length === 1 &&
      registrations[0]!.manifestFingerprint === getA2uiV1HostExtensionManifestFingerprint(manifest)
    ) {
      catalogIds.add(manifest.catalogId);
    }
  }
  return Object.freeze([...catalogIds]);
}

export interface A2uiV1NativeHostOptions {
  readonly components: NativeComponentCatalog;
  /** Omission allows every component that is both installed and policy-ready. */
  readonly allowedComponentNames?: readonly string[];
  readonly allowedEventNames?: readonly string[];
  readonly allowedFunctionNames?: readonly string[];
  readonly hostExtensions?: A2uiV1HostExtensionRegistry;
  readonly allowedHostExtensionComponentNames?: readonly string[];
  readonly imagePolicy?: A2uiV1NativeImagePolicy;
  readonly mediaPolicy?: A2uiV1NativeMediaPolicy;
  readonly hostExtensionPolicy?: A2uiV1NativeHostExtensionPolicy;
  /** Optional verified layout declarations for installed basic-catalog adapters. */
  readonly layoutContracts?: NativeComponentLayoutContracts;
  /** Layout declarations for exact locally registered extension component names. */
  readonly hostExtensionLayoutContracts?: Readonly<Record<string, NativeComponentLayoutContract>>;
}

/** One immutable source of truth for native catalog validation, discovery, and mounting. */
export interface A2uiV1NativeHost {
  readonly components: NativeComponentCatalog;
  readonly policy: A2uiV1SurfaceValidationPolicy;
  readonly supportedComponentNames: readonly string[];
  readonly supportedHostExtensionCatalogIds: readonly string[];
  readonly imagePolicy?: A2uiV1NativeImagePolicy;
  readonly mediaPolicy?: A2uiV1NativeMediaPolicy;
  readonly hostExtensionPolicy?: A2uiV1NativeHostExtensionPolicy;
  readonly layoutContracts: NativeComponentLayoutContracts;
  readonly hostExtensionLayoutContracts: Readonly<Record<string, NativeComponentLayoutContract>>;
}

export type A2uiV1NativeMountDiagnosticCode =
  | "component-not-allowed"
  | "layout-incompatible"
  | "missing-component"
  | "missing-extension-registration"
  | "render-plan-rejected"
  | "surface-invalid";

export interface A2uiV1NativeMountDiagnostic {
  readonly code: A2uiV1NativeMountDiagnosticCode;
  readonly message: string;
  readonly componentName?: string;
  readonly nativeElementKey?: string;
  readonly parentLayout?: NativeSurfaceParentLayout;
  readonly sourceComponentId?: string;
}

export interface A2uiV1NativeMountReport {
  readonly ok: boolean;
  readonly diagnostics: readonly A2uiV1NativeMountDiagnostic[];
  readonly requiredNativeComponentNames: readonly NativeComponentName[];
}

export interface InspectA2uiV1NativeMountOptions {
  /** External parent supplied by the application shell. Defaults to `unbounded`. */
  readonly parentLayout?: NativeSurfaceParentLayout;
}

/** Stable mount failure with no raw server, transport, or adapter exception in its message. */
export class A2uiV1NativeMountError extends Error {
  readonly code: A2uiV1NativeMountDiagnosticCode;
  readonly diagnostic: A2uiV1NativeMountDiagnostic;
  readonly report: A2uiV1NativeMountReport;

  constructor(report: A2uiV1NativeMountReport, options?: ErrorOptions) {
    const diagnostic = report.diagnostics[0];
    if (diagnostic === undefined) {
      throw new TypeError("A native mount error requires at least one diagnostic");
    }
    super(diagnostic.message, options);
    this.name = "A2uiV1NativeMountError";
    this.code = diagnostic.code;
    this.diagnostic = diagnostic;
    this.report = report;
  }
}

const nativeHosts = new WeakSet<A2uiV1NativeHost>();
const nativeHostResetKeys = new WeakMap<A2uiV1NativeHost, number>();
let nextNativeHostResetKey = 1;

/**
 * Creates a frozen native host whose policy and advertised capabilities cannot drift from its
 * installed catalog or required resource policies.
 */
export function createA2uiV1NativeHost(options: A2uiV1NativeHostOptions): A2uiV1NativeHost {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Expected A2UI native host options to be an object");
  }
  const components = freezeNativeComponentCatalog(options.components);
  const installedComponentNames = getA2uiV1NativeSupportedComponentNames(components, {
    ...(options.imagePolicy === undefined ? {} : { imagePolicy: options.imagePolicy }),
    ...(options.mediaPolicy === undefined ? {} : { mediaPolicy: options.mediaPolicy }),
  });
  const supportedSet = new Set(installedComponentNames);
  const allowedComponentNames = Object.freeze([
    ...(options.allowedComponentNames ?? installedComponentNames),
  ]);
  for (const name of allowedComponentNames) {
    if (!supportedSet.has(name)) {
      throw new TypeError(
        `A2UI native host cannot allow uninstalled or policy-unready component ${JSON.stringify(name)}`,
      );
    }
  }

  const allowedHostExtensionComponentNames = Object.freeze([
    ...(options.allowedHostExtensionComponentNames ?? []),
  ]);
  const allowedHostExtensionSet = new Set(allowedHostExtensionComponentNames);
  if (allowedHostExtensionComponentNames.length > 0) {
    if (options.hostExtensions === undefined || options.hostExtensionPolicy === undefined) {
      throw new TypeError(
        "Allowed host extensions require an exact registry and host-extension policy",
      );
    }
    for (const manifest of options.hostExtensions.manifests) {
      if (
        allowedHostExtensionSet.has(manifest.componentName) &&
        !hasMatchingHostExtensionRegistration(components, manifest)
      ) {
        throw new TypeError(
          `A2UI native host is missing an exact local registration for ${JSON.stringify(manifest.componentName)} in catalog ${JSON.stringify(manifest.catalogId)} with schema ${JSON.stringify(manifest.schemaVersion)}`,
        );
      }
    }
  }

  const policy = createA2uiV1BasicCatalogPolicy({
    allowedComponentNames,
    ...(options.allowedEventNames === undefined
      ? {}
      : { allowedEventNames: options.allowedEventNames }),
    ...(options.allowedFunctionNames === undefined
      ? {}
      : { allowedFunctionNames: options.allowedFunctionNames }),
    ...(options.hostExtensions === undefined ? {} : { hostExtensions: options.hostExtensions }),
    allowedHostExtensionComponentNames,
  });
  const supportedComponentNames = Object.freeze([...policy.allowedComponentNames]);
  const layoutContracts = freezeLayoutContracts(
    options.layoutContracts === undefined ? {} : options.layoutContracts,
    getInstalledNativeComponentNames(components),
  );
  const hostExtensionLayoutContracts = freezeHostExtensionLayoutContracts(
    options.hostExtensionLayoutContracts === undefined ? {} : options.hostExtensionLayoutContracts,
    new Set(allowedHostExtensionComponentNames),
  );
  const installedHostExtensionCatalogIds =
    options.hostExtensions === undefined
      ? Object.freeze([])
      : getA2uiV1NativeSupportedHostExtensionCatalogIds(
          components,
          options.hostExtensions,
          options.hostExtensionPolicy,
        );
  const supportedHostExtensionCatalogIds = Object.freeze(
    installedHostExtensionCatalogIds.filter((catalogId) =>
      options.hostExtensions?.manifests
        .filter((manifest) => manifest.catalogId === catalogId)
        .every((manifest) => allowedHostExtensionSet.has(manifest.componentName)),
    ),
  );
  const host = Object.freeze({
    components,
    policy,
    supportedComponentNames,
    supportedHostExtensionCatalogIds,
    ...(options.imagePolicy === undefined ? {} : { imagePolicy: options.imagePolicy }),
    ...(options.mediaPolicy === undefined ? {} : { mediaPolicy: options.mediaPolicy }),
    ...(options.hostExtensionPolicy === undefined
      ? {}
      : { hostExtensionPolicy: options.hostExtensionPolicy }),
    layoutContracts,
    hostExtensionLayoutContracts,
  });
  nativeHosts.add(host);
  nativeHostResetKeys.set(host, nextNativeHostResetKey);
  nextNativeHostResetKey += 1;
  return host;
}

/** Returns whether a value is a genuine immutable host created by this package. */
export function isA2uiV1NativeHost(value: unknown): value is A2uiV1NativeHost {
  return value !== null && typeof value === "object" && nativeHosts.has(value as A2uiV1NativeHost);
}

/** Inspects the exact expanded plan and local registrations without entering React rendering. */
export function inspectA2uiV1NativeMount(
  surface: A2uiV1SurfaceState,
  host: A2uiV1NativeHost,
  options: InspectA2uiV1NativeMountOptions = {},
): A2uiV1NativeMountReport {
  return inspectA2uiV1NativeMountInternal(surface, host, options, true);
}

function inspectA2uiV1NativeMountInternal(
  surface: A2uiV1SurfaceState,
  host: A2uiV1NativeHost,
  options: InspectA2uiV1NativeMountOptions,
  authorizeResources: boolean,
): A2uiV1NativeMountReport {
  if (!isA2uiV1NativeHost(host)) {
    throw new TypeError("Expected an A2UI native host created by createA2uiV1NativeHost");
  }
  const parentLayout = parseParentLayout(options.parentLayout ?? "unbounded");
  const deniedComponent = findDeniedSurfaceComponent(surface, host.policy);
  if (deniedComponent !== undefined) {
    return freezeMountReport(
      [],
      [
        createMountDiagnostic("component-not-allowed", {
          componentName: deniedComponent.componentName,
          sourceComponentId: deniedComponent.sourceComponentId,
        }),
      ],
    );
  }
  let validated: A2uiV1SurfaceState;
  try {
    validated = validateA2uiV1SurfaceState(surface, host.policy);
  } catch {
    return freezeMountReport([], [createMountDiagnostic("surface-invalid")]);
  }
  let plan: NativeElement;
  try {
    plan = authorizeResources
      ? createA2uiV1NativeRenderPlan(validated, host.policy, {
          ...(host.imagePolicy === undefined ? {} : { imagePolicy: host.imagePolicy }),
          ...(host.mediaPolicy === undefined ? {} : { mediaPolicy: host.mediaPolicy }),
          ...(host.hostExtensionPolicy === undefined
            ? {}
            : { hostExtensionPolicy: host.hostExtensionPolicy }),
        })
      : createA2uiV1NativeStructuralRenderPlan(validated, host.policy);
  } catch {
    return freezeMountReport([], [createMountDiagnostic("render-plan-rejected")]);
  }

  const diagnostics: A2uiV1NativeMountDiagnostic[] = [];
  const required = new Set<NativeComponentName>();
  inspectNativeElement(plan, host, parentLayout, required, diagnostics);
  return freezeMountReport([...required], diagnostics);
}

/** Throws a structured stable error when a surface cannot mount through the registered host. */
export function assertA2uiV1NativeMount(
  surface: A2uiV1SurfaceState,
  host: A2uiV1NativeHost,
  options: InspectA2uiV1NativeMountOptions = {},
): A2uiV1NativeMountReport {
  const report = inspectA2uiV1NativeMount(surface, host, options);
  if (!report.ok) {
    throw new A2uiV1NativeMountError(report);
  }
  return report;
}

const NATIVE_CATALOG_COMPONENT_NAMES = Object.freeze([
  "AudioPlayer",
  "Button",
  "CheckBox",
  "ChoicePicker",
  "DateTimeInput",
  "Divider",
  "Icon",
  "Image",
  "Modal",
  "Slider",
  "Tabs",
  "Text",
  "TextInput",
  "Video",
  "View",
] as const);

function freezeNativeComponentCatalog(catalog: NativeComponentCatalog): NativeComponentCatalog {
  if (catalog === null || typeof catalog !== "object" || Array.isArray(catalog)) {
    throw new TypeError("Expected native component catalog to be an object");
  }
  for (const name of ["Button", "Text", "TextInput", "View"] as const) {
    if (catalog[name] === undefined) {
      throw new TypeError(`Native component catalog is missing required component ${name}`);
    }
  }
  const variants =
    catalog.variants === undefined
      ? undefined
      : Object.freeze(
          Object.fromEntries(
            Object.entries(catalog.variants).map(([name, entries]) => [
              name,
              entries === undefined ? undefined : Object.freeze({ ...entries }),
            ]),
          ),
        );
  return Object.freeze({
    ...catalog,
    ...(catalog.hostExtensions === undefined
      ? {}
      : { hostExtensions: Object.freeze([...catalog.hostExtensions]) }),
    ...(variants === undefined ? {} : { variants }),
  });
}

function getInstalledNativeComponentNames(components: NativeComponentCatalog): ReadonlySet<string> {
  const installed = new Set<string>();
  for (const name of NATIVE_CATALOG_COMPONENT_NAMES) {
    if (components[name] !== undefined) installed.add(name);
  }
  return installed;
}

function hasMatchingHostExtensionRegistration(
  components: NativeComponentCatalog,
  manifest: A2uiV1HostExtensionManifest,
): boolean {
  const matching =
    components.hostExtensions?.filter(
      (registration) =>
        isNativeHostExtensionRegistration(registration) &&
        registration.manifest.extensionId === manifest.extensionId &&
        registration.manifest.catalogId === manifest.catalogId &&
        registration.manifest.schemaVersion === manifest.schemaVersion &&
        registration.manifest.componentName === manifest.componentName &&
        registration.manifestFingerprint === getA2uiV1HostExtensionManifestFingerprint(manifest),
    ) ?? [];
  return matching.length === 1;
}

function freezeLayoutContracts(
  contracts: NativeComponentLayoutContracts,
  installed: ReadonlySet<string>,
): NativeComponentLayoutContracts {
  if (contracts === null || typeof contracts !== "object" || Array.isArray(contracts)) {
    throw new TypeError("Expected native layout contracts to be an object");
  }
  const result: Partial<Record<string, NativeComponentLayoutContract>> = {};
  for (const [name, contract] of Object.entries(contracts)) {
    if (!(NATIVE_CATALOG_COMPONENT_NAMES as readonly string[]).includes(name)) {
      throw new TypeError(`Unknown native layout-contract component ${JSON.stringify(name)}`);
    }
    if (!installed.has(name)) {
      throw new TypeError(
        `Native layout contract targets uninstalled component ${JSON.stringify(name)}`,
      );
    }
    result[name] = freezeLayoutContract(contract, `layoutContracts.${name}`);
  }
  return Object.freeze(result) as NativeComponentLayoutContracts;
}

function freezeHostExtensionLayoutContracts(
  contracts: Readonly<Record<string, NativeComponentLayoutContract>>,
  allowed: ReadonlySet<string>,
): Readonly<Record<string, NativeComponentLayoutContract>> {
  if (contracts === null || typeof contracts !== "object" || Array.isArray(contracts)) {
    throw new TypeError("Expected host-extension layout contracts to be an object");
  }
  const result: Record<string, NativeComponentLayoutContract> = {};
  for (const [name, contract] of Object.entries(contracts)) {
    if (!allowed.has(name)) {
      throw new TypeError(
        `Host-extension layout contract targets unavailable component ${JSON.stringify(name)}`,
      );
    }
    result[name] = freezeLayoutContract(contract, `hostExtensionLayoutContracts.${name}`);
  }
  return Object.freeze(result);
}

function freezeLayoutContract(
  value: NativeComponentLayoutContract,
  path: string,
): NativeComponentLayoutContract {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`Expected ${path} to be an object`);
  }
  const keys = Object.keys(value);
  if (
    keys.some(
      (key) =>
        key !== "allowedParents" &&
        key !== "ownsScrolling" &&
        key !== "presentation" &&
        key !== "sizing",
    )
  ) {
    throw new TypeError(`Unsupported field in ${path}`);
  }
  if (!Array.isArray(value.allowedParents) || value.allowedParents.length === 0) {
    throw new TypeError(`Expected ${path}.allowedParents to be a non-empty array`);
  }
  const allowedParents = value.allowedParents.map(parseParentLayout);
  if (new Set(allowedParents).size !== allowedParents.length) {
    throw new TypeError(`Duplicate parent layout in ${path}.allowedParents`);
  }
  if (value.sizing !== "fill" && value.sizing !== "intrinsic") {
    throw new TypeError(`Expected ${path}.sizing to be fill or intrinsic`);
  }
  if (
    value.presentation !== undefined &&
    value.presentation !== "inline" &&
    value.presentation !== "overlay"
  ) {
    throw new TypeError(`Expected ${path}.presentation to be inline or overlay`);
  }
  if (value.ownsScrolling !== undefined && typeof value.ownsScrolling !== "boolean") {
    throw new TypeError(`Expected ${path}.ownsScrolling to be a boolean`);
  }
  return Object.freeze({
    allowedParents: Object.freeze(allowedParents),
    sizing: value.sizing,
    ...(value.presentation === undefined ? {} : { presentation: value.presentation }),
    ...(value.ownsScrolling === undefined ? {} : { ownsScrolling: value.ownsScrolling }),
  });
}

function parseParentLayout(value: unknown): NativeSurfaceParentLayout {
  if (value !== "bounded" && value !== "scroll" && value !== "unbounded") {
    throw new TypeError("Expected parent layout to be bounded, scroll, or unbounded");
  }
  return value;
}

function inspectNativeElement(
  element: NativeElement,
  host: A2uiV1NativeHost,
  parentLayout: NativeSurfaceParentLayout,
  required: Set<NativeComponentName>,
  diagnostics: A2uiV1NativeMountDiagnostic[],
): void {
  required.add(element.component);
  if (element.component === "HostExtension") {
    const componentName =
      typeof element.props.componentName === "string" ? element.props.componentName : undefined;
    const manifest =
      componentName === undefined
        ? undefined
        : host.policy.hostExtensions?.manifests.find(
            (candidate) => candidate.componentName === componentName,
          );
    if (
      manifest === undefined ||
      !hasMatchingHostExtensionRegistration(host.components, manifest)
    ) {
      diagnostics.push(
        createMountDiagnostic("missing-extension-registration", {
          ...(componentName === undefined ? {} : { componentName }),
          nativeElementKey: element.key,
        }),
      );
    }
    const contract =
      componentName === undefined ? undefined : host.hostExtensionLayoutContracts[componentName];
    inspectLayoutContract(contract, componentName, element.key, parentLayout, diagnostics);
  } else {
    if (selectInstalledComponent(host.components, element.component) === undefined) {
      diagnostics.push(
        createMountDiagnostic("missing-component", {
          componentName: element.component,
          nativeElementKey: element.key,
        }),
      );
    }
    const contract = host.layoutContracts[element.component];
    inspectLayoutContract(contract, element.component, element.key, parentLayout, diagnostics);
  }
  for (const child of element.children ?? []) {
    inspectNativeElement(child, host, parentLayout, required, diagnostics);
  }
}

function selectInstalledComponent(
  components: NativeComponentCatalog,
  name: Exclude<NativeComponentName, "HostExtension">,
): ComponentType<object> | undefined {
  return components[name] as ComponentType<object> | undefined;
}

function inspectLayoutContract(
  contract: NativeComponentLayoutContract | undefined,
  componentName: string | undefined,
  nativeElementKey: string,
  parentLayout: NativeSurfaceParentLayout,
  diagnostics: A2uiV1NativeMountDiagnostic[],
): void {
  if (contract === undefined || contract.allowedParents.includes(parentLayout)) return;
  diagnostics.push(
    createMountDiagnostic("layout-incompatible", {
      ...(componentName === undefined ? {} : { componentName }),
      nativeElementKey,
      parentLayout,
    }),
  );
}

function createMountDiagnostic(
  code: A2uiV1NativeMountDiagnosticCode,
  details: Omit<A2uiV1NativeMountDiagnostic, "code" | "message"> = {},
): A2uiV1NativeMountDiagnostic {
  const messages: Record<A2uiV1NativeMountDiagnosticCode, string> = {
    "component-not-allowed": "The surface requests a component this native host does not allow.",
    "layout-incompatible": "A native component does not support the supplied parent layout.",
    "missing-component": "The native catalog is missing a component required by the surface.",
    "missing-extension-registration":
      "The native catalog is missing an exact extension registration required by the surface.",
    "render-plan-rejected": "The validated surface could not produce an authorized render plan.",
    "surface-invalid": "The A2UI surface is invalid for this native host.",
  };
  return Object.freeze({ code, message: messages[code], ...details });
}

function findDeniedSurfaceComponent(
  surface: A2uiV1SurfaceState,
  policy: A2uiV1SurfaceValidationPolicy,
): { readonly componentName: string; readonly sourceComponentId: string } | undefined {
  if (!(surface.components instanceof Map)) return undefined;
  const allowedBasic = new Set(policy.allowedComponentNames);
  const allowedExtensions = new Set(policy.allowedHostExtensionComponentNames ?? []);
  for (const [id, component] of surface.components) {
    if (typeof component.component !== "string") continue;
    const basic = (A2UI_V1_NATIVE_COMPONENT_NAMES as readonly string[]).includes(
      component.component,
    );
    if (
      (basic && !allowedBasic.has(component.component)) ||
      (!basic && !allowedExtensions.has(component.component))
    ) {
      return { componentName: component.component, sourceComponentId: id };
    }
  }
  return undefined;
}

function freezeMountReport(
  requiredNativeComponentNames: readonly NativeComponentName[],
  diagnostics: readonly A2uiV1NativeMountDiagnostic[],
): A2uiV1NativeMountReport {
  const orderedRequired = Object.freeze(
    [...new Set(requiredNativeComponentNames)].sort(),
  ) as readonly NativeComponentName[];
  const frozenDiagnostics = Object.freeze([...diagnostics]);
  return Object.freeze({
    ok: frozenDiagnostics.length === 0,
    diagnostics: frozenDiagnostics,
    requiredNativeComponentNames: orderedRequired,
  });
}

/**
 * A serializable render plan. A React Native host maps these trusted component
 * names to locally bundled components; the MCP server never supplies code.
 */
export interface NativeElement {
  readonly key: string;
  readonly component: NativeComponentName;
  readonly props: Readonly<Record<string, unknown>>;
  readonly children?: readonly NativeElement[];
}

export type A2uiV1NativeActionHandler = (
  envelope: A2uiV1ActionEnvelope,
  dataModel?: JsonObject,
) => void;

/** Synchronous host authorization checked during the originating Button press. */
export type A2uiV1NativeOpenUrlPolicy = (request: A2uiV1NativeOpenUrlDescriptor) => boolean;

/** Host-owned platform opener. The library never invokes a browser or URL handler directly. */
export type A2uiV1NativeOpenUrlHandler = (request: A2uiV1NativeOpenUrlDescriptor) => void;

export interface A2uiV1NativeHostExtensionEventDescriptor {
  readonly extensionId: string;
  readonly catalogId: string;
  readonly schemaVersion: string;
  readonly componentName: string;
  readonly surfaceId: string;
  readonly sourceComponentId: string;
  readonly name: string;
  readonly payload: JsonObject;
  readonly userActivated: boolean;
}

export interface A2uiV1NativeSurfaceProps {
  readonly surface: A2uiV1SurfaceState;
  readonly policy: A2uiV1SurfaceValidationPolicy;
  readonly components: NativeComponentCatalog;
  /** Receives an official envelope and, only after explicit surface opt-in, the local model. */
  readonly onAction: A2uiV1NativeActionHandler;
  /** Required with `onOpenUrl` when this surface is allowed to use the local `openUrl` function. */
  readonly openUrlPolicy?: A2uiV1NativeOpenUrlPolicy;
  /** Executes an authorized URL while the originating Button press is still active. */
  readonly onOpenUrl?: A2uiV1NativeOpenUrlHandler;
  /** Required when the reachable surface contains an Image component. */
  readonly imagePolicy?: A2uiV1NativeImagePolicy;
  /** Required when the reachable surface contains Video or AudioPlayer. */
  readonly mediaPolicy?: A2uiV1NativeMediaPolicy;
  /** Required when the reachable surface contains a negotiated host extension. */
  readonly hostExtensionPolicy?: A2uiV1NativeHostExtensionPolicy;
  /** Receives only manifest-declared, schema-valid events from a local extension component. */
  readonly onHostExtensionEvent?: (event: A2uiV1NativeHostExtensionEventDescriptor) => void;
  /** Observes renderer-local state changes without turning keystrokes into network calls. */
  readonly onDataModelChange?: (dataModel: JsonObject) => void;
  readonly actionMetadata?: JsonObject;
  /** Host-selected BCP 47 locale for renderer-side number, currency, date, and plural formatting. */
  readonly locale?: string;
  /** Injectable RFC 3339 timestamp source for host clocks and deterministic tests. */
  readonly now?: () => string;
}

/**
 * Mounts the supported A2UI v1 subset with renderer-local two-way bindings.
 * Agent events are resolved against the latest local model at press time.
 */
export function A2uiV1NativeSurface({
  surface,
  policy,
  components,
  onAction,
  openUrlPolicy,
  onOpenUrl,
  imagePolicy,
  mediaPolicy,
  hostExtensionPolicy,
  onHostExtensionEvent,
  onDataModelChange,
  actionMetadata,
  locale,
  now = currentTimestamp,
}: A2uiV1NativeSurfaceProps): ReactElement {
  const validatedSurface = useMemo(
    () => validateA2uiV1SurfaceState(surface, policy),
    [policy, surface],
  );
  const sourceDataModel = validatedSurface.dataModel;
  const sourceDataModelKey = createDataModelSourceKey(validatedSurface);
  const sourceComponentsKey = createComponentSourceKey(validatedSurface);
  const [localState, setLocalState] = useState(() => ({
    sourceDataModelKey,
    sourceComponentsKey,
    dataModel: sourceDataModel,
    hasLocalEdits: false,
  }));
  const hasCurrentLocalState = localState.sourceDataModelKey === sourceDataModelKey;
  const dataModel = hasCurrentLocalState ? localState.dataModel : sourceDataModel;
  const hasLocalEdits = hasCurrentLocalState && localState.hasLocalEdits;
  const tolerateInvalidLocalOpenUrls =
    hasLocalEdits && localState.sourceComponentsKey === sourceComponentsKey;
  const dataModelRef = useRef(dataModel);
  dataModelRef.current = dataModel;

  useEffect(() => {
    setLocalState((current) => {
      if (current.sourceDataModelKey === sourceDataModelKey) {
        return current;
      }
      return {
        sourceDataModelKey,
        sourceComponentsKey,
        dataModel: sourceDataModel,
        hasLocalEdits: false,
      };
    });
  }, [sourceComponentsKey, sourceDataModel, sourceDataModelKey]);

  const plan = useMemo(
    () =>
      (tolerateInvalidLocalOpenUrls
        ? createA2uiV1NativeRenderPlanForLocalEdits
        : createA2uiV1NativeRenderPlan)(validatedSurface, policy, {
        dataModel,
        ...(locale === undefined ? {} : { locale }),
        ...(imagePolicy === undefined ? {} : { imagePolicy }),
        ...(mediaPolicy === undefined ? {} : { mediaPolicy }),
        ...(hostExtensionPolicy === undefined ? {} : { hostExtensionPolicy }),
      }),
    [
      dataModel,
      hostExtensionPolicy,
      imagePolicy,
      locale,
      mediaPolicy,
      policy,
      tolerateInvalidLocalOpenUrls,
      validatedSurface,
    ],
  );
  const handleBindingChange = useCallback(
    (binding: string, value: JsonValue) => {
      const next = updateDataModelBinding(dataModelRef.current, binding, value);
      dataModelRef.current = next;
      setLocalState({
        sourceDataModelKey,
        sourceComponentsKey,
        dataModel: next,
        hasLocalEdits: true,
      });
      onDataModelChange?.(parseJsonObject(next, "renderer data model"));
    },
    [onDataModelChange, sourceComponentsKey, sourceDataModelKey],
  );
  const handleEvent = useCallback(
    (event: A2uiV1NativeEventDescriptor) => {
      const currentDataModel = dataModelRef.current;
      const resolved = resolveA2uiV1NativeEvent(
        validatedSurface,
        policy,
        event.sourceComponentId,
        currentDataModel,
        {
          ...(event.instanceKey === undefined ? {} : { instanceKey: event.instanceKey }),
          ...(locale === undefined ? {} : { locale }),
        },
      );
      const envelope = createA2uiV1ActionEnvelope({
        name: resolved.name,
        surfaceId: resolved.surfaceId,
        sourceComponentId: resolved.sourceComponentId,
        context: resolved.context,
        ...(resolved.userMessage === undefined ? {} : { userMessage: resolved.userMessage }),
        ...(actionMetadata === undefined ? {} : { metadata: actionMetadata }),
        timestamp: now(),
      });
      if (validatedSurface.sendDataModel) {
        onAction(envelope, parseJsonObject(currentDataModel, "renderer data model"));
      } else {
        onAction(envelope);
      }
    },
    [actionMetadata, locale, now, onAction, policy, validatedSurface],
  );
  const handleOpenUrl = useCallback(
    (request: A2uiV1NativeOpenUrlDescriptor) => {
      const resolved = resolveA2uiV1NativeOpenUrl(
        validatedSurface,
        policy,
        request.sourceComponentId,
        dataModelRef.current,
        {
          ...(request.instanceKey === undefined ? {} : { instanceKey: request.instanceKey }),
          ...(locale === undefined ? {} : { locale }),
        },
      );
      if (openUrlPolicy?.(resolved) === true) {
        onOpenUrl?.(resolved);
      }
    },
    [locale, onOpenUrl, openUrlPolicy, policy, validatedSurface],
  );

  return renderElement(plan, components, {
    useComponentVariants: true,
    onV1BindingChange: handleBindingChange,
    onV1Event: handleEvent,
    ...(openUrlPolicy === undefined || onOpenUrl === undefined
      ? {}
      : { onV1OpenUrl: handleOpenUrl }),
    ...(onHostExtensionEvent === undefined ? {} : { onV1HostExtensionEvent: onHostExtensionEvent }),
  });
}

export type A2uiV1NativeRenderErrorCode = "native-surface-render-failed";

/** Stable render failure that does not expose a component-library exception in its message. */
export class A2uiV1NativeRenderError extends Error {
  readonly code: A2uiV1NativeRenderErrorCode;

  constructor(options?: ErrorOptions) {
    super("The validated native surface could not be rendered.", options);
    this.name = "A2uiV1NativeRenderError";
    this.code = "native-surface-render-failed";
  }
}

export interface A2uiV1NativeSurfaceBoundaryProps {
  readonly children?: ReactNode;
  /** Host-authored fallback. Omission renders no partial surface after failure. */
  readonly fallback?: ReactNode;
  readonly onError: (error: A2uiV1NativeMountError | A2uiV1NativeRenderError) => void;
  /** Changing this value clears a prior failure for a replacement surface. */
  readonly resetKey: string;
}

interface A2uiV1NativeSurfaceBoundaryState {
  readonly failed: boolean;
  readonly resetKey: string;
}

/** Reusable fail-closed boundary for applications that mount the low-level surface directly. */
export class A2uiV1NativeSurfaceBoundary extends Component<
  A2uiV1NativeSurfaceBoundaryProps,
  A2uiV1NativeSurfaceBoundaryState
> {
  override state: A2uiV1NativeSurfaceBoundaryState = {
    failed: false,
    resetKey: this.props.resetKey,
  };

  static getDerivedStateFromError(): Partial<A2uiV1NativeSurfaceBoundaryState> {
    return { failed: true };
  }

  static getDerivedStateFromProps(
    props: A2uiV1NativeSurfaceBoundaryProps,
    state: A2uiV1NativeSurfaceBoundaryState,
  ): Partial<A2uiV1NativeSurfaceBoundaryState> | null {
    return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey };
  }

  override componentDidCatch(error: unknown): void {
    const reported =
      error instanceof A2uiV1NativeMountError
        ? error
        : new A2uiV1NativeRenderError({ cause: error });
    try {
      void Promise.resolve(this.props.onError(reported)).catch(() => {
        // A rejected observer must not reopen a contained catalog failure asynchronously.
      });
    } catch {
      // A throwing observer must not turn a contained catalog failure into another render failure.
    }
  }

  override render(): ReactNode {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}

export interface A2uiV1NativeHostSurfaceProps {
  readonly host: A2uiV1NativeHost;
  readonly surface: A2uiV1SurfaceState;
  readonly onAction: A2uiV1NativeActionHandler;
  readonly onRenderError: (error: A2uiV1NativeMountError | A2uiV1NativeRenderError) => void;
  readonly fallback?: ReactNode;
  readonly parentLayout?: NativeSurfaceParentLayout;
  readonly resetKey?: string;
  readonly openUrlPolicy?: A2uiV1NativeOpenUrlPolicy;
  readonly onOpenUrl?: A2uiV1NativeOpenUrlHandler;
  readonly onHostExtensionEvent?: (event: A2uiV1NativeHostExtensionEventDescriptor) => void;
  readonly onDataModelChange?: (dataModel: JsonObject) => void;
  readonly actionMetadata?: JsonObject;
  readonly locale?: string;
  readonly now?: () => string;
}

/** Preflights and mounts through one immutable host, with surface-wide render containment. */
export function A2uiV1NativeHostSurface(props: A2uiV1NativeHostSurfaceProps): ReactElement {
  const resetKey =
    props.resetKey ??
    canonicalizeJson([
      nativeHostResetKeys.get(props.host) ?? 0,
      props.parentLayout ?? "unbounded",
      props.surface.surfaceId,
      props.surface.dataModelRevision ?? null,
      props.surface.dataModel,
      createComponentSourceKey(props.surface),
    ]);
  return createElement(
    A2uiV1NativeSurfaceBoundary,
    {
      resetKey,
      onError: props.onRenderError,
      ...(props.fallback === undefined ? {} : { fallback: props.fallback }),
    },
    createElement(A2uiV1NativeHostSurfaceContent, props),
  );
}

function A2uiV1NativeHostSurfaceContent({
  host,
  surface,
  parentLayout,
  onAction,
  openUrlPolicy,
  onOpenUrl,
  onHostExtensionEvent,
  onDataModelChange,
  actionMetadata,
  locale,
  now,
}: A2uiV1NativeHostSurfaceProps): ReactElement {
  const report = inspectA2uiV1NativeMountInternal(
    surface,
    host,
    { ...(parentLayout === undefined ? {} : { parentLayout }) },
    false,
  );
  if (!report.ok) throw new A2uiV1NativeMountError(report);
  return createElement(A2uiV1NativeSurface, {
    surface,
    policy: host.policy,
    components: host.components,
    onAction,
    ...(openUrlPolicy === undefined ? {} : { openUrlPolicy }),
    ...(onOpenUrl === undefined ? {} : { onOpenUrl }),
    ...(host.imagePolicy === undefined ? {} : { imagePolicy: host.imagePolicy }),
    ...(host.mediaPolicy === undefined ? {} : { mediaPolicy: host.mediaPolicy }),
    ...(host.hostExtensionPolicy === undefined
      ? {}
      : { hostExtensionPolicy: host.hostExtensionPolicy }),
    ...(onHostExtensionEvent === undefined ? {} : { onHostExtensionEvent }),
    ...(onDataModelChange === undefined ? {} : { onDataModelChange }),
    ...(actionMetadata === undefined ? {} : { actionMetadata }),
    ...(locale === undefined ? {} : { locale }),
    ...(now === undefined ? {} : { now }),
  });
}

function createDataModelSourceKey(surface: A2uiV1SurfaceState): string {
  return canonicalizeJson([
    surface.surfaceId,
    surface.dataModelRevision ?? null,
    surface.dataModel,
  ]);
}

function createComponentSourceKey(surface: A2uiV1SurfaceState): string {
  return canonicalizeJson(
    [...surface.components.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, component]) => [id, component]),
  );
}

function canonicalizeJson(value: JsonValue): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
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

function currentTimestamp(): string {
  return new Date().toISOString();
}

interface NativeRenderHandlers {
  /** A2UI v1-only selection of pinned semantic/style variants. */
  readonly useComponentVariants?: boolean;
  readonly onV1BindingChange?: (binding: string, value: JsonValue) => void;
  readonly onV1Event?: (event: A2uiV1NativeEventDescriptor) => void;
  readonly onV1OpenUrl?: (request: A2uiV1NativeOpenUrlDescriptor) => void;
  readonly onV1HostExtensionEvent?: (event: A2uiV1NativeHostExtensionEventDescriptor) => void;
  readonly onElementActivate?: (key: string) => void;
}

function renderElement(
  element: NativeElement,
  components: NativeComponentCatalog,
  handlers: NativeRenderHandlers,
): ReactElement {
  const accessibilityProps = selectAccessibilityProps(element);
  switch (element.component) {
    case "View": {
      const style = selectViewStyle(element);
      return createElement(
        selectViewComponent(element, components, handlers.useComponentVariants === true),
        {
          key: element.key,
          ...accessibilityProps,
          ...(style === undefined ? {} : { style }),
        },
        element.children?.map((child) => renderChildElement(child, components, handlers)),
      );
    }
    case "Text":
      return createElement(
        selectTextComponent(element, components, handlers.useComponentVariants === true),
        {
          key: element.key,
          children: expectStringProp(element, "children"),
          ...accessibilityProps,
          accessible: accessibilityProps.accessibilityElementsHidden !== true,
          accessibilityRole: "text",
          allowFontScaling: true,
        },
      );
    case "Button": {
      const title = expectStringProp(element, "title");
      const disabled = optionalBooleanProp(element, "disabled");
      const validationMessages = optionalStringArrayProp(element, "validationMessages");
      const onPress = createButtonPressHandler(element, handlers);
      return createElement(
        selectButtonComponent(element, components, handlers.useComponentVariants === true),
        {
          key: element.key,
          title,
          accessibilityLabel: accessibilityProps.accessibilityLabel ?? title,
          ...accessibilityProps,
          accessible: accessibilityProps.accessibilityElementsHidden !== true,
          accessibilityRole: "button",
          accessibilityState: { disabled: disabled === true },
          ...(disabled === undefined ? {} : { disabled }),
          ...(validationMessages === undefined ? {} : { validationMessages }),
          onPress,
        },
      );
    }
    case "TextInput": {
      const label =
        optionalStringProp(element, "label") ?? expectStringProp(element, "placeholder");
      const placeholder = optionalStringProp(element, "placeholder") ?? label;
      const value = optionalStringProp(element, "value");
      const binding = optionalStringProp(element, "binding");
      const invalid = optionalBooleanProp(element, "invalid");
      const validationMessages = optionalStringArrayProp(element, "validationMessages");
      const behaviorProps = selectTextInputBehaviorProps(element);
      return createElement(
        selectTextInputComponent(element, components, handlers.useComponentVariants === true),
        {
          key: element.key,
          accessibilityLabel: accessibilityProps.accessibilityLabel ?? label,
          ...accessibilityProps,
          accessible: accessibilityProps.accessibilityElementsHidden !== true,
          allowFontScaling: true,
          ...behaviorProps,
          placeholder,
          ...(invalid === undefined ? {} : { invalid }),
          ...(validationMessages === undefined ? {} : { validationMessages }),
          ...(value === undefined ? {} : { value }),
          ...(binding === undefined || handlers.onV1BindingChange === undefined
            ? {}
            : {
                onChangeText: (nextValue: string) => {
                  handlers.onV1BindingChange?.(binding, nextValue);
                },
              }),
        },
      );
    }
    case "Image": {
      const uri = expectStringProp(element, "uri");
      const fit = selectClosedStringProp(element, "fit", [
        "contain",
        "cover",
        "fill",
        "none",
        "scaleDown",
      ] as const);
      const variant = selectClosedStringProp(element, "variant", [
        "avatar",
        "header",
        "icon",
        "largeFeature",
        "mediumFeature",
        "smallFeature",
      ] as const);
      const accessible =
        accessibilityProps.accessibilityLabel !== undefined &&
        accessibilityProps.accessibilityElementsHidden !== true;
      return createElement(
        selectImageComponent(element, components, handlers.useComponentVariants === true, variant),
        {
          key: element.key,
          uri,
          fit,
          resourcePolicy: expectImageResourcePolicy(element),
          ...accessibilityProps,
          accessible,
          accessibilityRole: "image",
        },
      );
    }
    case "Video": {
      const uri = expectStringProp(element, "uri");
      const posterUri = optionalStringProp(element, "posterUri");
      const accessible = accessibilityProps.accessibilityElementsHidden !== true;
      return createElement(requireHostComponent(components.Video, "Video", element.key), {
        key: element.key,
        uri,
        ...(posterUri === undefined ? {} : { posterUri }),
        resourcePolicy: expectMediaResourcePolicy(element),
        ...(posterUri === undefined
          ? {}
          : { posterResourcePolicy: expectImageResourcePolicy(element, "posterResourcePolicy") }),
        ...accessibilityProps,
        accessible,
        accessibilityLabel: accessibilityProps.accessibilityLabel ?? "Video",
        accessibilityRole: "image",
      });
    }
    case "AudioPlayer": {
      const uri = expectStringProp(element, "uri");
      const description = optionalStringProp(element, "description");
      const accessible = accessibilityProps.accessibilityElementsHidden !== true;
      return createElement(
        requireHostComponent(components.AudioPlayer, "AudioPlayer", element.key),
        {
          key: element.key,
          uri,
          resourcePolicy: expectMediaResourcePolicy(element),
          ...(description === undefined ? {} : { description }),
          ...accessibilityProps,
          accessible,
          accessibilityLabel: accessibilityProps.accessibilityLabel ?? description ?? "Audio",
          accessibilityRole: "button",
        },
      );
    }
    case "HostExtension": {
      const extensionId = expectStringProp(element, "extensionId");
      const catalogId = expectStringProp(element, "catalogId");
      const schemaVersion = expectStringProp(element, "schemaVersion");
      const componentName = expectStringProp(element, "componentName");
      const manifestFingerprint = expectStringProp(element, "manifestFingerprint");
      const sourceComponentId = expectStringProp(element, "sourceComponentId");
      const surfaceId = expectStringProp(element, "surfaceId");
      const semanticProps = parseJsonObject(
        element.props.semanticProps,
        `native element ${element.key}.semanticProps`,
      );
      const capabilityGrant = expectHostExtensionCapabilityGrant(element);
      const registration = requireHostExtensionRegistration(
        components,
        { extensionId, catalogId, schemaVersion, componentName, manifestFingerprint },
        element.key,
      );
      const trustedProps: NativeHostExtensionComponentProps = {
        semanticProps,
        capabilityGrant,
        ...accessibilityProps,
        onEvent(name, payload, options) {
          if (options === null || typeof options !== "object" || Array.isArray(options)) {
            throw new TypeError("Expected closed host-extension event options");
          }
          const optionKeys = Object.keys(options);
          if (optionKeys.length !== 1 || optionKeys[0] !== "userActivated") {
            throw new TypeError("Expected only userActivated in host-extension event options");
          }
          const parsedPayload = validateA2uiV1HostExtensionEvent(
            registration.manifest,
            name,
            payload,
            options.userActivated,
          );
          handlers.onV1HostExtensionEvent?.({
            extensionId,
            catalogId,
            schemaVersion,
            componentName,
            surfaceId,
            sourceComponentId,
            name,
            payload: parsedPayload,
            userActivated: options.userActivated,
          });
        },
      };
      return renderNativeHostExtensionRegistration(registration, trustedProps, element.key);
    }
    case "Icon": {
      const name = expectStringProp(element, "name");
      if (!(A2UI_V1_NATIVE_ICON_NAMES as readonly string[]).includes(name)) {
        throw new TypeError(`Unsupported icon name at native element ${element.key}.name`);
      }
      const accessible =
        accessibilityProps.accessibilityLabel !== undefined &&
        accessibilityProps.accessibilityElementsHidden !== true;
      return createElement(requireHostComponent(components.Icon, "Icon", element.key), {
        key: element.key,
        name: name as NativeIconComponentProps["name"],
        ...accessibilityProps,
        accessible,
        accessibilityRole: "image",
      });
    }
    case "Divider":
      return createElement(requireHostComponent(components.Divider, "Divider", element.key), {
        key: element.key,
        axis: selectClosedStringProp(element, "axis", ["horizontal", "vertical"] as const),
        ...accessibilityProps,
        accessible: false,
      });
    case "CheckBox": {
      const label = expectStringProp(element, "label");
      const value = expectBooleanProp(element, "value");
      const binding = optionalStringProp(element, "binding");
      const invalid = optionalBooleanProp(element, "invalid");
      const validationMessages = optionalStringArrayProp(element, "validationMessages");
      return createElement(requireHostComponent(components.CheckBox, "CheckBox", element.key), {
        key: element.key,
        label,
        value,
        ...accessibilityProps,
        accessible: accessibilityProps.accessibilityElementsHidden !== true,
        accessibilityLabel: accessibilityProps.accessibilityLabel ?? label,
        accessibilityRole: "checkbox",
        accessibilityState: { checked: value },
        ...(invalid === undefined ? {} : { invalid }),
        ...(validationMessages === undefined ? {} : { validationMessages }),
        ...(binding === undefined || handlers.onV1BindingChange === undefined
          ? {}
          : {
              onValueChange: (nextValue: boolean) => {
                if (typeof nextValue !== "boolean") {
                  throw new TypeError(
                    `Expected a boolean checkbox value at native element ${element.key}`,
                  );
                }
                handlers.onV1BindingChange?.(binding, nextValue);
              },
            }),
      });
    }
    case "ChoicePicker": {
      const options = expectChoicePickerOptions(element);
      const value = expectStringArrayProp(element, "value");
      const variant = selectClosedStringProp(element, "variant", [
        "multipleSelection",
        "mutuallyExclusive",
      ] as const);
      const displayStyle = selectClosedStringProp(element, "displayStyle", [
        "checkbox",
        "chips",
      ] as const);
      const filterable = expectBooleanProp(element, "filterable");
      const label = optionalStringProp(element, "label");
      const accessibilityLabel = expectStringProp(element, "accessibilityLabel");
      const binding = optionalStringProp(element, "binding");
      const invalid = optionalBooleanProp(element, "invalid");
      const validationMessages = optionalStringArrayProp(element, "validationMessages");
      return createElement(selectChoicePickerComponent(components, variant, element.key), {
        key: element.key,
        options,
        value,
        variant,
        displayStyle,
        filterable,
        ...accessibilityProps,
        accessible: accessibilityProps.accessibilityElementsHidden !== true,
        accessibilityLabel,
        ...(label === undefined ? {} : { label }),
        ...(invalid === undefined ? {} : { invalid }),
        ...(validationMessages === undefined ? {} : { validationMessages }),
        ...(binding === undefined || handlers.onV1BindingChange === undefined
          ? {}
          : {
              onValueChange: (nextValue: readonly string[]) => {
                const parsed = validateChoicePickerChange(nextValue, options, variant, element.key);
                handlers.onV1BindingChange?.(binding, parsed);
              },
            }),
      });
    }
    case "Slider": {
      const value = expectFiniteNumberProp(element, "value");
      const minimumValue = expectFiniteNumberProp(element, "minimum");
      const maximumValue = expectFiniteNumberProp(element, "maximum");
      const step = optionalFiniteNumberProp(element, "step");
      const label = optionalStringProp(element, "label");
      const accessibilityLabel = expectStringProp(element, "accessibilityLabel");
      const binding = optionalStringProp(element, "binding");
      const invalid = optionalBooleanProp(element, "invalid");
      const validationMessages = optionalStringArrayProp(element, "validationMessages");
      return createElement(requireHostComponent(components.Slider, "Slider", element.key), {
        key: element.key,
        value,
        minimumValue,
        maximumValue,
        ...accessibilityProps,
        accessible: accessibilityProps.accessibilityElementsHidden !== true,
        accessibilityLabel,
        accessibilityRole: "adjustable",
        ...(label === undefined ? {} : { label }),
        ...(step === undefined ? {} : { step }),
        ...(invalid === undefined ? {} : { invalid }),
        ...(validationMessages === undefined ? {} : { validationMessages }),
        ...(binding === undefined || handlers.onV1BindingChange === undefined
          ? {}
          : {
              onValueChange: (nextValue: number) => {
                if (
                  typeof nextValue !== "number" ||
                  !Number.isFinite(nextValue) ||
                  nextValue < minimumValue ||
                  nextValue > maximumValue ||
                  (step !== undefined && !isSliderStepValue(nextValue, minimumValue, step))
                ) {
                  throw new TypeError(
                    `Expected an in-range finite slider value at native element ${element.key}`,
                  );
                }
                handlers.onV1BindingChange?.(binding, nextValue);
              },
            }),
      });
    }
    case "DateTimeInput": {
      const value = expectStringProp(element, "value");
      const enableDate = expectBooleanProp(element, "enableDate");
      const enableTime = expectBooleanProp(element, "enableTime");
      const minimum = optionalStringProp(element, "minimum");
      const maximum = optionalStringProp(element, "maximum");
      const label = optionalStringProp(element, "label");
      const accessibilityLabel = expectStringProp(element, "accessibilityLabel");
      const binding = optionalStringProp(element, "binding");
      const invalid = optionalBooleanProp(element, "invalid");
      const validationMessages = optionalStringArrayProp(element, "validationMessages");
      return createElement(
        requireHostComponent(components.DateTimeInput, "DateTimeInput", element.key),
        {
          key: element.key,
          value,
          enableDate,
          enableTime,
          ...accessibilityProps,
          accessible: accessibilityProps.accessibilityElementsHidden !== true,
          accessibilityLabel,
          ...(label === undefined ? {} : { label }),
          ...(minimum === undefined ? {} : { minimum }),
          ...(maximum === undefined ? {} : { maximum }),
          ...(invalid === undefined ? {} : { invalid }),
          ...(validationMessages === undefined ? {} : { validationMessages }),
          ...(binding === undefined || handlers.onV1BindingChange === undefined
            ? {}
            : {
                onValueChange: (nextValue: string) => {
                  if (typeof nextValue !== "string") {
                    throw new TypeError(
                      `Expected a string date/time value at native element ${element.key}`,
                    );
                  }
                  try {
                    validateA2uiV1NativeDateTimeInputChange(
                      nextValue,
                      enableDate,
                      enableTime,
                      minimum,
                      maximum,
                      `native element ${element.key}`,
                    );
                  } catch (error) {
                    const message =
                      error instanceof Error
                        ? error.message
                        : `Expected a valid date/time value at native element ${element.key}`;
                    throw new TypeError(message, { cause: error });
                  }
                  handlers.onV1BindingChange?.(binding, nextValue);
                },
              }),
        },
      );
    }
    case "Tabs":
      return createElement(NativeTabsRenderer, {
        key: element.key,
        element,
        components,
        handlers,
      });
    case "Modal":
      return createElement(NativeModalRenderer, {
        key: element.key,
        element,
        components,
        handlers,
      });
  }
}

function isSliderStepValue(value: number, minimum: number, step: number): boolean {
  const offset = (value - minimum) / step;
  return (
    Math.abs(offset - Math.round(offset)) <= Number.EPSILON * Math.max(1, Math.abs(offset)) * 8
  );
}

interface NativeCompositeRendererProps {
  readonly element: NativeElement;
  readonly components: NativeComponentCatalog;
  readonly handlers: NativeRenderHandlers;
}

function NativeTabsRenderer({
  element,
  components,
  handlers,
}: NativeCompositeRendererProps): ReactElement {
  const tabDefinitions = expectTabDefinitions(element);
  const children = element.children ?? [];
  if (tabDefinitions.length !== children.length || tabDefinitions.length === 0) {
    throw new TypeError(
      `Expected matching non-empty tabs and children at native element ${element.key}`,
    );
  }
  const [selectedIndex, setSelectedIndex] = useState(0);
  const currentIndex = selectedIndex < tabDefinitions.length ? selectedIndex : 0;
  useEffect(() => {
    if (selectedIndex >= tabDefinitions.length) {
      setSelectedIndex(0);
    }
  }, [selectedIndex, tabDefinitions.length]);
  const accessibilityProps = selectAccessibilityProps(element);
  return createElement(requireHostComponent(components.Tabs, "Tabs", element.key), {
    tabs: tabDefinitions.map((tab, index) => ({
      title: tab.title,
      content: renderChildElement(children[index]!, components, handlers),
    })),
    selectedIndex: currentIndex,
    onSelect: (index: number) => {
      if (!Number.isInteger(index) || index < 0 || index >= tabDefinitions.length) {
        throw new TypeError(`Expected an in-range tab index at native element ${element.key}`);
      }
      setSelectedIndex(index);
    },
    ...accessibilityProps,
    accessible: accessibilityProps.accessibilityElementsHidden !== true,
  });
}

function NativeModalRenderer({
  element,
  components,
  handlers,
}: NativeCompositeRendererProps): ReactElement {
  const children = element.children ?? [];
  if (children.length !== 2 || children[0]?.component !== "Button") {
    throw new TypeError(`Expected a Button trigger and content at native element ${element.key}`);
  }
  const [open, setOpen] = useState(false);
  const trigger = children[0];
  const content = children[1]!;
  const outerActivation = handlers.onElementActivate;
  const triggerElement = renderElement(trigger, components, {
    ...handlers,
    onElementActivate: (key) => {
      if (key === trigger.key) {
        setOpen(true);
      }
      outerActivation?.(key);
    },
  });
  const contentElement = renderElement(content, components, handlers);
  return createElement(requireHostComponent(components.Modal, "Modal", element.key), {
    trigger: triggerElement,
    content: contentElement,
    open,
    onRequestClose: () => setOpen(false),
    ...selectAccessibilityProps(element),
  });
}

function requireHostComponent<Props extends object>(
  component: ComponentType<Props> | undefined,
  name: string,
  key: string,
): ComponentType<Props> {
  if (component === undefined) {
    throw new TypeError(`Missing host component ${JSON.stringify(name)} for native element ${key}`);
  }
  return component;
}

function selectImageComponent(
  element: NativeElement,
  components: NativeComponentCatalog,
  useComponentVariants: boolean,
  variant: NativeImageVariant,
): ComponentType<NativeImageComponentProps> {
  const base = requireHostComponent(components.Image, "Image", element.key);
  if (!useComponentVariants) {
    return base;
  }
  return components.variants?.Image?.[variant] ?? base;
}

function selectChoicePickerComponent(
  components: NativeComponentCatalog,
  variant: "multipleSelection" | "mutuallyExclusive",
  key: string,
): ComponentType<NativeChoicePickerComponentProps> {
  return (
    components.variants?.ChoicePicker?.[variant] ??
    requireHostComponent(components.ChoicePicker, "ChoicePicker", key)
  );
}

function expectChoicePickerOptions(element: NativeElement): readonly NativeChoicePickerOption[] {
  const value = element.props.options;
  if (!Array.isArray(value)) {
    throw new TypeError(`Expected choice options at native element ${element.key}.options`);
  }
  const seen = new Set<string>();
  return Object.freeze(
    value.map((entry, index) => {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        throw new TypeError(
          `Expected a choice option at native element ${element.key}.options[${index}]`,
        );
      }
      const option = entry as Record<string, unknown>;
      const unknown = Object.keys(option).find((name) => name !== "label" && name !== "value");
      if (
        unknown !== undefined ||
        typeof option.label !== "string" ||
        typeof option.value !== "string"
      ) {
        throw new TypeError(
          `Expected a closed choice option at native element ${element.key}.options[${index}]`,
        );
      }
      if (seen.has(option.value)) {
        throw new TypeError(
          `Duplicate choice option at native element ${element.key}.options[${index}]`,
        );
      }
      seen.add(option.value);
      return Object.freeze({ label: option.label, value: option.value });
    }),
  );
}

function expectImageResourcePolicy(
  element: NativeElement,
  property = "resourcePolicy",
): NativeImageResourcePolicy {
  const path = `native element ${element.key}.${property}`;
  const value = parseJsonObject(element.props[property], path);
  rejectObjectKeys(
    value,
    [
      "allowedRedirectOrigins",
      "cacheMode",
      "maximumBytes",
      "maximumDecodedHeight",
      "maximumDecodedPixels",
      "maximumDecodedWidth",
      "maximumRedirects",
    ],
    path,
  );
  const origins = value.allowedRedirectOrigins;
  if (!Array.isArray(origins) || origins.some((origin) => typeof origin !== "string")) {
    throw new TypeError(`Expected redirect origins at ${path}.allowedRedirectOrigins`);
  }
  if (value.cacheMode !== "default" && value.cacheMode !== "no-store") {
    throw new TypeError(`Expected a closed cache mode at ${path}.cacheMode`);
  }
  const maximumBytes = expectObjectPositiveInteger(value, "maximumBytes", path);
  const maximumDecodedHeight = expectObjectPositiveInteger(value, "maximumDecodedHeight", path);
  const maximumDecodedPixels = expectObjectPositiveInteger(value, "maximumDecodedPixels", path);
  const maximumDecodedWidth = expectObjectPositiveInteger(value, "maximumDecodedWidth", path);
  const maximumRedirects = value.maximumRedirects;
  if (
    typeof maximumRedirects !== "number" ||
    !Number.isInteger(maximumRedirects) ||
    maximumRedirects < 0
  ) {
    throw new TypeError(`Expected a non-negative integer at ${path}.maximumRedirects`);
  }
  return Object.freeze({
    allowedRedirectOrigins: Object.freeze([...origins] as string[]),
    cacheMode: value.cacheMode,
    maximumBytes,
    maximumDecodedHeight,
    maximumDecodedPixels,
    maximumDecodedWidth,
    maximumRedirects,
  });
}

function expectMediaResourcePolicy(element: NativeElement): NativeMediaResourcePolicy {
  const path = `native element ${element.key}.resourcePolicy`;
  const value = parseJsonObject(element.props.resourcePolicy, path);
  rejectObjectKeys(
    value,
    [
      "allowedMimeTypes",
      "allowedRedirectOrigins",
      "allowsAutoplay",
      "allowsBackgroundPlayback",
      "allowsExternalRoutes",
      "maximumBytes",
      "maximumRedirects",
      "requiresUserActivation",
      "sourceOrigin",
    ],
    path,
  );
  const sourceOrigin = expectObjectString(value, "sourceOrigin", path);
  const allowedRedirectOrigins = expectObjectStringArray(value, "allowedRedirectOrigins", path);
  const allowedMimeTypes = expectObjectStringArray(value, "allowedMimeTypes", path);
  if (allowedMimeTypes.length === 0) {
    throw new TypeError(`Expected at least one MIME type at ${path}.allowedMimeTypes`);
  }
  const maximumBytes = expectObjectPositiveInteger(value, "maximumBytes", path);
  const maximumRedirects = expectObjectNonNegativeInteger(value, "maximumRedirects", path);
  const allowsAutoplay = expectObjectBoolean(value, "allowsAutoplay", path);
  const allowsBackgroundPlayback = expectObjectBoolean(value, "allowsBackgroundPlayback", path);
  const allowsExternalRoutes = expectObjectBoolean(value, "allowsExternalRoutes", path);
  const requiresUserActivation = expectObjectBoolean(value, "requiresUserActivation", path);
  if (allowsAutoplay && requiresUserActivation) {
    throw new TypeError(`Conflicting autoplay and activation controls at ${path}`);
  }
  return Object.freeze({
    sourceOrigin,
    allowedRedirectOrigins,
    allowedMimeTypes,
    maximumBytes,
    maximumRedirects,
    allowsAutoplay,
    allowsBackgroundPlayback,
    allowsExternalRoutes,
    requiresUserActivation,
  });
}

function expectHostExtensionCapabilityGrant(
  element: NativeElement,
): NativeHostExtensionComponentProps["capabilityGrant"] {
  const path = `native element ${element.key}.capabilityGrant`;
  const value = parseJsonObject(element.props.capabilityGrant, path);
  rejectObjectKeys(value, ["permissions", "resources"], path);
  return Object.freeze({
    permissions: expectObjectStringArray(value, "permissions", path),
    resources: expectObjectStringArray(value, "resources", path),
  });
}

function requireHostExtensionRegistration(
  components: NativeComponentCatalog,
  identity: {
    readonly extensionId: string;
    readonly catalogId: string;
    readonly schemaVersion: string;
    readonly componentName: string;
    readonly manifestFingerprint: string;
  },
  key: string,
): NativeHostExtensionRegistration {
  if (!Array.isArray(components.hostExtensions)) {
    throw new TypeError(`Missing host-extension registrations for native element ${key}`);
  }
  const registrations = components.hostExtensions.filter((registration) => {
    if (!isNativeHostExtensionRegistration(registration)) {
      throw new TypeError("Host-extension catalogs accept only helper-created registrations");
    }
    const manifest = registration.manifest;
    return (
      manifest.extensionId === identity.extensionId &&
      manifest.catalogId === identity.catalogId &&
      manifest.schemaVersion === identity.schemaVersion &&
      manifest.componentName === identity.componentName
    );
  });
  if (registrations.length !== 1) {
    throw new TypeError(
      `Expected exactly one local registration for ${JSON.stringify(identity.componentName)} at native element ${key}`,
    );
  }
  const registration = registrations[0]!;
  if (registration.manifestFingerprint !== identity.manifestFingerprint) {
    throw new TypeError(
      `Local registration manifest mismatch for ${JSON.stringify(identity.componentName)} at native element ${key}`,
    );
  }
  return registration;
}

function expectObjectStringArray(value: JsonObject, name: string, path: string): readonly string[] {
  const field = value[name];
  if (!Array.isArray(field) || field.some((entry) => typeof entry !== "string")) {
    throw new TypeError(`Expected a string array at ${path}.${name}`);
  }
  if (new Set(field).size !== field.length) {
    throw new TypeError(`Expected unique strings at ${path}.${name}`);
  }
  return Object.freeze([...field] as string[]);
}

function expectObjectBoolean(value: JsonObject, name: string, path: string): boolean {
  const field = value[name];
  if (typeof field !== "boolean") {
    throw new TypeError(`Expected a boolean at ${path}.${name}`);
  }
  return field;
}

function expectObjectNonNegativeInteger(value: JsonObject, name: string, path: string): number {
  const field = value[name];
  if (typeof field !== "number" || !Number.isInteger(field) || field < 0) {
    throw new TypeError(`Expected a non-negative integer at ${path}.${name}`);
  }
  return field;
}

function expectObjectPositiveInteger(value: JsonObject, name: string, path: string): number {
  const field = value[name];
  if (typeof field !== "number" || !Number.isInteger(field) || field < 1) {
    throw new TypeError(`Expected a positive integer at ${path}.${name}`);
  }
  return field;
}

function validateChoicePickerChange(
  value: readonly string[],
  options: readonly NativeChoicePickerOption[],
  variant: "multipleSelection" | "mutuallyExclusive",
  key: string,
): readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new TypeError(`Expected an array of choice values at native element ${key}`);
  }
  if (new Set(value).size !== value.length) {
    throw new TypeError(`Expected unique choice values at native element ${key}`);
  }
  if (variant === "mutuallyExclusive" && value.length > 1) {
    throw new TypeError(`Expected at most one choice value at native element ${key}`);
  }
  const allowed = new Set(options.map((option) => option.value));
  if (value.some((entry) => !allowed.has(entry))) {
    throw new TypeError(`Expected known choice values at native element ${key}`);
  }
  return Object.freeze([...value]);
}

function expectTabDefinitions(element: NativeElement): readonly { readonly title: string }[] {
  const value = element.props.tabs;
  if (!Array.isArray(value)) {
    throw new TypeError(`Expected tabs at native element ${element.key}.tabs`);
  }
  return Object.freeze(
    value.map((entry, index) => {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        throw new TypeError(`Expected a tab at native element ${element.key}.tabs[${index}]`);
      }
      const tab = entry as Record<string, unknown>;
      if (Object.keys(tab).some((name) => name !== "title") || typeof tab.title !== "string") {
        throw new TypeError(
          `Expected a closed tab at native element ${element.key}.tabs[${index}]`,
        );
      }
      return Object.freeze({ title: tab.title });
    }),
  );
}

function renderChildElement(
  element: NativeElement,
  components: NativeComponentCatalog,
  handlers: NativeRenderHandlers,
): ReactElement {
  const rendered = renderElement(element, components, handlers);
  const weight = optionalFiniteNumberProp(element, "weight");
  if (weight === undefined) {
    return rendered;
  }
  if (weight < 0) {
    throw new TypeError(`Expected a non-negative weight at native element ${element.key}`);
  }
  return createElement(
    components.View,
    { key: element.key, style: { flexGrow: weight } satisfies NativeViewStyle },
    rendered,
  );
}

function selectViewComponent(
  element: NativeElement,
  components: NativeComponentCatalog,
  useComponentVariants: boolean,
): ComponentType<NativeViewComponentProps> {
  if (!useComponentVariants) {
    return components.View;
  }
  const layout = optionalStringProp(element, "layout");
  const variant = optionalStringProp(element, "variant");
  let selected: NativeViewVariant | undefined;
  if (variant === "card" || variant === "list") {
    selected = variant;
  } else if (variant !== undefined) {
    throw new TypeError(
      `Unsupported view variant ${JSON.stringify(variant)} at native element ${element.key}`,
    );
  } else if (layout === "column" || layout === "row") {
    selected = layout;
  }
  return (
    (selected === undefined ? undefined : components.variants?.View?.[selected]) ?? components.View
  );
}

function selectTextComponent(
  element: NativeElement,
  components: NativeComponentCatalog,
  useComponentVariants: boolean,
): ComponentType<NativeTextComponentProps> {
  if (!useComponentVariants) {
    return components.Text;
  }
  const variant = selectClosedVariant(
    element,
    "variant",
    ["body", "caption"] as const,
    "body",
    "text",
  );
  return components.variants?.Text?.[variant] ?? components.Text;
}

function selectButtonComponent(
  element: NativeElement,
  components: NativeComponentCatalog,
  useComponentVariants: boolean,
): ComponentType<NativeButtonComponentProps> {
  if (!useComponentVariants) {
    return components.Button;
  }
  const variant = selectClosedVariant(
    element,
    "variant",
    ["borderless", "default", "primary"] as const,
    "default",
    "button",
  );
  return components.variants?.Button?.[variant] ?? components.Button;
}

function selectTextInputComponent(
  element: NativeElement,
  components: NativeComponentCatalog,
  useComponentVariants: boolean,
): ComponentType<NativeTextInputComponentProps> {
  if (!useComponentVariants) {
    return components.TextInput;
  }
  const variant = selectClosedVariant(
    element,
    "variant",
    ["longText", "number", "obscured", "shortText"] as const,
    "shortText",
    "text input",
  );
  return components.variants?.TextInput?.[variant] ?? components.TextInput;
}

function selectClosedVariant<const Variant extends string>(
  element: NativeElement,
  property: string,
  allowed: readonly Variant[],
  fallback: Variant,
  label: string,
): Variant {
  const value = optionalStringProp(element, property);
  if (value === undefined) {
    return fallback;
  }
  if ((allowed as readonly string[]).includes(value)) {
    return value as Variant;
  }
  throw new TypeError(
    `Unsupported ${label} variant ${JSON.stringify(value)} at native element ${element.key}`,
  );
}

function selectViewStyle(element: NativeElement): NativeViewStyle | undefined {
  const layout = optionalStringProp(element, "layout");
  const justify = optionalStringProp(element, "justify");
  const align = optionalStringProp(element, "align");
  if (layout === undefined) {
    if (justify !== undefined || align !== undefined) {
      throw new TypeError(`Missing layout at native element ${element.key}`);
    }
    return undefined;
  }
  if (layout !== "column" && layout !== "row") {
    throw new TypeError(
      `Unsupported layout ${JSON.stringify(layout)} at native element ${element.key}`,
    );
  }
  return {
    flexDirection: layout,
    ...(justify === undefined ? {} : { justifyContent: mapJustifyContent(justify, element.key) }),
    ...(align === undefined ? {} : { alignItems: mapAlignItems(align, element.key) }),
  };
}

function mapJustifyContent(
  value: string,
  elementKey: string,
): NonNullable<NativeViewStyle["justifyContent"]> {
  switch (value) {
    case "start":
      return "flex-start";
    case "end":
      return "flex-end";
    case "center":
      return "center";
    case "spaceAround":
      return "space-around";
    case "spaceBetween":
      return "space-between";
    case "spaceEvenly":
      return "space-evenly";
    default:
      throw new TypeError(
        `Unsupported justify value ${JSON.stringify(value)} at native element ${elementKey}`,
      );
  }
}

function mapAlignItems(
  value: string,
  elementKey: string,
): NonNullable<NativeViewStyle["alignItems"]> {
  switch (value) {
    case "start":
      return "flex-start";
    case "end":
      return "flex-end";
    case "center":
    case "stretch":
      return value;
    default:
      throw new TypeError(
        `Unsupported align value ${JSON.stringify(value)} at native element ${elementKey}`,
      );
  }
}

function selectTextInputBehaviorProps(
  element: NativeElement,
): Pick<NativeTextInputComponentProps, "keyboardType" | "multiline" | "secureTextEntry"> {
  const variant = optionalStringProp(element, "variant");
  switch (variant) {
    case undefined:
    case "shortText":
      return {};
    case "longText":
      return { multiline: true };
    case "number":
      return { keyboardType: "numeric" };
    case "obscured":
      return { secureTextEntry: true };
    default:
      throw new TypeError(
        `Unsupported text input variant ${JSON.stringify(variant)} at native element ${element.key}`,
      );
  }
}

function createButtonPressHandler(
  element: NativeElement,
  handlers: NativeRenderHandlers,
): () => void {
  const disabled = optionalBooleanProp(element, "disabled") === true;
  const hasEvent = Object.hasOwn(element.props, "event");
  const hasOpenUrl = Object.hasOwn(element.props, "openUrl");
  const hasInvalidLocalOpenUrl = Object.hasOwn(element.props, "invalidLocalOpenUrl");
  if (Number(hasEvent) + Number(hasOpenUrl) + Number(hasInvalidLocalOpenUrl) !== 1) {
    throw new TypeError(
      `Expected exactly one event, openUrl, or invalid local openUrl at native element ${element.key}`,
    );
  }
  if (hasEvent) {
    const event = expectV1EventProp(element);
    if (handlers.onV1Event === undefined) {
      throw new TypeError(`Missing A2UI v1 event handler for element ${element.key}`);
    }
    return disabled
      ? () => undefined
      : () => {
          handlers.onElementActivate?.(element.key);
          handlers.onV1Event?.(event);
        };
  }
  if (hasOpenUrl) {
    const request = expectV1OpenUrlProp(element);
    if (handlers.onV1OpenUrl === undefined) {
      throw new TypeError(`Missing A2UI v1 openUrl policy or handler for element ${element.key}`);
    }
    return disabled
      ? () => undefined
      : () => {
          handlers.onElementActivate?.(element.key);
          handlers.onV1OpenUrl?.(request);
        };
  }
  expectV1InvalidLocalOpenUrlProp(element);
  if (!disabled) {
    throw new TypeError(`Expected invalid local openUrl element ${element.key} to be disabled`);
  }
  return () => undefined;
}

function selectAccessibilityProps(element: NativeElement): NativeAccessibilityProps {
  const accessibilityLabel = optionalStringProp(element, "accessibilityLabel");
  const accessibilityHint = optionalStringProp(element, "accessibilityHint");
  const live = optionalAccessibilityLiveProp(element);
  const hidden = optionalBooleanProp(element, "accessibilityHidden");
  return {
    ...(accessibilityLabel === undefined ? {} : { accessibilityLabel }),
    ...(accessibilityHint === undefined ? {} : { accessibilityHint }),
    ...(live === undefined
      ? {}
      : { accessibilityLiveRegion: live === "off" ? ("none" as const) : live }),
    ...(hidden === undefined
      ? {}
      : {
          accessibilityElementsHidden: hidden,
          importantForAccessibility: hidden ? ("no-hide-descendants" as const) : ("auto" as const),
        }),
  };
}

function expectStringProp(element: NativeElement, name: string): string {
  const value = element.props[name];
  if (typeof value !== "string") {
    throw new TypeError(`Expected a string at native element ${element.key}.${name}`);
  }
  return value;
}

function selectClosedStringProp<const Value extends string>(
  element: NativeElement,
  name: string,
  allowed: readonly Value[],
): Value {
  const value = expectStringProp(element, name);
  if (!(allowed as readonly string[]).includes(value)) {
    throw new TypeError(
      `Unsupported value ${JSON.stringify(value)} at native element ${element.key}.${name}`,
    );
  }
  return value as Value;
}

function optionalStringProp(element: NativeElement, name: string): string | undefined {
  const value = element.props[name];
  return value === undefined ? undefined : expectStringProp(element, name);
}

function optionalStringArrayProp(
  element: NativeElement,
  name: string,
): readonly string[] | undefined {
  const value = element.props[name];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new TypeError(`Expected an array of strings at native element ${element.key}.${name}`);
  }
  return value as readonly string[];
}

function expectStringArrayProp(element: NativeElement, name: string): readonly string[] {
  const value = optionalStringArrayProp(element, name);
  if (value === undefined) {
    throw new TypeError(`Expected an array of strings at native element ${element.key}.${name}`);
  }
  return value;
}

function expectBooleanProp(element: NativeElement, name: string): boolean {
  const value = optionalBooleanProp(element, name);
  if (value === undefined) {
    throw new TypeError(`Expected a boolean at native element ${element.key}.${name}`);
  }
  return value;
}

function optionalBooleanProp(element: NativeElement, name: string): boolean | undefined {
  const value = element.props[name];
  if (value !== undefined && typeof value !== "boolean") {
    throw new TypeError(`Expected a boolean at native element ${element.key}.${name}`);
  }
  return value;
}

function optionalFiniteNumberProp(element: NativeElement, name: string): number | undefined {
  const value = element.props[name];
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) {
    throw new TypeError(`Expected a finite number at native element ${element.key}.${name}`);
  }
  return value;
}

function expectFiniteNumberProp(element: NativeElement, name: string): number {
  const value = optionalFiniteNumberProp(element, name);
  if (value === undefined) {
    throw new TypeError(`Expected a finite number at native element ${element.key}.${name}`);
  }
  return value;
}

function optionalAccessibilityLiveProp(
  element: NativeElement,
): "assertive" | "off" | "polite" | undefined {
  const value = element.props.accessibilityLive;
  if (value === undefined || value === "assertive" || value === "off" || value === "polite") {
    return value;
  }
  throw new TypeError(
    `Expected an accessibility live value at native element ${element.key}.accessibilityLive`,
  );
}

function expectV1EventProp(element: NativeElement): A2uiV1NativeEventDescriptor {
  const path = `native element ${element.key}.event`;
  const event = parseJsonObject(element.props.event, path);
  rejectObjectKeys(
    event,
    ["context", "instanceKey", "name", "sourceComponentId", "surfaceId", "userMessage"],
    path,
  );
  const name = expectObjectString(event, "name", path);
  const surfaceId = expectObjectString(event, "surfaceId", path);
  const sourceComponentId = expectObjectString(event, "sourceComponentId", path);
  const context = parseJsonObject(event.context, `${path}.context`);
  const instanceKey = event.instanceKey;
  if (instanceKey !== undefined && (typeof instanceKey !== "string" || instanceKey.length === 0)) {
    throw new TypeError(`Expected a non-empty string at ${path}.instanceKey`);
  }
  const userMessage = event.userMessage;
  if (userMessage !== undefined && typeof userMessage !== "string") {
    throw new TypeError(`Expected a string at ${path}.userMessage`);
  }
  return {
    name,
    surfaceId,
    sourceComponentId,
    ...(instanceKey === undefined ? {} : { instanceKey }),
    context,
    ...(userMessage === undefined ? {} : { userMessage }),
  };
}

function expectV1OpenUrlProp(element: NativeElement): A2uiV1NativeOpenUrlDescriptor {
  const path = `native element ${element.key}.openUrl`;
  try {
    return parseA2uiV1NativeOpenUrlDescriptor(element.props.openUrl, path);
  } catch (error) {
    const message = error instanceof Error ? error.message : `Expected an openUrl at ${path}`;
    throw new TypeError(message, { cause: error });
  }
}

function expectV1InvalidLocalOpenUrlProp(element: NativeElement): void {
  const path = `native element ${element.key}.invalidLocalOpenUrl`;
  const marker = parseJsonObject(element.props.invalidLocalOpenUrl, path);
  rejectObjectKeys(marker, ["instanceKey", "sourceComponentId", "surfaceId"], path);
  expectObjectString(marker, "instanceKey", path);
  expectObjectString(marker, "sourceComponentId", path);
  expectObjectString(marker, "surfaceId", path);
}

function expectObjectString(value: JsonObject, name: string, path: string): string {
  const field = value[name];
  if (typeof field !== "string" || field.length === 0) {
    throw new TypeError(`Expected a non-empty string at ${path}.${name}`);
  }
  return field;
}

function rejectObjectKeys(value: JsonObject, allowed: readonly string[], path: string): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new TypeError(`Unexpected field ${JSON.stringify(key)} at ${path}`);
    }
  }
}

function updateDataModelBinding(
  dataModel: JsonObject,
  binding: string,
  value: JsonValue,
): JsonObject {
  if (typeof binding !== "string" || !binding.startsWith("/") || binding.length === 1) {
    throw new TypeError(
      `Expected a non-root absolute JSON Pointer binding, received ${JSON.stringify(binding)}`,
    );
  }
  const parsedValue = parseJsonValue(value, "renderer binding value");
  const next = parseJsonObject(dataModel, "renderer data model");
  const tokens = binding
    .slice(1)
    .split("/")
    .map((token) => decodePointerToken(token, binding));
  let cursor: JsonValue = next;
  for (const [index, token] of tokens.entries()) {
    const last = index === tokens.length - 1;
    if (Array.isArray(cursor)) {
      if (!/^(0|[1-9][0-9]*)$/.test(token)) {
        throw new TypeError(`Invalid array binding index in ${JSON.stringify(binding)}`);
      }
      const arrayIndex = Number(token);
      if (!Number.isSafeInteger(arrayIndex) || arrayIndex >= cursor.length) {
        throw new TypeError(`Renderer binding ${JSON.stringify(binding)} is missing`);
      }
      if (last) {
        cursor[arrayIndex] = validateRendererBindingReplacement(
          cursor[arrayIndex]!,
          parsedValue,
          binding,
        );
        break;
      }
      cursor = cursor[arrayIndex]!;
      continue;
    }
    if (cursor === null || typeof cursor !== "object" || !Object.hasOwn(cursor, token)) {
      throw new TypeError(`Renderer binding ${JSON.stringify(binding)} is missing`);
    }
    if (last) {
      defineJsonProperty(
        cursor as Record<string, JsonValue>,
        token,
        validateRendererBindingReplacement(
          (cursor as Record<string, JsonValue>)[token]!,
          parsedValue,
          binding,
        ),
      );
      break;
    }
    cursor = (cursor as Record<string, JsonValue>)[token]!;
  }
  return parseJsonObject(next, "renderer data model");
}

function validateRendererBindingReplacement(
  current: JsonValue,
  next: JsonValue,
  binding: string,
): JsonValue {
  if (
    (typeof current === "string" && typeof next === "string") ||
    (typeof current === "boolean" && typeof next === "boolean") ||
    (typeof current === "number" && typeof next === "number")
  ) {
    return next;
  }
  if (
    Array.isArray(current) &&
    current.every((value) => typeof value === "string") &&
    Array.isArray(next) &&
    next.every((value) => typeof value === "string")
  ) {
    return Object.freeze([...next]);
  }
  throw new TypeError(
    `Renderer binding ${JSON.stringify(binding)} must preserve its string, boolean, number, or string-array value type`,
  );
}

function decodePointerToken(token: string, pointer: string): string {
  for (let index = 0; index < token.length; index += 1) {
    if (token[index] !== "~") {
      continue;
    }
    const escaped = token[index + 1];
    if (escaped !== "0" && escaped !== "1") {
      throw new TypeError(`Invalid JSON Pointer escape in ${JSON.stringify(pointer)}`);
    }
    index += 1;
  }
  return token.replaceAll("~1", "/").replaceAll("~0", "~");
}

function defineJsonProperty(
  object: Record<string, JsonValue>,
  key: string,
  value: JsonValue,
): void {
  Object.defineProperty(object, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

export {
  A2UI_V1_NATIVE_COMPONENT_NAMES,
  A2UI_V1_NATIVE_MAX_CHOICE_OPTIONS,
  A2UI_V1_NATIVE_MAX_IMAGE_BYTES,
  A2UI_V1_NATIVE_MAX_IMAGE_DIMENSION,
  A2UI_V1_NATIVE_MAX_IMAGE_PIXELS,
  A2UI_V1_NATIVE_MAX_IMAGE_REDIRECT_ORIGINS,
  A2UI_V1_NATIVE_MAX_IMAGE_REDIRECTS,
  A2UI_V1_NATIVE_MAX_IMAGE_URL_LENGTH,
  A2UI_V1_NATIVE_MAX_IMAGES,
  A2UI_V1_NATIVE_MAX_MEDIA,
  A2UI_V1_NATIVE_MAX_MEDIA_BYTES,
  A2UI_V1_NATIVE_MAX_MEDIA_MIME_TYPES,
  A2UI_V1_NATIVE_MAX_MEDIA_REDIRECT_ORIGINS,
  A2UI_V1_NATIVE_MAX_MEDIA_REDIRECTS,
  A2UI_V1_NATIVE_MAX_MEDIA_URL_LENGTH,
  A2UI_V1_NATIVE_MAX_OPEN_URL_LENGTH,
  A2UI_V1_NATIVE_MAX_RENDER_NODES,
  A2UI_V1_NATIVE_MAX_TOTAL_IMAGE_BYTES,
  A2UI_V1_NATIVE_MAX_TOTAL_IMAGE_PIXELS,
  A2UI_V1_NATIVE_MAX_TOTAL_MEDIA_BYTES,
  createA2uiV1NativeRenderPlan,
  resolveA2uiV1NativeEvent,
  resolveA2uiV1NativeOpenUrl,
} from "./v1.js";
export type {
  A2uiV1NativeEventDescriptor,
  A2uiV1NativeEventResolutionOptions,
  A2uiV1NativeImagePolicy,
  A2uiV1NativeImageGrant,
  A2uiV1NativeImageRequest,
  A2uiV1NativeHostExtensionPolicy,
  A2uiV1NativeHostExtensionRequest,
  A2uiV1NativeMediaGrant,
  A2uiV1NativeMediaKind,
  A2uiV1NativeMediaPolicy,
  A2uiV1NativeMediaRequest,
  A2uiV1NativeOpenUrlDescriptor,
  A2uiV1NativeOpenUrlResolutionOptions,
  A2uiV1NativeRenderPlanOptions,
} from "./v1.js";
