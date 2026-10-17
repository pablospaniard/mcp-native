import XCTest
@testable import MCPNativeSwiftUI

@MainActor
final class RendererSessionTests: XCTestCase {
  private let policy = RendererPolicy(
    allowedComponentNames: ["Column", "Text", "TextField", "CheckBox", "Button"],
    allowedEventNames: ["submit"], allowedFunctionNames: ["required"], locale: "en-US"
  )

  func testLifecycleBindingsAndAuthorizedAction() async throws {
    var deliveries: [ActionProposal] = []
    let session = try RendererSession(
      policy: policy, authorize: { _ in true }, deliver: { deliveries.append($0) }
    )
    session.apply(createEnvelope)
    let publication = try XCTUnwrap(session.publication)
    XCTAssertEqual(publication.root.component, "View")
    let field = try XCTUnwrap(find(publication.root, component: "TextInput"))
    session.input(controlID: try XCTUnwrap(field.controlID), value: .string("Grace"))
    XCTAssertEqual(find(try XCTUnwrap(session.publication).root, component: "Text")?.props["children"], .string("Grace"))

    let button = try XCTUnwrap(find(try XCTUnwrap(session.publication).root, component: "Button"))
    await session.activate(controlID: try XCTUnwrap(button.controlID))
    XCTAssertEqual(deliveries.count, 1)
    XCTAssertEqual(deliveries[0].dataModel?.object?["name"], .string("Grace"))
    XCTAssertNil(session.lastDiagnostic)
  }

  func testDeniedActionDoesNotDeliver() async throws {
    var delivered = false
    let session = try RendererSession(
      policy: policy, authorize: { _ in false }, deliver: { _ in delivered = true }
    )
    session.apply(createEnvelope)
    let button = try XCTUnwrap(find(try XCTUnwrap(session.publication).root, component: "Button"))
    await session.activate(controlID: try XCTUnwrap(button.controlID))
    XCTAssertFalse(delivered)
    XCTAssertEqual(session.lastDiagnostic, "denied")
  }

  func testRejectsUnknownComponentAndOversizedInput() throws {
    let session = try RendererSession(policy: policy, authorize: { _ in true }, deliver: { _ in })
    session.apply(.object([
      "version": .string("v1.0"),
      "createSurface": .object([
        "surfaceId": .string("bad"),
        "components": .array([.object([
          "id": .string("root"), "component": .string("RemoteCode")
        ])]),
        "dataModel": .object([:]),
      ]),
    ]))
    XCTAssertNil(session.publication)
    XCTAssertEqual(session.lastDiagnostic, "message-rejected")

    XCTAssertThrowsError(try session.apply(data: Data(repeating: 32, count: BoundedJSON.maximumBytes + 1)))
  }

  func testCloseIsTerminal() throws {
    let session = try RendererSession(policy: policy, authorize: { _ in true }, deliver: { _ in })
    session.apply(createEnvelope)
    session.close()
    XCTAssertNil(session.publication)
    session.render()
    XCTAssertNil(session.publication)
  }

  func testHostExtensionRequiresExactLocalManifestAndGrant() throws {
    let manifest = try BoundedJSON.decode(Data(extensionManifest.utf8))
    let extensionPolicy = RendererPolicy(
      allowedComponentNames: ["Column"],
      hostExtensions: [HostExtensionGrant(manifest: manifest)]
    )
    let session = try RendererSession(
      policy: extensionPolicy, authorize: { _ in true }, deliver: { _ in }
    )
    session.apply(.object([
      "version": .string("v1.0"),
      "createSurface": .object([
        "surfaceId": .string("extension"),
        "components": .array([
          .object(["id": .string("root"), "component": .string("Column"), "children": .array([.string("status")])]),
          .object([
            "id": .string("status"),
            "component": .string("io.github.pablospaniard/status-badge:StatusBadge"),
            "catalogId": .string("io.github.pablospaniard/status-badge@1"),
            "label": .string("Connected"), "tone": .string("positive"),
            "accessibility": .object(["label": .string("Connection status")]),
          ]),
        ]),
      ]),
    ]))
    let publication = try XCTUnwrap(session.publication, session.lastDiagnostic ?? "missing publication")
    let extensionNode = try XCTUnwrap(find(publication.root, component: "HostExtension"))
    XCTAssertEqual(extensionNode.props["semanticProps"]?.object?["label"], .string("Connected"))

    session.emitHostExtensionEvent(
      from: extensionNode, name: "undeclared:event", payload: .object([:]), userActivated: true
    )
    XCTAssertNotNil(session.lastDiagnostic)
  }

  private var createEnvelope: JSONValue {
    .object([
      "version": .string("v1.0"),
      "createSurface": .object([
        "surfaceId": .string("form"),
        "components": .array([
          .object(["id": .string("root"), "component": .string("Column"), "children": .array([.string("value"), .string("name"), .string("submit")])]),
          .object(["id": .string("value"), "component": .string("Text"), "text": .object(["path": .string("/name")])]),
          .object(["id": .string("name"), "component": .string("TextField"), "label": .string("Name"), "value": .object(["path": .string("/name")])]),
          .object(["id": .string("submit"), "component": .string("Button"), "child": .string("label"), "action": .object(["event": .object(["name": .string("submit")])])]),
          .object(["id": .string("label"), "component": .string("Text"), "text": .string("Submit")]),
        ]),
        "dataModel": .object(["name": .string("Ada")]),
        "sendDataModel": .bool(true),
      ]),
    ])
  }

  private func find(_ node: NativeNode, component: String) -> NativeNode? {
    if node.component == component { return node }
    return node.children.lazy.compactMap { self.find($0, component: component) }.first
  }

  private var extensionManifest: String {
    #"{"profileVersion":"1","extensionId":"io.github.pablospaniard/status-badge","catalogId":"io.github.pablospaniard/status-badge@1","catalogVersion":"1","schemaVersion":"1.0.0","componentName":"io.github.pablospaniard/status-badge:StatusBadge","propsSchema":{"type":"object","properties":{"label":{"type":"string","minLength":1,"maxLength":64},"tone":{"enum":["negative","neutral","positive"]}},"required":["label","tone"],"additionalProperties":false},"events":[],"platforms":["ios"],"accessibility":{"ownership":"host","requiresLabel":true,"behavior":"Expose one static labeled status value."},"resourceNeeds":[],"permissionNeeds":[],"limits":{"maximumInstances":4,"maximumEventPayloadValues":8,"maximumEventPayloadStringCodeUnits":256,"maximumPropsValues":8,"maximumPropsStringCodeUnits":256,"maximumUpdatesPerSurface":16},"fallback":{"kind":"reject"},"compatibility":{"owner":"MCP Native maintainers"}}"#
  }
}
