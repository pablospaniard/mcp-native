package io.github.pablospaniard.mcpnative.compose

import androidx.compose.runtime.Composable
import java.nio.charset.StandardCharsets
import org.json.JSONArray
import org.json.JSONObject

public sealed interface JsonValue {
  public data object Null : JsonValue
  public data class BooleanValue(val value: Boolean) : JsonValue
  public data class NumberValue(val value: Double) : JsonValue
  public data class StringValue(val value: String) : JsonValue
  public data class ArrayValue(val value: List<JsonValue>) : JsonValue
  public data class ObjectValue(val value: Map<String, JsonValue>) : JsonValue
}

public object BoundedJson {
  public const val MAXIMUM_BYTES: Int = 1_048_576
  public const val MAXIMUM_DEPTH: Int = 64
  public const val MAXIMUM_VALUES: Int = 16_384
  public const val MAXIMUM_STRING_CODE_UNITS: Int = 262_144

  public fun decode(source: ByteArray): JsonValue {
    require(source.size <= MAXIMUM_BYTES) { "JSON byte limit exceeded" }
    val text = source.toString(StandardCharsets.UTF_8)
    require(text.toByteArray(StandardCharsets.UTF_8).contentEquals(source)) { "Invalid UTF-8" }
    return StrictJsonParser(text).parse()
  }

  public fun encode(value: JsonValue): String {
    var count = 0
    fun visit(item: JsonValue, depth: Int): Any {
      require(depth <= MAXIMUM_DEPTH) { "JSON depth limit exceeded" }
      count += 1
      require(count <= MAXIMUM_VALUES) { "JSON value limit exceeded" }
      return when (item) {
        JsonValue.Null -> JSONObject.NULL
        is JsonValue.BooleanValue -> item.value
        is JsonValue.NumberValue -> {
          require(item.value.isFinite()) { "Non-finite JSON number" }
          item.value
        }
        is JsonValue.StringValue -> {
          require(item.value.length <= MAXIMUM_STRING_CODE_UNITS) { "JSON string limit exceeded" }
          item.value
        }
        is JsonValue.ArrayValue -> JSONArray(item.value.map { visit(it, depth + 1) })
        is JsonValue.ObjectValue -> {
          require(item.value.keys.all { it.length <= MAXIMUM_STRING_CODE_UNITS }) { "JSON key limit exceeded" }
          JSONObject(item.value.mapValues { visit(it.value, depth + 1) })
        }
      }
    }
    val encoded = when (val raw = visit(value, 1)) {
      is String -> JSONObject.quote(raw)
      JSONObject.NULL -> "null"
      else -> raw.toString()
    }
    require(encoded.toByteArray(StandardCharsets.UTF_8).size <= MAXIMUM_BYTES) { "JSON byte limit exceeded" }
    return encoded
  }
}

private class StrictJsonParser(private val source: String) {
  private var index = 0
  private var values = 0

  fun parse(): JsonValue {
    skipWhitespace()
    val value = parseValue(1)
    skipWhitespace()
    require(index == source.length) { "Trailing JSON data" }
    return value
  }

  private fun parseValue(depth: Int): JsonValue {
    require(depth <= BoundedJson.MAXIMUM_DEPTH) { "JSON depth limit exceeded" }
    values += 1
    require(values <= BoundedJson.MAXIMUM_VALUES) { "JSON value limit exceeded" }
    require(index < source.length) { "Unexpected end of JSON" }
    return when (source[index]) {
      '{' -> parseObject(depth)
      '[' -> parseArray(depth)
      '"' -> JsonValue.StringValue(parseString("JSON string"))
      't' -> { literal("true"); JsonValue.BooleanValue(true) }
      'f' -> { literal("false"); JsonValue.BooleanValue(false) }
      'n' -> { literal("null"); JsonValue.Null }
      '-', in '0'..'9' -> parseNumber()
      else -> throw IllegalArgumentException("Invalid JSON value")
    }
  }

  private fun parseObject(depth: Int): JsonValue.ObjectValue {
    index += 1
    skipWhitespace()
    val result = linkedMapOf<String, JsonValue>()
    if (consume('}')) return JsonValue.ObjectValue(result)
    while (true) {
      require(index < source.length && source[index] == '"') { "JSON object keys must be quoted" }
      val key = parseString("JSON key")
      skipWhitespace()
      require(consume(':')) { "Missing JSON object colon" }
      skipWhitespace()
      result[key] = parseValue(depth + 1)
      skipWhitespace()
      if (consume('}')) return JsonValue.ObjectValue(result)
      require(consume(',')) { "Missing JSON object comma" }
      skipWhitespace()
    }
  }

  private fun parseArray(depth: Int): JsonValue.ArrayValue {
    index += 1
    skipWhitespace()
    val result = mutableListOf<JsonValue>()
    if (consume(']')) return JsonValue.ArrayValue(result)
    while (true) {
      result += parseValue(depth + 1)
      skipWhitespace()
      if (consume(']')) return JsonValue.ArrayValue(result)
      require(consume(',')) { "Missing JSON array comma" }
      skipWhitespace()
    }
  }

