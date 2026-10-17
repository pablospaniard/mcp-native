package io.github.pablospaniard.mcpnative.compose

import android.content.Context
import androidx.javascriptengine.IsolateStartupParameters
import androidx.javascriptengine.JavaScriptIsolate
import androidx.javascriptengine.JavaScriptSandbox
import androidx.javascriptengine.Message
import androidx.javascriptengine.MessagePort
import com.google.common.util.concurrent.ListenableFuture
import java.io.Closeable
import java.util.UUID
import java.util.concurrent.Executor
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeout

internal class JavaScriptBridge private constructor(
  private val sandbox: JavaScriptSandbox,
  private val isolate: JavaScriptIsolate,
  private val port: MessagePort,
  private val token: String,
) : Closeable {
  private val mutex = Mutex()
  private var sequence = 0
  private var pending: CompletableDeferred<String>? = null
  private var closed = false

  suspend fun call(operation: String, fields: Map<String, JsonValue> = emptyMap()): JsonValue =
    mutex.withLock {
      check(!closed) { "Renderer bridge is closed" }
      val nextSequence = if (operation == "open") 0 else sequence + 1
      val request = JsonValue.ObjectValue(
        linkedMapOf(
          "token" to JsonValue.StringValue(token),
          "sequence" to JsonValue.NumberValue(nextSequence.toDouble()),
          "op" to JsonValue.StringValue(operation),
        ) + fields,
      )
      val waiter = CompletableDeferred<String>()
      check(pending == null) { "Concurrent renderer bridge request" }
      pending = waiter
      try {
        port.postMessage(Message.createStringMessage(BoundedJson.encode(request)))
        val response = BoundedJson.decode(withTimeout(CALL_TIMEOUT_MILLIS) { waiter.await() }.encodeToByteArray())
        val objectValue = response.obj ?: error("Invalid renderer bridge response")
        check(objectValue["ok"]?.boolean == true) {
          objectValue["diagnostic"]?.string ?: "Renderer bridge rejected request"
        }
        sequence = nextSequence
        objectValue["value"] ?: JsonValue.Null
      } catch (error: Throwable) {
        close()
        throw error
      } finally {
        pending = null
      }
    }

  override fun close() {
    if (closed) return
    closed = true
    pending?.cancel()
    port.close()
    isolate.close()
    sandbox.close()
  }

  private fun fail(error: Throwable) {
    pending?.completeExceptionally(error)
    close()
  }

  companion object {
    private const val HEAP_LIMIT_BYTES = 64L * 1024 * 1024
    private const val CALL_TIMEOUT_MILLIS = 10_000L
    private const val PORT_NAME = "mcp-native-renderer"
    private val directExecutor = Executor { it.run() }
    private val requiredFeatures = listOf(
      JavaScriptSandbox.JS_FEATURE_MESSAGE_PORTS,
      JavaScriptSandbox.JS_FEATURE_PROMISE_RETURN,
      JavaScriptSandbox.JS_FEATURE_ISOLATE_TERMINATION,
      JavaScriptSandbox.JS_FEATURE_ISOLATE_MAX_HEAP_SIZE,
      JavaScriptSandbox.JS_FEATURE_EVALUATE_WITHOUT_TRANSACTION_LIMIT,
    )

    suspend fun create(context: Context, policy: RendererPolicy): JavaScriptBridge {
      val sandbox = JavaScriptSandbox.createConnectedInstanceAsync(context).await()
      var isolate: JavaScriptIsolate? = null
      var port: MessagePort? = null
      try {
        requiredFeatures.forEach { check(sandbox.isFeatureSupported(it)) { "Missing JavaScript engine feature: $it" } }
        val limits = IsolateStartupParameters().apply {
          maxHeapSizeBytes = HEAP_LIMIT_BYTES
          maxEvaluationReturnSizeBytes = BoundedJson.MAXIMUM_BYTES
        }
        isolate = sandbox.createIsolate(limits)
        val bundle = context.assets.open("mcp-native-runtime.js").bufferedReader().use { it.readText() }
        withTimeout(CALL_TIMEOUT_MILLIS) { isolate.evaluateJavaScriptAsync(bundle).await() }
        val waiterHolder = arrayOfNulls<JavaScriptBridge>(1)
        port = isolate.createMessageChannel(PORT_NAME, directExecutor) { message ->
          val bridge = waiterHolder[0]
          if (bridge == null || message.type != Message.TYPE_STRING) bridge?.fail(IllegalStateException("Unexpected engine message"))
          else {
            val response = message.string
            if (response.encodeToByteArray().size > BoundedJson.MAXIMUM_BYTES) bridge.fail(IllegalArgumentException("Response byte limit exceeded"))
            else bridge.pending?.complete(response) ?: bridge.fail(IllegalStateException("Unexpected engine response"))
          }
        }
        val bootstrap = """(async()=>{const p=await android.getNamedPort("$PORT_NAME");p.onmessage=({data})=>p.postMessage(MCPNativeAndroid.exchange(data));return "ready"})()"""
        check(withTimeout(CALL_TIMEOUT_MILLIS) { isolate.evaluateJavaScriptAsync(bootstrap).await() } == "ready")
        val bridge = JavaScriptBridge(sandbox, isolate, port, UUID.randomUUID().toString())
        waiterHolder[0] = bridge
        isolate.addOnTerminatedCallback(directExecutor) { info ->
          bridge.fail(IllegalStateException("JavaScript isolate terminated: ${info.status}"))
        }
        bridge.call(
          "open",
          mapOf(
            "configuration" to policy.toJson(),
            "timestamp" to JsonValue.StringValue("1970-01-01T00:00:00.000Z"),
          ),
        )
        return bridge
      } catch (error: Throwable) {
        port?.close()
        isolate?.close()
        sandbox.close()
        throw error
      }
    }
  }
}

