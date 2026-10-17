package io.github.pablospaniard.mcpnative.compose

import android.content.Context
import android.view.View
import java.time.Instant
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Tab
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.launch

@Composable
public fun Surface(session: RendererSession, modifier: Modifier = Modifier) {
  val publication by session.publication.collectAsState()
  SessionLifecycle(session)
  Box(modifier) {
    publication?.let { current ->
      key(current.surfaceIncarnation) { NodeContent(current.root, session) }
    }
  }
}

@Composable
private fun SessionLifecycle(session: RendererSession) {
  val owner = LocalLifecycleOwner.current
  val scope = rememberCoroutineScope()
  DisposableEffect(owner, session) {
    val observer = LifecycleEventObserver { _, event ->
      when (event) {
        Lifecycle.Event.ON_START -> scope.launch { session.render() }
        Lifecycle.Event.ON_DESTROY -> session.close()
        else -> Unit
      }
    }
    owner.lifecycle.addObserver(observer)
    onDispose { owner.lifecycle.removeObserver(observer) }
  }
}

@Composable
private fun NodeContent(node: NativeNode, session: RendererSession) {
  val modifier = Modifier.nativeAccessibility(node.props)
  when (node.component) {
    "View" -> Container(node, session, modifier)
    "Text" -> Text(
      node.props["children"]?.string.orEmpty(), modifier,
      style = if (node.props["variant"]?.string == "caption") MaterialTheme.typography.bodySmall else MaterialTheme.typography.bodyLarge,
    )
    "Button" -> ActionButton(node, session, modifier)
    "TextInput" -> TextInput(node, session, modifier)
    "CheckBox" -> CheckBox(node, session, modifier)
    "ChoicePicker" -> ChoicePicker(node, session, modifier)
    "Slider" -> SliderNode(node, session, modifier)
    "DateTimeInput" -> DateTimeInput(node, session, modifier)
    "Tabs" -> Tabs(node, session, modifier)
    "Modal" -> Modal(node, session, modifier)
    "Divider" -> if (node.props["axis"]?.string == "vertical") VerticalDivider(modifier.height(24.dp)) else HorizontalDivider(modifier.fillMaxWidth())
    "Icon" -> Text(iconGlyph(node.props["name"]?.string), modifier)
    "Image" -> Resource(node, session, session.catalog.image, "Image", modifier)
    "Video" -> Resource(node, session, session.catalog.video, "Video", modifier)
    "AudioPlayer" -> Resource(node, session, session.catalog.audio, "Audio", modifier)
    "HostExtension" -> HostExtension(node, session, modifier)
  }
}

@Composable
private fun Container(node: NativeNode, session: RendererSession, modifier: Modifier) {
  val verticalArrangement = verticalArrangement(node.props["justify"]?.string)
  val decorated = if (node.props["variant"]?.string == "card") {
    modifier.padding(8.dp)
  } else modifier
  if (node.props["variant"]?.string == "list" && node.props["layout"]?.string != "row") {
    LazyColumn(decorated, horizontalAlignment = horizontalAlignment(node.props["align"]?.string)) {
      items(node.children, key = { it.id }) { NodeContent(it, session) }
    }
  } else if (node.props["layout"]?.string == "row") {
    val horizontalArrangement = horizontalArrangement(node.props["justify"]?.string)
    Row(decorated, horizontalArrangement = horizontalArrangement, verticalAlignment = verticalAlignment(node.props["align"]?.string)) {
      node.children.forEach { NodeContent(it, session) }
    }
  } else {
    Column(decorated, verticalArrangement = verticalArrangement, horizontalAlignment = horizontalAlignment(node.props["align"]?.string)) {
      node.children.forEach { NodeContent(it, session) }
    }
  }
}

@Composable
private fun ActionButton(node: NativeNode, session: RendererSession, modifier: Modifier) {
  val scope = rememberCoroutineScope()
  val enabled = node.props["disabled"]?.boolean != true
  val action: () -> Unit = {
    val controlId = node.controlId
    val url = node.props["openUrl"]?.obj?.get("url")?.string
    if (controlId != null) scope.launch { session.activate(controlId) }
    else if (url != null) scope.launch { session.open(url) }
  }
  val label = node.props["title"]?.string ?: node.props["accessibilityLabel"]?.string.orEmpty()
  if (node.props["variant"]?.string == "borderless") {
    OutlinedButton(action, modifier, enabled, border = BorderStroke(0.dp, MaterialTheme.colorScheme.surface)) { Text(label) }
  } else Button(action, modifier, enabled) { Text(label) }
}

