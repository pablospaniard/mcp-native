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

  @Test fun rejectsDeepAndNonFiniteOutput() {
    var deep: JsonValue = JsonValue.Null
    repeat(BoundedJson.MAXIMUM_DEPTH + 1) { deep = JsonValue.ArrayValue(listOf(deep)) }
    assertThrows(IllegalArgumentException::class.java) { BoundedJson.encode(deep) }
    assertThrows(IllegalArgumentException::class.java) {
      BoundedJson.encode(JsonValue.NumberValue(Double.POSITIVE_INFINITY))
    }
  }
}

