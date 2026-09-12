// JavaScriptCore has no browser URL global. Ajv/fast-uri requires WHATWG URL for IDNA.
import URL from "core-js-pure/actual/url/index.js";
export { URL };
