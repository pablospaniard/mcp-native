import CoreFoundation
import Foundation

enum ProbeError: Error, CustomStringConvertible {
  case invalid(String)
  case harness(String)
  var description: String {
    switch self {
    case .invalid(let s), .harness(let s): return s
    }
  }
}

indirect enum JSON: Equatable {
  case object([String: JSON])
  case array([JSON])
  case string(String)
  case number(Double)
  case bool(Bool)
  case null

  subscript(_ key: String) -> JSON? {
    guard case .object(let value) = self else { return nil }
    return value[key]
  }

  // A 64-node render path adds a node object and children array per level, plus the
  // bridge envelope, observation, view array and leaf validation-message array.
  static let bridgeResponseMaxDepth = 2 * 64 + 4

  static func decode(_ data: Data, maxDepth: Int = 64) throws -> JSON {
    guard data.count <= 1_048_576 else { throw ProbeError.invalid("JSON byte limit") }
    // Bound nesting before Foundation allocates the parsed object graph.
    var depth = 0
    var quoted = false
    var escaped = false
    for byte in data {
      if quoted {
        if escaped {
          escaped = false
        } else if byte == 92 {
          escaped = true
        } else if byte == 34 {
          quoted = false
        }
      } else if byte == 34 {
        quoted = true
      } else if byte == 123 || byte == 91 {
        depth += 1
        guard depth <= maxDepth else { throw ProbeError.invalid("JSON depth limit") }
      } else if byte == 125 || byte == 93 {
        depth -= 1
      }
    }
    let raw = try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
    var values = 0
    var strings = 0
    func convert(_ value: Any) throws -> JSON {
      values += 1
      guard values <= 10_000 else { throw ProbeError.invalid("JSON value limit") }
      func count(_ s: String) throws {
        strings += s.utf16.count
        guard s.utf16.count <= 65_536, strings <= 1_048_576 else {
          throw ProbeError.invalid("JSON string budget")
        }
      }
      if let s = value as? String {
        try count(s)
        return .string(s)
      }
      if let n = value as? NSNumber {
        if CFGetTypeID(n) == CFBooleanGetTypeID() { return .bool(n.boolValue) }
        guard n.doubleValue.isFinite else { throw ProbeError.invalid("Non-finite number") }
        return .number(n.doubleValue)
      }
      if value is NSNull { return .null }
      if let a = value as? [Any] { return .array(try a.map(convert)) }
      if let o = value as? NSDictionary {
        var result: [String: JSON] = [:]
        for (rawKey, item) in o {
          // Swift Dictionary keys use canonical Unicode equality. Keep this probe's keys ASCII
          // instead of silently merging distinct JSON keys; string values remain full Unicode.
          guard let key = rawKey as? String, key.utf8.allSatisfy({ $0 < 128 }) else {
            throw ProbeError.invalid("Experiment requires ASCII JSON keys")
          }
          try count(key)
          result[key] = try convert(item)
        }
        return .object(result)
      }
      throw ProbeError.invalid("Non-JSON value")
    }
    return try convert(raw)
  }

  func data() throws -> Data {
    func raw(_ value: JSON) -> Any {
      switch value {
      case .object(let o): return o.mapValues(raw)
      case .array(let a): return a.map(raw)
      case .string(let s): return s
      case .number(let n): return n
      case .bool(let b): return b
      case .null: return NSNull()
      }
    }
    return try JSONSerialization.data(
      withJSONObject: raw(self), options: [.sortedKeys, .fragmentsAllowed])
  }
}

func object(_ value: JSON?) throws -> [String: JSON] {
  guard case .object(let o) = value else { throw ProbeError.invalid("Expected object") }
  return o
}
func array(_ value: JSON?) throws -> [JSON] {
  guard case .array(let a) = value else { throw ProbeError.invalid("Expected array") }
  return a
}
func string(_ value: JSON?) throws -> String {
  guard case .string(let s) = value else { throw ProbeError.invalid("Expected string") }
  return s
}
func boolean(_ value: JSON?) throws -> Bool {
  guard case .bool(let b) = value else { throw ProbeError.invalid("Expected boolean") }
  return b
}
func keys(_ o: [String: JSON], required: Set<String>, optional: Set<String> = []) throws {
  guard required.isSubset(of: Set(o.keys)), Set(o.keys).isSubset(of: required.union(optional))
  else {
    throw ProbeError.invalid("Unknown or missing field")
  }
}
func identifier(_ value: JSON?) throws -> String {
  let s = try string(value)
  guard !s.isEmpty, s.utf16.count <= 128, s.utf8.allSatisfy({ $0 < 128 }) else {
    throw ProbeError.invalid("Experiment requires bounded ASCII identifiers")
  }
  return s
}

func pointerTokens(_ pointer: String) throws -> [String] {
  guard pointer.hasPrefix("/"), pointer.utf16.count <= 65_536 else {
    throw ProbeError.invalid("Expected absolute pointer")
  }
  let parts = pointer.dropFirst().split(separator: "/", omittingEmptySubsequences: false)
  guard parts.count <= 64 else { throw ProbeError.invalid("Pointer depth limit") }
  return try parts.map { part in
    let chars = Array(part)
    for index in chars.indices where chars[index] == "~" {
      guard index + 1 < chars.count, chars[index + 1] == "0" || chars[index + 1] == "1" else {
        throw ProbeError.invalid("Invalid pointer escape")
      }
    }
    return part.replacingOccurrences(of: "~1", with: "/").replacingOccurrences(of: "~0", with: "~")
  }
}

func readPointer(_ model: JSON, _ pointer: String) throws -> JSON {
  if pointer.isEmpty { return model }
  var cursor = model
  for token in try pointerTokens(pointer) {
    switch cursor {
    case .object(let o):
      guard let next = o[token] else { throw ProbeError.invalid("Missing binding") }
      cursor = next
    case .array(let a):
      guard let i = Int(token), String(i) == token, a.indices.contains(i) else {
        throw ProbeError.invalid("Invalid array pointer")
      }
      cursor = a[i]
    default: throw ProbeError.invalid("Invalid pointer parent")
    }
  }
  return cursor
}

func writePointer(_ model: JSON, _ pointer: String, _ value: JSON, existing: Bool) throws -> JSON {
  if pointer.isEmpty {
    _ = try object(value)
    return value
  }
  let tokens = try pointerTokens(pointer)
  func replace(_ cursor: JSON, _ index: Int) throws -> JSON {
    let key = tokens[index]
    let last = index == tokens.count - 1
    switch cursor {
    case .object(var o):
      if existing && o[key] == nil { throw ProbeError.invalid("Missing binding") }
      o[key] = last ? value : try replace(o[key] ?? .object([:]), index + 1)
      return .object(o)
    case .array(var a):
      guard let i = Int(key), String(i) == key, a.indices.contains(i) else {
        throw ProbeError.invalid("Invalid array pointer")
      }
      a[i] = last ? value : try replace(a[i], index + 1)
      return .array(a)
    default: throw ProbeError.invalid("Invalid pointer parent")
    }
  }
  return try replace(model, 0)
}
