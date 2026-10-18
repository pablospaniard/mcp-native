package io.github.pablospaniard.mcpnative.compose

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class BoundedJsonTest {
  @Test fun roundTripsStructuredValues() {
    val value = JsonValue.ObjectValue(mapOf(
      "text" to JsonValue.StringValue("مرحبا 👋"),
      "number" to JsonValue.NumberValue(42.0),
      "items" to JsonValue.ArrayValue(listOf(JsonValue.BooleanValue(true), JsonValue.Null)),
    ))
    assertEquals(value, BoundedJson.decode(BoundedJson.encode(value).encodeToByteArray()))
  }

  @Test fun rejectsOversizedInput() {
    assertThrows(IllegalArgumentException::class.java) {
      BoundedJson.decode(ByteArray(BoundedJson.MAXIMUM_BYTES + 1))
    }
    assertThrows(IllegalArgumentException::class.java) {
      BoundedJson.decode("{} true".encodeToByteArray())
    }
  }

  @Test fun rejectsLenientNonJsonSyntax() {
    listOf(
      "{'key':'value'}",
      "{key:\"value\"}",
      "[1,]",
      "{\"key\":true,}",
      "{\"key\":01}",
      "{\"key\":.5}",
      "{\"key\":\"line\nfeed\"}",
    ).forEach { source ->
      assertThrows(source, IllegalArgumentException::class.java) {
        BoundedJson.decode(source.encodeToByteArray())
      }
    }
  }

  @Test fun mapsTrustedComposeControlFields() {
    assertEquals(TextInputBehavior(multiline = true), textInputBehavior("longText"))
    assertEquals(TextInputBehavior(numeric = true), textInputBehavior("number"))
    assertEquals(TextInputBehavior(obscured = true), textInputBehavior("obscured"))
    assertEquals(TextInputBehavior(), textInputBehavior("shortText"))
    assertEquals(null, textInputBehavior("remoteVariant"))

    val slider = sliderValues(mapOf(
      "minimum" to JsonValue.NumberValue(2.0),
      "maximum" to JsonValue.NumberValue(10.0),
      "value" to JsonValue.NumberValue(6.0),
      "step" to JsonValue.NumberValue(2.0),
    ))
    assertEquals(SliderValues(2.0, 10.0, 6.0, 2.0), slider)
    assertEquals(null, sliderValues(mapOf(
      "minimumValue" to JsonValue.NumberValue(2.0),
      "maximumValue" to JsonValue.NumberValue(10.0),
    )))
    assertEquals(null, sliderValues(mapOf(
      "minimum" to JsonValue.NumberValue(-Double.MAX_VALUE),
      "maximum" to JsonValue.NumberValue(Double.MAX_VALUE),
      "value" to JsonValue.NumberValue(0.0),
    )))

    assertEquals(
      AccessibilityBehavior(hidden = true, live = "assertive"),
      accessibilityBehavior(mapOf(
        "accessibilityHidden" to JsonValue.BooleanValue(true),
        "accessibilityLive" to JsonValue.StringValue("assertive"),
      )),
    )
    assertEquals(
      AccessibilityBehavior(hidden = false, live = null),
      accessibilityBehavior(mapOf(
        "accessibilityElementsHidden" to JsonValue.BooleanValue(true),
        "accessibilityLiveRegion" to JsonValue.StringValue("assertive"),
      )),
    )
  }

  @Test fun rejectsDeepAndNonFiniteOutput() {
    var deep: JsonValue = JsonValue.Null
    repeat(BoundedJson.MAXIMUM_DEPTH + 1) { deep = JsonValue.ArrayValue(listOf(deep)) }
    assertThrows(IllegalArgumentException::class.java) { BoundedJson.encode(deep) }
    assertThrows(IllegalArgumentException::class.java) {
      BoundedJson.encode(JsonValue.NumberValue(Double.POSITIVE_INFINITY))
    }
  }
}

