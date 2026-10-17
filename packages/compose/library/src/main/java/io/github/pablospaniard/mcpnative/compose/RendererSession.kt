package io.github.pablospaniard.mcpnative.compose

import android.content.Context
import android.net.Uri
import java.io.Closeable
import java.time.Instant
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.yield
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext

public typealias ActionAuthorizer = suspend (ActionProposal) -> Boolean
public typealias ActionDeliverer = suspend (ActionProposal) -> Unit
public typealias OpenUrlAuthorizer = suspend (Uri) -> Boolean
public typealias OpenUrlHandler = suspend (Uri) -> Unit
public typealias HostExtensionEventHandler = (HostExtensionEvent) -> Unit

public class RendererSession private constructor(
  public val policy: RendererPolicy,
  public val catalog: HostCatalog,
  private val bridge: JavaScriptBridge,
  private val authorize: ActionAuthorizer,
  private val deliver: ActionDeliverer,
  private val authorizeOpenUrl: OpenUrlAuthorizer,
  private val openUrlHandler: OpenUrlHandler,
  private val extensionEventHandler: HostExtensionEventHandler,
) : Closeable {
  private val mutablePublication = MutableStateFlow<Publication?>(null)
  private val mutableDiagnostic = MutableStateFlow<String?>(null)
  public val publication: StateFlow<Publication?> = mutablePublication.asStateFlow()
  public val lastDiagnostic: StateFlow<String?> = mutableDiagnostic.asStateFlow()
  private var closed = false

  public suspend fun apply(envelope: JsonValue) {
    perform("apply", mapOf("envelope" to envelope))
  }

  public suspend fun apply(source: ByteArray) { apply(BoundedJson.decode(source)) }

  public suspend fun render() { perform("render") }

  public suspend fun input(controlId: String, value: JsonValue) {
    perform("input", mapOf("controlID" to JsonValue.StringValue(controlId), "value" to value))
  }

  public suspend fun activate(controlId: String) {
    if (closed) return
    var pressId: String? = null
    var finished = false
    try {
      val started = bridge.call(
        "press",
        mapOf(
          "controlID" to JsonValue.StringValue(controlId),
          "timestamp" to JsonValue.StringValue(Instant.now().toString()),
        ),
      )
      pressId = started.obj?.get("pressID")?.string
      if (pressId == null) {
        consumeOperation(started)
        return
      }
      var authorizationHandled = false
      var deliveryHandled = false
      repeat(32) {
        yield()
        val state = bridge.call("poll", mapOf("pressID" to JsonValue.StringValue(pressId)))
        val stateObject = state.obj ?: error("Invalid press response")
        when (stateObject["kind"]?.string) {
          "authorizing" -> if (!authorizationHandled) {
            val proposal = decodeProposal(stateObject["proposal"] ?: error("Missing proposal"))
            val allowed = authorize(proposal)
            bridge.call("authorize", mapOf(
              "pressID" to JsonValue.StringValue(pressId),
              "allowed" to JsonValue.BooleanValue(allowed),
            ))
            authorizationHandled = true
          }
          "delivering" -> if (!deliveryHandled) {
            val proposal = decodeProposal(stateObject["proposal"] ?: error("Missing proposal"))
            val succeeded = try {
              deliver(proposal)
              true
            } catch (error: Throwable) {
              if (error is CancellationException) throw error
              false
            }
            bridge.call("delivered", mapOf(
              "pressID" to JsonValue.StringValue(pressId),
              "succeeded" to JsonValue.BooleanValue(succeeded),
            ))
            deliveryHandled = true
          }
          "complete" -> {
            val result = bridge.call("finish", mapOf("pressID" to JsonValue.StringValue(pressId)))
            finished = true
            consumeOperation(result)
            return
          }
        }
      }
      error("Action did not settle within the bounded bridge budget")
    } catch (error: Throwable) {
      if (error is CancellationException) throw error
      mutableDiagnostic.value = error.message?.take(256) ?: "Renderer action failed"
    } finally {
      if (!finished && pressId != null && !closed) {
        withContext(NonCancellable) {
          runCatching { bridge.call("cancel", mapOf("pressID" to JsonValue.StringValue(pressId))) }
        }
      }
    }
  }

  public suspend fun open(url: String) {
    val uri = runCatching { Uri.parse(url) }.getOrNull()
    if (uri == null || uri.scheme?.lowercase() != "https" || uri.host.isNullOrBlank() || !authorizeOpenUrl(uri)) {
      mutableDiagnostic.value = "rejected open URL"
      return
    }
    openUrlHandler(uri)
    mutableDiagnostic.value = null
  }

  public suspend fun emitHostExtensionEvent(
    node: NativeNode,
    name: String,
    payload: JsonValue,
    userActivated: Boolean,
  ) {
    try {
      val result = bridge.call("extensionEvent", mapOf(
        "catalogId" to JsonValue.StringValue(node.props["catalogId"]?.string.orEmpty()),
        "componentName" to JsonValue.StringValue(node.props["componentName"]?.string.orEmpty()),
        "surfaceId" to JsonValue.StringValue(node.props["surfaceId"]?.string.orEmpty()),
        "sourceComponentId" to JsonValue.StringValue(node.props["sourceComponentId"]?.string.orEmpty()),
        "name" to JsonValue.StringValue(name),
        "payload" to payload,
        "userActivated" to JsonValue.BooleanValue(userActivated),
      ))
      val resultObject = result.obj ?: error("Invalid extension event response")
      if (resultObject["kind"]?.string == "rejected") {
        mutableDiagnostic.value = resultObject["code"]?.string ?: "extension-event-rejected"
        return
      }
      val event = resultObject["event"]?.obj ?: error("Missing extension event")
      extensionEventHandler(HostExtensionEvent(
        extensionId = event["extensionId"]?.string.orEmpty(),
        catalogId = event["catalogId"]?.string.orEmpty(),
        schemaVersion = event["schemaVersion"]?.string.orEmpty(),
        componentName = event["componentName"]?.string.orEmpty(),
        surfaceId = event["surfaceId"]?.string.orEmpty(),
        sourceComponentId = event["sourceComponentId"]?.string.orEmpty(),
        name = event["name"]?.string.orEmpty(),
        payload = event["payload"] ?: JsonValue.ObjectValue(emptyMap()),
        userActivated = event["userActivated"]?.boolean == true,
      ))
      mutableDiagnostic.value = null
    } catch (error: Throwable) {
      mutableDiagnostic.value = error.message?.take(256) ?: "Extension event failed"
    }
  }

  override fun close() {
    if (closed) return
    closed = true
    bridge.close()
    mutablePublication.value = null
  }

  private suspend fun perform(operation: String, fields: Map<String, JsonValue> = emptyMap()) {
    if (closed) return
    try { consumeOperation(bridge.call(operation, fields)) }
    catch (error: Throwable) { mutableDiagnostic.value = error.message?.take(256) ?: "Renderer operation failed" }
  }

  private fun consumeOperation(value: JsonValue) {
    val objectValue = value.obj ?: run { mutableDiagnostic.value = "invalid semantic result"; return }
    when (val kind = objectValue["kind"]?.string) {
      "published" -> try {
        var count = 0
        val root = decodeNode(objectValue["plan"] ?: error("Missing render plan"), 1) { count += 1; count }
        mutablePublication.value = Publication(
          generation = objectValue.integer("generation"),
          renderRevision = objectValue.integer("renderRevision"),
          serverModelRevision = objectValue.integer("serverModelRevision"),
          surfaceIncarnation = objectValue.integer("surfaceIncarnation"),
          root = root,
        )
        mutableDiagnostic.value = null
      } catch (error: Throwable) {
        mutablePublication.value = null
        mutableDiagnostic.value = error.message?.take(256) ?: "Invalid render plan"
      }
      "unmounted" -> { mutablePublication.value = null; mutableDiagnostic.value = objectValue["code"]?.string }
      "rejected", "denied" -> mutableDiagnostic.value = objectValue["code"]?.string ?: kind
      "delivered" -> mutableDiagnostic.value = null
      "unchanged" -> Unit
      else -> mutableDiagnostic.value = "unknown semantic result"
    }
  }

  public companion object {
    public suspend fun create(
      context: Context,
      policy: RendererPolicy,
      catalog: HostCatalog = HostCatalog(),
      authorize: ActionAuthorizer,
      deliver: ActionDeliverer,
      authorizeOpenUrl: OpenUrlAuthorizer = { false },
      openUrl: OpenUrlHandler = {},
      onHostExtensionEvent: HostExtensionEventHandler = {},
    ): RendererSession = RendererSession(
      policy, catalog, JavaScriptBridge.create(context.applicationContext, policy), authorize,
      deliver, authorizeOpenUrl, openUrl, onHostExtensionEvent,
    )
  }
}

