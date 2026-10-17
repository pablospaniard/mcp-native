package io.github.pablospaniard.mcpnative.compose

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SharedConformanceTest {
  @Test fun everySharedCorpusCaseCrossesTheAndroidEngineBoundary() = runBlocking {
    val context = ApplicationProvider.getApplicationContext<android.content.Context>()
    val suite = context.assets.open("basic-form.json").use { BoundedJson.decode(it.readBytes()) }.obj!!
    assertEquals("8ff4651232ab0e02b0123730b502711170637a3a", suite["schemaRevision"]?.string)
    val cases = suite["cases"]?.array.orEmpty()
    assertEquals(21, cases.size)
    var accepted = 0
    var rejected = 0
    for (caseValue in cases) {
      val fixture = caseValue.obj!!
      val host = fixture["host"]!!.obj!!
      val session = RendererSession.create(
        context,
        RendererPolicy(
          allowedComponentNames = host.strings("componentNames"),
          allowedEventNames = host.strings("eventNames"),
          allowedFunctionNames = host.strings("functionNames"),
          locale = "en-US",
        ),
        authorize = { host["authorizeActions"]?.boolean == true },
        deliver = {},
      )
      try {
        val firstMessage = fixture["steps"]!!.array!!.first { it.obj?.get("op")?.string == "message" }.obj!!
        session.apply(firstMessage["message"]!!)
        when (firstMessage["expect"]!!.obj!!["outcome"]!!.string) {
          "accepted" -> {
            assertNull(fixture["id"]!!.string, session.lastDiagnostic.value)
            assertNotNull(fixture["id"]!!.string, session.publication.value)
            accepted += 1
          }
          "message-rejected", "surface-rejected" -> {
            assertNotNull(session.lastDiagnostic.value)
            assertNull(session.publication.value)
            rejected += 1
          }
        }
      } finally {
        session.close()
      }
    }
    assertTrue(accepted > 0)
    assertTrue(rejected > 0)
  }
}

private fun Map<String, JsonValue>.strings(name: String): List<String> =
  get(name)?.array?.mapNotNull { it.string }.orEmpty()

