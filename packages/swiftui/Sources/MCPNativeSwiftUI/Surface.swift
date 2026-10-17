import Foundation
import SwiftUI

public struct Surface: View {
  @ObservedObject private var session: RendererSession
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  public init(session: RendererSession) { self.session = session }

  public var body: some View {
    Group {
      if let publication = session.publication {
        NodeView(node: publication.root, session: session)
          .id("\(publication.generation):\(publication.surfaceIncarnation)")
      }
    }
    .transaction { transaction in
      if reduceMotion { transaction.animation = nil }
    }
  }
}

private struct NodeView: View {
  let node: NativeNode
  @ObservedObject var session: RendererSession

  var body: some View {
    mapped.nativeAccessibility(node.props)
  }

  @ViewBuilder private var mapped: some View {
    switch node.component {
    case "View": container
    case "Text": Text(node.props["children"]?.string ?? "")
    case "Button": button
    case "TextInput": textInput
    case "CheckBox": checkBox
    case "ChoicePicker": choicePicker
    case "Slider": slider
    case "DateTimeInput": dateTimeInput
    case "Tabs": TabsNode(node: node, session: session)
    case "Modal": ModalNode(node: node, session: session)
    case "Divider": divider
    case "Icon": Image(systemName: symbolName(node.props["name"]?.string))
    case "Image": resource(session.catalog.image, fallback: "photo")
    case "Video": resource(session.catalog.video, fallback: "video")
    case "AudioPlayer": resource(session.catalog.audio, fallback: "speaker.wave.2")
    case "HostExtension": extensionView
    default: EmptyView()
    }
  }

  @ViewBuilder private var container: some View {
    let layout = node.props["layout"]?.string
    let variant = node.props["variant"]?.string
    if layout == "row" {
      HStack(alignment: verticalAlignment(node.props["align"]?.string)) {
        children
      }
    } else if variant == "list" {
      LazyVStack(alignment: horizontalAlignment(node.props["align"]?.string)) { children }
    } else if variant == "card" {
      VStack(alignment: horizontalAlignment(node.props["align"]?.string)) { children }
        .padding()
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 12))
    } else {
      VStack(alignment: horizontalAlignment(node.props["align"]?.string)) { children }
    }
  }

  private var children: some View {
    ForEach(node.children) { child in NodeView(node: child, session: session) }
  }

  private var baseButton: some View {
    Button(node.props["title"]?.string ?? node.props["accessibilityLabel"]?.string ?? "") {
      if let controlID = node.controlID { Task { await session.activate(controlID: controlID) } }
      else if let url = node.props["openUrl"]?.object?["url"]?.string {
        Task { await session.open(url) }
      }
    }
    .disabled(node.props["disabled"]?.bool == true)
  }

  @ViewBuilder private var button: some View {
    if node.props["variant"]?.string == "borderless" { baseButton.buttonStyle(.plain) }
    else { baseButton }
  }

  private var textInput: some View {
    let value = node.props["value"]?.string ?? ""
    let binding = Binding(
      get: { value },
      set: { next in
        if let controlID = node.controlID { session.input(controlID: controlID, value: .string(next)) }
      }
    )
    return Group {
      #if os(tvOS)
        TextField(node.props["placeholder"]?.string ?? "", text: binding)
      #else
      if node.props["variant"]?.string == "longText" {
        TextEditor(text: binding)
      } else if node.props["variant"]?.string == "obscured" {
        SecureField(node.props["placeholder"]?.string ?? "", text: binding)
      } else {
        TextField(node.props["placeholder"]?.string ?? "", text: binding)
      }
      #endif
    }
  }

  private var checkBox: some View {
    Toggle(
      node.props["label"]?.string ?? "",
      isOn: Binding(
        get: { node.props["value"]?.bool ?? false },
        set: { value in
          if let controlID = node.controlID { session.input(controlID: controlID, value: .bool(value)) }
        }
      )
    )
  }

  @ViewBuilder private var choicePicker: some View {
    ChoicePickerNode(node: node, session: session)
  }

  private var slider: some View {
    let minimum = node.props["minimum"]?.number ?? 0
    let maximum = node.props["maximum"]?.number ?? 1
    let step = node.props["step"]?.number ?? (maximum - minimum) / 100
    let value = node.props["value"]?.number ?? minimum
    guard minimum.isFinite, maximum.isFinite, step.isFinite, value.isFinite,
      minimum < maximum, step > 0, value >= minimum, value <= maximum
    else { return AnyView(EmptyView()) }
    #if os(tvOS)
      return AnyView(HStack {
        if let label = node.props["label"]?.string { Text(label) }
        Button("−") {
          if let controlID = node.controlID {
            session.input(
              controlID: controlID,
              value: .number(max(minimum, value - step))
            )
          }
        }
        Text(String(value))
        Button("+") {
          if let controlID = node.controlID {
            session.input(
              controlID: controlID,
              value: .number(min(maximum, value + step))
            )
          }
        }
      })
    #else
      return AnyView(VStack(alignment: .leading) {
      if let label = node.props["label"]?.string { Text(label) }
      Slider(
        value: Binding(
          get: { value },
          set: { value in
            if let controlID = node.controlID { session.input(controlID: controlID, value: .number(value)) }
          }
        ), in: minimum...maximum, step: step
      )
      })
    #endif
  }

  private var dateTimeInput: some View {
    DateTimeInputNode(node: node, session: session)
  }

  @ViewBuilder private var divider: some View {
    if node.props["axis"]?.string == "vertical" { Divider().frame(maxHeight: .infinity) }
    else { Divider() }
  }

  @ViewBuilder private func resource(_ factory: HostCatalog.ResourceView?, fallback: String) -> some View {
    if let factory, let grant = resourceGrant(node.props["resourcePolicy"]) {
      factory(node, grant)
    } else {
      Label(node.props["accessibilityLabel"]?.string ?? node.component, systemImage: fallback)
    }
  }

  @ViewBuilder private var extensionView: some View {
    let key = "\(node.props["catalogId"]?.string ?? "")#\(node.props["componentName"]?.string ?? "")"
    if let registration = session.catalog.extensions[key],
      registration.manifestFingerprint == node.props["manifestFingerprint"]?.string
    {
      registration.view(node) { name, payload, userActivated in
        session.emitHostExtensionEvent(
          from: node, name: name, payload: payload, userActivated: userActivated
        )
      }
    }
    else { EmptyView() }
  }
}