@Composable
private fun TextInput(node: NativeNode, session: RendererSession, modifier: Modifier) {
  val scope = rememberCoroutineScope()
  val external = node.props["value"]?.string.orEmpty()
  var value by rememberSaveable(node.id) { mutableStateOf(external) }
  LaunchedEffect(external) { if (external != value) value = external }
  OutlinedTextField(
    value = value,
    onValueChange = { next ->
      value = next
      node.controlId?.let { scope.launch { session.input(it, JsonValue.StringValue(next)) } }
    },
    modifier = modifier,
    enabled = node.controlId != null && node.props["disabled"]?.boolean != true,
    label = node.props["accessibilityLabel"]?.string?.let { { Text(it) } },
    placeholder = { Text(node.props["placeholder"]?.string.orEmpty()) },
    singleLine = node.props["multiline"]?.boolean != true,
    isError = node.props["invalid"]?.boolean == true,
    visualTransformation = if (node.props["secureTextEntry"]?.boolean == true) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
    keyboardOptions = KeyboardOptions(keyboardType = if (node.props["keyboardType"]?.string == "numeric") KeyboardType.Number else KeyboardType.Text),
  )
  ValidationMessages(node)
}

@Composable
private fun CheckBox(node: NativeNode, session: RendererSession, modifier: Modifier) {
  val scope = rememberCoroutineScope()
  val checked = node.props["value"]?.boolean == true
  Row(modifier) {
    Checkbox(checked, { next -> node.controlId?.let { scope.launch { session.input(it, JsonValue.BooleanValue(next)) } } }, enabled = node.controlId != null)
    Text(node.props["label"]?.string.orEmpty())
  }
  ValidationMessages(node)
}

@Composable
private fun ChoicePicker(node: NativeNode, session: RendererSession, modifier: Modifier) {
  val scope = rememberCoroutineScope()
  val external = node.props["value"]?.array?.mapNotNull { it.string }.orEmpty()
  val selected = remember(node.id) { mutableStateListOf<String>().apply { addAll(external) } }
  LaunchedEffect(external) { selected.clear(); selected.addAll(external) }
  val options = node.props["options"]?.array.orEmpty().mapNotNull { value ->
    value.obj?.let { item -> item["value"]?.string?.let { it to (item["label"]?.string ?: it) } }
  }
  fun publish(next: List<String>) {
    selected.clear(); selected.addAll(next)
    node.controlId?.let { id -> scope.launch { session.input(id, JsonValue.ArrayValue(next.map(JsonValue::StringValue))) } }
  }
  Column(modifier) {
    node.props["label"]?.string?.let { Text(it) }
    if (node.props["variant"]?.string == "multipleSelection") {
      options.forEach { (value, label) ->
        Row {
          Checkbox(selected.contains(value), { enabled -> publish(if (enabled) selected + value else selected - value) })
          Text(label)
        }
      }
    } else {
      var expanded by remember { mutableStateOf(false) }
      OutlinedButton({ expanded = true }) {
        Text(options.firstOrNull { it.first == selected.firstOrNull() }?.second ?: node.props["label"]?.string.orEmpty())
      }
      DropdownMenu(expanded, { expanded = false }) {
        options.forEach { (value, label) -> DropdownMenuItem({ Text(label) }, { publish(listOf(value)); expanded = false }, leadingIcon = { RadioButton(selected.firstOrNull() == value, null) }) }
      }
    }
    ValidationMessages(node)
  }
}

@Composable
private fun SliderNode(node: NativeNode, session: RendererSession, modifier: Modifier) {
  val minimum = node.props["minimumValue"]?.number ?: 0.0
  val maximum = node.props["maximumValue"]?.number ?: 1.0
  val value = node.props["value"]?.number ?: minimum
  val step = node.props["step"]?.number
  if (!minimum.isFinite() || !maximum.isFinite() || !value.isFinite() || minimum >= maximum || value !in minimum..maximum || (step != null && (!step.isFinite() || step <= 0))) return
  val scope = rememberCoroutineScope()
  val steps = if (step == null) 0 else (((maximum - minimum) / step).toInt() - 1).coerceIn(0, 10_000)
  Column(modifier) {
    node.props["label"]?.string?.let { Text(it) }
    Slider(value.toFloat(), { next -> node.controlId?.let { scope.launch { session.input(it, JsonValue.NumberValue(next.toDouble())) } } }, valueRange = minimum.toFloat()..maximum.toFloat(), steps = steps, enabled = node.controlId != null)
    ValidationMessages(node)
  }
}

