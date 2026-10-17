package io.github.pablospaniard.mcpnative.compose.consumer

import android.content.Context
import androidx.compose.runtime.Composable
import io.github.pablospaniard.mcpnative.compose.RendererPolicy
import io.github.pablospaniard.mcpnative.compose.RendererSession
import io.github.pablospaniard.mcpnative.compose.Surface

object ConsumerProbe {
  suspend fun create(context: Context): RendererSession =
    RendererSession.create(
      context = context,
      policy = RendererPolicy(
        allowedComponentNames = listOf("Column", "Text"),
        allowedEventNames = emptyList(),
        locale = "en-US",
      ),
      authorize = { false },
      deliver = {},
    )

  @Composable
  fun Render(session: RendererSession) = Surface(session)
}
