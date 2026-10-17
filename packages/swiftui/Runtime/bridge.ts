import URL from "core-js-pure/actual/url/index.js";

import {
  createBasicCatalogPolicy,
  createHostExtensionCapabilitySettings,
  createHostExtensionRegistry,
  getHostExtensionManifest,
  negotiateHostExtensions,
  validateHostExtensionEvent,
} from "@mcp-native/a2ui";
import type { HostExtensionRegistry } from "@mcp-native/a2ui";
import { createNativeSession } from "@mcp-native/renderer-core";
import type {
  NativeSession,
  NativeSessionActionProposal,
  NativeSessionOperationResult,
  NativeSessionPressResult,
  NativeSessionTicket,
} from "@mcp-native/renderer-core";

globalThis.URL ??= URL as unknown as typeof globalThis.URL;
if (globalThis.AbortController === undefined) {
  class AppleAbortSignal {
    aborted = false;
    readonly #listeners = new Set<() => void>();
    addEventListener(type: "abort", listener: () => void): void {
      if (type === "abort") this.#listeners.add(listener);
    }
    removeEventListener(type: "abort", listener: () => void): void {
      if (type === "abort") this.#listeners.delete(listener);
    }
    abort(): void {
      if (this.aborted) return;
      this.aborted = true;
      for (const listener of this.#listeners) listener();
      this.#listeners.clear();
    }
  }
  class AppleAbortController {
    readonly signal = new AppleAbortSignal();
    abort(): void {
      this.signal.abort();
    }
  }
  globalThis.AbortController = AppleAbortController as unknown as typeof AbortController;
}

const MAX_REQUEST_CODE_UNITS = 1_048_576;
const MAX_RESPONSE_CODE_UNITS = 1_048_576;
const MAX_TOKEN_CODE_UNITS = 128;

interface Grant {
  readonly allowedOrigins: readonly string[];
  readonly allowedMIMETypes: readonly string[];
  readonly maximumBytes: number;
  readonly maximumRedirects: number;
  readonly maximumDecodedWidth?: number;
  readonly maximumDecodedHeight?: number;
  readonly maximumDecodedPixels?: number;
  readonly allowsAutoplay: boolean;
  readonly allowsBackgroundPlayback: boolean;
  readonly allowsExternalRoutes: boolean;
  readonly requiresUserActivation: boolean;
}

interface Configuration {
  readonly allowedComponentNames: readonly string[];
  readonly allowedEventNames: readonly string[];
  readonly allowedFunctionNames: readonly string[];
  readonly locale: string;
  readonly imageGrants: Readonly<Record<string, Grant>>;
  readonly mediaGrants: Readonly<Record<string, Grant>>;
  readonly hostExtensions: readonly {
    readonly manifest: Record<string, unknown>;
    readonly permissions: readonly string[];
    readonly resources: readonly string[];
  }[];
  readonly maximumOperations: number;
}

interface PendingPress {
  phase: "authorizing" | "delivering" | "complete";
  proposal?: NativeSessionActionProposal;
  resolveAuthorization?: (allowed: boolean) => void;
  resolveDelivery?: (failure?: unknown) => void;
  result?: NativeSessionPressResult;
}

let session: NativeSession | undefined;
let token: string | undefined;
let sequence = 0;
let tickets = new Map<string, NativeSessionTicket>();
let pending: PendingPress | undefined;
let nextPressId = 1;
let activePressId: string | undefined;
let extensionRegistry: HostExtensionRegistry | undefined;
let actionTimestamp = "";

function requireObject(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`Expected ${name} to be an object`);
  }
  return value as Record<string, unknown>;
}

function grantFor(table: Readonly<Record<string, Grant>>, url: string): Grant | false {
  const grant = table[url];
  if (grant === undefined) return false;
  return grant;
}

function imageGrant(grant: Grant) {
  return {
    allowedRedirectOrigins: grant.allowedOrigins,
    cacheMode: "no-store" as const,
    maximumBytes: grant.maximumBytes,
    maximumDecodedHeight: grant.maximumDecodedHeight,
    maximumDecodedPixels: grant.maximumDecodedPixels,
    maximumDecodedWidth: grant.maximumDecodedWidth,
    maximumRedirects: grant.maximumRedirects,
  };
}

function mediaGrant(grant: Grant, sourceOrigin: string) {
  return {
    sourceOrigin,
    allowedRedirectOrigins: grant.allowedOrigins,
    allowedMimeTypes: grant.allowedMIMETypes,
    maximumBytes: grant.maximumBytes,
    maximumRedirects: grant.maximumRedirects,
    allowsAutoplay: grant.allowsAutoplay,
    allowsBackgroundPlayback: grant.allowsBackgroundPlayback,
    allowsExternalRoutes: grant.allowsExternalRoutes,
    requiresUserActivation: grant.requiresUserActivation,
  };
}

