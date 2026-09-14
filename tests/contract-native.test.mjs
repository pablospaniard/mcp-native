/* eslint-disable no-await-in-loop -- Lifecycle scenarios deliberately run in sequence. */
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { createA2uiV1ActionEnvelope } from "../packages/a2ui/dist/index.js";
import { act, createElement, Fragment, StrictMode } from "react";
import { createRoot } from "test-renderer";
import {
  createContractAdapter,
  createContractHostController,
  createContractActionAuthorization,
  CONTRACT_EXTENSION_ID,
} from "../packages/host/dist/contracts.js";
import {
  ContractHostProvider,
  ContractNativeResultView,
  createContractNativeRegistration,
  createContractNativeRegistry,
} from "../packages/host/dist/contracts-react-native.js";
import {
  client,
  unit,
  tool,
  classifyError,
  deferred,
  turn,
} from "./fixtures/contract-lifecycle.mjs";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const modelSchema = {
  type: "object",
  properties: { title: { type: "string", maxLength: 80 } },
  required: ["title"],
  additionalProperties: false,
};
const eventSchema = {
  type: "object",
  properties: { name: { type: "string", maxLength: 7, enum: ["confirm"] } },
  required: ["name"],
  additionalProperties: false,
};
const event = { name: "confirm" };
function adapter(events = true) {
  const bundle = { inputSchema: modelSchema, modelSchema, ...(events ? { eventSchema } : {}) };
  return createContractAdapter({
    descriptor: {
      id: "com.example/native",
      version: "1.0.0",
      transport: "structured-content",
      mimeType: "application/vnd.example.native+json",
      schemaRevision: "sha256:" + createHash("sha256").update(JSON.stringify(bundle)).digest("hex"),
    },
    ...bundle,
    prepare: (input) => input,
  });
}
async function mount(options = {}) {
  let props;
  let title = "Paid";
  const errors = [];
  const registration = createContractNativeRegistration({
    adapter: adapter(options.events !== false),
    component:
      options.component ??
      ((value) => {
        props = value;
        value.consume(1);
        return createElement("Text", null, value.model.title);
      }),
  });
  const nativeRegistry = createContractNativeRegistry([registration]);
  const controller = createContractHostController({
    registry: nativeRegistry.registry,
    classifyError,
    createConnection: (extensions) =>
      unit(
        client(extensions, {
          callTool: async () => ({
            content: [],
            structuredContent: { title },
            _meta: { [CONTRACT_EXTENSION_ID]: registration.adapter.descriptor },
          }),
        }),
      ),
  });
  const root = createRoot({ textComponentTypes: ["Text"] });
  const fallback = (status) => createElement("Text", null, status);
  const providerProps = {
    controller,
    nativeRegistry,
    onError: (error) => errors.push(error),
    ...options.provider,
  };
  const view = createElement(ContractNativeResultView, { fallback });
  const render = (child = view) =>
    root.render(createElement(ContractHostProvider, providerProps, child));
  await act(async () => {
    if (options.strict)
      root.render(
        createElement(StrictMode, null, createElement(ContractHostProvider, providerProps, view)),
      );
    else render();
  });
  await act(async () => {
    await controller.callTool(tool.name);
  });
  return {
    controller,
    root,
    errors,
    nativeRegistry,
    registration,
    get props() {
      return props;
    },
    async replace(value = "Next") {
      title = value;
      await act(async () => {
        await controller.callTool(tool.name);
      });
    },
    async duplicate() {
      await act(async () =>
        render(
          createElement(
            Fragment,
            null,
            view,
            createElement(ContractNativeResultView, { fallback }),
          ),
        ),
      );
    },
    async hide() {
      await act(async () => render(null));
    },
    async show() {
      await act(async () => render());
    },
    async close() {
      await act(async () => root.unmount());
    },
  };
}