@Composable
private fun DateTimeInput(node: NativeNode, session: RendererSession, modifier: Modifier) {
  val scope = rememberCoroutineScope()
  val external = node.props["value"]?.string.orEmpty()
  var value by rememberSaveable(node.id) { mutableStateOf(external) }
  LaunchedEffect(external) { value = external }
  OutlinedTextField(
    value, { next -> value = next; if (validDateTime(next, node.props)) node.controlId?.let { scope.launch { session.input(it, JsonValue.StringValue(next)) } } },
    modifier, enabled = node.controlId != null, label = { Text(node.props["label"]?.string.orEmpty()) }, singleLine = true,
  )
  ValidationMessages(node)
}

@Composable
private fun Tabs(node: NativeNode, session: RendererSession, modifier: Modifier) {
  var selected by rememberSaveable(node.id) { mutableIntStateOf(0) }
  val tabs = node.props["tabs"]?.array.orEmpty()
  Column(modifier) {
    PrimaryTabRow(selected) {
      tabs.forEachIndexed { index, item -> Tab(selected == index, { selected = index }, text = { Text(item.obj?.get("title")?.string.orEmpty()) }) }
    }
    node.children.getOrNull(selected)?.let { NodeContent(it, session) }
  }
}

@Composable
private fun Modal(node: NativeNode, session: RendererSession, modifier: Modifier) {
  var open by rememberSaveable(node.id) { mutableStateOf(false) }
  val trigger = node.children.firstOrNull() ?: return
  val scope = rememberCoroutineScope()
  Button({ open = true; trigger.controlId?.let { scope.launch { session.activate(it) } } }, modifier, trigger.props["disabled"]?.boolean != true) {
    Text(trigger.props["title"]?.string ?: "Open")
  }
  if (open) {
    BackHandler { open = false }
    AlertDialog(
      onDismissRequest = { open = false },
      confirmButton = { Button({ open = false }) { Text(stringResource(android.R.string.cancel)) } },
      text = { node.children.getOrNull(1)?.let { NodeContent(it, session) } },
    )
  }
}

@Composable
private fun Resource(node: NativeNode, session: RendererSession, content: ResourceContent?, fallback: String, modifier: Modifier) {
  val grant = resourceGrant(node.props["resourcePolicy"])
  if (content != null && grant != null) Box(modifier) { content.Render(node, grant) }
  else Text(node.props["accessibilityLabel"]?.string ?: fallback, modifier.alpha(0.7f))
}

@Composable
private fun HostExtension(node: NativeNode, session: RendererSession, modifier: Modifier) {
  val key = "${node.props["catalogId"]?.string.orEmpty()}#${node.props["componentName"]?.string.orEmpty()}"
  val registration = session.catalog.extensions[key]
  if (registration != null && registration.manifestFingerprint == node.props["manifestFingerprint"]?.string) {
    val scope = rememberCoroutineScope()
    Box(modifier) {
      registration.content.Render(node) { name, payload, activated ->
        scope.launch { session.emitHostExtensionEvent(node, name, payload, activated) }
      }
    }
  }
}

public fun androidViewExtension(
  factory: (Context) -> View,
  update: (View, NativeNode, (String, JsonValue, Boolean) -> Unit) -> Unit,
): ExtensionContent = ExtensionContent { node, emit ->
  AndroidView(factory = factory, update = { update(it, node, emit) })
}