private val nativeComponentNames = setOf(
  "AudioPlayer", "Button", "CheckBox", "ChoicePicker", "DateTimeInput", "Divider",
  "HostExtension", "Icon", "Image", "Modal", "Slider", "Tabs", "Text", "TextInput", "Video", "View",
)

private fun decodeNode(value: JsonValue, depth: Int, count: () -> Int): NativeNode {
  require(depth <= 64 && count() <= 1_024) { "Render plan limit exceeded" }
  val item = value.obj ?: error("Invalid render node")
  val id = item["id"]?.string ?: error("Missing render node ID")
  val component = item["component"]?.string ?: error("Missing render component")
  require(id.isNotEmpty() && id.length <= 1_024 && component in nativeComponentNames)
  val controlId = item["controlID"]?.string
  require(controlId == null || Regex("c[0-9]+").matches(controlId))
  return NativeNode(
    id = id,
    component = component,
    props = item["props"]?.obj ?: error("Missing render props"),
    children = item["children"]?.array?.map { decodeNode(it, depth + 1, count) }
      ?: error("Missing render children"),
    controlId = controlId,
  )
}

private fun decodeProposal(value: JsonValue): ActionProposal {
  val item = value.obj ?: error("Invalid action proposal")
  return ActionProposal(item["envelope"] ?: error("Missing action envelope"), item["dataModel"])
}

private fun Map<String, JsonValue>.integer(name: String): Int {
  val value = get(name)?.number ?: error("Missing integer")
  require(value.isFinite() && value % 1.0 == 0.0 && value in Int.MIN_VALUE.toDouble()..Int.MAX_VALUE.toDouble())
  return value.toInt()
}