test("compiled native rendering and exact immutable event delivery require explicit policy", async () => {
  const reviewed = [],
    delivered = [];
  const authorization = createContractActionAuthorization({
    authorize: (request) => {
      reviewed.push(request);
      return true;
    },
  });
  const mounted = await mount({
    provider: { authorization, onEvent: (request) => delivered.push(request) },
  });
  const sent = { name: "confirm" };
  const pending = mounted.props.dispatchEvent(sent);
  sent.name = "mutated";
  assert.deepEqual(await pending, { kind: "delivered" });
  assert.equal(reviewed.length, 1);
  assert.equal(delivered[0], reviewed[0]);
  assert.equal(reviewed[0].model, mounted.props.model);
  assert.equal(reviewed[0].event.name, "confirm");
  assert.ok(Object.isFrozen(reviewed[0]));
  assert.ok(Object.isFrozen(reviewed[0].event));
  assert.equal(reviewed[0].signal.aborted, false);
  await mounted.close();
});

test("default denial, absent event schema, malformed events, and failed policies never deliver", async () => {
  let deliveries = 0;
  for (const authorize of [
    undefined,
    () => false,
    () => "yes",
    () => {
      throw Error("secret");
    },
    async () => {
      throw Error("secret");
    },
  ]) {
    const mounted = await mount({
      provider: {
        authorization: createContractActionAuthorization(authorize ? { authorize } : {}),
        onEvent: () => deliveries++,
      },
    });
    assert.deepEqual(await mounted.props.dispatchEvent(event), {
      kind: "rejected",
      code: "denied",
    });
    await mounted.close();
  }
  const mounted = await mount({
    provider: {
      authorization: createContractActionAuthorization({ authorize: () => true }),
      onEvent: () => deliveries++,
    },
  });
  for (const bad of [
    { name: "execute" },
    { ...event, tool: "delete" },
    { name: undefined },
    { name: Infinity },
    { name: () => {} },
    null,
  ])
    assert.deepEqual(await mounted.props.dispatchEvent(bad), {
      kind: "rejected",
      code: "invalid-event",
    });
  await mounted.close();
  const absent = await mount({
    events: false,
    provider: {
      authorization: createContractActionAuthorization({ authorize: () => true }),
      onEvent: () => deliveries++,
    },
  });
  assert.equal((await absent.props.dispatchEvent(event)).code, "denied");
  await absent.close();
  assert.equal(deliveries, 0);
});

test("replacement, clear, disconnect and unmount abort approval and prevent late delivery", async () => {
  for (const stop of [
    (m) => m.replace(),
    (m) => act(async () => m.controller.clearResult()),
    (m) => act(async () => m.controller.setOnline(false)),
    (m) => m.hide(),
    (m) => m.close(),
  ]) {
    const review = deferred();
    let request;
    let deliveries = 0;
    const mounted = await mount({
      provider: {
        authorization: createContractActionAuthorization({
          authorize: (value) => {
            request = value;
            return review.promise;
          },
        }),
        onEvent: () => deliveries++,
      },
    });
    const old = mounted.props;
    const pending = old.dispatchEvent(event);
    await turn();
    await stop(mounted);
    assert.deepEqual(await pending, { kind: "rejected", code: "stale" });
    assert.equal(request.signal.aborted, true);
    review.resolve(true);
    await turn();
    assert.equal(deliveries, 0);
    assert.equal((await old.dispatchEvent(event)).code, "stale");
    await mounted.close();
  }
});

test("shared authorization serializes custom and MCP Apps review in both directions", async () => {
  let review = deferred();
  let reviews = 0;
  const authorization = createContractActionAuthorization({
    authorize: () => {
      reviews++;
      return review.promise;
    },
  });
  const mounted = await mount({ provider: { authorization, onEvent() {} } });
  const pending = mounted.props.dispatchEvent(event);
  await turn();
  assert.equal(
    await authorization.authorizeMcpAppsToolCall({ type: "tool", name: "allowed", arguments: {} }),
    false,
  );
  assert.equal(
    await authorization.authorizeA2uiAction(
      createA2uiV1ActionEnvelope({
        name: "confirm",
        surfaceId: "test",
        sourceComponentId: "button",
        context: {},
        timestamp: "2026-09-14T10:00:00.000Z",
      }),
    ),
    false,
  );
  assert.equal((await mounted.props.dispatchEvent(event)).code, "busy");
  review.resolve(true);
  assert.equal((await pending).kind, "delivered");
  review = deferred();
  const builtin = authorization.authorizeMcpAppsToolCall({
    type: "tool",
    name: "allowed",
    arguments: {},
  });
  assert.equal((await mounted.props.dispatchEvent(event)).code, "denied");
  review.resolve(true);
  assert.equal(await builtin, true);
  assert.equal(reviews, 2);
  await mounted.close();
});

