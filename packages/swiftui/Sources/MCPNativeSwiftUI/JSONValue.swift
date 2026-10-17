import CoreFoundation
import Foundation

public enum JSONValue: Sendable, Equatable, Codable {
  case object([String: JSONValue])
  case array([JSONValue])
  case string(String)
  case number(Double)
  case bool(Bool)
  case null

  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    if container.decodeNil() { self = .null }
    else if let value = try? container.decode(Bool.self) { self = .bool(value) }
    else if let value = try? container.decode(Double.self), value.isFinite { self = .number(value) }
    else if let value = try? container.decode(String.self) { self = .string(value) }
    else if let value = try? container.decode([JSONValue].self) { self = .array(value) }
    else { self = .object(try container.decode([String: JSONValue].self)) }
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .object(let value): try container.encode(value)
    case .array(let value): try container.encode(value)
    case .string(let value): try container.encode(value)
    case .number(let value): try container.encode(value)
    case .bool(let value): try container.encode(value)
    case .null: try container.encodeNil()
    }
  }

  public var object: [String: JSONValue]? {
    guard case .object(let value) = self else { return nil }
    return value
  }

  public var array: [JSONValue]? {
    guard case .array(let value) = self else { return nil }
    return value
  }

  public var string: String? {
    guard case .string(let value) = self else { return nil }
    return value
  }

  public var number: Double? {
    guard case .number(let value) = self else { return nil }
    return value
  }

  public var bool: Bool? {
    guard case .bool(let value) = self else { return nil }
    return value
  }
}

enum BoundedJSON {
  static let maximumBytes = 1_048_576
  static let maximumDepth = 132
  static let maximumValues = 20_000
  static let maximumStringCodeUnits = 1_048_576

  static func decode(_ data: Data) throws -> JSONValue {
    guard data.count <= maximumBytes else { throw RendererError.bridgeLimit }
    var depth = 0
    var quoted = false
    var escaped = false
    for byte in data {
      if quoted {
        if escaped { escaped = false }
        else if byte == 92 { escaped = true }
        else if byte == 34 { quoted = false }
      } else if byte == 34 { quoted = true }
      else if byte == 123 || byte == 91 {
        depth += 1
        guard depth <= maximumDepth else { throw RendererError.bridgeLimit }
      } else if byte == 125 || byte == 93 { depth -= 1 }
    }
    let value = try JSONDecoder().decode(JSONValue.self, from: data)
    var count = 0
    var strings = 0
    func inspect(_ value: JSONValue) throws {
      count += 1
      guard count <= maximumValues else { throw RendererError.bridgeLimit }
      switch value {
      case .object(let object):
        for (key, child) in object {
          strings += key.utf16.count
          try inspect(child)
        }
      case .array(let array): try array.forEach(inspect)
      case .string(let string): strings += string.utf16.count
      case .number, .bool, .null: break
      }
      guard strings <= maximumStringCodeUnits else { throw RendererError.bridgeLimit }
    }
    try inspect(value)
    return value
  }

  static func encode(_ value: JSONValue) throws -> Data {
    let data = try JSONEncoder().encode(value)
    guard data.count <= maximumBytes else { throw RendererError.bridgeLimit }
    return data
  }
}
