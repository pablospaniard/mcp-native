package dev.mcpnative.androidprobe;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.pm.PackageInfo;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.javascriptengine.IsolateTerminatedException;
import androidx.javascriptengine.JavaScriptIsolate;
import androidx.javascriptengine.JavaScriptSandbox;
import androidx.javascriptengine.MessagePort;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

/** Local instrumentation only: no Activity, Compose view, network transport or device benchmark. */
public final class ProbeInstrumentation extends Instrumentation {
  private String runId;
  private static final String PROBE = """
      JSON.stringify({intl:typeof Intl, dateTimeFormat:typeof Intl.DateTimeFormat,
      numberFormat:typeof Intl.NumberFormat, pluralRules:typeof Intl.PluralRules,
      url:typeof URL, textEncoder:typeof TextEncoder, structuredClone:typeof structuredClone,
      promises:typeof Promise, map:typeof Map,
      number:new Intl.NumberFormat('de-DE').format(1234.5),
      plural:new Intl.PluralRules('en').select(2),
      date:new Intl.DateTimeFormat('en-US',{timeZone:'UTC',year:'numeric',month:'2-digit',day:'2-digit'})
        .format(new Date('2026-09-12T12:00:00.000Z'))})
      """;

  @Override public void onCreate(Bundle arguments) {
    super.onCreate(arguments);
    runId = arguments.getString("runId", "");
    start();
  }

  @Override public void onStart() {
    Bundle status = new Bundle();
    try {
      Json.require(UUID.fromString(runId).toString().equals(runId), "Missing run identifier");
      JSONObject report = runProbe();
      byte[] bytes = report.toString().getBytes(StandardCharsets.UTF_8);
      Json.require(bytes.length <= 8 * Json.MAX_BYTES, "Report size limit");
      try (var output = getTargetContext().openFileOutput("report.json", 0)) { output.write(bytes); }
      status.putString("stream", "Android runtime probe passed; report.json written\n");
      finish(Activity.RESULT_OK, status);
    } catch (Throwable error) {
      status.putString("stream", "Android runtime probe failed: " + error + "\n");
      android.util.Log.e("McpNativeProbe", "Probe failed", error);
      finish(Activity.RESULT_CANCELED, status);
    }
  }

  private String asset(String name) throws Exception {
    try (InputStream input = getTargetContext().getAssets().open(name);
        ByteArrayOutputStream output = new ByteArrayOutputStream()) {
      byte[] chunk = new byte[8192];
      int size;
      while ((size = input.read(chunk)) != -1) {
        Json.require(output.size() + size <= Json.MAX_BYTES, "Asset size limit");
        output.write(chunk, 0, size);
      }
      return output.toString(StandardCharsets.UTF_8.name());
    }
  }

  private JSONObject runProbe() throws Exception {
    Json.require(JavaScriptSandbox.isSupported(), "JavaScriptSandbox unavailable on this provider/device");
    String bundle = asset("runtime.js"), bridge = asset("bridge.js");
    JSONObject suite = Json.object(Json.parse(asset("inputs.json"), 64));
    String timestamp = suite.getString("timestamp");
    JSONArray cases = suite.getJSONArray("cases");
    Json.require(cases.length() > 0 && cases.length() <= 64, "Case limit");
    JSONObject runs = new JSONObject();
    JSONObject features = new JSONObject();
    JSONObject engineProbe;
    JSONObject checks;
    try (JavaScriptSandbox sandbox = JavaScriptSandbox.createConnectedInstanceAsync(getTargetContext())
        .get(10, TimeUnit.SECONDS)) {
      for (String feature : EngineSession.REQUIRED_FEATURES) {
        features.put(feature, sandbox.isFeatureSupported(feature));
        Json.require(sandbox.isFeatureSupported(feature), "Missing required feature: " + feature);
      }
      try (JavaScriptIsolate isolate = sandbox.createIsolate(EngineSession.limits(sandbox))) {
        engineProbe = Json.object(Json.parse(isolate.evaluateJavaScriptAsync(PROBE).get(10, TimeUnit.SECONDS), 64));
      }
      Json.require(engineProbe.get("number").equals("1.234,5") && engineProbe.get("plural").equals("other")
          && engineProbe.get("date").equals("09/12/2026"), "Intl output mismatch");
      int retainedBytes = 0;
      for (int i = 0; i < cases.length(); i++) {
        JSONObject fixture = cases.getJSONObject(i);
        JSONArray steps = fixture.getJSONArray("steps"), observations = new JSONArray();
        try (ExperimentHost host = new ExperimentHost(sandbox, bundle, bridge,
            fixture.getJSONObject("host"), timestamp)) {
          for (int j = 0; j < steps.length(); j++) {
            JSONObject observation = host.step(steps.getJSONObject(j), host.generation);
            retainedBytes += observation.toString().getBytes(StandardCharsets.UTF_8).length;
            Json.require(retainedBytes <= 7 * Json.MAX_BYTES, "Cumulative corpus output limit");
            observations.put(observation);
          }
        }
        runs.put(fixture.getString("id"), observations);
      }
      checks = testBoundaries(sandbox, bundle, bridge, cases.getJSONObject(0).getJSONObject("host"), timestamp);
      testBridgeFailures(sandbox, bundle);
      checks.put("bridgeFailureClosesSession", true);
      checks.put("singleInFlightAndPendingClose", true);
      testRunningTermination(sandbox);
      checks.put("runningIsolateTermination", true);
      // A fresh session in the same sandbox proves termination did not poison future work.
      try (ExperimentHost host = new ExperimentHost(sandbox, bundle, bridge,
          cases.getJSONObject(0).getJSONObject("host"), timestamp)) {
        Json.require(host.step(Json.obj("op", "render"), host.generation).getJSONArray("view").length() == 0,
            "Fresh session leaked state");
      }
      checks.put("freshSessionAfterTermination", true);
    }
    PackageInfo provider = WebView.getCurrentWebViewPackage();
    byte[] digest = MessageDigest.getInstance("SHA-256").digest(bundle.getBytes(StandardCharsets.UTF_8));
    StringBuilder hash = new StringBuilder();
    for (byte value : digest) hash.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
    return Json.obj("runId", runId, "cases", runs, "features", features, "probe", engineProbe,
        "checks", checks, "bundleSha256", hash.toString(), "environment", Json.obj(
            "api", Build.VERSION.SDK_INT, "release", Build.VERSION.RELEASE, "abi", Build.SUPPORTED_ABIS[0],
            "provider", provider == null ? JSONObject.NULL : provider.packageName,
            "providerVersion", provider == null ? JSONObject.NULL : provider.versionName,
            "androidx", "1.1.0"));
  }

