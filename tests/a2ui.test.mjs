import assert from "node:assert/strict";
import test from "node:test";

import {
  A2UI_MIME_TYPE,
  A2UI_VERSION,
  A2uiParseError,
  A2uiResourceError,
  parseA2uiSurface,
  resolveA2uiResourceFromToolResult,
} from "../packages/a2ui/dist/index.js";
import { createNativeRenderPlan } from "../packages/react-native/dist/index.js";

test("a validated A2UI surface becomes a native render plan for every node type", () => {
  const surface = parseA2uiSurface({
    version: A2UI_VERSION,
    root: {
      id: "profile",
      type: "container",
      children: [
        { id: "title", type: "text", text: "Profile" },
        {
          id: "save",
          type: "button",
          label: "Save",
          action: { type: "tool", name: "save_profile", arguments: { confirmed: true } },
        },
        {
          id: "display-name",
          type: "text-input",
          label: "Display name",
          value: "Ada",
          binding: "/profile/displayName",
        },
        { id: "email", type: "text-input", label: "Email" },
      ],
    },
  });

  const plan = createNativeRenderPlan(surface);
  assert.equal(plan.component, "View");
  assert.deepEqual(
    plan.children?.map((child) => child.component),
    ["Text", "Button", "TextInput", "TextInput"],
  );
  assert.deepEqual(plan.children?.[0]?.props, { children: "Profile" });
  assert.equal(plan.children?.[1]?.props.action.name, "save_profile");
  assert.deepEqual(plan.children?.[2]?.props, {
    label: "Display name",
    value: "Ada",
    binding: "/profile/displayName",
  });
  assert.deepEqual(plan.children?.[3]?.props, { label: "Email" });
});

test("a JSON string preserves nested tool arguments", () => {
  const surface = parseA2uiSurface(
    JSON.stringify({
      version: "0.1",
      root: {
        id: "save",
        type: "button",
        label: "Save",
        action: {
          type: "tool",
          name: "save_profile",
          arguments: {
            active: true,
            aliases: ["Ada", null, 42],
            profile: { role: "admin" },
          },
        },
      },
    }),
  );

  assert.deepEqual(surface.root, {
    id: "save",
    type: "button",
    label: "Save",
    action: {
      type: "tool",
      name: "save_profile",
      arguments: {
        active: true,
        aliases: ["Ada", null, 42],
        profile: { role: "admin" },
      },
    },
  });
});

test("tool arguments preserve prototype-named JSON keys without changing prototypes", () => {
  const surface = parseA2uiSurface(
    '{"version":"0.1","root":{"id":"safe","type":"button","label":"Safe","action":{"type":"tool","name":"safe","arguments":{"__proto__":{"polluted":true}}}}}',
  );
  const arguments_ = surface.root.action.arguments;

  assert.equal(Object.getPrototypeOf(arguments_), Object.prototype);
  assert.equal(Object.hasOwn(arguments_, "__proto__"), true);
  assert.equal(arguments_.polluted, undefined);
  assert.deepEqual(arguments_["__proto__"], { polluted: true });
});

test("a tool action may omit arguments", () => {
  const surface = parseA2uiSurface({
    version: "0.1",
    root: {
      id: "refresh",
      type: "button",
      label: "Refresh",
      action: { type: "tool", name: "refresh" },
    },
  });

  assert.deepEqual(surface.root, {
    id: "refresh",
    type: "button",
    label: "Refresh",
    action: { type: "tool", name: "refresh" },
  });
});

