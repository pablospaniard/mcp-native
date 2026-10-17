import Combine
import Foundation

public typealias ActionAuthorizer = @MainActor @Sendable (ActionProposal) async -> Bool
public typealias ActionDeliverer = @MainActor @Sendable (ActionProposal) async throws -> Void
public typealias OpenURLAuthorizer = @MainActor @Sendable (URL) async -> Bool
public typealias OpenURLHandler = @MainActor @Sendable (URL) async -> Void
public typealias HostExtensionEventHandler = @MainActor @Sendable (HostExtensionEvent) -> Void

@MainActor
public final class RendererSession: ObservableObject {
  @Published public private(set) var publication: Publication?
  @Published public private(set) var lastDiagnostic: String?

  public let policy: RendererPolicy
  public var catalog: HostCatalog
  private let authorize: ActionAuthorizer
  private let deliver: ActionDeliverer
  private let authorizeOpenURL: OpenURLAuthorizer
  private let openURLHandler: OpenURLHandler
  private let extensionEventHandler: HostExtensionEventHandler
  private var bridge: JavaScriptBridge?

  public init(
    policy: RendererPolicy, catalog: HostCatalog = HostCatalog(),
    authorize: @escaping ActionAuthorizer,
    deliver: @escaping ActionDeliverer,
    authorizeOpenURL: @escaping OpenURLAuthorizer = { _ in false },
    openURL: @escaping OpenURLHandler = { _ in },
    onHostExtensionEvent: @escaping HostExtensionEventHandler = { _ in }
  ) throws {
    self.policy = policy
    self.catalog = catalog
    self.authorize = authorize
    self.deliver = deliver
    self.authorizeOpenURL = authorizeOpenURL
    self.openURLHandler = openURL
    self.extensionEventHandler = onHostExtensionEvent
    bridge = try JavaScriptBridge(policy: policy)
  }

  public func apply(_ envelope: JSONValue) {
    perform("apply", fields: ["envelope": envelope])
  }

  public func apply(data: Data) throws {
    apply(try BoundedJSON.decode(data))
  }

  public func render() { perform("render") }

  public func input(controlID: String, value: JSONValue) {
    perform("input", fields: ["controlID": .string(controlID), "value": value])
  }

  public func activate(controlID: String) async {
    guard let bridge else { return }
    do {
      let started = try bridge.call(
        operation: "press",
        fields: [
          "controlID": .string(controlID),
          "timestamp": .string(ISO8601DateFormatter().string(from: Date())),
        ]
      )
      guard let pressID = started.object?["pressID"]?.string else {
        consumeOperation(started)
        return
      }
      var finished = false
      defer {
        if !finished {
          _ = try? bridge.call(operation: "cancel", fields: ["pressID": .string(pressID)])
        }
      }
      var authorizationHandled = false
      var deliveryHandled = false
      for _ in 0..<32 {
        await Task.yield()
        let state = try bridge.call(operation: "poll", fields: ["pressID": .string(pressID)])
        guard let object = state.object, let kind = object["kind"]?.string else {
          throw RendererError.invalidResponse
        }
        if kind == "authorizing", !authorizationHandled, let raw = object["proposal"] {
          let proposal = try decodeProposal(raw)
          let allowed = await authorize(proposal)
          _ = try bridge.call(
            operation: "authorize",
            fields: ["pressID": .string(pressID), "allowed": .bool(allowed)]
          )
          authorizationHandled = true
        } else if kind == "delivering", !deliveryHandled, let raw = object["proposal"] {
          let proposal = try decodeProposal(raw)
          var succeeded = true
          do { try await deliver(proposal) } catch { succeeded = false }
          _ = try bridge.call(
            operation: "delivered",
            fields: ["pressID": .string(pressID), "succeeded": .bool(succeeded)]
          )
          deliveryHandled = true
        } else if kind == "complete" {
          let result = try bridge.call(operation: "finish", fields: ["pressID": .string(pressID)])
          finished = true
          consumeOperation(result)
          return
        }
      }
      throw RendererError.rejected("action did not settle within the bounded bridge budget")
    } catch {
      lastDiagnostic = String(describing: error)
    }
  }

  public func open(_ urlString: String) async {
    guard let url = URL(string: urlString), let scheme = url.scheme?.lowercased(),
      scheme == "https", await authorizeOpenURL(url)
    else {
      lastDiagnostic = "rejected open URL"
      return
    }
    await openURLHandler(url)
    lastDiagnostic = nil
  }

