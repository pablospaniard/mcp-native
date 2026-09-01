package io.github.pablospaniard.mcpnativefixture.fabric

import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.viewmanagers.McpNativeStatusBadgeManagerDelegate
import com.facebook.react.viewmanagers.McpNativeStatusBadgeManagerInterface

@ReactModule(name = McpNativeStatusBadgeViewManager.REACT_CLASS)
class McpNativeStatusBadgeViewManager :
  SimpleViewManager<McpNativeStatusBadgeView>(),
  McpNativeStatusBadgeManagerInterface<McpNativeStatusBadgeView> {
  private val delegate = McpNativeStatusBadgeManagerDelegate(this)

  override fun getDelegate(): ViewManagerDelegate<McpNativeStatusBadgeView> = delegate

  override fun getName(): String = REACT_CLASS

  override fun createViewInstance(context: ThemedReactContext): McpNativeStatusBadgeView =
    McpNativeStatusBadgeView(context)

  @ReactProp(name = "label")
  override fun setLabel(view: McpNativeStatusBadgeView, value: String?) {
    view.text = value.orEmpty()
  }

  @ReactProp(name = "tone")
  override fun setTone(view: McpNativeStatusBadgeView, value: String?) {
    view.setTone(value)
  }

  companion object {
    const val REACT_CLASS = "McpNativeStatusBadge"
  }
}