private struct ChoicePickerNode: View {
  let node: NativeNode
  @ObservedObject var session: RendererSession
  @State private var selected: [String]

  init(node: NativeNode, session: RendererSession) {
    self.node = node
    self.session = session
    _selected = State(initialValue: node.props["value"]?.array?.compactMap(\.string) ?? [])
  }

  var body: some View {
    let options = node.props["options"]?.array ?? []
    Group {
      if node.props["variant"]?.string == "multipleSelection" {
        VStack(alignment: .leading) {
          if let label = node.props["label"]?.string { Text(label).font(.caption) }
          ForEach(Array(options.enumerated()), id: \.offset) { _, option in
            if let object = option.object, let value = object["value"]?.string {
              Toggle(
                object["label"]?.string ?? value,
                isOn: Binding(
                  get: { selected.contains(value) },
                  set: { enabled in update(value, enabled: enabled) }
                )
              )
            }
          }
        }
      } else {
        Picker(
          node.props["label"]?.string ?? "",
          selection: Binding(
            get: { selected.first ?? "" },
            set: { value in updateSingle(value) }
          )
        ) {
          if selected.isEmpty { Text("Select").tag("") }
          ForEach(Array(options.enumerated()), id: \.offset) { _, option in
            if let object = option.object, let value = object["value"]?.string {
              Text(object["label"]?.string ?? value).tag(value)
            }
          }
        }
      }
    }
    .onChange(of: node.props["value"]?.array?.compactMap(\.string) ?? []) { _, value in
      selected = value
    }
  }

  private func update(_ value: String, enabled: Bool) {
    var next = selected.filter { $0 != value }
    if enabled { next.append(value) }
    selected = next
    publish(next)
  }

  private func updateSingle(_ value: String) {
    let next = value.isEmpty ? [] : [value]
    selected = next
    publish(next)
  }

  private func publish(_ value: [String]) {
    guard let controlID = node.controlID else { return }
    session.input(controlID: controlID, value: .array(value.map(JSONValue.string)))
  }
}

private struct DateTimeInputNode: View {
  let node: NativeNode
  @ObservedObject var session: RendererSession
  @State private var selection: Date
  @State private var draft: String

  init(node: NativeNode, session: RendererSession) {
    self.node = node
    self.session = session
    let value = node.props["value"]?.string ?? ""
    _selection = State(initialValue: parseDateTime(value, props: node.props) ?? Date())
    _draft = State(initialValue: value)
  }

