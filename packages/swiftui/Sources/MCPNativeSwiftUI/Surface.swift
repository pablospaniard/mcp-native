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
    let options = node.props["options"]?.array ?? []
    let selected = node.props["value"]?.array?.compactMap(\.string) ?? []
    if node.props["variant"]?.string == "multipleSelection" {
      VStack(alignment: .leading) {
        if let label = node.props["label"]?.string { Text(label).font(.caption) }
        ForEach(Array(options.enumerated()), id: \.offset) { _, option in
          let object = option.object ?? [:]
          let value = object["value"]?.string ?? ""
          Toggle(
            object["label"]?.string ?? value,
            isOn: Binding(
              get: { selected.contains(value) },
              set: { enabled in
                var next = selected.filter { $0 != value }
                if enabled { next.append(value) }
                if let controlID = node.controlID {
                  session.input(controlID: controlID, value: .array(next.map(JSONValue.string)))
                }
              }
            )
          )
        }
      }
    } else {
      Picker(
        node.props["label"]?.string ?? "",
        selection: Binding(
          get: { selected.first ?? "" },
          set: { value in
            if let controlID = node.controlID {
              session.input(controlID: controlID, value: .array([.string(value)]))
            }
          }
        )
      ) {
        ForEach(Array(options.enumerated()), id: \.offset) { _, option in
          let object = option.object ?? [:]
          Text(object["label"]?.string ?? "").tag(object["value"]?.string ?? "")
        }
      }
    }
  }

  private var slider: some View {
    let minimum = node.props["minimum"]?.number ?? 0
    let maximum = node.props["maximum"]?.number ?? 1
    let step = node.props["step"]?.number ?? (maximum - minimum) / 100
    #if os(tvOS)
      return HStack {
        if let label = node.props["label"]?.string { Text(label) }
        Button("−") {
          if let controlID = node.controlID {
            session.input(
              controlID: controlID,
              value: .number(max(minimum, (node.props["value"]?.number ?? minimum) - step))
            )
          }
        }
        Text(String(node.props["value"]?.number ?? minimum))
        Button("+") {
          if let controlID = node.controlID {
            session.input(
              controlID: controlID,
              value: .number(min(maximum, (node.props["value"]?.number ?? minimum) + step))
            )
          }
        }
      }
    #else
      return VStack(alignment: .leading) {
      if let label = node.props["label"]?.string { Text(label) }
      Slider(
        value: Binding(
          get: { node.props["value"]?.number ?? minimum },
          set: { value in
            if let controlID = node.controlID { session.input(controlID: controlID, value: .number(value)) }
          }
        ), in: minimum...maximum, step: step
      )
      }
    #endif
  }

  private var dateTimeInput: some View {
    TextField(
      node.props["label"]?.string ?? "",
      text: Binding(
        get: { node.props["value"]?.string ?? "" },
        set: { value in
          if let controlID = node.controlID { session.input(controlID: controlID, value: .string(value)) }
        }
      )
    )
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
    if let factory = session.catalog.extensions[key] {
      factory(node) { name, payload, userActivated in
        session.emitHostExtensionEvent(
          from: node, name: name, payload: payload, userActivated: userActivated
        )
      }
    }
    else { EmptyView() }
  }
}

private extension View {
  @ViewBuilder func nativeAccessibility(_ props: [String: JSONValue]) -> some View {
    let hidden = props["accessibilityElementsHidden"]?.bool == true
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

  var body: some View {
    Button(node.children.first?.props["title"]?.string ?? "Open") { presented = true }
      .sheet(isPresented: $presented) {
        if node.children.count == 2 { NodeView(node: node.children[1], session: session).padding() }
      }
  }
}

private func resourceGrant(_ value: JSONValue?) -> ResourceGrant? {
  guard let object = value?.object, let maximumBytes = object["maximumBytes"]?.number else { return nil }
  return ResourceGrant(
    allowedOrigins: object["allowedRedirectOrigins"]?.array?.compactMap(\.string) ?? [],
    allowedMIMETypes: object["allowedMimeTypes"]?.array?.compactMap(\.string) ?? [],
    maximumBytes: Int(maximumBytes), maximumRedirects: Int(object["maximumRedirects"]?.number ?? 0),
    maximumDecodedWidth: object["maximumDecodedWidth"]?.number.map(Int.init),
    maximumDecodedHeight: object["maximumDecodedHeight"]?.number.map(Int.init),
    maximumDecodedPixels: object["maximumDecodedPixels"]?.number.map(Int.init),
    allowsAutoplay: object["allowsAutoplay"]?.bool ?? false,
    allowsBackgroundPlayback: object["allowsBackgroundPlayback"]?.bool ?? false,
    allowsExternalRoutes: object["allowsExternalRoutes"]?.bool ?? false,
    requiresUserActivation: object["requiresUserActivation"]?.bool ?? true
  )
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