  private fun parseString(label: String): String {
    require(consume('"')) { "Expected JSON string" }
    val result = StringBuilder()
    while (index < source.length) {
      val character = source[index++]
      when {
        character == '"' -> return result.toString()
        character == '\\' -> {
          require(index < source.length) { "Incomplete JSON escape" }
          when (val escaped = source[index++]) {
            '"', '\\', '/' -> result.append(escaped)
            'b' -> result.append('\b')
            'f' -> result.append('\u000c')
            'n' -> result.append('\n')
            'r' -> result.append('\r')
            't' -> result.append('\t')
            'u' -> {
              require(index + 4 <= source.length) { "Incomplete JSON Unicode escape" }
              val codeUnit = source.substring(index, index + 4).toIntOrNull(16)
                ?: throw IllegalArgumentException("Invalid JSON Unicode escape")
              result.append(codeUnit.toChar())
              index += 4
            }
            else -> throw IllegalArgumentException("Invalid JSON escape")
          }
        }
        character.code < 0x20 -> throw IllegalArgumentException("Unescaped JSON control character")
        else -> result.append(character)
      }
      require(result.length <= BoundedJson.MAXIMUM_STRING_CODE_UNITS) { "$label limit exceeded" }
    }
    throw IllegalArgumentException("Unterminated JSON string")
  }

  private fun parseNumber(): JsonValue.NumberValue {
    val start = index
    consume('-')
    require(index < source.length) { "Incomplete JSON number" }
    if (consume('0')) {
      require(index >= source.length || source[index] !in '0'..'9') { "Invalid leading zero" }
    } else {
      require(source[index] in '1'..'9') { "Invalid JSON number" }
      while (index < source.length && source[index] in '0'..'9') index += 1
    }
    if (consume('.')) {
      require(index < source.length && source[index] in '0'..'9') { "Invalid JSON fraction" }
      while (index < source.length && source[index] in '0'..'9') index += 1
    }
    if (index < source.length && (source[index] == 'e' || source[index] == 'E')) {
      index += 1
      if (index < source.length && (source[index] == '+' || source[index] == '-')) index += 1
      require(index < source.length && source[index] in '0'..'9') { "Invalid JSON exponent" }
      while (index < source.length && source[index] in '0'..'9') index += 1
    }
    val value = source.substring(start, index).toDouble()
    require(value.isFinite()) { "Non-finite JSON number" }
    return JsonValue.NumberValue(value)
  }

  private fun literal(expected: String) {
    require(source.regionMatches(index, expected, 0, expected.length)) { "Invalid JSON literal" }
    index += expected.length
  }

  private fun consume(expected: Char): Boolean {
    if (index >= source.length || source[index] != expected) return false
    index += 1
    return true
  }

  private fun skipWhitespace() {
    while (index < source.length) {
      when (source[index]) {
        ' ', '\t', '\r', '\n' -> index += 1
        else -> return
      }
    }
  }
}

public data class ResourceGrant(
  val allowedOrigins: List<String>,
  val allowedMimeTypes: List<String> = emptyList(),
  val maximumBytes: Int,
  val maximumRedirects: Int = 0,
  val maximumDecodedWidth: Int? = null,
  val maximumDecodedHeight: Int? = null,
  val maximumDecodedPixels: Int? = null,
  val allowsAutoplay: Boolean = false,
  val allowsBackgroundPlayback: Boolean = false,
  val allowsExternalRoutes: Boolean = false,
  val requiresUserActivation: Boolean = true,
) {
  init {
    require(maximumBytes > 0)
    require(maximumRedirects >= 0)
    require(maximumDecodedWidth == null || maximumDecodedWidth > 0)
    require(maximumDecodedHeight == null || maximumDecodedHeight > 0)
    require(maximumDecodedPixels == null || maximumDecodedPixels > 0)
  }
}

public data class HostExtensionGrant(
  val manifest: JsonValue.ObjectValue,
  val permissions: List<String> = emptyList(),
  val resources: List<String> = emptyList(),
)

public data class RendererPolicy(
  val allowedComponentNames: List<String>,
  val allowedEventNames: List<String> = emptyList(),
  val allowedFunctionNames: List<String> = emptyList(),
  val locale: String,
  val imageGrants: Map<String, ResourceGrant> = emptyMap(),
  val mediaGrants: Map<String, ResourceGrant> = emptyMap(),
  val hostExtensions: List<HostExtensionGrant> = emptyList(),
  val maximumOperations: Int = 10_000,
) {
  init {
    require(maximumOperations in 1..100_000)
    require(locale.length in 2..128)
  }
}

public data class ActionProposal(val envelope: JsonValue, val dataModel: JsonValue?)

public data class HostExtensionEvent(
  val extensionId: String,
  val catalogId: String,
  val schemaVersion: String,
  val componentName: String,
  val surfaceId: String,
  val sourceComponentId: String,
  val name: String,
  val payload: JsonValue,
  val userActivated: Boolean,
)

public data class NativeNode(
  val id: String,
  val component: String,
  val props: Map<String, JsonValue>,
  val children: List<NativeNode>,
  val controlId: String?,
)

public data class Publication(
  val generation: Int,
  val renderRevision: Int,
  val serverModelRevision: Int,
  val surfaceIncarnation: Int,
  val root: NativeNode,
)

public fun interface ResourceContent {
  @Composable public fun Render(node: NativeNode, grant: ResourceGrant)
}

public fun interface ExtensionContent {
  @Composable public fun Render(node: NativeNode, emit: (String, JsonValue, Boolean) -> Unit)
}

public data class ExtensionRegistration(
  val manifestFingerprint: String,
  val content: ExtensionContent,
)

public data class HostCatalog(
  val image: ResourceContent? = null,
  val video: ResourceContent? = null,
  val audio: ResourceContent? = null,
  val extensions: Map<String, ExtensionRegistration> = emptyMap(),
)

internal val JsonValue.string: String? get() = (this as? JsonValue.StringValue)?.value
internal val JsonValue.boolean: Boolean? get() = (this as? JsonValue.BooleanValue)?.value
internal val JsonValue.number: Double? get() = (this as? JsonValue.NumberValue)?.value
internal val JsonValue.array: List<JsonValue>? get() = (this as? JsonValue.ArrayValue)?.value
internal val JsonValue.obj: Map<String, JsonValue>? get() = (this as? JsonValue.ObjectValue)?.value

