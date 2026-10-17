package io.github.pablospaniard.mcpnative.compose

import androidx.activity.ComponentActivity
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RendererSessionTest {
  @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
  private var session: RendererSession? = null

  @After fun close() { session?.close() }

  @Test fun rendersAndDeliversAnAuthorizedAction() = runBlocking {
    val deliveries = mutableListOf<ActionProposal>()
    val current = RendererSession.create(
      compose.activity,
      RendererPolicy(
        allowedComponentNames = listOf("Column", "Text", "Button"),
        allowedEventNames = listOf("submit"),
        locale = "en-US",
      ),
      authorize = { true },
      deliver = { deliveries += it },
    )
    session = current
    current.apply(createEnvelope)
    compose.setContent { MaterialTheme { Surface(current) } }
    compose.onNodeWithText("Hello").assertIsDisplayed()
    compose.onNodeWithContentDescription("Submit").assertIsDisplayed()
    compose.onNodeWithText("Submit").performClick()
    compose.waitUntil(timeoutMillis = 10_000) { deliveries.size == 1 }
    assertEquals(1, deliveries.size)
    assertNull(current.lastDiagnostic.value)
  }

  @Test fun deliveryFailureClearsPendingPressAndCloseIsTerminal() = runBlocking {
    var authorizationCount = 0
    val current = RendererSession.create(
      compose.activity,
      RendererPolicy(
        allowedComponentNames = listOf("Column", "Text", "Button"),
        allowedEventNames = listOf("submit"), locale = "en-US",
      ),
      authorize = { authorizationCount += 1; true },
      deliver = { error("delivery failed") },
    )
    session = current
    current.apply(createEnvelope)
    val button = requireNotNull(find(current.publication.value!!.root, "Button"))
    current.activate(requireNotNull(button.controlId))
    assertEquals("delivery-failed", current.lastDiagnostic.value)
    current.activate(requireNotNull(find(current.publication.value!!.root, "Button")?.controlId))
    assertEquals(2, authorizationCount)
    current.close()
    current.render()
    assertNull(current.publication.value)
  }

  @Test fun navigationNeedsFreshHttpsApprovalAndRepeatedRenderingStaysBounded() = runBlocking {
    var allowed = false
    val opened = mutableListOf<String>()
    val current = RendererSession.create(
      compose.activity,
      RendererPolicy(allowedComponentNames = listOf("Column", "Text", "Button"), locale = "en-US"),
      authorize = { true }, deliver = {}, authorizeOpenUrl = { allowed }, openUrl = { opened += it.toString() },
    )
    session = current
    current.open("http://example.com")
    allowed = true
    current.open("https://example.com/approved")
    assertEquals(listOf("https://example.com/approved"), opened)
    withTimeout(10_000) { repeat(100) { current.render() } }
  }

  @Test fun rejectsUnknownServerSelectedComponentsWithoutClosingTheHost() = runBlocking {
    val current = RendererSession.create(
      compose.activity,
      RendererPolicy(
        allowedComponentNames = listOf("Column", "Text", "Button"),
        allowedEventNames = listOf("submit"),
        locale = "en-US",
      ),
      authorize = { true }, deliver = {},
    )
    session = current
    current.apply(JsonValue.ObjectValue(mapOf(
      "version" to JsonValue.StringValue("v1.0"),
      "createSurface" to JsonValue.ObjectValue(mapOf(
        "surfaceId" to JsonValue.StringValue("hostile"),
        "components" to JsonValue.ArrayValue(listOf(JsonValue.ObjectValue(mapOf(
          "id" to JsonValue.StringValue("root"),
          "component" to JsonValue.StringValue("RemoteComposable"),
        )))),
      )),
    )))
    assertEquals("message-rejected", current.lastDiagnostic.value)
    current.apply(createEnvelope)
    assertEquals("View", current.publication.value?.root?.component)
  }

  private val createEnvelope = JsonValue.ObjectValue(mapOf(
    "version" to JsonValue.StringValue("v1.0"),
    "createSurface" to JsonValue.ObjectValue(mapOf(
      "surfaceId" to JsonValue.StringValue("form"),
      "components" to JsonValue.ArrayValue(listOf(
        node("root", "Column", "children" to strings("label", "submit")),
        node("label", "Text", "text" to JsonValue.StringValue("Hello")),
        node("submit", "Button",
          "child" to JsonValue.StringValue("submit-label"),
          "action" to JsonValue.ObjectValue(mapOf("event" to JsonValue.ObjectValue(mapOf("name" to JsonValue.StringValue("submit"))))),
        ),
        node("submit-label", "Text", "text" to JsonValue.StringValue("Submit")),
      )),
      "dataModel" to JsonValue.ObjectValue(emptyMap()),
    )),
  ))

  private fun node(id: String, component: String, vararg fields: Pair<String, JsonValue>) =
    JsonValue.ObjectValue(mapOf("id" to JsonValue.StringValue(id), "component" to JsonValue.StringValue(component)) + fields)

  private fun strings(vararg values: String) = JsonValue.ArrayValue(values.map(JsonValue::StringValue))

  private fun find(node: NativeNode, component: String): NativeNode? =
    if (node.component == component) node else node.children.firstNotNullOfOrNull { find(it, component) }
}

