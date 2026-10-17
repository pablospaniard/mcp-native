package io.github.pablospaniard.mcpnative.compose

import androidx.compose.runtime.Composable
import java.nio.charset.StandardCharsets
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener

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
    val tokener = JSONTokener(text)
    val raw = tokener.nextValue()
    require(tokener.nextClean() == '\u0000') { "Trailing JSON data" }
    var count = 0
    fun visit(value: Any?, depth: Int): JsonValue {
      require(depth <= MAXIMUM_DEPTH) { "JSON depth limit exceeded" }
      count += 1
      require(count <= MAXIMUM_VALUES) { "JSON value limit exceeded" }
      return when (value) {
        null, JSONObject.NULL -> JsonValue.Null
        is Boolean -> JsonValue.BooleanValue(value)
        is Number -> {
          val number = value.toDouble()
          require(number.isFinite()) { "Non-finite JSON number" }
          JsonValue.NumberValue(number)
        }
        is String -> {
          require(value.length <= MAXIMUM_STRING_CODE_UNITS) { "JSON string limit exceeded" }
          JsonValue.StringValue(value)
        }
        is JSONArray -> JsonValue.ArrayValue((0 until value.length()).map { visit(value.get(it), depth + 1) })
        is JSONObject -> {
          val keys = value.keys().asSequence().toList()
          require(keys.all { it.length <= MAXIMUM_STRING_CODE_UNITS }) { "JSON key limit exceeded" }
          JsonValue.ObjectValue(keys.associateWith { visit(value.get(it), depth + 1) })
        }
        else -> error("Unsupported JSON value")
      }
    }
    return visit(raw, 1)
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