test("invalid A2UI input fails closed with a parse error", () => {
  const invalidInputs = [
    "{not-json",
    null,
    { version: "1.0", root: { id: "x", type: "text", text: "x" } },
    { version: "0.1", root: { id: 1, type: "text", text: "x" } },
    { version: "0.1", root: { id: "x", type: "container", children: {} } },
    { version: "0.1", root: { id: "x", type: "text", text: 1 } },
    {
      version: "0.1",
      root: {
        id: "x",
        type: "button",
        label: "Run",
        action: { type: "navigation", name: "next" },
      },
    },
    {
      version: "0.1",
      root: {
        id: "x",
        type: "button",
        label: "Run",
        action: { type: "tool", name: "run", arguments: [] },
      },
    },
    {
      version: "0.1",
      root: {
        id: "x",
        type: "button",
        label: "Run",
        action: { type: "tool", name: "run", arguments: { value: NaN } },
      },
    },
    {
      version: "0.1",
      root: {
        id: "x",
        type: "button",
        label: "Run",
        action: { type: "tool", name: "run", arguments: { value: Infinity } },
      },
    },
    {
      version: "0.1",
      root: {
        id: "x",
        type: "button",
        label: "Run",
        action: { type: "tool", name: "run", arguments: { values: Array(1) } },
      },
    },
    {
      version: "0.1",
      root: {
        id: "x",
        type: "button",
        label: "Run",
        action: { type: "tool", name: "run", arguments: { value: new Date(0) } },
      },
    },
    { version: "0.1", root: { id: "x", type: "text-input", label: "X", value: 1 } },
    { version: "0.1", root: { id: "x", type: "script" } },
    {
      version: "0.1",
      root: {
        id: "root",
        type: "container",
        children: [
          { id: "dup", type: "text", text: "one" },
          { id: "dup", type: "text", text: "two" },
        ],
      },
    },
    {
      version: "0.1",
      root: {
        id: "shared",
        type: "container",
        children: [{ id: "shared", type: "text", text: "nested" }],
      },
    },
  ];

  for (const input of invalidInputs) {
    assert.throws(() => parseA2uiSurface(input), A2uiParseError);
  }
});

test("circular tool arguments fail closed with a parse error", () => {
  const arguments_ = {};
  arguments_.self = arguments_;

  assert.throws(
    () =>
      parseA2uiSurface({
        version: "0.1",
        root: {
          id: "run",
          type: "button",
          label: "Run",
          action: { type: "tool", name: "run", arguments: arguments_ },
        },
      }),
    (error) => error instanceof A2uiParseError && /Circular JSON value/.test(error.message),
  );
});

test("duplicate node ids fail closed with a parse error", () => {
  assert.throws(
    () =>
      parseA2uiSurface({
        version: "0.1",
        root: {
          id: "root",
          type: "container",
          children: [
            { id: "title", type: "text", text: "one" },
            { id: "title", type: "text", text: "two" },
          ],
        },
      }),
    (error) => error instanceof A2uiParseError && /Duplicate node id.*title/.test(error.message),
  );
});

test("an A2UI resource link resolves to a validated surface", async () => {
  const reads = [];
  const reader = {
    async readResource(uri) {
      reads.push(uri);
      return {
        contents: [
          { uri: "ui://related", mimeType: "text/plain", text: "related" },
          {
            uri,
            mimeType: A2UI_MIME_TYPE,
            text: JSON.stringify({
              version: A2UI_VERSION,
              root: { id: "result", type: "text", text: "Resolved" },
            }),
          },
        ],
      };
    },
  };
  const toolResult = {
    content: [
      { type: "text", text: "Opening a native surface" },
      {
        type: "resource_link",
        name: "Result surface",
        uri: "ui://result",
        mimeType: A2UI_MIME_TYPE,
      },
      {
        type: "resource_link",
        name: "Documentation",
        uri: "docs://result",
        mimeType: "text/markdown",
      },
    ],
  };

  assert.deepEqual(await resolveA2uiResourceFromToolResult(reader, toolResult), {
    uri: "ui://result",
    mimeType: A2UI_MIME_TYPE,
    surface: {
      version: A2UI_VERSION,
      root: { id: "result", type: "text", text: "Resolved" },
    },
  });
  assert.deepEqual(reads, ["ui://result"]);
});

