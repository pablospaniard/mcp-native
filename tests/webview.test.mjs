import assert from "node:assert/strict";
import test from "node:test";

import {
  WebViewPolicyError,
  createWebViewDocument,
} from "../packages/webview/dist/index.js";

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
