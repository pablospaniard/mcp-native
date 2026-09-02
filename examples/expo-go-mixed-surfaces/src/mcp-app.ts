import type { JsonObject, McpNativeAction, McpTool, McpToolCallResult } from "@mcp-native/core";
import {
  MCP_APPS_EXTENSION_CAPABILITIES,
  MCP_APPS_MIME_TYPE,
  negotiateMcpApps,
  resolveMcpAppsResource,
} from "@mcp-native/webview";

import type { SavedStop } from "./types";

export const CITY_CANVAS_RESOURCE_URI = "ui://city-canvas/live-plan";
export const SAVE_CITY_STOP_TOOL_NAME = "save_city_stop";

export const cityStops = Object.freeze({
  retiro: "Crystal Palace reflections",
  letras: "Golden-hour bookshops",
  debod: "Sunset at Templo de Debod",
} satisfies Readonly<Record<string, string>>);

export const cityCanvasTool: McpTool = {
  name: "open_city_canvas",
  description: "Open the interactive city canvas",
  inputSchema: { type: "object", additionalProperties: false },
  _meta: {
    ui: {
      resourceUri: CITY_CANVAS_RESOURCE_URI,
      visibility: ["model"],
    },
  },
};

export const saveCityStopTool: McpTool = {
  name: SAVE_CITY_STOP_TOOL_NAME,
  description: "Save one host-approved city stop",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: { id: { type: "string", enum: Object.keys(cityStops) } },
    required: ["id"],
  },
  _meta: { ui: { visibility: ["app"] } },
};

const cityCanvasHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <title>City Canvas</title>
  <style>
    :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #161125; color: #fff9ed; min-height: 100vh; }
    .canvas { position: relative; min-height: 100vh; overflow: hidden; padding: 20px 18px 24px; }
    .orb { position: absolute; width: 220px; height: 220px; right: -82px; top: -84px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #f5d76e, #ff8066 42%, #7b4dff 72%, transparent 73%); opacity: .9; filter: blur(.2px); }
    .grid { position: absolute; inset: 0; opacity: .16; background-image: linear-gradient(#9d8cff 1px, transparent 1px), linear-gradient(90deg, #9d8cff 1px, transparent 1px); background-size: 28px 28px; mask-image: linear-gradient(to bottom, black, transparent 70%); }
    header, main { position: relative; z-index: 1; }
    .eyebrow { display: flex; align-items: center; gap: 7px; color: #79e7c4; font-size: 10px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: #79e7c4; box-shadow: 0 0 16px #79e7c4; }
    h1 { margin: 12px 0 4px; max-width: 260px; font-size: 31px; line-height: .98; letter-spacing: -1.4px; }
    .lead { margin: 10px 0 18px; max-width: 280px; color: #c9bfd9; font-size: 13px; line-height: 1.45; }
    .tabs { display: flex; gap: 7px; padding: 5px; border: 1px solid #3d3354; border-radius: 16px; background: rgba(23,19,38,.82); backdrop-filter: blur(12px); }
    .tab { flex: 1; border: 0; border-radius: 11px; padding: 10px 6px; background: transparent; color: #a99fba; font: inherit; font-size: 11px; font-weight: 800; }
    .tab.active { background: #9d8cff; color: #130e26; box-shadow: 0 8px 24px rgba(123,77,255,.28); }
    .route { display: none; margin-top: 13px; }
    .route.active { display: block; }
    .stop { display: grid; grid-template-columns: 40px 1fr auto; align-items: center; gap: 11px; margin-top: 9px; padding: 12px; border: 1px solid #39304f; border-radius: 17px; background: linear-gradient(135deg, rgba(39,31,59,.96), rgba(24,19,39,.93)); }
    .time { color: #f5d76e; font-size: 11px; font-weight: 900; }
    .name { font-size: 13px; font-weight: 800; line-height: 1.2; }
    .meta { margin-top: 4px; color: #a99fba; font-size: 10px; }
    .save { min-width: 56px; border: 1px solid #5b4c7b; border-radius: 999px; padding: 8px 10px; background: transparent; color: #fff9ed; font: inherit; font-size: 10px; font-weight: 900; }
    .save.saved { border-color: #79e7c4; background: #173c35; color: #79e7c4; }
    .save:disabled { opacity: .65; }
    .signal { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; padding: 10px 12px; border-radius: 14px; background: #211b35; color: #b7adca; font-size: 10px; }
    .signal strong { color: #fff9ed; }
    .pulse { width: 42px; height: 4px; border-radius: 999px; background: linear-gradient(90deg, #79e7c4, #9d8cff, #ff8066); }
  </style>
</head>
<body>
  <div class="canvas">
    <div class="grid"></div><div class="orb"></div>
    <header>
      <div class="eyebrow"><span class="dot"></span> Isolated MCP App</div>
      <h1>Madrid, tuned to your tempo.</h1>
      <p class="lead">Explore an interactive HTML route inside an ephemeral, permission-free WebView.</p>
    </header>
    <main>
      <div class="tabs" role="tablist" aria-label="Time of day">
        <button class="tab active" data-slot="morning" role="tab">Morning</button>
        <button class="tab" data-slot="golden" role="tab">Golden hour</button>
        <button class="tab" data-slot="night" role="tab">After dark</button>
      </div>
      <section class="route active" data-route="morning">
        <article class="stop"><div class="time">09:10</div><div><div class="name">Retiro glasshouse</div><div class="meta">Quiet light · 42 min</div></div><button class="save" data-stop="retiro">Save</button></article>
        <article class="stop"><div class="time">10:35</div><div><div class="name">Barrio de las Letras</div><div class="meta">Books & coffee · 55 min</div></div><button class="save" data-stop="letras">Save</button></article>
      </section>
      <section class="route" data-route="golden">
        <article class="stop"><div class="time">18:20</div><div><div class="name">Golden-hour bookshops</div><div class="meta">Warm streets · 48 min</div></div><button class="save" data-stop="letras">Save</button></article>
        <article class="stop"><div class="time">20:05</div><div><div class="name">Templo de Debod</div><div class="meta">Sunset edge · 35 min</div></div><button class="save" data-stop="debod">Save</button></article>
      </section>
      <section class="route" data-route="night">
        <article class="stop"><div class="time">21:15</div><div><div class="name">Templo de Debod</div><div class="meta">Blue hour · 35 min</div></div><button class="save" data-stop="debod">Save</button></article>
        <article class="stop"><div class="time">22:10</div><div><div class="name">Letras after hours</div><div class="meta">Tiny bars · open end</div></div><button class="save" data-stop="letras">Save</button></article>
      </section>
      <div class="signal" aria-live="polite"><span id="status"><strong>Connecting</strong> to native host</span><span class="pulse"></span></div>
    </main>
  </div>
  <script>
    (() => {
      let nextId = 2;
      const pending = new Map();
      const status = document.getElementById("status");
      function send(method, params) {
        const id = "city-" + nextId++;
        globalThis.postMessage({ jsonrpc: "2.0", id, method, params });
        return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
      }
      addEventListener("message", (event) => {
        const message = event.data;
        if (!message || typeof message !== "object") return;
        if (message.id === "city-init" && message.result) {
          globalThis.postMessage({ jsonrpc: "2.0", method: "ui/notifications/initialized", params: {} });
          status.innerHTML = "<strong>Protected bridge</strong> ready";
          return;
        }
        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error.message));
        else request.resolve(message.result);
      });
      document.querySelectorAll(".tab").forEach((button) => {
        button.addEventListener("click", () => {
          document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item === button));
          document.querySelectorAll(".route").forEach((route) => route.classList.toggle("active", route.dataset.route === button.dataset.slot));
        });
      });
      document.querySelectorAll(".save").forEach((button) => {
        button.addEventListener("click", async () => {
          button.disabled = true;
          status.innerHTML = "Asking the <strong>host policy</strong>…";
          try {
            await send("tools/call", { name: "save_city_stop", arguments: { id: button.dataset.stop } });
            document.querySelectorAll('[data-stop="' + button.dataset.stop + '"]').forEach((item) => { item.textContent = "Saved"; item.classList.add("saved"); item.disabled = true; });
            status.innerHTML = "Saved through a <strong>validated tool call</strong>";
          } catch (error) {
            button.disabled = false;
            status.textContent = error instanceof Error ? error.message : "Host denied this request";
          }
        });
      });
      globalThis.postMessage({
        jsonrpc: "2.0",
        id: "city-init",
        method: "ui/initialize",
        params: {
          appInfo: { name: "city-canvas", version: "1.0.0" },
          appCapabilities: {},
          protocolVersion: "2026-01-26"
        }
      });
    })();
  </script>
</body>
</html>`;

const grant = negotiateMcpApps(MCP_APPS_EXTENSION_CAPABILITIES, MCP_APPS_EXTENSION_CAPABILITIES);
if (grant.kind !== "negotiated") {
  throw new Error("The bundled MCP Apps profile must negotiate with itself");
}

export const cityCanvasResource = resolveMcpAppsResource(
  cityCanvasTool,
  {
    contents: [
      {
        uri: CITY_CANVAS_RESOURCE_URI,
        mimeType: MCP_APPS_MIME_TYPE,
        text: cityCanvasHtml,
        _meta: { ui: { prefersBorder: true } },
      },
    ],
  },
  grant,
);

export function authorizeSaveCityStop(action: McpNativeAction): boolean {
  if (action.type !== "tool" || action.name !== SAVE_CITY_STOP_TOOL_NAME) return false;
  const arguments_ = action.arguments;
  if (arguments_ === undefined) return false;
  const keys = Object.keys(arguments_);
  if (keys.length !== 1 || keys[0] !== "id") return false;
  return typeof arguments_.id === "string" && Object.hasOwn(cityStops, arguments_.id);
}

export function parseSavedStop(arguments_: JsonObject): SavedStop | undefined {
  if (Object.keys(arguments_).length !== 1 || typeof arguments_.id !== "string") return undefined;
  const title = cityStops[arguments_.id as keyof typeof cityStops];
  return title === undefined ? undefined : { id: arguments_.id, title };
}

export function createSavedStopResult(stop: SavedStop): McpToolCallResult {
  return {
    content: [{ type: "text", text: `Saved ${stop.title} to the native itinerary.` }],
    structuredContent: { saved: true, stopId: stop.id },
  };
}
