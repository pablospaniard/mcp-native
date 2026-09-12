import { parseJsonObject, parseJsonValue } from "../../packages/core/dist/index.js";
import {
  A2uiParseError,
  A2uiSurfaceStore,
  createA2uiV1ActionEnvelope,
  createA2uiV1BasicCatalogPolicy,
} from "../../packages/a2ui/dist/index.js";
import {
  createA2uiV1NativeRenderPlan,
  resolveA2uiV1NativeEvent,
} from "../../packages/renderer-core/dist/index.js";

// Experiment-only session glue. No React, Node, network, or native callbacks in this bundle.
// Binding/reconciliation remains adapter work; renderer-core is not a complete session runtime.
export class SharedSession {
  constructor(host, timestamp) {
    this.store = new A2uiSurfaceStore();
    this.policy = createA2uiV1BasicCatalogPolicy({
      allowedComponentNames: host.componentNames,
      allowedEventNames: host.eventNames,
      allowedFunctionNames: host.functionNames,
    });
    this.timestamp = timestamp;
    this.model = undefined;
    this.revision = undefined;
    this.plan = undefined;
    this.localChanges = [];
    this.actions = [];
    this.steps = 0;
  }

  render() {
    const surface = this.store.get("form");
    if (!surface) {
      this.model = this.plan = this.revision = undefined;
      return "accepted";
    }
    if (this.model === undefined || this.revision !== surface.dataModelRevision) {
      this.model = parseJsonObject(surface.dataModel);
      this.revision = surface.dataModelRevision;
    }
    try {
      this.plan = createA2uiV1NativeRenderPlan(surface, this.policy, { dataModel: this.model });
      return "accepted";
    } catch (error) {
      if (!(error instanceof A2uiParseError)) throw error;
      this.plan = this.model = undefined;
      return "surface-rejected";
    }
  }

  step(step) {
    if (++this.steps > 64) throw new Error("Session step limit");
    let outcome = "accepted";
    if (step.op === "message") {
      try {
        const payloads = [
          "createSurface",
          "updateComponents",
          "updateDataModel",
          "deleteSurface",
        ].filter((key) => Object.hasOwn(step.message, key));
        if (payloads.length !== 1 || step.message[payloads[0]]?.surfaceId !== "form") {
          throw new A2uiParseError("The experiment accepts one form surface");
        }
        this.store.apply(step.message);
      } catch (error) {
        if (!(error instanceof A2uiParseError)) throw error;
        outcome = "message-rejected";
      }
      if (outcome === "accepted") outcome = this.render();
    } else if (step.op === "render") {
      outcome = this.render();
    } else if (step.op === "resolve-event") {
      const surface = this.store.get("form");
      if (!surface) throw new Error("Missing resolver surface");
      try {
        resolveA2uiV1NativeEvent(surface, this.policy, step.sourceComponentId, surface.dataModel);
      } catch (error) {
        if (!(error instanceof A2uiParseError)) throw error;
        outcome = "event-rejected";
      }
    } else if (step.op === "input" || step.op === "press") {
      const type = { "text-field": "TextInput", checkbox: "CheckBox", button: "Button" }[
        step.target.kind
      ];
      const matches = [];
      const visit = (node) => {
        if (node.component === type && node.props.accessibilityLabel === step.target.label) {
          matches.push(node);
        }
        node.children?.forEach(visit);
      };
      if (this.plan) visit(this.plan);
      if (matches.length !== 1) throw new Error("Interaction target is missing or ambiguous");
      const node = matches[0];
      if (step.op === "input") {
        if (
          (type === "TextInput" && typeof step.value !== "string") ||
          (type === "CheckBox" && typeof step.value !== "boolean")
        ) {
          outcome = "input-rejected";
        } else {
          this.model = replaceBinding(this.model, node.props.binding, step.value);
          this.localChanges.push(parseJsonObject(this.model));
          outcome = this.render();
        }
      } else if (node.props.disabled !== true) {
        const surface = this.store.get("form");
        const event = resolveA2uiV1NativeEvent(
          surface,
          this.policy,
          node.props.event.sourceComponentId,
          this.model,
          { instanceKey: node.props.event.instanceKey },
        );
        this.actions.push({
          envelope: createA2uiV1ActionEnvelope({
            name: event.name,
            surfaceId: event.surfaceId,
            sourceComponentId: event.sourceComponentId,
            context: event.context,
            timestamp: this.timestamp,
          }),
          ...(surface.sendDataModel ? { dataModel: parseJsonObject(this.model) } : {}),
        });
      }
    } else throw new Error("Unknown operation");
    return {
      outcome,
      serverDataModel: this.store.get("form")?.dataModel ?? null,
      view: this.plan ? [project(this.plan)] : [],
      localChanges: this.localChanges,
      actions: this.actions,
    };
  }
}