test("A2UI resource resolution fails closed", async (t) => {
  const validLink = {
    type: "resource_link",
    name: "Result surface",
    uri: "ui://result",
    mimeType: A2UI_MIME_TYPE,
  };
  const validResource = {
    uri: "ui://result",
    mimeType: A2UI_MIME_TYPE,
    text: JSON.stringify({
      version: A2UI_VERSION,
      root: { id: "result", type: "text", text: "Resolved" },
    }),
  };

  const cases = [
    {
      name: "errored tool result",
      result: { content: [validLink], isError: true },
      readResult: { contents: [validResource] },
      message: /errored tool result/,
    },
    {
      name: "invalid tool error flag",
      result: { content: [validLink], isError: "false" },
      readResult: { contents: [validResource] },
      message: /isError to be a boolean/,
    },
    {
      name: "missing A2UI link",
      result: { content: [{ type: "text", text: "none" }] },
      readResult: { contents: [validResource] },
      message: /resource link, received 0/,
    },
    {
      name: "malformed tool content collection",
      result: { content: {} },
      readResult: { contents: [validResource] },
      message: /array at tool result\.content/,
    },
    {
      name: "malformed content block",
      result: { content: [null] },
      readResult: { contents: [validResource] },
      message: /content object/,
    },
    {
      name: "missing content type",
      result: { content: [{ text: "missing type" }] },
      readResult: { contents: [validResource] },
      message: /content type/,
    },
    {
      name: "ambiguous A2UI links",
      result: { content: [validLink, validLink] },
      readResult: { contents: [validResource] },
      message: /resource link, received 2/,
    },
    {
      name: "malformed resource link",
      result: {
        content: [
          { type: "resource_link", name: "Result surface", uri: 1, mimeType: A2UI_MIME_TYPE },
        ],
      },
      readResult: { contents: [validResource] },
      message: /content\[0\]\.uri/,
    },
    {
      name: "malformed resource link name",
      result: {
        content: [{ type: "resource_link", name: 1, uri: "ui://result", mimeType: A2UI_MIME_TYPE }],
      },
      readResult: { contents: [validResource] },
      message: /content\[0\]\.name/,
    },
    {
      name: "malformed resource link MIME type",
      result: {
        content: [
          { type: "resource_link", name: "Result surface", uri: "ui://result", mimeType: 1 },
        ],
      },
      readResult: { contents: [validResource] },
      message: /content\[0\]\.mimeType/,
    },
    {
      name: "missing resource content",
      result: { content: [validLink] },
      readResult: { contents: [] },
      message: /text resource for ui:\/\/result, received 0/,
    },
    {
      name: "ambiguous resource content",
      result: { content: [validLink] },
      readResult: { contents: [validResource, validResource] },
      message: /text resource for ui:\/\/result, received 2/,
    },
    {
      name: "binary resource content",
      result: { content: [validLink] },
      readResult: {
        contents: [{ uri: "ui://result", mimeType: A2UI_MIME_TYPE, blob: "AA==" }],
      },
      message: /text-only A2UI resource/,
    },
    {
      name: "resource content with no body",
      result: { content: [validLink] },
      readResult: { contents: [{ uri: "ui://result", mimeType: A2UI_MIME_TYPE }] },
      message: /exactly one of text or blob/,
    },
    {
      name: "resource content with conflicting bodies",
      result: { content: [validLink] },
      readResult: {
        contents: [{ uri: "ui://result", mimeType: A2UI_MIME_TYPE, text: "text", blob: "AA==" }],
      },
      message: /exactly one of text or blob/,
    },
    {
      name: "malformed resource collection",
      result: { content: [validLink] },
      readResult: { contents: {} },
      message: /array at resource result\.contents/,
    },
    {
      name: "malformed resource result",
      result: { content: [validLink] },
      readResult: null,
      message: /object from resources\/read/,
    },
    {
      name: "malformed resource item",
      result: { content: [validLink] },
      readResult: { contents: [null] },
      message: /object at resource result\.contents\[0\]/,
    },
    {
      name: "malformed resource URI",
      result: { content: [validLink] },
      readResult: { contents: [{ ...validResource, uri: 1 }] },
      message: /contents\[0\]\.uri/,
    },
    {
      name: "malformed resource MIME type",
      result: { content: [validLink] },
      readResult: { contents: [{ ...validResource, mimeType: 1 }] },
      message: /contents\[0\]\.mimeType/,
    },
    {
      name: "malformed resource text",
      result: { content: [validLink] },
      readResult: { contents: [{ ...validResource, text: 1 }] },
      message: /contents\[0\]\.text/,
    },
    {
      name: "malformed resource blob",
      result: { content: [validLink] },
      readResult: { contents: [{ ...validResource, blob: 1 }] },
      message: /contents\[0\]\.blob/,
    },
  ];

  await Promise.all(
    cases.map((invalidCase) =>
      t.test(invalidCase.name, async () => {
        const reader = {
          async readResource() {
            return invalidCase.readResult;
          },
        };
        await assert.rejects(
          () => resolveA2uiResourceFromToolResult(reader, invalidCase.result),
          (error) => error instanceof A2uiResourceError && invalidCase.message.test(error.message),
        );
      }),
    ),
  );
});

test("invalid resolved A2UI text remains a parse error", async () => {
  const reader = {
    async readResource() {
      return {
        contents: [{ uri: "ui://invalid", mimeType: A2UI_MIME_TYPE, text: "not-json" }],
      };
    },
  };

  await assert.rejects(
    () =>
      resolveA2uiResourceFromToolResult(reader, {
        content: [
          {
            type: "resource_link",
            name: "Invalid surface",
            uri: "ui://invalid",
            mimeType: A2UI_MIME_TYPE,
          },
        ],
      }),
    A2uiParseError,
  );
});
