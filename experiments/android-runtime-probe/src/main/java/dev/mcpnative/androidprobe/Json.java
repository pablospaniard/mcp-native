package dev.mcpnative.androidprobe;

import android.util.JsonReader;
import android.util.JsonToken;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/** Bounded strict decoding; JSONObject's permissive text parser is not an input boundary. */
final class Json {
  static final int MAX_BYTES = 1_048_576;
  static final int RESPONSE_DEPTH = 132;

  static Object parse(String text, int maxDepth) throws Exception {
    require(text.length() <= MAX_BYTES && text.getBytes(StandardCharsets.UTF_8).length <= MAX_BYTES,
        "JSON byte limit");
    // Wrapping permits scalar JSON roots without enabling JsonReader's lenient syntax.
    try (JsonReader reader = new JsonReader(new StringReader("[" + text + "]"))) {
      reader.setLenient(false);
      reader.beginArray();
      Object value = read(reader, 1, maxDepth, new int[2]);
      require(!reader.hasNext(), "Multiple JSON values");
      reader.endArray();
      require(reader.peek() == JsonToken.END_DOCUMENT, "Trailing JSON");
      return value;
    }
  }

  private static Object read(JsonReader reader, int depth, int maxDepth, int[] budget)
      throws Exception {
    require(++budget[0] <= 10_000, "JSON value limit");
    switch (reader.peek()) {
      case BEGIN_OBJECT:
        require(depth <= maxDepth, "JSON depth limit");
        JSONObject object = new JSONObject();
        reader.beginObject();
        while (reader.hasNext()) {
          String key = reader.nextName();
          count(key, budget);
          require(!object.has(key), "Duplicate JSON key");
          object.put(key, read(reader, depth + 1, maxDepth, budget));
        }
        reader.endObject();
        return object;
      case BEGIN_ARRAY:
        require(depth <= maxDepth, "JSON depth limit");
        JSONArray array = new JSONArray();
        reader.beginArray();
        while (reader.hasNext()) array.put(read(reader, depth + 1, maxDepth, budget));
        reader.endArray();
        return array;
      case STRING:
        String value = reader.nextString();
        count(value, budget);
        return value;
      case NUMBER:
        double number = reader.nextDouble();
        require(Double.isFinite(number), "Non-finite number");
        return number;
      case BOOLEAN: return reader.nextBoolean();
      case NULL:
        reader.nextNull();
        return JSONObject.NULL;
      default: throw new IllegalArgumentException("Expected JSON value");
    }
  }

  private static void count(String value, int[] budget) {
    budget[1] += value.length();
    require(value.length() <= 65_536 && budget[1] <= MAX_BYTES, "JSON string budget");
  }

  static JSONObject object(Object value) {
    require(value instanceof JSONObject, "Expected object");
    return (JSONObject) value;
  }

  static void shape(JSONObject value, Set<String> required, Set<String> optional) {
    Set<String> fields = new HashSet<>();
    value.keys().forEachRemaining(fields::add);
    require(fields.containsAll(required), "Missing field");
    fields.removeAll(required);
    require(optional.containsAll(fields), "Unknown field");
  }

  static JSONObject obj(Object... fields) throws Exception {
    JSONObject value = new JSONObject();
    for (int i = 0; i < fields.length; i += 2) value.put((String) fields[i], fields[i + 1]);
    return value;
  }

  static void require(boolean condition, String message) {
    if (!condition) throw new IllegalArgumentException(message);
  }
}
