/* eslint-disable no-await-in-loop -- Each observer gets its own mounted controller. */
import assert from "node:assert/strict";
import test from "node:test";
import { StrictMode, act, createElement } from "react";
import { createRoot } from "test-renderer";
import { createContractHostController } from "../packages/host/dist/contracts.js";
import {
  ContractHostProvider,
  useContractHost,
} from "../packages/host/dist/contracts-react-native.js";
import {
  registry,
  result,
  client,
  unit,
  deferred,
  turn,
  classifyError,
} from "./fixtures/contract-lifecycle.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function setup(overrides = {}) {
  const counts = { connects: 0, closes: 0, prepares: 0 };
  const installed = registry((input) => {
    counts.prepares++;
    return input;
  });
  const controller = createContractHostController({
    registry: installed,
    classifyError,
    createConnection: (extensions) =>
      unit(client(extensions, overrides), {
        connect() {
          counts.connects++;
        },
        close() {
          counts.closes++;
        },
      }),
  });
  return { controller, counts };
}

async function mount(controller, { strict = false, onError = () => {} } = {}) {
  let host;
  function Probe() {
    host = useContractHost();
    return createElement("Text", null, host.snapshot.call.kind);
  }
  const root = createRoot({ textComponentTypes: ["Text"] });
  const element = createElement(
    ContractHostProvider,
    { controller, onError },
    createElement(Probe),
  );
  await act(async () => {
    root.render(strict ? createElement(StrictMode, null, element) : element);
  });
  return {
    root,
    get host() {
      return host;
    },
    Probe,
  };
}

test("provider starts the controller, exposes immutable snapshots, and disposes on unmount", async () => {
  const { controller, counts } = setup();
  const mounted = await mount(controller);
  assert.equal(mounted.host.controller, controller);
  assert.equal(mounted.host.snapshot.tools.kind, "ready");
  assert.ok(Object.isFrozen(mounted.host));
  await act(async () => {
    await mounted.host.controller.callTool("receipt");
  });
  const resolved = mounted.host.snapshot.call.result;
  assert.equal(resolved.kind, "contract-data");
  assert.equal(counts.prepares, 1);
  await act(async () => {
    controller.clearResult();
  });
  assert.equal(mounted.host.snapshot.call.kind, "idle");
  await act(async () => {
    mounted.root.unmount();
  });
  assert.equal(controller.isCurrentResult(resolved), false);
  assert.deepEqual(controller.getSnapshot().connection, {
    kind: "disconnected",
    reason: "shutdown",
  });
  assert.equal(counts.connects, 1);
  assert.equal(counts.closes, 1);
});

test("Strict Mode replay retains the connection until a real unmount", async () => {
  const { controller, counts } = setup();
  const mounted = await mount(controller, { strict: true });
  assert.equal(counts.connects, 1);
  assert.equal(counts.closes, 0);
  await act(async () => {
    await controller.callTool("receipt");
  });
  assert.equal(mounted.host.snapshot.call.result.kind, "contract-data");
  await act(async () => {
    mounted.root.unmount();
  });
  assert.equal(counts.closes, 1);
});

test("unmount aborts pending work and late responses cannot run preparation", async () => {
  const late = deferred();
  let signal;
  const { controller, counts } = setup({
    callTool(_name, _args, options) {
      signal = options.signal;
      return late.promise;
    },
  });
  const mounted = await mount(controller);
  let pending;
  await act(async () => {
    pending = controller.callTool("receipt");
    await turn();
  });
  const cancelled = assert.rejects(pending, (error) => error.code === "cancelled");
  await act(async () => {
    mounted.root.unmount();
  });
  await cancelled;
  assert.equal(signal.aborted, true);
  late.resolve(result());
  await turn();
  assert.equal(counts.prepares, 0);
  assert.equal(counts.closes, 1);
  assert.equal(controller.getSnapshot().call.kind, "idle");
});

test("hook without provider and replacement/invalid controllers fail at the local boundary", async () => {
  const root = createRoot();
  function Alone() {
    useContractHost();
    return null;
  }
  await assert.rejects(
    async () =>
      await act(async () => {
        root.render(createElement(Alone));
      }),
    /requires ContractHostProvider/,
  );
  const { controller } = setup();
  const mounted = await mount(controller);
  const other = setup().controller;
  await assert.rejects(
    async () =>
      await act(async () => {
        mounted.root.render(
          createElement(
            ContractHostProvider,
            { controller: other, onError() {} },
            createElement(mounted.Probe),
          ),
        );
      }),
    /cannot replace/,
  );
  await act(async () => {
    mounted.root.unmount();
  });
  await other.shutdown();
  await assert.rejects(
    async () =>
      await act(async () => {
        createRoot().render(createElement(ContractHostProvider, { controller: {}, onError() {} }));
      }),
    /requires ContractHostController/,
  );
  await assert.rejects(
    async () =>
      await act(async () => {
        createRoot().render(
          createElement(ContractHostProvider, { controller: setup().controller }),
        );
      }),
    /requires an error callback/,
  );
});

test("two providers cannot share controller ownership", async () => {
  const { controller, counts } = setup();
  const mounted = await mount(controller);
  await assert.rejects(mount(controller), /already has a provider/);
  assert.equal(controller.getSnapshot().connection.kind, "ready");
  assert.equal(counts.closes, 0);
  await act(async () => {
    mounted.root.unmount();
  });
  assert.equal(counts.closes, 1);
});

test("provider contains throwing and rejecting local error observers", async () => {
  for (const onError of [
    () => {
      throw new Error("observer failed");
    },
    async () => {
      throw new Error("observer failed");
    },
  ]) {
    const { controller } = setup();
    controller.start = async () => {
      throw new Error("local startup failed");
    };
    const mounted = await mount(controller, { onError });
    await act(async () => {
      mounted.root.unmount();
    });
    assert.equal(controller.getSnapshot().connection.reason, "shutdown");
  }
});

test("Strict Mode cleanup does not request cancellation before real provider disposal", async () => {
  const { controller, counts } = setup();
  const cancel = controller.cancelCurrentCall.bind(controller);
  let cancellations = 0;
  controller.cancelCurrentCall = () => {
    cancellations++;
    return cancel();
  };
  const mounted = await mount(controller, { strict: true });
  assert.equal(cancellations, 0);
  await act(async () => mounted.root.unmount());
  assert.equal(cancellations, 1);
  assert.equal(counts.closes, 1);
});