test("event count and aggregate budgets persist across view remounts", async () => {
  const mounted = await mount({
    provider: {
      authorization: createContractActionAuthorization({ authorize: () => true }),
      onEvent() {},
    },
  });
  for (let i = 0; i < 128; i++)
    assert.equal((await mounted.props.dispatchEvent(event)).kind, "delivered");
  await mounted.hide();
  await mounted.show();
  assert.equal((await mounted.props.dispatchEvent(event)).code, "limit-exceeded");
  await mounted.replace();
  assert.equal((await mounted.props.dispatchEvent(event)).kind, "delivered");
  await mounted.close();
  const bounded = await mount({
    provider: {
      surfaceLimits: { maxWork: 20 },
      authorization: createContractActionAuthorization({ authorize: () => true }),
      onEvent() {},
    },
  });
  for (let i = 0; i < 5; i++) await bounded.props.dispatchEvent(event);
  assert.equal((await bounded.props.dispatchEvent(event)).code, "limit-exceeded");
  await bounded.close();
});

test("hanging review times out, revokes authority, and cannot deliver after late approval", async () => {
  const review = deferred();
  let delivered = 0;
  let request;
  const mounted = await mount({
    provider: {
      eventTimeoutMs: 5,
      authorization: createContractActionAuthorization({
        authorize: (value) => {
          request = value;
          return review.promise;
        },
      }),
      onEvent: () => delivered++,
    },
  });
  assert.equal((await mounted.props.dispatchEvent(event)).code, "timeout");
  assert.equal(request.signal.aborted, true);
  assert.equal((await mounted.props.dispatchEvent(event)).code, "denied");
  review.resolve(true);
  await turn();
  assert.equal(delivered, 0);
  await mounted.close();
});

test("abandoned delivery consumes pending capacity until settlement across replacements", async () => {
  const work = [];
  const mounted = await mount({
    provider: {
      eventTimeoutMs: 5,
      authorization: createContractActionAuthorization({ authorize: () => true }),
      onEvent: () => {
        const pending = deferred();
        work.push(pending);
        return pending.promise;
      },
    },
  });
  for (let i = 0; i < 8; i++) {
    assert.equal((await mounted.props.dispatchEvent(event)).code, "timeout");
    await mounted.replace();
  }
  assert.equal((await mounted.props.dispatchEvent(event)).code, "busy");
  work[0].resolve();
  await turn();
  assert.equal((await mounted.props.dispatchEvent(event)).code, "timeout");
  for (const pending of work) pending.resolve();
  await mounted.close();
});

test("render exceptions fail the whole surface, redact errors and reset on a new result", async () => {
  let captured;
  const mounted = await mount({
    component: (props) => {
      captured = props;
      if (props.model.title === "Paid") throw Error("secret render");
      return createElement("Text", null, props.model.title);
    },
    provider: {
      authorization: createContractActionAuthorization({ authorize: () => true }),
      onEvent() {},
    },
  });
  assert.equal(mounted.errors.length, 1);
  assert.equal(mounted.errors[0].message, "Contract native renderer failed");
  assert.equal((await captured.dispatchEvent(event)).code, "stale");
  await mounted.replace();
  assert.equal((await captured.dispatchEvent(event)).kind, "delivered");
  await mounted.close();
});

test("Strict Mode preserves a usable lease and delivery failures are contained", async () => {
  const mounted = await mount({
    strict: true,
    provider: {
      authorization: createContractActionAuthorization({ authorize: () => true }),
      onEvent: async () => {
        throw Error("private transport");
      },
    },
  });
  assert.deepEqual(await mounted.props.dispatchEvent(event), {
    kind: "rejected",
    code: "delivery-failed",
  });
  await mounted.close();
});

test("registrations reject structural forgeries, remote component names, and duplicates", () => {
  const local = adapter();
  assert.throws(() =>
    createContractNativeRegistration({ adapter: { ...local }, component: () => null }),
  );
  assert.throws(() =>
    createContractNativeRegistration({ adapter: local, component: "RemoteName" }),
  );
  assert.throws(() =>
    createContractNativeRegistration({ adapter: local, component: () => null, extra: true }),
  );
  const registered = createContractNativeRegistration({ adapter: local, component: () => null });
  assert.throws(() => createContractNativeRegistry([{ ...registered }]));
  assert.throws(() => createContractNativeRegistry([registered, registered]));
  assert.throws(() => createContractNativeRegistry(Array.from({ length: 33 }, () => registered)));
});

