import assert from "node:assert/strict";
import test from "node:test";

import { createBasicCatalogPolicy, createSurfaceIdRegistry } from "../packages/a2ui/dist/index.js";
import {
  NATIVE_SESSION_MAX_OPERATIONS,
  createNativeSession,
} from "../packages/renderer-core/dist/index.js";

const policy = createBasicCatalogPolicy({
  allowedComponentNames: ["Button", "Column", "Text", "TextField"],
  allowedEventNames: ["submit"],
});

function createEnvelope(surfaceId = "main") {
  return {
    version: "v1.0",
    createSurface: {
      surfaceId,
      sendDataModel: true,
      components: [
        { id: "root", component: "Column", children: ["field", "button"] },
        { id: "field", component: "TextField", label: "Name", value: { path: "/name" } },
        {
          id: "button",
          component: "Button",
          child: "label",
          action: { event: { name: "submit", context: { name: { path: "/name" } } } },
        },
        { id: "label", component: "Text", text: "Save" },
      ],
      dataModel: { name: "Ada" },
    },
  };
}

function createHarness(options = {}) {
  const proposals = [];
  const deliveries = [];
  const session = createNativeSession({
    policy,
    authorize: (proposal) => {
      proposals.push(proposal);
      return true;
    },
    deliver: (proposal) => {
      deliveries.push(proposal);
    },
    now: () => "2026-09-16T00:00:00.000Z",
    ...options,
  });
  return { session, proposals, deliveries };
}