function open(configurationInput: unknown, timestamp: unknown): void {
  const configuration = requireObject(
    configurationInput,
    "configuration",
  ) as unknown as Configuration;
  if (typeof timestamp !== "string") throw new TypeError("Expected a fixed timestamp");
  const manifests = configuration.hostExtensions.map((entry) => entry.manifest);
  const settings = createHostExtensionCapabilitySettings(manifests, "ios");
  const negotiation =
    manifests.length === 0 ? undefined : negotiateHostExtensions(settings, settings);
  const hostExtensions =
    negotiation?.kind === "negotiated"
      ? createHostExtensionRegistry({ platform: "ios", manifests, negotiation })
      : undefined;
  extensionRegistry = hostExtensions;
  const policy = createBasicCatalogPolicy({
    allowedComponentNames: configuration.allowedComponentNames,
    allowedEventNames: configuration.allowedEventNames,
    allowedFunctionNames: configuration.allowedFunctionNames,
    ...(hostExtensions === undefined ? {} : { hostExtensions }),
    allowedHostExtensionComponentNames: manifests.map((manifest) => String(manifest.componentName)),
  });
  session = createNativeSession({
    policy,
    maximumOperations: configuration.maximumOperations,
    now: () => actionTimestamp,
    renderOptions: {
      locale: configuration.locale,
      imagePolicy: (request) => {
        const grant = grantFor(configuration.imageGrants, request.url);
        return grant === false ? false : imageGrant(grant);
      },
      mediaPolicy: (request) => {
        const grant = grantFor(configuration.mediaGrants, request.url);
        return grant === false ? false : mediaGrant(grant, request.sourceOrigin);
      },
      hostExtensionPolicy: (request) => {
        const entry = configuration.hostExtensions.find(
          (candidate) =>
            candidate.manifest.catalogId === request.catalogId &&
            candidate.manifest.componentName === request.componentName,
        );
        return entry === undefined
          ? false
          : { permissions: entry.permissions, resources: entry.resources };
      },
    },
    authorize: (proposal) =>
      new Promise<boolean>((resolve) => {
        if (pending === undefined) throw new TypeError("Missing pending press");
        pending.phase = "authorizing";
        pending.proposal = proposal;
        pending.resolveAuthorization = resolve;
      }),
    deliver: () =>
      new Promise<void>((resolve, reject) => {
        if (pending === undefined) throw new TypeError("Missing pending press");
        pending.phase = "delivering";
        pending.resolveDelivery = (failure) =>
          failure === undefined ? resolve() : reject(failure);
      }),
  });
}

function sourceIdFromKey(key: string): string {
  const slash = key.lastIndexOf("/");
  const segment = slash === -1 ? key : key.slice(slash + 1);
  const separator = segment.lastIndexOf(":");
  const encoded = separator === -1 ? segment : segment.slice(0, separator);
  return encoded.replaceAll("%3A", ":").replaceAll("%2F", "/").replaceAll("%25", "%");
}

function serializeResult(result: NativeSessionOperationResult): unknown {
  if (result.kind !== "published") return result;
  tickets = new Map();
  const unused = result.controls.map((control, index) => ({
    control,
    id: `c${index}`,
    used: false,
  }));
  for (const entry of unused) tickets.set(entry.id, entry.control.ticket);
  const visit = (node: typeof result.plan): unknown => {
    const event = node.props.event as
      | { readonly sourceComponentId?: unknown; readonly instanceKey?: unknown }
      | undefined;
    const binding = typeof node.props.binding === "string" ? node.props.binding : undefined;
    const sourceComponentId =
      typeof event?.sourceComponentId === "string"
        ? event.sourceComponentId
        : sourceIdFromKey(node.key);
    const instanceKey = typeof event?.instanceKey === "string" ? event.instanceKey : undefined;
    const match = unused.find(
      (entry) =>
        !entry.used &&
        entry.control.sourceComponentId === sourceComponentId &&
        entry.control.instanceKey === instanceKey &&
        entry.control.binding === binding,
    );
    if (match !== undefined) match.used = true;
    return {
      id: node.key,
      component: node.component,
      props: JSON.parse(JSON.stringify(node.props)),
      children: (node.children ?? []).map(visit),
      ...(match === undefined ? {} : { controlID: match.id }),
    };
  };
  return { ...result, plan: visit(result.plan), controls: undefined };
}