test("provider rejects foreign registries and forged authorization before renderer work", async () => {
  const registry = createContractNativeRegistry([
    createContractNativeRegistration({ adapter: adapter(), component: () => null }),
  ]);
  const foreign = createContractHostController({
    registry: createContractNativeRegistry([]).registry,
    classifyError,
    createConnection: () => {
      throw Error("must not connect");
    },
  });
  const root = createRoot();
  await assert.rejects(
    async () =>
      await act(async () =>
        root.render(
          createElement(ContractHostProvider, {
            controller: foreign,
            nativeRegistry: registry,
            onError() {},
          }),
        ),
      ),
    /invalid-registry/,
  );
  await foreign.shutdown();
  const controller = createContractHostController({
    registry: registry.registry,
    classifyError,
    createConnection: () => {
      throw Error("must not connect");
    },
  });
  await assert.rejects(
    async () =>
      await act(async () =>
        createRoot().render(
          createElement(ContractHostProvider, {
            controller,
            nativeRegistry: registry,
            authorization: { ...createContractActionAuthorization() },
            onError() {},
          }),
        ),
      ),
    /invalid-registration/,
  );
  await controller.shutdown();
});

test("render work exhaustion stays exhausted after a renderer catches the budget error", async () => {
  let captured;
  const mounted = await mount({
    component: (props) => {
      captured = props;
      try {
        props.consume(100001);
      } catch {}
      return createElement("Text", null, "Exhausted");
    },
    provider: {
      authorization: createContractActionAuthorization({ authorize: () => true }),
      onEvent() {},
    },
  });
  assert.equal((await captured.dispatchEvent(event)).code, "limit-exceeded");
  await mounted.hide();
  await mounted.show();
  assert.equal((await captured.dispatchEvent(event)).code, "limit-exceeded");
  await mounted.close();
});

test("duplicate custom views cannot both own actionable leases", async () => {
  const captured = [];
  const mounted = await mount({
    component: (props) => {
      captured.push(props);
      return createElement("Text", null, "Receipt");
    },
    provider: {
      authorization: createContractActionAuthorization({ authorize: () => true }),
      onEvent() {},
    },
  });
  await mounted.duplicate();
  assert.equal(mounted.errors.length, 1);
  const unique = [...new Set(captured)];
  const outcomes = [];
  for (const props of unique) outcomes.push(await props.dispatchEvent(event));
  assert.equal(outcomes.filter((outcome) => outcome.kind === "delivered").length, 1);
  await mounted.close();
});

test("unmounted render work cannot exhaust a remounted result, and Strict Mode restores the live lease", async () => {
  const mounted = await mount({ provider: { surfaceLimits: { maxWork: 10 } } });
  const stale = mounted.props;
  await mounted.hide();
  assert.throws(() => stale.consume(100001), { code: "cancelled" });
  await mounted.show();
  assert.equal(mounted.errors.length, 0);
  assert.notEqual(mounted.props, stale);
  assert.throws(() => stale.consume(1), { code: "cancelled" });
  assert.doesNotThrow(() => mounted.props.consume(1));
  await mounted.close();
  const strict = await mount({ strict: true });
  assert.doesNotThrow(() => strict.props.consume(1));
  await strict.close();
});

test("a caught invalid render charge still exhausts that result's event budget", async () => {
  let deliveries = 0;
  const mounted = await mount({
    provider: {
      authorization: createContractActionAuthorization({ authorize: () => true }),
      onEvent: () => {
        deliveries++;
      },
    },
  });
  assert.throws(() => mounted.props.consume(0), { code: "contract-limit-exceeded" });
  assert.deepEqual(await mounted.props.dispatchEvent(event), {
    kind: "rejected",
    code: "limit-exceeded",
  });
  assert.equal(deliveries, 0);
  await mounted.hide();
  await mounted.show();
  assert.equal(mounted.errors.length, 1);
  await mounted.replace();
  assert.equal((await mounted.props.dispatchEvent(event)).kind, "delivered");
  await mounted.close();
});
