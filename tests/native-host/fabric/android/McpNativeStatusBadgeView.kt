package io.github.pablospaniard.mcpnativefixture.fabric

import android.content.Context
import android.graphics.Color
import android.view.Gravity
import android.widget.TextView

class McpNativeStatusBadgeView(context: Context) : TextView(context) {
  init {
    gravity = Gravity.CENTER
    setTextColor(Color.rgb(38, 38, 38))
    setBackgroundColor(Color.rgb(232, 232, 232))
  }

  fun setTone(tone: String?) {
    when (tone) {
      "positive" -> {
        setTextColor(Color.rgb(13, 82, 36))
        setBackgroundColor(Color.rgb(214, 242, 222))
      }
      "negative" -> {
        setTextColor(Color.rgb(140, 20, 15))
        setBackgroundColor(Color.rgb(255, 227, 224))
      }
      else -> {
        setTextColor(Color.rgb(38, 38, 38))
        setBackgroundColor(Color.rgb(232, 232, 232))
      }
    }
  }
}