  private JSONObject testBoundaries(JavaScriptSandbox sandbox, String bundle, String bridge,
      JSONObject policy, String timestamp) throws Exception {
    JSONObject tool = Json.object(Json.parse(asset("tool-result.json"), 64));
    String inert = "\"; globalThis.injected = true; // 🚀";
    JSONObject render = Json.obj("op", "render");
    ExperimentHost host = new ExperimentHost(sandbox, bundle, bridge, policy, timestamp);
    String oldTicket = host.generation;
    try {
      host.toolResult(tool, oldTicket);
      JSONObject edited = host.step(Json.obj("op", "input", "target", Json.obj("kind", "text-field", "label", "Name"),
          "value", inert), oldTicket);
      for (String source : new String[]{"null", "[]", "\"invalid\"", "42", "true"}) {
        JSONObject malformed = Json.object(Json.parse(tool.toString(), 64));
        malformed.getJSONArray("content").getJSONObject(0).getJSONObject("resource").put("text", source);
        JSONObject rejected = host.toolResult(malformed, oldTicket);
        Json.require(rejected.get("outcome").equals("message-rejected"), "Malformed envelope accepted");
        rejected.put("outcome", "accepted");
        equal(rejected, edited);
        equal(host.step(render, oldTicket), edited);
      }
      JSONObject action = host.step(Json.obj("op", "press", "target", Json.obj("kind", "button", "label", "Submit")), oldTicket);
      Json.require(action.getJSONArray("deliveries").getJSONObject(0).getJSONObject("envelope")
          .getJSONObject("action").getJSONObject("context").get("name").equals(inert), "Message-port text changed");
      JSONObject bad = Json.object(Json.parse(tool.toString(), 64));
      bad.getJSONArray("content").getJSONObject(0).getJSONObject("resource").put("mimeType", "text/html");
      rejects(() -> host.toolResult(bad, oldTicket));
    } finally { host.close(); }
    rejects(() -> host.step(render, oldTicket));
    try (ExperimentHost replacement = new ExperimentHost(sandbox, bundle, bridge, policy, timestamp)) {
      rejects(() -> replacement.step(render, oldTicket));
    }
    for (String invalid : new String[]{"{\"a\":1,\"a\":2}", "{a:1}", "[1,]", "null true",
        "NaN", "1e999", "[".repeat(65) + "0" + "]".repeat(65), "\"" + "x".repeat(65_537) + "\""}) {
      rejects(() -> Json.parse(invalid, 64));
    }
    Json.parse("[".repeat(132) + "0" + "]".repeat(132), 132);
    rejects(() -> Json.parse("[".repeat(133) + "0" + "]".repeat(133), 132));
    testNestedLayout(sandbox, bundle, bridge, policy, timestamp);
    return Json.obj("malformedEnvelopesPreserveSession", true, "inertUnicodeRoundTrip", true,
        "unknownMimeRejected", true, "closedAndStaleTickets", true, "strictJsonAndDepthLimits", true,
        "nestedLayoutBoundary", true);
  }

