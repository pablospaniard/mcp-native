import {
  A2uiSurfaceStore,
  createA2uiV1ActionEnvelope,
  createA2uiSurfaceIdRegistry,
} from "@mcp-native/a2ui";
import type {
  A2uiSurfaceIdRegistry,
  A2uiV1ActionEnvelope,
  A2uiV1Envelope,
  A2uiV1SurfaceState,
  A2uiV1SurfaceValidationPolicy,
} from "@mcp-native/a2ui";
import { parseJsonObject } from "@mcp-native/core";
import type { JsonObject, JsonValue } from "@mcp-native/core";

import type { NativeElement } from "./index.js";
import {
  createA2uiV1NativeRenderPlan,
  createA2uiV1NativeRenderPlanForLocalEdits,
  resolveA2uiV1NativeEvent,
  updateDataModelBinding,
} from "./v1.js";
import type { A2uiV1NativeEventDescriptor, A2uiV1NativeRenderPlanOptions } from "./v1.js";

export const NATIVE_SESSION_MAX_OPERATIONS = 10_000;

export type NativeSessionDiagnosticCode =
  | "action-denied"
  | "busy"
  | "closed"
  | "delivery-failed"
  | "input-rejected"
  | "message-rejected"
  | "operation-limit"
  | "stale"
  | "surface-rejected";

export interface NativeSessionTicket {}

export interface NativeSessionControl {
  readonly ticket: NativeSessionTicket;
  readonly sourceComponentId: string;
  readonly instanceKey?: string;
  readonly binding?: string;
  readonly canPress: boolean;
}

export interface NativeSessionPublication {
  readonly kind: "published";
  readonly generation: number;
  readonly renderRevision: number;
  readonly serverModelRevision: number;
  readonly surfaceIncarnation: number;
  readonly plan: NativeElement;
  readonly controls: readonly NativeSessionControl[];
}

export type NativeSessionOperationResult =
  | NativeSessionPublication
  | { readonly kind: "unmounted"; readonly code: "surface-rejected" }
  | { readonly kind: "unchanged" }
  | { readonly kind: "rejected"; readonly code: NativeSessionDiagnosticCode };

export interface NativeSessionActionProposal {
  readonly envelope: A2uiV1ActionEnvelope;
  readonly dataModel?: JsonObject;
  readonly generation: number;
  readonly renderRevision: number;
  readonly surfaceIncarnation: number;
}

export interface NativeSessionAbortSignal {
  readonly aborted: boolean;
  addEventListener(
    type: "abort",
    listener: () => void,
    options?: { readonly once?: boolean },
  ): void;
  removeEventListener(type: "abort", listener: () => void): void;
}

interface NativeSessionAbortController {
  readonly signal: NativeSessionAbortSignal;
  abort(): void;
}

export type NativeSessionPressResult =
  | { readonly kind: "delivered" }
  | { readonly kind: "denied" }
  | { readonly kind: "rejected"; readonly code: NativeSessionDiagnosticCode };

export interface NativeSessionOptions {
  readonly policy: A2uiV1SurfaceValidationPolicy;
  readonly surfaceIdRegistry?: A2uiSurfaceIdRegistry;
  readonly renderOptions?: A2uiV1NativeRenderPlanOptions;
  readonly maximumOperations?: number;
  readonly now?: () => string;
  readonly authorize: (
    proposal: NativeSessionActionProposal,
    signal: NativeSessionAbortSignal,
  ) => boolean | Promise<boolean>;
  readonly deliver: (
    proposal: NativeSessionActionProposal,
    signal: NativeSessionAbortSignal,
  ) => void | Promise<void>;
}

interface TicketState {
  readonly session: NativeSession;
  readonly generation: number;
  readonly renderRevision: number;
  readonly surfaceIncarnation: number;
  readonly sourceComponentId: string;
  readonly instanceKey?: string;
  readonly binding?: string;
  readonly canPress: boolean;
}

const ticketStates = new WeakMap<object, TicketState>();
let nextGeneration = 1;

/**
 * Platform-neutral semantic session for native adapters. It owns strict surface identity,
 * renderer-local state, revisioned callback tickets, and at-most-once action authorization.
 */