  public func emitHostExtensionEvent(
    from node: NativeNode, name: String, payload: JSONValue, userActivated: Bool
  ) {
    guard let bridge else { return }
    do {
      let result = try bridge.call(
        operation: "extensionEvent",
        fields: [
          "catalogId": .string(node.props["catalogId"]?.string ?? ""),
          "componentName": .string(node.props["componentName"]?.string ?? ""),
          "surfaceId": .string(node.props["surfaceId"]?.string ?? ""),
          "sourceComponentId": .string(node.props["sourceComponentId"]?.string ?? ""),
          "name": .string(name), "payload": payload, "userActivated": .bool(userActivated),
        ]
      )
      if result.object?["kind"]?.string == "rejected" {
        lastDiagnostic = result.object?["code"]?.string ?? "extension-event-rejected"
        return
      }
      guard let event = result.object?["event"]?.object else { throw RendererError.invalidResponse }
      extensionEventHandler(HostExtensionEvent(
        extensionID: event["extensionId"]?.string ?? "",
        catalogID: event["catalogId"]?.string ?? "",
        schemaVersion: event["schemaVersion"]?.string ?? "",
        componentName: event["componentName"]?.string ?? "",
        surfaceID: event["surfaceId"]?.string ?? "",
        sourceComponentID: event["sourceComponentId"]?.string ?? "",
        name: event["name"]?.string ?? "", payload: event["payload"] ?? .object([:]),
        userActivated: event["userActivated"]?.bool ?? false
      ))
    } catch { lastDiagnostic = String(describing: error) }
  }

  public func close() {
    bridge?.close()
    bridge = nil
    publication = nil
  }

  private func perform(_ operation: String, fields: [String: JSONValue] = [:]) {
    guard let bridge else { return }
    do { consumeOperation(try bridge.call(operation: operation, fields: fields)) }
    catch { lastDiagnostic = String(describing: error) }
  }

  private func consumeOperation(_ value: JSONValue) {
    guard let object = value.object, let kind = object["kind"]?.string else {
      lastDiagnostic = "invalid semantic result"
      return
    }
    switch kind {
    case "published":
      do {
        guard let plan = object["plan"] else { throw RendererError.invalidResponse }
        var nodeCount = 0
        let root = try decodeNode(plan, count: &nodeCount, depth: 1)
        publication = Publication(
          generation: try integer(object["generation"]),
          renderRevision: try integer(object["renderRevision"]),
          serverModelRevision: try integer(object["serverModelRevision"]),
          surfaceIncarnation: try integer(object["surfaceIncarnation"]),
          root: root
        )
        lastDiagnostic = nil
      } catch { lastDiagnostic = String(describing: error); publication = nil }
    case "unmounted": publication = nil; lastDiagnostic = object["code"]?.string
    case "rejected", "denied": lastDiagnostic = object["code"]?.string ?? kind
    case "delivered": lastDiagnostic = nil
    case "unchanged": break
    default: lastDiagnostic = "unknown semantic result"
    }
  }
}

private func integer(_ value: JSONValue?) throws -> Int {
  guard let number = value?.number, number.rounded() == number, let result = Int(exactly: number) else {
    throw RendererError.invalidResponse
  }
  return result
}

private let nativeComponentNames: Set<String> = [
  "AudioPlayer", "Button", "CheckBox", "ChoicePicker", "DateTimeInput", "Divider",
  "HostExtension", "Icon", "Image", "Modal", "Slider", "Tabs", "Text", "TextInput", "Video",
  "View",
]

private func decodeNode(_ value: JSONValue, count: inout Int, depth: Int) throws -> NativeNode {
  count += 1
  guard count <= 1_024, depth <= 64 else { throw RendererError.bridgeLimit }
  guard let object = value.object, let id = object["id"]?.string,
    let component = object["component"]?.string, let props = object["props"]?.object,
    let childValues = object["children"]?.array, nativeComponentNames.contains(component),
    !id.isEmpty, id.utf16.count <= 1_024,
    object["controlID"] == nil || object["controlID"]?.string?.wholeMatch(of: /c[0-9]+/) != nil
  else { throw RendererError.invalidResponse }
  return NativeNode(
    id: id, component: component, props: props,
    children: try childValues.map { try decodeNode($0, count: &count, depth: depth + 1) },
    controlID: object["controlID"]?.string
  )
}

private func decodeProposal(_ value: JSONValue) throws -> ActionProposal {
  guard let object = value.object, let envelope = object["envelope"] else {
    throw RendererError.invalidResponse
  }
  return ActionProposal(envelope: envelope, dataModel: object["dataModel"])
}
