package dev.mcpnative.androidprobe;

import androidx.javascriptengine.IsolateStartupParameters;
import androidx.javascriptengine.JavaScriptIsolate;
import androidx.javascriptengine.JavaScriptSandbox;
import androidx.javascriptengine.Message;
import androidx.javascriptengine.MessagePort;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;

/** One isolate and at most one request in flight; no input is interpolated into source. */
final class EngineSession implements AutoCloseable {
  static final String[] REQUIRED_FEATURES = {
      JavaScriptSandbox.JS_FEATURE_MESSAGE_PORTS,
      JavaScriptSandbox.JS_FEATURE_PROMISE_RETURN,
      JavaScriptSandbox.JS_FEATURE_ISOLATE_TERMINATION,
      JavaScriptSandbox.JS_FEATURE_ISOLATE_MAX_HEAP_SIZE,
      JavaScriptSandbox.JS_FEATURE_EVALUATE_WITHOUT_TRANSACTION_LIMIT
  };
  private final JavaScriptIsolate isolate;
  private MessagePort port;
  private final AtomicBoolean closed = new AtomicBoolean();
  private final AtomicBoolean inFlight = new AtomicBoolean();
  private final AtomicReference<CompletableFuture<String>> pending = new AtomicReference<>();

  static IsolateStartupParameters limits(JavaScriptSandbox sandbox) {
    IsolateStartupParameters parameters = new IsolateStartupParameters();
    if (sandbox.isFeatureSupported(JavaScriptSandbox.JS_FEATURE_ISOLATE_MAX_HEAP_SIZE)) {
      parameters.setMaxHeapSizeBytes(64L * 1024 * 1024);
    } else throw new IllegalArgumentException("Missing isolate heap limit");
    if (sandbox.isFeatureSupported(JavaScriptSandbox.JS_FEATURE_EVALUATE_WITHOUT_TRANSACTION_LIMIT)) {
      parameters.setMaxEvaluationReturnSizeBytes(Json.MAX_BYTES);
    } else throw new IllegalArgumentException("Missing engine result limit");
    return parameters;
  }

  EngineSession(JavaScriptSandbox sandbox, String bundle, String bridge) throws Exception {
    for (String feature : REQUIRED_FEATURES) {
      Json.require(sandbox.isFeatureSupported(feature), "Missing engine feature: " + feature);
    }
    isolate = sandbox.createIsolate(limits(sandbox));
    try {
      isolate.addOnTerminatedCallback(Runnable::run,
          info -> fail(new IllegalStateException("Isolate terminated: " + info.getStatus())));
      // Both sources are fixed, locally built APK assets. This is the only evaluation path.
      isolate.evaluateJavaScriptAsync(bundle).get(10, TimeUnit.SECONDS);
      if (sandbox.isFeatureSupported(JavaScriptSandbox.JS_FEATURE_MESSAGE_PORTS)) {
        port = isolate.createMessageChannel("mcp-native-probe", Runnable::run, message -> {
          CompletableFuture<String> waiting = pending.get();
          try {
            Json.require(waiting != null && message.getType() == Message.TYPE_STRING,
                "Unexpected engine message");
            String text = message.getString();
            Json.require(text.length() <= Json.MAX_BYTES, "Response length limit");
            Json.require(waiting.complete(text), "Duplicate engine response");
          } catch (Exception error) {
            if (waiting != null) waiting.completeExceptionally(error);
            fail(error);
          }
        });
      } else throw new IllegalArgumentException("Missing message-port support");
      Json.require("ready".equals(isolate.evaluateJavaScriptAsync(bridge).get(10, TimeUnit.SECONDS)),
          "Bridge initialization failed");
    } catch (Exception error) {
      close();
      throw error;
    }
  }

  JSONObject exchange(JSONObject request) throws Exception {
    Json.require(!closed.get(), "Closed engine session");
    String source = request.toString();
    Json.parse(source, 64);
    Json.require(inFlight.compareAndSet(false, true), "Concurrent engine request");
    CompletableFuture<String> waiting = new CompletableFuture<>();
    pending.set(waiting);
    try {
      port.postMessage(Message.createStringMessage(source));
      JSONObject response = Json.object(Json.parse(waiting.get(10, TimeUnit.SECONDS), Json.RESPONSE_DEPTH));
      Json.require(!closed.get(), "Response after engine close");
      Json.require(Boolean.TRUE.equals(response.opt("ok")), "Engine session rejected request");
      Json.shape(response, java.util.Set.of("ok", "value"), java.util.Set.of());
      return response;
    } catch (Exception error) {
      fail(error);
      throw error;
    } finally {
      pending.compareAndSet(waiting, null);
      inFlight.set(false);
    }
  }

  private void fail(Exception error) {
    CompletableFuture<String> waiting = pending.getAndSet(null);
    if (waiting != null) waiting.completeExceptionally(error);
    close();
  }

  @Override public void close() {
    if (!closed.compareAndSet(false, true)) return;
    CompletableFuture<String> waiting = pending.getAndSet(null);
    if (waiting != null) waiting.completeExceptionally(new IllegalStateException("Closed engine session"));
    if (port != null) port.close();
    isolate.close();
  }
}