  private void testNestedLayout(JavaScriptSandbox sandbox, String bundle, String bridge,
      JSONObject policy, String timestamp) throws Exception {
    for (int columns : new int[]{31, 63, 64}) {
      JSONArray components = new JSONArray();
      JSONObject expected = Json.obj("kind", "text-field", "label", "Deep field", "value", "Retained leaf",
          "invalid", false, "validationMessages", new JSONArray());
      for (int i = 0; i < columns; i++) {
        components.put(Json.obj("id", i == 0 ? "root" : "c" + i, "component", "Column",
            "children", new JSONArray().put(i == columns - 1 ? "leaf" : "c" + (i + 1))));
        expected = Json.obj("kind", "group", "children", new JSONArray().put(expected));
      }
      components.put(Json.obj("id", "leaf", "component", "TextField", "label", "Deep field", "value", "Retained leaf"));
      try (ExperimentHost host = new ExperimentHost(sandbox, bundle, bridge, policy, timestamp)) {
        JSONObject result = host.step(Json.obj("op", "message", "message", Json.obj("version", "v1.0",
            "createSurface", Json.obj("surfaceId", "form", "components", components, "dataModel", new JSONObject()))), host.generation);
        Json.require(result.get("outcome").equals(columns == 64 ? "surface-rejected" : "accepted"), "Graph depth outcome");
        equal(result.get("view"), columns == 64 ? new JSONArray() : new JSONArray().put(expected));
        equal(result, host.step(Json.obj("op", "render"), host.generation));
      }
    }
  }

  private static void testRunningTermination(JavaScriptSandbox sandbox) throws Exception {
    // Fixed hostile host test script; no server can submit code to this entry point.
    if (sandbox.isFeatureSupported(JavaScriptSandbox.JS_FEATURE_MESSAGE_PORTS)) {
      CompletableFuture<String> started = new CompletableFuture<>();
      JavaScriptIsolate isolate = sandbox.createIsolate(EngineSession.limits(sandbox));
      try (MessagePort port = isolate.createMessageChannel("termination-probe", Runnable::run,
          message -> started.complete(message.getString()))) {
        var running = isolate.evaluateJavaScriptAsync("""
            (async () => {const port = await android.getNamedPort('termination-probe');
            let announced = false;
            while (true) {if (!announced) {announced = true; port.postMessage('started');}}})()
            """);
        Json.require(started.get(10, TimeUnit.SECONDS).equals("started"), "Loop did not start");
        isolate.close();
        try {
          running.get(10, TimeUnit.SECONDS);
          throw new AssertionError("Running evaluation completed instead of terminating");
        } catch (ExecutionException error) {
          Json.require(error.getCause() instanceof IsolateTerminatedException, "Unexpected termination failure");
        }
      } finally { isolate.close(); }
    } else throw new IllegalArgumentException("Missing termination-probe message port");
  }

  private static void testBridgeFailures(JavaScriptSandbox sandbox, String bundle) throws Exception {
    // Fixed host test adapters deliberately violate the response contract or withhold a reply.
    String invalidBridge = """
        (async () => {const port = await android.getNamedPort('mcp-native-probe');
        port.onmessage = () => port.postMessage('['.repeat(133)+'0'+']'.repeat(133)); return 'ready';})()
        """;
    try (EngineSession session = new EngineSession(sandbox, bundle, invalidBridge)) {
      rejects(() -> session.exchange(Json.obj("op", "render")));
      rejects(() -> session.exchange(Json.obj("op", "render")));
    }
    String silentBridge = """
        (async () => {const port = await android.getNamedPort('mcp-native-probe');
        port.onmessage = () => {}; return 'ready';})()
        """;
    try (EngineSession session = new EngineSession(sandbox, bundle, silentBridge)) {
      CompletableFuture<Exception> stopped = new CompletableFuture<>();
      Thread worker = new Thread(() -> {
        try { session.exchange(new JSONObject()); stopped.complete(null); }
        catch (Exception error) { stopped.complete(error); }
      }, "probe-pending-request");
      worker.start();
      try {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (worker.getState() != Thread.State.TIMED_WAITING && worker.isAlive() && System.nanoTime() < deadline) {
          Thread.sleep(10);
        }
        Json.require(worker.getState() == Thread.State.TIMED_WAITING, "Request did not reach pending wait");
        rejects(() -> session.exchange(new JSONObject()));
        session.close();
        Exception error = stopped.get(5, TimeUnit.SECONDS);
        Json.require(error instanceof ExecutionException && error.getCause() instanceof IllegalStateException,
            "Pending request did not reject on close");
      } finally {
        session.close();
        worker.join(5000);
        Json.require(!worker.isAlive(), "Pending request thread leaked");
      }
    }
  }

  private interface Checked { void run() throws Exception; }
  private static void rejects(Checked action) throws Exception {
    try { action.run(); } catch (IllegalArgumentException | java.io.IOException expected) { return; }
    throw new AssertionError("Invalid operation was accepted");
  }

  private static void equal(Object actual, Object expected) throws Exception {
    if (actual instanceof JSONObject a && expected instanceof JSONObject b) {
      Json.require(a.length() == b.length(), "Object field mismatch");
      for (var keys = b.keys(); keys.hasNext();) { String key = keys.next(); equal(a.get(key), b.get(key)); }
    } else if (actual instanceof JSONArray a && expected instanceof JSONArray b) {
      Json.require(a.length() == b.length(), "Array length mismatch");
      for (int i = 0; i < b.length(); i++) equal(a.get(i), b.get(i));
    } else Json.require(actual.equals(expected), "Observation mismatch");
  }
}