  @ViewBuilder
  var body: some View {
    #if os(tvOS)
      TextField(
        node.props["label"]?.string ?? "",
        text: Binding(get: { draft }, set: { draft = $0 })
      )
      .onSubmit { publish(draft) }
      .disabled(node.props["disabled"]?.bool == true || node.controlID == nil)
      .onChange(of: node.props["value"]?.string ?? "") { _, value in draft = value }
    #else
    DatePicker(
      node.props["label"]?.string ?? "",
      selection: Binding(
        get: { selection },
        set: { next in
          selection = next
          publish(next)
        }
      ),
      displayedComponents: displayedComponents
    )
    .environment(\.timeZone, TimeZone(secondsFromGMT: 0)!)
    .disabled(node.props["disabled"]?.bool == true || node.controlID == nil)
    .onChange(of: node.props["value"]?.string) { _, value in
      if let next = parseDateTime(value, props: node.props) { selection = next }
    }
    #endif
  }

  #if !os(tvOS)
  private var displayedComponents: DatePickerComponents {
    var components: DatePickerComponents = []
    if node.props["enableDate"]?.bool == true { components.insert(.date) }
    if node.props["enableTime"]?.bool == true { components.insert(.hourAndMinute) }
    return components
  }
  #endif

  private func publish(_ date: Date) {
    guard let controlID = node.controlID,
      isWithinBounds(date, props: node.props),
      let value = formatDateTime(date, props: node.props)
    else { return }
    session.input(controlID: controlID, value: .string(value))
  }

  private func publish(_ value: String) {
    guard let controlID = node.controlID else { return }
    if value.isEmpty {
      session.input(controlID: controlID, value: .string(value))
      return
    }
    guard let date = parseDateTime(value, props: node.props), isWithinBounds(date, props: node.props)
    else { return }
    session.input(controlID: controlID, value: .string(value))
  }
}

private func parseDateTime(_ value: String?, props: [String: JSONValue]) -> Date? {
  guard let value, !value.isEmpty else { return nil }
  let enableDate = props["enableDate"]?.bool == true
  let enableTime = props["enableTime"]?.bool == true
  if enableDate && enableTime {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = formatter.date(from: value) { return date }
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.date(from: value)
  }
  if enableDate {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyy-MM-dd"
    formatter.isLenient = false
    return formatter.date(from: value)
  }
  for format in [
    "HH:mm:ss.SSSSSSSSSXXXXX", "HH:mm:ssXXXXX", "HH:mmXXXXX",
    "HH:mm:ss.SSSSSSSSS", "HH:mm:ss", "HH:mm",
  ] {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.defaultDate = Date(timeIntervalSince1970: 0)
    formatter.dateFormat = format
    formatter.isLenient = false
    if let date = formatter.date(from: value) { return date }
  }
  return nil
}

private func formatDateTime(_ date: Date, props: [String: JSONValue]) -> String? {
  let enableDate = props["enableDate"]?.bool == true
  let enableTime = props["enableTime"]?.bool == true
  if enableDate && enableTime {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.string(from: date)
  }
  if enableDate {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: date)
  }
  guard enableTime else { return nil }
  let components = Calendar(identifier: .gregorian).dateComponents(
    in: TimeZone(secondsFromGMT: 0)!, from: date)
  guard let hour = components.hour, let minute = components.minute, let second = components.second else {
    return nil
  }
  return String(format: "%02d:%02d:%02d", hour, minute, second)
}

private func isWithinBounds(_ date: Date, props: [String: JSONValue]) -> Bool {
  if let minimum = parseDateTime(props["minimum"]?.string, props: props), date < minimum { return false }
  if let maximum = parseDateTime(props["maximum"]?.string, props: props), date > maximum { return false }
  return true
}

private extension View {
  @ViewBuilder func nativeAccessibility(_ props: [String: JSONValue]) -> some View {
    let hidden = props["accessibilityHidden"]?.bool == true
    let label = props["accessibilityLabel"]?.string
    let hint = props["accessibilityHint"]?.string
    if hidden { accessibilityHidden(true) }
    else if let label, let hint { accessibilityLabel(Text(label)).accessibilityHint(Text(hint)) }
    else if let label { accessibilityLabel(Text(label)) }
    else if let hint { accessibilityHint(Text(hint)) }
    else { self }
  }
}

private struct TabsNode: View {
  let node: NativeNode
  @ObservedObject var session: RendererSession
  @State private var selection = 0

  var body: some View {
    let tabs = node.props["tabs"]?.array ?? []
    VStack {
      Picker("", selection: $selection) {
        ForEach(Array(tabs.enumerated()), id: \.offset) { index, tab in
          Text(tab.object?["title"]?.string ?? "").tag(index)
        }
      }.pickerStyle(.segmented)
      if node.children.indices.contains(selection) {
        NodeView(node: node.children[selection], session: session)
      }
    }
  }
}