function replaceBinding(model, pointer, value) {
  if (typeof pointer !== "string" || !pointer.startsWith("/") || pointer.length < 2) {
    throw new Error("Missing writable binding");
  }
  const copy = parseJsonObject(model);
  const keys = pointer
    .slice(1)
    .split("/")
    .map((part) => {
      if (/~(?![01])/u.test(part)) throw new Error("Invalid pointer escape");
      return part.replaceAll("~1", "/").replaceAll("~0", "~");
    });
  let cursor = copy;
  for (const [index, key] of keys.entries()) {
    if (cursor === null || typeof cursor !== "object" || !Object.hasOwn(cursor, key)) {
      throw new Error("Missing binding");
    }
    if (index === keys.length - 1) {
      if (typeof cursor[key] !== typeof value) throw new Error("Binding type changed");
      Object.defineProperty(cursor, key, {
        value: parseJsonValue(value),
        writable: true,
        enumerable: true,
        configurable: true,
      });
    } else cursor = cursor[key];
  }
  return parseJsonObject(copy);
}

function project(node) {
  const p = node.props;
  switch (node.component) {
    case "View":
      if (p.layout !== "column") throw new Error("Unsupported layout");
      return { kind: "group", children: (node.children ?? []).map(project) };
    case "Text":
      return { kind: "text", text: p.children };
    case "TextInput":
    case "CheckBox":
      return {
        kind: node.component === "TextInput" ? "text-field" : "checkbox",
        label: p.accessibilityLabel,
        value: p.value,
        invalid: p.invalid === true,
        validationMessages: p.validationMessages ?? [],
      };
    case "Button":
      return {
        kind: "button",
        label: p.accessibilityLabel,
        disabled: p.disabled === true,
        validationMessages: p.validationMessages ?? [],
      };
    default:
      throw new Error("Unmapped native view");
  }
}

let session;
let token;
let sequence = 0;

// Called with JSON as a JSValue argument, never interpolated into executable source.
export function exchange(source) {
  try {
    if (typeof source !== "string" || source.length > 1_048_576) throw new Error("Request limit");
    const request = parseJsonObject(JSON.parse(source));
    if (
      Object.keys(request).some(
        (key) => !["op", "token", "sequence", "host", "timestamp", "step"].includes(key),
      )
    ) {
      throw new Error("Unknown request field");
    }
    if (typeof request.token !== "string" || request.token.length > 128)
      throw new Error("Invalid token");
    if (request.op === "open") {
      if (session || request.sequence !== 0) throw new Error("Session already open");
      session = new SharedSession(request.host, request.timestamp);
      token = request.token;
      sequence = 0;
      return JSON.stringify({ ok: true, value: null });
    }
    if (!session || request.token !== token || request.sequence !== sequence + 1)
      throw new Error("Stale session request");
    sequence = request.sequence;
    if (request.op === "close") {
      session = token = undefined;
      return JSON.stringify({ ok: true, value: null });
    }
    if (request.op !== "step") throw new Error("Unknown bridge operation");
    const result = JSON.stringify({ ok: true, value: session.step(request.step) });
    if (result.length > 2_097_152) throw new Error("Response limit");
    return result;
  } catch (error) {
    // Protocol/renderer rejections are observations. Bridge/programming failures close the session.
    session = token = undefined;
    return JSON.stringify({
      ok: false,
      error: "experiment-session-failed",
      diagnostic: String(error).slice(0, 256),
    });
  }
}
