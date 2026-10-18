import Foundation
import JavaScriptCore

@MainActor
final class JavaScriptBridge {
  private var context: JSContext?
  private var exchange: JSValue?
  private let token = UUID().uuidString
  private var sequence = 0

  init(policy: RendererPolicy) throws {
    guard let url = Bundle.module.url(forResource: "runtime", withExtension: "js"),
      let source = try? String(contentsOf: url, encoding: .utf8),
      source.utf8.count <= 8_388_608,
      let context = JSContext()
    else { throw RendererError.bridgeUnavailable }
    self.context = context
    context.evaluateScript(source)
    guard context.exception == nil,
      let api = context.objectForKeyedSubscript("MCPNativeApple"),
      let function = api.objectForKeyedSubscript("exchange"), !function.isUndefined
    else { throw RendererError.bridgeUnavailable }
    exchange = function
    let policyData = try JSONEncoder().encode(policy)
    let policyValue = try BoundedJSON.decode(policyData)
    _ = try call(
      operation: "open",
      fields: [
        "configuration": policyValue,
        "timestamp": .string(ISO8601DateFormatter().string(from: Date())),
      ],
      opening: true
    )
  }

  func call(operation: String, fields: [String: JSONValue] = [:], opening: Bool = false) throws
    -> JSONValue
  {
    guard let context, let exchange else { throw RendererError.closed }
    if !opening { sequence += 1 }
    var request = fields
    request["op"] = .string(operation)
    request["token"] = .string(token)
    request["sequence"] = .number(Double(sequence))
    let data = try BoundedJSON.encode(.object(request))
    guard let source = String(data: data, encoding: .utf8) else { throw RendererError.invalidResponse }
    context.exception = nil
    guard let result = exchange.call(withArguments: [source]), context.exception == nil,
      let text = result.toString(), text.utf8.count <= BoundedJSON.maximumBytes
    else {
      invalidate()
      throw RendererError.bridgeUnavailable
    }
    let response = try BoundedJSON.decode(Data(text.utf8))
    guard let object = response.object, object["ok"]?.bool == true, let value = object["value"] else {
      invalidate()
      throw RendererError.rejected(response.object?["diagnostic"]?.string ?? "bridge rejected request")
    }
    return value
  }

  func close() {
    if exchange != nil { _ = try? call(operation: "close") }
    invalidate()
  }

  private func invalidate() {
    exchange = nil
    context = nil
  }
}
