import assert from "node:assert/strict";
import test from "node:test";

import {
  WebViewPolicyError,
  createWebViewDocument,
  isHtmlResource,
} from "../packages/webview/dist/index.js";

test("HTML resource detection accepts both supported MIME types", () => {
  assert.equal(isHtmlResource({ uri: "ui://html", mimeType: "text/html" }), true);
  assert.equal(isHtmlResource({ uri: "ui://skybridge", mimeType: "text/html+skybridge" }), true);
  assert.equal(isHtmlResource({ uri: "ui://json", mimeType: "application/json" }), false);
  assert.equal(isHtmlResource({ uri: "ui://unknown" }), false);
});

test("inline HTML requires an explicit policy grant", () => {
  assert.throws(
    () =>
      createWebViewDocument({
        uri: "ui://profile",
        mimeType: "text/html",
        text: "<main>Profile</main>",
      }),
    (error) =>
      error instanceof WebViewPolicyError &&
      error.message === "Inline WebView documents are disabled by policy",
  );

  assert.deepEqual(
    createWebViewDocument(
      {
        uri: "ui://profile",
        mimeType: "text/html",
        text: "<main>Profile</main>",
      },
      { allowInlineDocuments: true },
    ),
    {
      kind: "inline",
      html: "<main>Profile</main>",
      baseUrl: "ui://profile",
    },
  );
});

test("inline HTML base URLs use a positive non-network scheme allowlist", () => {
  for (const uri of [
    "javascript:alert(1)",
    "intent://scan/#Intent;end",
    "data:text/html,hello",
    "file:///tmp/x",
    "blob:https://example.com/uuid",
    "https://example.com/app",
    "http://example.com/app",
  ]) {
    assert.throws(
      () =>
        createWebViewDocument(
          { uri, mimeType: "text/html", text: "<main>x</main>" },
          { allowInlineDocuments: true },
        ),
      /Inline WebView base URL scheme is not allowlisted/,
    );
  }

  for (const uri of ["ui://profile", "mcp://example/app"]) {
    assert.equal(
      createWebViewDocument(
        { uri, mimeType: "text/html", text: "<main>x</main>" },
        { allowInlineDocuments: true },
      ).kind,
      "inline",
    );
  }

  assert.throws(
    () =>
      createWebViewDocument(
        {
          uri: "ui://user:secret@profile",
          mimeType: "text/html",
          text: "<main>x</main>",
        },
        { allowInlineDocuments: true },
      ),
    /must not include embedded credentials/,
  );
  assert.throws(
    () =>
      createWebViewDocument(
        { uri: "not a uri", mimeType: "text/html", text: "<main>x</main>" },
        { allowInlineDocuments: true },
      ),
    /Invalid WebView document URI/,
  );
});

test("allowedRemoteOrigins rejects non-http(s) and non-exact origins", () => {
  assert.throws(
    () =>
      createWebViewDocument(
        { uri: "https://example.com/app", mimeType: "text/html" },
        {
          allowRemoteDocuments: true,
          allowedRemoteOrigins: ["ui://example"],
        },
      ),
    /allowedRemoteOrigins entries must use http: or https:/,
  );
});

test("binary MCP resources cannot become WebView documents", () => {
  assert.throws(
    () =>
      createWebViewDocument(
        {
          uri: "https://example.com/app",
          mimeType: "text/html",
          blob: "PGh0bWw+PC9odG1sPg==",
        },
        {
          allowRemoteDocuments: true,
          allowedRemoteOrigins: ["https://example.com"],
        },
      ),
    /Binary WebView resources are not supported/,
  );
});

test("remote WebView documents are denied by default", () => {
  assert.throws(
    () => createWebViewDocument({ uri: "https://example.com/app", mimeType: "text/html" }),
    WebViewPolicyError,
  );
});

test("remote WebView documents require an origin allowlist", () => {
  assert.throws(
    () =>
      createWebViewDocument(
        { uri: "https://example.com/app", mimeType: "text/html+skybridge" },
        { allowRemoteDocuments: true },
      ),
    /non-empty allowedRemoteOrigins/,
  );

  assert.deepEqual(
    createWebViewDocument(
      { uri: "https://example.com/app", mimeType: "text/html+skybridge" },
      {
        allowRemoteDocuments: true,
        allowedRemoteOrigins: ["https://example.com"],
      },
    ),
    { kind: "remote", uri: "https://example.com/app" },
  );
});

test("remote WebView documents reject dangerous schemes, credentials, and foreign origins", () => {
  assert.throws(
    () =>
      createWebViewDocument(
        { uri: "javascript:alert(1)", mimeType: "text/html" },
        {
          allowRemoteDocuments: true,
          allowedRemoteOrigins: ["https://example.com"],
        },
      ),
    /require http: or https:/,
  );
  assert.throws(
    () =>
      createWebViewDocument(
        { uri: "file:///etc/passwd", mimeType: "text/html" },
        {
          allowRemoteDocuments: true,
          allowedRemoteOrigins: ["https://example.com"],
        },
      ),
    /require http: or https:/,
  );
  assert.throws(
    () =>
      createWebViewDocument(
        { uri: "https://user:secret@example.com/app", mimeType: "text/html" },
        {
          allowRemoteDocuments: true,
          allowedRemoteOrigins: ["https://example.com"],
        },
      ),
    /must not include embedded credentials/,
  );
  assert.throws(
    () =>
      createWebViewDocument(
        { uri: "https://evil.example/app", mimeType: "text/html" },
        {
          allowRemoteDocuments: true,
          allowedRemoteOrigins: ["https://example.com"],
        },
      ),
    /Remote WebView origin is not allowlisted: https:\/\/evil.example/,
  );
  assert.throws(
    () =>
      createWebViewDocument(
        { uri: "ui://local-app", mimeType: "text/html" },
        {
          allowRemoteDocuments: true,
          allowedRemoteOrigins: ["https://example.com"],
        },
      ),
    /require http: or https:/,
  );
  assert.throws(
    () =>
      createWebViewDocument(
        { uri: "https://example.com/app", mimeType: "text/html" },
        {
          allowRemoteDocuments: true,
          allowedRemoteOrigins: ["https://user:secret@example.com"],
        },
      ),
    /must not include embedded credentials/,
  );
  assert.throws(
    () =>
      createWebViewDocument(
        { uri: "https://example.com/app", mimeType: "text/html" },
        {
          allowRemoteDocuments: true,
          allowedRemoteOrigins: ["https://example.com/app"],
        },
      ),
    /must be exact origins/,
  );
});

test("unsupported WebView resources fail closed", () => {
  assert.throws(
    () =>
      createWebViewDocument(
        { uri: "ui://profile", mimeType: "application/json", text: "{}" },
        { allowInlineDocuments: true },
      ),
    (error) =>
      error instanceof WebViewPolicyError &&
      error.name === "WebViewPolicyError" &&
      error.message === "Unsupported WebView MIME type: application/json",
  );
  assert.throws(
    () => createWebViewDocument({ uri: "ui://profile", mimeType: "text/html" }),
    /Remote WebView documents are disabled by policy/,
  );
});