export class NativeSession {
  readonly #generation: number;
  readonly #policy: A2uiV1SurfaceValidationPolicy;
  readonly #store: A2uiSurfaceStore;
  readonly #renderOptions: A2uiV1NativeRenderPlanOptions;
  readonly #maximumOperations: number;
  readonly #now: () => string;
  readonly #authorize: NativeSessionOptions["authorize"];
  readonly #deliver: NativeSessionOptions["deliver"];
  #closed = false;
  #operationCount = 0;
  #renderRevision = 0;
  #serverModelRevision = 0;
  #surfaceIncarnation = 0;
  #surfaceId: string | undefined;
  #localModel: JsonObject | undefined;
  #hasLocalEdits = false;
  #publication: NativeSessionPublication | undefined;
  #pendingAction: { readonly id: object; readonly abort: NativeSessionAbortController } | undefined;

  constructor(options: NativeSessionOptions) {
    if (options === null || typeof options !== "object" || Array.isArray(options)) {
      throw new TypeError("Expected native session options to be an object");
    }
    for (const key of Object.keys(options)) {
      if (
        ![
          "authorize",
          "deliver",
          "maximumOperations",
          "now",
          "policy",
          "renderOptions",
          "surfaceIdRegistry",
        ].includes(key)
      ) {
        throw new TypeError(`Unexpected native session option ${JSON.stringify(key)}`);
      }
    }
    if (typeof options.authorize !== "function" || typeof options.deliver !== "function") {
      throw new TypeError("Native session requires authorize and deliver callbacks");
    }
    const maximumOperations = options.maximumOperations ?? NATIVE_SESSION_MAX_OPERATIONS;
    if (
      !Number.isSafeInteger(maximumOperations) ||
      maximumOperations < 1 ||
      maximumOperations > NATIVE_SESSION_MAX_OPERATIONS
    ) {
      throw new TypeError(
        `Native session maximumOperations must be an integer from 1 through ${NATIVE_SESSION_MAX_OPERATIONS}`,
      );
    }
    this.#generation = nextGeneration++;
    this.#policy = options.policy;
    this.#store = new A2uiSurfaceStore({
      surfaceIdRegistry: options.surfaceIdRegistry ?? createA2uiSurfaceIdRegistry(),
      ...(options.policy.hostExtensions === undefined
        ? {}
        : { hostExtensions: options.policy.hostExtensions }),
    });
    this.#renderOptions = Object.freeze({ ...(options.renderOptions ?? {}) });
    this.#maximumOperations = maximumOperations;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#authorize = options.authorize;
    this.#deliver = options.deliver;
  }

  get generation(): number {
    return this.#generation;
  }

  get closed(): boolean {
    return this.#closed;
  }

  get publication(): NativeSessionPublication | undefined {
    return this.#publication;
  }

  apply(envelope: unknown): NativeSessionOperationResult {
    const admitted = this.#admit();
    if (admitted !== undefined) return admitted;
    const input = envelope as Partial<A2uiV1Envelope>;
    const creates = input !== null && typeof input === "object" && "createSurface" in input;
    if (creates && this.#surfaceId !== undefined) {
      return Object.freeze({ kind: "rejected", code: "message-rejected" });
    }
    try {
      this.#store.apply(envelope);
    } catch {
      return Object.freeze({ kind: "rejected", code: "message-rejected" });
    }
    if ("deleteSurface" in (input as object)) {
      this.#surfaceId = undefined;
      this.#localModel = undefined;
      this.#hasLocalEdits = false;
      this.#publication = undefined;
      this.#surfaceIncarnation += 1;
      this.#renderRevision += 1;
      return Object.freeze({ kind: "unchanged" });
    }
    const surfaceId = getEnvelopeSurfaceId(input);
    if (surfaceId === undefined) {
      return Object.freeze({ kind: "rejected", code: "message-rejected" });
    }
    if (creates) {
      this.#surfaceId = surfaceId;
      this.#surfaceIncarnation += 1;
      this.#localModel = undefined;
      this.#hasLocalEdits = false;
    }
    if ("updateDataModel" in (input as object)) {
      this.#serverModelRevision += 1;
      this.#localModel = undefined;
      this.#hasLocalEdits = false;
    }
    return this.#publish();
  }

  render(): NativeSessionOperationResult {
    const admitted = this.#admit();
    if (admitted !== undefined) return admitted;
    return this.#publish();
  }

  input(ticket: NativeSessionTicket, value: JsonValue): NativeSessionOperationResult {
    const admitted = this.#admit();
    if (admitted !== undefined) return admitted;
    const state = this.#validateTicket(ticket);
    if (state === undefined || state.binding === undefined) {
      return Object.freeze({ kind: "rejected", code: "stale" });
    }
    const surface = this.#currentSurface();
    if (surface === undefined) {
      return Object.freeze({ kind: "rejected", code: "stale" });
    }
    const current = this.#localModel ?? surface.dataModel;
    try {
      this.#localModel = updateDataModelBinding(current, state.binding, value);
      this.#hasLocalEdits = true;
    } catch {
      return Object.freeze({ kind: "rejected", code: "input-rejected" });
    }
    return this.#publish();
  }

  async press(ticket: NativeSessionTicket): Promise<NativeSessionPressResult> {
    if (this.#closed) return Object.freeze({ kind: "rejected", code: "closed" });
    if (this.#pendingAction !== undefined) {
      return Object.freeze({ kind: "rejected", code: "busy" });
    }
    if (this.#operationCount >= this.#maximumOperations) {
      return Object.freeze({ kind: "rejected", code: "operation-limit" });
    }
    this.#operationCount += 1;
    const state = this.#validateTicket(ticket);
    if (state === undefined || !state.canPress) {
      return Object.freeze({ kind: "rejected", code: "stale" });
    }
    const surface = this.#currentSurface();
    if (surface === undefined) {
      return Object.freeze({ kind: "rejected", code: "stale" });
    }
    const model = this.#localModel ?? surface.dataModel;
    let event: A2uiV1NativeEventDescriptor;
    try {
      event = resolveA2uiV1NativeEvent(
        surface,
        this.#policy,
        state.sourceComponentId,
        model,
        state.instanceKey === undefined ? {} : { instanceKey: state.instanceKey },
      );
    } catch {
      return Object.freeze({ kind: "rejected", code: "stale" });
    }
    const envelope = createA2uiV1ActionEnvelope({
      name: event.name,
      surfaceId: event.surfaceId,
      sourceComponentId: event.sourceComponentId,
      context: event.context,
      ...(event.userMessage === undefined ? {} : { userMessage: event.userMessage }),
      timestamp: this.#now(),
    });
    const proposal = Object.freeze({
      envelope,
      ...(surface.sendDataModel
        ? { dataModel: parseJsonObject(model, "native session data model") }
        : {}),
      generation: state.generation,
      renderRevision: state.renderRevision,
      surfaceIncarnation: state.surfaceIncarnation,
    });
    const pending = { id: {}, abort: createAbortController() };
    this.#pendingAction = pending;
    let allowed = false;
    try {
      allowed = (await this.#authorize(proposal, pending.abort.signal)) === true;
    } catch {
      allowed = false;
    }
    if (this.#pendingAction?.id !== pending.id || !this.#isCurrent(state)) {
      if (this.#pendingAction?.id === pending.id) this.#pendingAction = undefined;
      return Object.freeze({ kind: "rejected", code: this.#closed ? "closed" : "stale" });
    }
    if (!allowed) {
      this.#pendingAction = undefined;
      return Object.freeze({ kind: "denied" });
    }
    try {
      await this.#deliver(proposal, pending.abort.signal);
      if (this.#pendingAction?.id !== pending.id || !this.#isCurrent(state)) {
        return Object.freeze({ kind: "rejected", code: this.#closed ? "closed" : "stale" });
      }
      return Object.freeze({ kind: "delivered" });
    } catch {
      return Object.freeze({ kind: "rejected", code: "delivery-failed" });
    } finally {
      if (this.#pendingAction?.id === pending.id) this.#pendingAction = undefined;
    }
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#publication = undefined;
    this.#localModel = undefined;
    this.#pendingAction?.abort.abort();
    this.#pendingAction = undefined;
  }

  #admit(): NativeSessionOperationResult | undefined {
    if (this.#closed) return Object.freeze({ kind: "rejected", code: "closed" });
    if (this.#operationCount >= this.#maximumOperations) {
      return Object.freeze({ kind: "rejected", code: "operation-limit" });
    }
    this.#operationCount += 1;
    return undefined;
  }

  #currentSurface(): A2uiV1SurfaceState | undefined {
    return this.#surfaceId === undefined ? undefined : this.#store.get(this.#surfaceId);
  }

  #publish(): NativeSessionOperationResult {
    const surface = this.#currentSurface();
    if (surface === undefined) {
      this.#publication = undefined;
      return Object.freeze({ kind: "unchanged" });
    }
    const dataModel = this.#localModel ?? surface.dataModel;
    let plan: NativeElement;
    try {
      plan = (
        this.#hasLocalEdits
          ? createA2uiV1NativeRenderPlanForLocalEdits
          : createA2uiV1NativeRenderPlan
      )(surface, this.#policy, {
        ...this.#renderOptions,
        dataModel,
      });
    } catch {
      this.#publication = undefined;
      this.#localModel = undefined;
      this.#hasLocalEdits = false;
      this.#renderRevision += 1;
      return Object.freeze({ kind: "unmounted", code: "surface-rejected" });
    }
    this.#renderRevision += 1;
    const controls = Object.freeze(
      collectControls(plan).map((control) => {
        const ticket = Object.freeze({});
        ticketStates.set(ticket, {
          session: this,
          generation: this.#generation,
          renderRevision: this.#renderRevision,
          surfaceIncarnation: this.#surfaceIncarnation,
          sourceComponentId: control.sourceComponentId,
          ...(control.instanceKey === undefined ? {} : { instanceKey: control.instanceKey }),
          ...(control.binding === undefined ? {} : { binding: control.binding }),
          canPress: control.canPress,
        });
        return Object.freeze({ ticket, ...control });
      }),
    );
    const publication = Object.freeze({
      kind: "published" as const,
      generation: this.#generation,
      renderRevision: this.#renderRevision,
      serverModelRevision: this.#serverModelRevision,
      surfaceIncarnation: this.#surfaceIncarnation,
      plan,
      controls,
    });
    this.#publication = publication;
    return publication;
  }

  #validateTicket(ticket: NativeSessionTicket): TicketState | undefined {
    if (ticket === null || typeof ticket !== "object") return undefined;
    const state = ticketStates.get(ticket);
    return state !== undefined && this.#isCurrent(state) ? state : undefined;
  }

  #isCurrent(state: TicketState): boolean {
    return (
      !this.#closed &&
      state.session === this &&
      state.generation === this.#generation &&
      state.renderRevision === this.#renderRevision &&
      state.surfaceIncarnation === this.#surfaceIncarnation
    );
  }
}

export function createNativeSession(options: NativeSessionOptions): NativeSession {
  return new NativeSession(options);
}

function getEnvelopeSurfaceId(envelope: Partial<A2uiV1Envelope>): string | undefined {
  const source = envelope as Record<string, unknown>;
  for (const key of [
    "createSurface",
    "updateComponents",
    "updateDataModel",
    "deleteSurface",
  ] as const) {
    const message = source[key] as { readonly surfaceId?: unknown } | undefined;
    if (message !== undefined && typeof message.surfaceId === "string") return message.surfaceId;
  }
  return undefined;
}

function createAbortController(): NativeSessionAbortController {
  const AbortControllerConstructor = (
    globalThis as typeof globalThis & {
      readonly AbortController?: new () => NativeSessionAbortController;
    }
  ).AbortController;
  if (AbortControllerConstructor === undefined) {
    throw new TypeError("Native sessions require AbortController support");
  }
  return new AbortControllerConstructor();
}

function collectControls(plan: NativeElement): readonly Omit<NativeSessionControl, "ticket">[] {
  const controls: Omit<NativeSessionControl, "ticket">[] = [];
  const pending = [plan];
  while (pending.length > 0) {
    const element = pending.pop()!;
    const event = element.props.event as A2uiV1NativeEventDescriptor | undefined;
    const binding = typeof element.props.binding === "string" ? element.props.binding : undefined;
    if (event !== undefined || binding !== undefined) {
      controls.push({
        sourceComponentId: event?.sourceComponentId ?? sourceIdFromKey(element.key),
        ...(event?.instanceKey === undefined ? {} : { instanceKey: event.instanceKey }),
        ...(binding === undefined ? {} : { binding }),
        canPress: event !== undefined && element.props.disabled !== true,
      });
    }
    pending.push(...(element.children ?? []));
  }
  return controls;
}

function sourceIdFromKey(key: string): string {
  const slash = key.lastIndexOf("/");
  const source = slash === -1 ? key : key.slice(slash + 1);
  const separator = source.search(/[[:]/u);
  return separator === -1 ? source : source.slice(0, separator);
}