private fun resourceGrant(value: JsonValue?): ResourceGrant? {
  val item = value?.obj ?: return null
  fun integer(name: String, positive: Boolean = false): Int? {
    val number = item[name]?.number ?: return if (positive) null else 0
    if (!number.isFinite() || number % 1.0 != 0.0 || number < (if (positive) 1.0 else 0.0) || number > Int.MAX_VALUE) return null
    return number.toInt()
  }
  val bytes = integer("maximumBytes", true) ?: return null
  val redirects = integer("maximumRedirects") ?: return null
  return ResourceGrant(
    allowedOrigins = item["allowedRedirectOrigins"]?.array?.mapNotNull { it.string }.orEmpty(),
    allowedMimeTypes = item["allowedMimeTypes"]?.array?.mapNotNull { it.string }.orEmpty(),
    maximumBytes = bytes, maximumRedirects = redirects,
    maximumDecodedWidth = item["maximumDecodedWidth"]?.let { integer("maximumDecodedWidth", true) },
    maximumDecodedHeight = item["maximumDecodedHeight"]?.let { integer("maximumDecodedHeight", true) },
    maximumDecodedPixels = item["maximumDecodedPixels"]?.let { integer("maximumDecodedPixels", true) },
    allowsAutoplay = item["allowsAutoplay"]?.boolean ?: false,
    allowsBackgroundPlayback = item["allowsBackgroundPlayback"]?.boolean ?: false,
    allowsExternalRoutes = item["allowsExternalRoutes"]?.boolean ?: false,
    requiresUserActivation = item["requiresUserActivation"]?.boolean ?: true,
  )
}

private fun Modifier.nativeAccessibility(props: Map<String, JsonValue>): Modifier = semantics {
  props["accessibilityLabel"]?.string?.let { contentDescription = it }
  if (props["accessibilityElementsHidden"]?.boolean == true || props["importantForAccessibility"]?.string == "no-hide-descendants") hideFromAccessibility()
  if (props["disabled"]?.boolean == true) disabled()
  when (props["accessibilityLiveRegion"]?.string) {
    "assertive" -> liveRegion = LiveRegionMode.Assertive
    "polite" -> liveRegion = LiveRegionMode.Polite
  }
  val nativeRole = when (props["accessibilityRole"]?.string) {
    "button" -> Role.Button
    "checkbox" -> Role.Checkbox
    "radio" -> Role.RadioButton
    "tab" -> Role.Tab
    "image" -> Role.Image
    else -> null
  }
  nativeRole?.let { role = it }
}

@Composable
private fun ValidationMessages(node: NativeNode) {
  node.props["validationMessages"]?.array?.mapNotNull { it.string }?.forEach {
    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
  }
}

private fun verticalArrangement(value: String?): Arrangement.Vertical = when (value) {
  "center" -> Arrangement.Center
  "end" -> Arrangement.Bottom
  "spaceAround" -> Arrangement.SpaceAround
  "spaceBetween" -> Arrangement.SpaceBetween
  "spaceEvenly" -> Arrangement.SpaceEvenly
  else -> Arrangement.Top
}

private fun horizontalArrangement(value: String?): Arrangement.Horizontal = when (value) {
  "center" -> Arrangement.Center
  "end" -> Arrangement.End
  "spaceAround" -> Arrangement.SpaceAround
  "spaceBetween" -> Arrangement.SpaceBetween
  "spaceEvenly" -> Arrangement.SpaceEvenly
  else -> Arrangement.Start
}

private fun horizontalAlignment(value: String?): Alignment.Horizontal = when (value) {
  "center" -> Alignment.CenterHorizontally
  "end" -> Alignment.End
  else -> Alignment.Start
}

private fun verticalAlignment(value: String?): Alignment.Vertical = when (value) {
  "center" -> Alignment.CenterVertically
  "end" -> Alignment.Bottom
  else -> Alignment.Top
}

private fun validDateTime(value: String, props: Map<String, JsonValue>): Boolean {
  if (value.isEmpty()) return true
  val date = props["enableDate"]?.boolean == true
  val time = props["enableTime"]?.boolean == true
  val valid = when {
    date && time -> runCatching { Instant.parse(value) }.isSuccess
    date -> Regex("\\d{4}-\\d{2}-\\d{2}").matches(value)
    time -> Regex("\\d{2}:\\d{2}(:\\d{2}(\\.\\d{1,9})?([+-]\\d{2}:\\d{2}|Z)?)?").matches(value)
    else -> false
  }
  return valid && (props["minimum"]?.string == null || value >= props["minimum"]!!.string!!) &&
    (props["maximum"]?.string == null || value <= props["maximum"]!!.string!!)
}

private fun iconGlyph(name: String?): String = when (name) {
  "add" -> "+"; "check" -> "✓"; "close" -> "×"; "delete" -> "⌫"; "favorite" -> "♥"
  "pause" -> "Ⅱ"; "play" -> "▶"; "search" -> "⌕"; "star" -> "★"; "warning" -> "⚠"
  else -> "●"
}