function operate(request: Record<string, unknown>): unknown {
  if (session === undefined) throw new TypeError("Session is closed");
  switch (request.op) {
    case "apply":
      return serializeResult(session.apply(request.envelope));
    case "render":
      return serializeResult(session.render());
    case "input": {
      const ticket = tickets.get(String(request.controlID));
      if (ticket === undefined) return { kind: "rejected", code: "stale" };
      return serializeResult(session.input(ticket, request.value as never));
    }
    case "press": {
      const ticket = tickets.get(String(request.controlID));
      if (ticket === undefined) return { kind: "rejected", code: "stale" };
      if (pending !== undefined) return { kind: "rejected", code: "busy" };
      if (typeof request.timestamp !== "string") throw new TypeError("Expected action timestamp");
      actionTimestamp = request.timestamp;
      const id = `p${nextPressId++}`;
      pending = { phase: "authorizing" };
      activePressId = id;
      void session.press(ticket).then((result) => {
        if (pending !== undefined && activePressId === id) {
          pending.phase = "complete";
          pending.result = result;
        }
      });
      return { kind: "pending", pressID: id };
    }
    case "poll":
      if (request.pressID !== activePressId || pending === undefined) {
        return { kind: "rejected", code: "stale" };
      }
      return {
        kind: pending.phase,
        ...(pending.proposal === undefined ? {} : { proposal: pending.proposal }),
        ...(pending.result === undefined ? {} : { result: pending.result }),
      };
    case "authorize":
      if (request.pressID !== activePressId || pending?.resolveAuthorization === undefined) {
        return { kind: "rejected", code: "stale" };
      }
      pending.resolveAuthorization(request.allowed === true);
      pending.resolveAuthorization = undefined;
      return { kind: "unchanged" };
    case "delivered":
      if (request.pressID !== activePressId || pending?.resolveDelivery === undefined) {
        return { kind: "rejected", code: "stale" };
      }
      pending.resolveDelivery(
        request.succeeded === true ? undefined : new Error("delivery failed"),
      );
      pending.resolveDelivery = undefined;
      return { kind: "unchanged" };
    case "finish": {
      const result = pending?.result ?? { kind: "rejected", code: "busy" };
      pending = undefined;
      activePressId = undefined;
      return result;
    }
    case "extensionEvent": {
      if (extensionRegistry === undefined) return { kind: "rejected", code: "stale" };
      const manifest = getHostExtensionManifest(
        extensionRegistry,
        request.catalogId,
        request.componentName,
      );
      if (manifest === undefined) return { kind: "rejected", code: "stale" };
      const payload = validateHostExtensionEvent(
        manifest,
        request.name,
        request.payload,
        request.userActivated === true,
      );
      return {
        kind: "extension-event",
        event: {
          extensionId: manifest.extensionId,
          catalogId: manifest.catalogId,
          schemaVersion: manifest.schemaVersion,
          componentName: manifest.componentName,
          surfaceId: request.surfaceId,
          sourceComponentId: request.sourceComponentId,
          name: request.name,
          payload,
          userActivated: request.userActivated === true,
        },
      };
    }
    case "close":
      session.close();
      session = undefined;
      tickets.clear();
      pending = undefined;
      activePressId = undefined;
      extensionRegistry = undefined;
      return null;
    default:
      throw new TypeError("Unknown bridge operation");
  }
}

export function exchange(source: unknown): string {
  try {
    if (typeof source !== "string" || source.length > MAX_REQUEST_CODE_UNITS) {
      throw new TypeError("Request limit");
    }
    const request = requireObject(JSON.parse(source), "request");
    if (typeof request.token !== "string" || request.token.length > MAX_TOKEN_CODE_UNITS) {
      throw new TypeError("Invalid token");
    }
    let value: unknown;
    if (request.op === "open") {
      if (session !== undefined || request.sequence !== 0)
        throw new TypeError("Session already open");
      token = request.token;
      sequence = 0;
      open(request.configuration, request.timestamp);
      value = null;
    } else {
      if (session === undefined || request.token !== token || request.sequence !== sequence + 1) {
        throw new TypeError("Stale bridge request");
      }
      sequence += 1;
      value = operate(request);
    }
    const response = JSON.stringify({ ok: true, value });
    if (response.length > MAX_RESPONSE_CODE_UNITS) throw new TypeError("Response limit");
    return response;
  } catch (error) {
    session?.close();
    session = undefined;
    tickets.clear();
    pending = undefined;
    extensionRegistry = undefined;
    const response = JSON.stringify({
      ok: false,
      error: "apple-renderer-session-failed",
      diagnostic: String(error).slice(0, 256),
    });
    return response;
  }
}
