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

test("inline HTML can become a WebView document", () => {
  const document = createWebViewDocument({
    uri: "ui://profile",
    mimeType: "text/html",
    text: "<main>Profile</main>",
  });

  assert.deepEqual(document, {
    kind: "inline",
    html: "<main>Profile</main>",
    baseUrl: "ui://profile",
  });
});

test("remote WebView documents are denied by default", () => {
  assert.throws(
    () => createWebViewDocument({ uri: "https://example.com/app", mimeType: "text/html" }),
    WebViewPolicyError,
  );
});

test("remote WebView documents require an explicit policy grant", () => {
  assert.deepEqual(
    createWebViewDocument(
      { uri: "https://example.com/app", mimeType: "text/html+skybridge" },
      { allowRemoteDocuments: true },
    ),
    { kind: "remote", uri: "https://example.com/app" },
  );
});

test("unsupported WebView resources fail closed", () => {
  assert.throws(
    () => createWebViewDocument({ uri: "ui://profile", mimeType: "application/json", text: "{}" }),
    (error) =>
      error instanceof WebViewPolicyError &&
      error.name === "WebViewPolicyError" &&
      error.message === "Unsupported WebView MIME type: application/json",
  );
  assert.throws(
    () => createWebViewDocument({ uri: "ui://profile" }),
    /Unsupported WebView MIME type: unknown/,
  );
});
