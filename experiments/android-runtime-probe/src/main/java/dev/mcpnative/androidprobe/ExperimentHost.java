package dev.mcpnative.androidprobe;

import androidx.javascriptengine.JavaScriptSandbox;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONArray;
import org.json.JSONObject;

/** Experiment-only native admission and delivery policy, shared semantics remain in JavaScript. */
final class ExperimentHost implements AutoCloseable {
  final String generation = UUID.randomUUID().toString();
  private final EngineSession session;
  private final JSONObject policy;
  private final String timestamp;
  private final AtomicBoolean closed = new AtomicBoolean();
  private int sequence, seenActions;
  private final JSONArray deliveries = new JSONArray(), results = new JSONArray();

  ExperimentHost(JavaScriptSandbox sandbox, String bundle, String bridge,
      JSONObject policy, String timestamp) throws Exception {
    Json.shape(policy, Set.of("componentNames", "functionNames", "eventNames", "authorizeActions"), Set.of());
    allowlist(policy.getJSONArray("componentNames"), Set.of("Column", "List", "Text", "TextField", "CheckBox", "Button"));
    allowlist(policy.getJSONArray("functionNames"), Set.of("required", "formatDate"));
    allowlist(policy.getJSONArray("eventNames"), Set.of("submit"));
    Json.require(policy.get("authorizeActions") instanceof Boolean, "Invalid authorization policy");
    this.policy = policy;
    this.timestamp = timestamp;
    session = new EngineSession(sandbox, bundle, bridge);
    try {
      session.exchange(Json.obj("op", "open", "token", generation, "sequence", 0,
          "host", policy, "timestamp", timestamp));
    } catch (Exception error) {
      close();
      throw error;
    }
  }

  private static void allowlist(JSONArray names, Set<String> allowed) throws Exception {
    Set<String> unique = new HashSet<>();
    for (int i = 0; i < names.length(); i++) {
      Object value = names.get(i);
      Json.require(value instanceof String && allowed.contains(value) && unique.add((String) value),
          "Invalid host allowlist");
    }
  }

  synchronized JSONObject step(JSONObject input, String ticket) throws Exception {
    Json.require(!closed.get() && generation.equals(ticket) && sequence < 64, "Stale, closed or exhausted host");
    String op = input.getString("op");
    switch (op) {
      case "message": Json.shape(input, Set.of("op", "message"), Set.of()); break;
      case "render": Json.shape(input, Set.of("op"), Set.of()); break;
      case "resolve-event": Json.shape(input, Set.of("op", "sourceComponentId"), Set.of()); break;
      case "input": case "press":
        Json.shape(input, op.equals("input") ? Set.of("op", "target", "value") : Set.of("op", "target"), Set.of());
        JSONObject target = input.getJSONObject("target");
        Json.shape(target, Set.of("kind", "label"), Set.of());
        identifier(target.get("label"));
        Json.require((op.equals("press") ? Set.of("button") : Set.of("text-field", "checkbox"))
            .contains(target.get("kind")), "Invalid interaction target");
        break;
      default: throw new IllegalArgumentException("Unknown host operation");
    }
    try {
      JSONObject observation = session.exchange(Json.obj("op", "step", "token", generation,
          "sequence", ++sequence, "step", input)).getJSONObject("value");
      Json.require(!closed.get(), "Response after close");
      Json.shape(observation, Set.of("outcome", "serverDataModel", "view", "localChanges", "actions"), Set.of());
      JSONArray actions = observation.getJSONArray("actions");
      Json.require(actions.length() >= seenActions && actions.length() <= seenActions + 1, "Invalid action count");
      for (int i = seenActions; i < actions.length(); i++) {
        Json.require(op.equals("press"), "Action without explicit press");
        JSONObject record = actions.getJSONObject(i);
        Json.shape(record, Set.of("envelope"), Set.of("dataModel"));
        JSONObject envelope = record.getJSONObject("envelope");
        Json.shape(envelope, Set.of("version", "action"), Set.of());
        JSONObject action = envelope.getJSONObject("action");
        Json.shape(action, Set.of("name", "surfaceId", "sourceComponentId", "timestamp", "context"), Set.of());
        Json.require(envelope.get("version").equals("v1.0") && action.get("surfaceId").equals("form")
            && action.get("timestamp").equals(timestamp) && action.get("name").equals("submit")
            && policy.getJSONArray("eventNames").length() == 1, "Denied action contract");
        identifier(action.get("sourceComponentId"));
        action.getJSONObject("context");
        if (record.has("dataModel")) record.getJSONObject("dataModel");
        Json.parse(record.toString(), 64);
        if (policy.getBoolean("authorizeActions")) {
          deliveries.put(record);
          results.put("delivered");
        } else results.put("denied");
      }
      seenActions = actions.length();
      observation.put("deliveries", deliveries);
      observation.put("deliveryResults", results);
      // Snapshot cumulative logs so later steps cannot mutate earlier observations.
      return Json.object(Json.parse(observation.toString(), Json.RESPONSE_DEPTH));
    } catch (Exception error) {
      close();
      throw error;
    }
  }

  JSONObject toolResult(JSONObject input, String ticket) throws Exception {
    Json.shape(input, Set.of("content"), Set.of());
    JSONArray content = input.getJSONArray("content");
    Json.require(content.length() == 1, "Ambiguous tool result");
    JSONObject item = content.getJSONObject(0);
    Json.shape(item, Set.of("type", "resource"), Set.of());
    JSONObject resource = item.getJSONObject("resource");
    Json.shape(resource, Set.of("uri", "mimeType", "text"), Set.of());
    Json.require(item.get("type").equals("resource")
        && resource.get("uri").equals("a2ui://experiment/form")
        && resource.get("mimeType").equals("application/a2ui+json"), "Unsupported resource");
    return step(Json.obj("op", "message", "message", Json.parse(resource.getString("text"), 64)), ticket);
  }

  private static void identifier(Object value) {
    Json.require(value instanceof String && !((String) value).isEmpty() && ((String) value).length() <= 128
        && ((String) value).chars().allMatch(c -> c < 128), "Expected bounded ASCII identifier");
  }

  @Override public void close() {
    closed.set(true);
    session.close();
  }
}
