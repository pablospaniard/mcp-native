import Foundation
import JavaScriptCore

final class JavaScriptSession: SemanticSession {
  private var context: JSContext?
  private var exchange: JSValue?
  private let token = UUID().uuidString
  private var sequence = 0

  init(bundle: String, host: JSON, timestamp: String) throws {
    guard let context = JSContext() else { throw ProbeError.harness("JavaScriptCore unavailable") }
    self.context = context
    // This is the only evaluated source: a fixed, locally built, app-bundled file.
    context.evaluateScript(bundle)
    guard context.exception == nil,
      let api = context.objectForKeyedSubscript("NativeExperiment"),
      let function = api.objectForKeyedSubscript("exchange"), !function.isUndefined
    else {
      throw ProbeError.harness(
        "Host bundle failed to initialize: \(context.exception?.toString() ?? "missing API")")
    }
    exchange = function
    _ = try call(
      .object([
        "op": .string("open"), "token": .string(token), "sequence": .number(0),
        "host": host, "timestamp": .string(timestamp),
      ]))
  }

  private func call(_ request: JSON) throws -> JSON {
    guard let context, let exchange else { throw ProbeError.harness("Closed JavaScript session") }
    let data = try request.data()
    guard data.count <= 1_048_576, let source = String(data: data, encoding: .utf8) else {
      throw ProbeError.harness("Request byte limit")
    }
    context.exception = nil
    guard let result = exchange.call(withArguments: [source]), context.exception == nil,
      let text = result.toString(), text.utf8.count <= 1_048_576
    else {
      close()
      throw ProbeError.harness("JavaScript exchange failed")
    }
    let response = try JSON.decode(Data(text.utf8))
    guard response["ok"] == .bool(true), let value = response["value"] else {
      close()
      throw ProbeError.harness(
        "JavaScript session rejected request: \(try string(response["diagnostic"] ?? .string("unknown")))"
      )
    }
    return value
  }

  func step(_ input: JSON) throws -> JSON {
    sequence += 1
    return try call(
      .object([
        "op": .string("step"), "token": .string(token), "sequence": .number(Double(sequence)),
        "step": input,
      ]))
  }

  func close() {
    // Release both managed values and the context; no native callbacks can retain the VM.
    exchange = nil
    context = nil
  }

  static func probe() throws -> JSON {
    guard let context = JSContext() else { throw ProbeError.harness("JavaScriptCore unavailable") }
    let source = """
      JSON.stringify({intl: typeof Intl, dateTimeFormat: typeof Intl.DateTimeFormat,
      numberFormat: typeof Intl.NumberFormat, pluralRules: typeof Intl.PluralRules,
      structuredClone: typeof structuredClone, textEncoder: typeof TextEncoder,
      url: typeof URL, promises: typeof Promise, map: typeof Map})
      """
    guard let text = context.evaluateScript(source)?.toString(), context.exception == nil else {
      throw ProbeError.harness("Engine probe failed")
    }
    return try JSON.decode(Data(text.utf8))
  }
}