function control(publication, sourceComponentId) {
  const found = publication.controls.find(
    (candidate) => candidate.sourceComponentId === sourceComponentId,
  );
  assert.ok(found, `missing control ${sourceComponentId}`);
  return found;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

test("native session publishes revisioned controls and rejects stale callbacks", async () => {
  const { session, proposals, deliveries } = createHarness();
  const first = session.apply(createEnvelope());
  assert.equal(first.kind, "published");
  assert.equal(first.generation, session.generation);
  assert.equal(first.renderRevision, 1);
  const oldField = control(first, "field");
  const oldButton = control(first, "button");

  const edited = session.input(oldField.ticket, "Grace");
  assert.equal(edited.kind, "published");
  assert.equal(edited.renderRevision, 2);
  assert.deepEqual(session.input(oldField.ticket, "stale"), {
    kind: "rejected",
    code: "stale",
  });
  assert.deepEqual(await session.press(oldButton.ticket), {
    kind: "rejected",
    code: "stale",
  });

  const result = await session.press(control(edited, "button").ticket);
  assert.deepEqual(result, { kind: "delivered" });
  assert.equal(proposals.length, 1);
  assert.equal(deliveries.length, 1);
  assert.deepEqual(proposals[0].dataModel, { name: "Grace" });
  assert.equal(proposals[0].envelope.action.timestamp, "2026-09-16T00:00:00.000Z");
});

test("native session preserves arbitrary source component IDs for bound controls", () => {
  const sourceComponentId = "field%2F/:%[arbitrary]";
  const { session } = createHarness();
  const result = session.apply({
    version: "v1.0",
    createSurface: {
      surfaceId: "arbitrary-ids",
      components: [
        { id: "root", component: "Column", children: [sourceComponentId] },
        {
          id: sourceComponentId,
          component: "TextField",
          label: "Value",
          value: { path: "/value" },
        },
      ],
      dataModel: { value: "kept" },
    },
  });

  assert.equal(result.kind, "published");
  assert.equal(result.controls[0].sourceComponentId, sourceComponentId);
});

test("native session derives lifecycle state from one reconstructed envelope", () => {
  const stable = createEnvelope("stable").createSurface;
  let reads = 0;
  const input = { version: "v1.0" };
  Object.defineProperty(input, "createSurface", {
    enumerable: true,
    get() {
      reads += 1;
      return reads === 1 ? stable : { surfaceId: "changed" };
    },
  });
  const { session } = createHarness();
  const created = session.apply(input);

  assert.equal(created.kind, "published");
  assert.equal(reads, 1);
  assert.equal(
    session.apply({
      version: "v1.0",
      updateDataModel: { surfaceId: "stable", path: "/name", value: "Grace" },
    }).kind,
    "published",
  );
});

test("native session rejects reentrant semantic operations from render policies", () => {
  const imageCatalogPolicy = createBasicCatalogPolicy({
    allowedComponentNames: ["Image"],
  });
  let session;
  let nested;
  session = createNativeSession({
    policy: imageCatalogPolicy,
    authorize: () => false,
    deliver() {},
    renderOptions: {
      imagePolicy() {
        nested = session.render();
        return {
          allowedRedirectOrigins: [],
          cacheMode: "no-store",
          maximumBytes: 1024,
          maximumDecodedHeight: 32,
          maximumDecodedPixels: 1024,
          maximumDecodedWidth: 32,
          maximumRedirects: 0,
        };
      },
    },
  });
  const outer = session.apply({
    version: "v1.0",
    createSurface: {
      surfaceId: "image",
      components: [
        {
          id: "root",
          component: "Image",
          url: "https://images.example.com/image.png",
        },
      ],
    },
  });

  assert.deepEqual(nested, { kind: "rejected", code: "busy" });
  assert.equal(outer.kind, "published");
  assert.equal(session.publication, outer);
});

test("component updates preserve local edits and model updates reset them even when equal", async () => {
  const { session, proposals } = createHarness();
  const created = session.apply(createEnvelope());
  session.input(control(created, "field").ticket, "Grace");
  const componentUpdate = session.apply({
    version: "v1.0",
    updateComponents: {
      surfaceId: "main",
      components: [{ id: "label", component: "Text", text: "Submit" }],
    },
  });
  assert.equal(componentUpdate.kind, "published");
  await session.press(control(componentUpdate, "button").ticket);
  assert.deepEqual(proposals.at(-1).dataModel, { name: "Grace" });

  const modelUpdate = session.apply({
    version: "v1.0",
    updateDataModel: { surfaceId: "main", path: "/name", value: "Ada" },
  });
  assert.equal(modelUpdate.kind, "published");
  assert.equal(modelUpdate.serverModelRevision, 1);
  await session.press(control(modelUpdate, "button").ticket);
  assert.deepEqual(proposals.at(-1).dataModel, { name: "Ada" });
});

test("accepted server updates survive render rejection and later retry from server state", () => {
  const { session } = createHarness();
  const created = session.apply(createEnvelope());
  session.input(control(created, "field").ticket, "Grace");
  const rejected = session.apply({
    version: "v1.0",
    updateComponents: {
      surfaceId: "main",
      components: [{ id: "root", component: "Column", children: ["missing"] }],
    },
  });
  assert.deepEqual(rejected, { kind: "unmounted", code: "surface-rejected" });
  assert.equal(session.publication, undefined);

  const repaired = session.apply({
    version: "v1.0",
    updateComponents: {
      surfaceId: "main",
      components: [{ id: "root", component: "Column", children: ["field", "button"] }],
    },
  });
  assert.equal(repaired.kind, "published");
  assert.equal(repaired.renderRevision, 4);
});

test("authorization is bound to one revision and becomes stale after update or deletion", async () => {
  await Promise.all(
    [
      (session) => session.render(),
      (session) => session.apply({ version: "v1.0", deleteSurface: { surfaceId: "main" } }),
    ].map(async (mutate) => {
      const review = deferred();
      const deliveries = [];
      const session = createNativeSession({
        policy,
        authorize: () => review.promise,
        deliver: (proposal) => deliveries.push(proposal),
      });
      const created = session.apply(createEnvelope());
      const pending = session.press(control(created, "button").ticket);
      assert.deepEqual(await session.press(control(created, "button").ticket), {
        kind: "rejected",
        code: "busy",
      });
      mutate(session);
      review.resolve(true);
      assert.deepEqual(await pending, { kind: "rejected", code: "stale" });
      assert.equal(deliveries.length, 0);
    }),
  );
});

test("close aborts pending review, rejects late completion, and is idempotent", async () => {
  const review = deferred();
  let observedSignal;
  let deliveries = 0;
  const session = createNativeSession({
    policy,
    authorize: (_proposal, signal) => {
      observedSignal = signal;
      return review.promise;
    },
    deliver: () => {
      deliveries += 1;
    },
  });
  const created = session.apply(createEnvelope());
  const pending = session.press(control(created, "button").ticket);
  session.close();
  session.close();
  assert.equal(observedSignal.aborted, true);
  review.resolve(true);
  assert.deepEqual(await pending, { kind: "rejected", code: "closed" });
  assert.equal(deliveries, 0);
  assert.deepEqual(session.render(), { kind: "rejected", code: "closed" });
});

test("delivery stays single-flight and close aborts and discards its late completion", async () => {
  const delivery = deferred();
  let observedSignal;
  const session = createNativeSession({
    policy,
    authorize: () => true,
    deliver: (_proposal, signal) => {
      observedSignal = signal;
      return delivery.promise;
    },
  });
  const created = session.apply(createEnvelope());
  const button = control(created, "button").ticket;
  const pending = session.press(button);
  await Promise.resolve();
  assert.deepEqual(await session.press(button), { kind: "rejected", code: "busy" });
  session.close();
  assert.equal(observedSignal.aborted, true);
  delivery.resolve();
  assert.deepEqual(await pending, { kind: "rejected", code: "closed" });
});

test("strict context registry survives session replacement and deletion", () => {
  const surfaceIdRegistry = createSurfaceIdRegistry();
  const first = createHarness({ surfaceIdRegistry }).session;
  first.apply(createEnvelope("shared"));
  first.apply({ version: "v1.0", deleteSurface: { surfaceId: "shared" } });
  first.close();

  const replacement = createHarness({ surfaceIdRegistry }).session;
  assert.deepEqual(replacement.apply(createEnvelope("shared")), {
    kind: "rejected",
    code: "message-rejected",
  });
  assert.equal(surfaceIdRegistry.retainedCount, 1);
});

test("native session limits cumulative work and validates initialization", () => {
  const { session } = createHarness({ maximumOperations: 1 });
  assert.equal(session.apply(createEnvelope()).kind, "published");
  assert.deepEqual(session.render(), { kind: "rejected", code: "operation-limit" });
  assert.equal(NATIVE_SESSION_MAX_OPERATIONS, 10_000);

  assert.throws(() => createNativeSession(null), /options/);
  assert.throws(() => createHarness({ maximumOperations: 0 }), /maximumOperations/);
  assert.throws(() => createHarness({ unknown: true }), /Unexpected/);
  assert.throws(
    () => createNativeSession({ policy, authorize: true, deliver() {} }),
    /authorize and deliver/,
  );
});

test("delivery failures are closed outcomes and are never retried", async () => {
  let attempts = 0;
  const session = createNativeSession({
    policy,
    authorize: () => true,
    deliver: () => {
      attempts += 1;
      throw new Error("failed");
    },
  });
  const created = session.apply(createEnvelope());
  assert.deepEqual(await session.press(control(created, "button").ticket), {
    kind: "rejected",
    code: "delivery-failed",
  });
  assert.equal(attempts, 1);
});