private suspend fun <T> ListenableFuture<T>.await(): T = suspendCancellableCoroutine { continuation ->
  addListener(
    {
      try { continuation.resume(get()) }
      catch (error: Throwable) { continuation.resumeWithException(error.cause ?: error) }
    },
    Executor { it.run() },
  )
  continuation.invokeOnCancellation { cancel(true) }
}

private fun RendererPolicy.toJson(): JsonValue.ObjectValue = JsonValue.ObjectValue(
  mapOf(
    "allowedComponentNames" to allowedComponentNames.jsonStrings(),
    "allowedEventNames" to allowedEventNames.jsonStrings(),
    "allowedFunctionNames" to allowedFunctionNames.jsonStrings(),
    "locale" to JsonValue.StringValue(locale),
    "imageGrants" to JsonValue.ObjectValue(imageGrants.mapValues { it.value.toJson() }),
    "mediaGrants" to JsonValue.ObjectValue(mediaGrants.mapValues { it.value.toJson() }),
    "hostExtensions" to JsonValue.ArrayValue(hostExtensions.map {
      JsonValue.ObjectValue(mapOf(
        "manifest" to it.manifest,
        "permissions" to it.permissions.jsonStrings(),
        "resources" to it.resources.jsonStrings(),
      ))
    }),
    "maximumOperations" to JsonValue.NumberValue(maximumOperations.toDouble()),
  ),
)

private fun ResourceGrant.toJson(): JsonValue.ObjectValue = JsonValue.ObjectValue(buildMap {
  put("allowedOrigins", allowedOrigins.jsonStrings())
  put("allowedMIMETypes", allowedMimeTypes.jsonStrings())
  put("maximumBytes", JsonValue.NumberValue(maximumBytes.toDouble()))
  put("maximumRedirects", JsonValue.NumberValue(maximumRedirects.toDouble()))
  maximumDecodedWidth?.let { put("maximumDecodedWidth", JsonValue.NumberValue(it.toDouble())) }
  maximumDecodedHeight?.let { put("maximumDecodedHeight", JsonValue.NumberValue(it.toDouble())) }
  maximumDecodedPixels?.let { put("maximumDecodedPixels", JsonValue.NumberValue(it.toDouble())) }
  put("allowsAutoplay", JsonValue.BooleanValue(allowsAutoplay))
  put("allowsBackgroundPlayback", JsonValue.BooleanValue(allowsBackgroundPlayback))
  put("allowsExternalRoutes", JsonValue.BooleanValue(allowsExternalRoutes))
  put("requiresUserActivation", JsonValue.BooleanValue(requiresUserActivation))
})

private fun List<String>.jsonStrings(): JsonValue.ArrayValue =
  JsonValue.ArrayValue(map(JsonValue::StringValue))