private struct ModalNode: View {
  let node: NativeNode
  @ObservedObject var session: RendererSession
  @State private var presented = false

  @ViewBuilder
  var body: some View {
    if let trigger = node.children.first {
      let triggerButton = Button(
        trigger.props["title"]?.string ?? trigger.props["accessibilityLabel"]?.string ?? "Open"
      ) {
        presented = true
        if let controlID = trigger.controlID {
          Task { await session.activate(controlID: controlID) }
        } else if let url = trigger.props["openUrl"]?.object?["url"]?.string {
          Task { await session.open(url) }
        }
      }
      .disabled(trigger.props["disabled"]?.bool == true)
      if trigger.props["variant"]?.string == "borderless" {
        triggerButton.buttonStyle(.plain).sheet(isPresented: $presented) { content }
      } else {
        triggerButton.sheet(isPresented: $presented) { content }
      }
    }
  }

  @ViewBuilder private var content: some View {
    if node.children.count == 2 {
      NodeView(node: node.children[1], session: session).padding()
    }
  }
}

private func resourceGrant(_ value: JSONValue?) -> ResourceGrant? {
  guard let object = value?.object,
    let maximumBytes = exactNonNegativeInteger(object["maximumBytes"]), maximumBytes > 0,
    let maximumRedirects = exactNonNegativeInteger(object["maximumRedirects"] ?? .number(0)),
    let maximumDecodedWidth = exactOptionalPositiveInteger(object["maximumDecodedWidth"]),
    let maximumDecodedHeight = exactOptionalPositiveInteger(object["maximumDecodedHeight"]),
    let maximumDecodedPixels = exactOptionalPositiveInteger(object["maximumDecodedPixels"])
  else { return nil }
  return ResourceGrant(
    allowedOrigins: object["allowedRedirectOrigins"]?.array?.compactMap(\.string) ?? [],
    allowedMIMETypes: object["allowedMimeTypes"]?.array?.compactMap(\.string) ?? [],
    maximumBytes: maximumBytes, maximumRedirects: maximumRedirects,
    maximumDecodedWidth: maximumDecodedWidth,
    maximumDecodedHeight: maximumDecodedHeight,
    maximumDecodedPixels: maximumDecodedPixels,
    allowsAutoplay: object["allowsAutoplay"]?.bool ?? false,
    allowsBackgroundPlayback: object["allowsBackgroundPlayback"]?.bool ?? false,
    allowsExternalRoutes: object["allowsExternalRoutes"]?.bool ?? false,
    requiresUserActivation: object["requiresUserActivation"]?.bool ?? true
  )
}

private func exactNonNegativeInteger(_ value: JSONValue?) -> Int? {
  guard let number = value?.number, number >= 0, number.rounded() == number else { return nil }
  return Int(exactly: number)
}

private func exactOptionalPositiveInteger(_ value: JSONValue?) -> Int?? {
  guard let value else { return .some(nil) }
  guard let result = exactNonNegativeInteger(value), result > 0 else { return nil }
  return .some(.some(result))
}

private func horizontalAlignment(_ value: String?) -> HorizontalAlignment {
  switch value { case "end": return .trailing; case "center": return .center; default: return .leading }
}

private func verticalAlignment(_ value: String?) -> VerticalAlignment {
  switch value { case "end": return .bottom; case "center": return .center; default: return .top }
}

private func symbolName(_ name: String?) -> String {
  let names = [
    "accountCircle": "person.crop.circle", "add": "plus", "arrowBack": "arrow.backward",
    "arrowForward": "arrow.forward", "calendarToday": "calendar", "check": "checkmark",
    "close": "xmark", "delete": "trash", "download": "arrow.down.circle", "edit": "pencil",
    "error": "xmark.octagon", "favorite": "heart.fill", "favoriteOff": "heart",
    "help": "questionmark.circle", "home": "house", "info": "info.circle", "lock": "lock",
    "lockOpen": "lock.open", "mail": "envelope", "menu": "line.3.horizontal",
    "notifications": "bell", "notificationsOff": "bell.slash", "pause": "pause.fill",
    "play": "play.fill", "refresh": "arrow.clockwise", "search": "magnifyingglass",
    "send": "paperplane", "settings": "gearshape", "share": "square.and.arrow.up",
    "star": "star.fill", "starHalf": "star.leadinghalf.filled", "starOff": "star",
    "stop": "stop.fill", "upload": "arrow.up.circle", "visibility": "eye",
    "visibilityOff": "eye.slash", "warning": "exclamationmark.triangle",
  ]
  return names[name ?? ""] ?? "questionmark.square.dashed"
}
