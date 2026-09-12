import Foundation

protocol SemanticSession: AnyObject {
  func step(_ input: JSON) throws -> JSON
  func close()
}

// Independent, deliberately narrow v1 form interpreter. No JavaScript is called by this type.
final class NativeSession: SemanticSession {
  private var components: [String: JSON] = [:]
  private var server: JSON?
  private var local: JSON?
  private var sendModel = false
  private var view: [JSON] = []
  private var controls: [Control] = []
  private var changes: [JSON] = [], actions: [JSON] = []
  private var closed = false, steps = 0
  private var work = 0
  private let allowedComponents: Set<String>, allowedFunctions: Set<String>,
    allowedEvents: Set<String>
  private let timestamp: String

  struct Control {
    let kind: String, label: String, id: String, scope: String
    let binding: String?
    let disabled: Bool
  }

  init(host: JSON, timestamp: String) throws {
    allowedComponents = Set(try array(host["componentNames"]).map { try string($0) })
    allowedFunctions = Set(try array(host["functionNames"]).map { try string($0) })
    allowedEvents = Set(try array(host["eventNames"]).map { try string($0) })
    self.timestamp = timestamp
  }

  func close() {
    closed = true
    components = [:]
    server = nil
    local = nil
    view = []
    controls = []
    changes = []
    actions = []
  }

  func step(_ input: JSON) throws -> JSON {
    guard !closed, steps < 64 else { throw ProbeError.harness("Closed or exhausted session") }
    steps += 1
    var outcome = "accepted"
    switch try string(input["op"]) {
    case "message":
      do {
        try apply(input["message"])
        outcome = try render()
      } catch ProbeError.invalid { outcome = "message-rejected" }
    case "render": outcome = try render()
    case "resolve-event":
      do {
        guard let model = server else { throw ProbeError.harness("Missing resolver surface") }
        let (_, reachable) = try plan(model)
        let id = try identifier(input["sourceComponentId"])
        let matches = reachable.filter { $0.id == id && $0.kind == "button" && !$0.disabled }
        guard matches.count == 1 else { throw ProbeError.invalid("Unreachable event") }
        _ = try event(matches[0], model)
      } catch ProbeError.invalid { outcome = "event-rejected" }
    case "input", "press":
      let kind = try string(input["target"]?["kind"])
      let label = try string(input["target"]?["label"])
      let matches = controls.filter { $0.kind == kind && $0.label.utf8.elementsEqual(label.utf8) }
      guard matches.count == 1, let model = local else {
        throw ProbeError.harness("Interaction target is missing or ambiguous")
      }
      let control = matches[0]
      if input["op"] == .string("input") {
        do {
          guard let value = input["value"], let binding = control.binding else {
            throw ProbeError.invalid("Missing input binding")
          }
          switch kind {
          case "text-field": _ = try string(value)
          case "checkbox": _ = try boolean(value)
          default: throw ProbeError.harness("Invalid input target")
          }
          let next = try writePointer(model, binding, value, existing: true)
          _ = try JSON.decode(next.data())
          local = next
          changes.append(next)
          outcome = try render()
        } catch ProbeError.invalid { outcome = "input-rejected" }
      } else if !control.disabled {
        actions.append(try event(control, model))
      }
    default: throw ProbeError.harness("Unknown operation")
    }
    return .object([
      "outcome": .string(outcome), "serverDataModel": server ?? .null,
      "view": .array(view), "localChanges": .array(changes), "actions": .array(actions),
    ])
  }

  private func apply(_ input: JSON?) throws {
    let message = try object(input)
    guard message["version"] == .string("v1.0") else { throw ProbeError.invalid("Unknown version") }
    let operations = Set(message.keys).subtracting(["version"])
    guard operations.count == 1, let op = operations.first else {
      throw ProbeError.invalid("Ambiguous envelope")
    }
    let payload = try object(message[op])
    guard payload["surfaceId"] == .string("form") else {
      throw ProbeError.invalid("Unknown surface")
    }
    switch op {
    case "createSurface":
      try keys(
        payload, required: ["surfaceId", "components"], optional: ["dataModel", "sendDataModel"])
      guard server == nil else { throw ProbeError.invalid("Duplicate surface") }
      let next = try componentMap(payload["components"])
      let model = payload["dataModel"] ?? .object([:])
      _ = try object(model)
      let send = try boolean(payload["sendDataModel"] ?? .bool(false))
      components = next
      server = model
      local = nil
      sendModel = send
    case "updateComponents":
      try keys(payload, required: ["surfaceId", "components"])
      guard server != nil else { throw ProbeError.invalid("Missing surface") }
      let updates = try componentMap(payload["components"])
      let next = components.merging(updates) { _, new in new }
      guard next.count <= 1024 else { throw ProbeError.invalid("Component limit") }
      _ = try JSON.decode(JSON.object(next).data())
      components = next
    case "updateDataModel":
      try keys(payload, required: ["surfaceId", "value"], optional: ["path"])
      guard let model = server, let value = payload["value"] else {
        throw ProbeError.invalid("Missing surface/value")
      }
      let next = try writePointer(
        model, string(payload["path"] ?? .string("")), value, existing: false)
      _ = try JSON.decode(next.data())
      server = next
      local = nil
    case "deleteSurface":
      try keys(payload, required: ["surfaceId"])
      components = [:]
      server = nil
      local = nil
    default: throw ProbeError.invalid("Unsupported message")
    }
  }

  private func componentMap(_ input: JSON?) throws -> [String: JSON] {
    let values = try array(input)
    guard !values.isEmpty, values.count <= 1024 else { throw ProbeError.invalid("Component limit") }
    var result: [String: JSON] = [:]
    for value in values {
      let component = try object(value)
      let id = try identifier(component["id"])
      guard result[id] == nil else { throw ProbeError.invalid("Duplicate component") }
      try validateComponent(component)
      result[id] = value
    }
    return result
  }

  private func validateComponent(_ c: [String: JSON]) throws {
    let type = try string(c["component"])
    let fields: Set<String>
    switch type {
    case "Column", "List": fields = ["children"]
    case "Text": fields = ["text"]
    case "TextField": fields = ["label", "value"]
    case "CheckBox": fields = ["label", "value"]
    case "Button": fields = ["child", "action"]
    case "Divider": fields = ["axis"]
    default: throw ProbeError.invalid("Unsupported component")
    }
    try keys(
      c, required: fields.union(["id", "component"]),
      optional: type == "TextField" || type == "Button" ? ["checks"] : [])
    if let checks = c["checks"] {
      let values = try array(checks)
      guard values.count <= 32 else { throw ProbeError.invalid("Check limit") }
      for check in values {
        let value = try object(check)
        try keys(value, required: ["condition", "message"])
        try dynamicShape(value["condition"], type: "boolean")
        try dynamicShape(value["message"], type: "string")
      }
    }
    switch type {
    case "Column", "List":
      if case .array(let children) = c["children"] {
        guard children.count <= 1024 else { throw ProbeError.invalid("Child limit") }
        for child in children { _ = try identifier(child) }
      } else {
        let children = try object(c["children"])
        try keys(children, required: ["path", "componentId"])
        _ = try string(children["path"])
        _ = try identifier(children["componentId"])
      }
    case "Text": try dynamicShape(c["text"], type: "string")
    case "TextField", "CheckBox":
      try dynamicShape(c["label"], type: "string")
      try dynamicShape(c["value"], type: type == "TextField" ? "string" : "boolean")
    case "Button":
      _ = try identifier(c["child"])
      let action = try object(c["action"])
      try keys(action, required: ["event"])
      let event = try object(action["event"])
      try keys(event, required: ["name"], optional: ["context"])
      _ = try identifier(event["name"])
      for value in try object(event["context"] ?? .object([:])).values {
        try dynamicShape(value, type: "any")
      }
    case "Divider":
      guard c["axis"] == .string("horizontal") || c["axis"] == .string("vertical") else {
        throw ProbeError.invalid("Invalid axis")
      }
    default: break
    }
  }

  private func dynamicShape(_ input: JSON?, type: String) throws {
    guard let value = input else { throw ProbeError.invalid("Missing dynamic value") }
    if case .object(let o) = value {
      if o["path"] != nil {
        try keys(o, required: ["path"])
        _ = try string(o["path"])
      } else {
        try keys(o, required: ["call", "args"])
        let name = try string(o["call"])
        let args = try object(o["args"])
        switch name {
        case "required":
          guard type == "boolean" || type == "any" else {
            throw ProbeError.invalid("Function result type")
          }
          try keys(args, required: ["value"])
          try dynamicShape(args["value"], type: "any")
        case "formatDate":
          guard type == "string" || type == "any" else {
            throw ProbeError.invalid("Function result type")
          }
          try keys(args, required: ["value", "format"])
          guard args["format"] == .string("yyyy-MM-dd") else {
            throw ProbeError.invalid("Unsupported date format")
          }
          try dynamicShape(args["value"], type: "string")
        default: throw ProbeError.invalid("Unknown function")
        }
      }
    } else if type == "string" {
      _ = try string(value)
    } else if type == "boolean" {
      _ = try boolean(value)
    }
  }

  private func render() throws -> String {
    guard let model = server else {
      local = nil
      view = []
      controls = []
      return "accepted"
    }
    if local == nil { local = model }
    do {
      let (next, handlers) = try plan(local!)
      view = [next]
      controls = handlers
      return "accepted"
    } catch ProbeError.invalid {
      view = []
      controls = []
      local = nil
      return "surface-rejected"
    }
  }

  private func plan(_ model: JSON) throws -> (JSON, [Control]) {
    work = 0
    func checkPolicy(_ value: JSON) throws {
      work += 1
      guard work <= 10_000 else { throw ProbeError.invalid("Policy work limit") }
      switch value {
      case .object(let o):
        if let name = o["call"], !allowedFunctions.contains(try string(name)) {
          throw ProbeError.invalid("Function policy")
        }
        if let event = o["event"], !allowedEvents.contains(try string(event["name"])) {
          throw ProbeError.invalid("Event policy")
        }
        for child in o.values { try checkPolicy(child) }
      case .array(let a): for child in a { try checkPolicy(child) }
      default: break
      }
    }
    for value in components.values {
      guard allowedComponents.contains(try string(value["component"])) else {
        throw ProbeError.invalid("Component policy")
      }
      try checkPolicy(value)
    }
    var nodes = 0
    var outputUnits = 0
    var handlers: [Control] = []
    func text(_ value: JSON?) throws -> String {
      let s = try string(value)
      outputUnits += s.utf16.count
      guard s.utf16.count <= 65_536, outputUnits <= 1_048_576 else {
        throw ProbeError.invalid("Render string budget")
      }
      return s
    }
    func walk(_ id: String, _ scope: String, _ ancestors: Set<String>) throws -> JSON {
      nodes += 1
      guard nodes <= 1024, ancestors.count < 64, !ancestors.contains(id), let c = components[id]
      else {
        throw ProbeError.invalid("Render graph limit or missing component")
      }
      let nextAncestors = ancestors.union([id])
      let type = try string(c["component"])
      var messages: [JSON] = []
      for check in try array(c["checks"] ?? .array([])) {
        if try !boolean(resolve(check["condition"], model, scope)) {
          messages.append(.string(try text(resolve(check["message"], model, scope))))
        }
      }
      switch type {
      case "Column", "List":
        var children: [JSON] = []
        if case .array(let ids) = c["children"] {
          for child in ids { children.append(try walk(identifier(child), scope, nextAncestors)) }
        } else {
          let path = try absolute(string(c["children"]?["path"]), scope)
          let rows = try array(readPointer(model, path))
          guard rows.count <= 1024 else { throw ProbeError.invalid("List limit") }
          let template = try identifier(c["children"]?["componentId"])
          for index in rows.indices {
            children.append(try walk(template, "\(path)/\(index)", nextAncestors))
          }
        }
        return .object(["kind": .string("group"), "children": .array(children)])
      case "Text":
        return .object([
          "kind": .string("text"), "text": .string(try text(resolve(c["text"], model, scope))),
        ])
      case "TextField", "CheckBox":
        let label = try text(resolve(c["label"], model, scope))
        let value = try resolve(c["value"], model, scope)
        if type == "TextField" { _ = try text(value) } else { _ = try boolean(value) }
        let kind = type == "TextField" ? "text-field" : "checkbox"
        let binding = try c["value"]?["path"].map { try absolute(string($0), scope) }
        handlers.append(
          Control(kind: kind, label: label, id: id, scope: scope, binding: binding, disabled: false)
        )
        return .object([
          "kind": .string(kind), "label": .string(label), "value": value,
          "invalid": .bool(!messages.isEmpty), "validationMessages": .array(messages),
        ])
      case "Button":
        let child = try walk(identifier(c["child"]), scope, nextAncestors)
        guard child["kind"] == .string("text") else {
          throw ProbeError.invalid("Only text button labels in experiment")
        }
        let label = try text(child["text"])
        let name = try string(c["action"]?["event"]?["name"])
        guard allowedEvents.contains(name) else { throw ProbeError.invalid("Event policy") }
        for value in try object(c["action"]?["event"]?["context"] ?? .object([:])).values {
          _ = try resolve(value, model, scope)
        }
        handlers.append(
          Control(
            kind: "button", label: label, id: id, scope: scope, binding: nil,
            disabled: !messages.isEmpty))
        return .object([
          "kind": .string("button"), "label": .string(label), "disabled": .bool(!messages.isEmpty),
          "validationMessages": .array(messages),
        ])
      default: throw ProbeError.invalid("Unsupported native mapping")
      }
    }
    let root = try walk("root", "", [])
    return (root, handlers)
  }

  private func absolute(_ path: String, _ scope: String) throws -> String {
    guard path.hasPrefix("/") || !scope.isEmpty else {
      throw ProbeError.invalid("Relative binding outside template")
    }
    let result = path.hasPrefix("/") ? path : scope + "/" + path
    _ = try pointerTokens(result)
    return result
  }

  private func resolve(_ input: JSON?, _ model: JSON, _ scope: String) throws -> JSON {
    work += 1
    guard work <= 10_000 else { throw ProbeError.invalid("Cumulative evaluation limit") }
    guard let value = input else { throw ProbeError.invalid("Missing dynamic value") }
    guard case .object(let o) = value else { return value }
    if let path = o["path"] { return try readPointer(model, absolute(string(path), scope)) }
    let name = try string(o["call"])
    guard allowedFunctions.contains(name) else { throw ProbeError.invalid("Function policy") }
    let arg = try resolve(o["args"]?["value"], model, scope)
    switch name {
    case "required":
      switch arg {
      case .null: return .bool(false)
      case .string(let s): return .bool(!s.isEmpty)
      case .array(let a): return .bool(!a.isEmpty)
      default: return .bool(true)
      }
    case "formatDate":
      // Intentionally only yyyy-MM-dd input/output; no locale or general Unicode token parity.
      let s = try string(arg)
      let bytes = Array(s.utf8)
      guard bytes.count == 10, bytes[4] == 45, bytes[7] == 45,
        bytes.enumerated().allSatisfy({
          $0.offset == 4 || $0.offset == 7 || (48...57).contains($0.element)
        }),
        let year = Int(s.prefix(4)), let month = Int(s.dropFirst(5).prefix(2)),
        let day = Int(s.suffix(2)),
        year >= 1, (1...12).contains(month)
      else { throw ProbeError.invalid("Invalid date") }
      let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
      let days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
      guard (1...days[month - 1]).contains(day) else { throw ProbeError.invalid("Invalid date") }
      return .string(s)
    default: throw ProbeError.invalid("Unsupported function")
    }
  }

  private func event(_ control: Control, _ model: JSON) throws -> JSON {
    work = 0
    guard let c = components[control.id], control.kind == "button", !control.disabled else {
      throw ProbeError.invalid("Invalid action source")
    }
    let declared = try object(c["action"]?["event"])
    let name = try identifier(declared["name"])
    guard allowedEvents.contains(name) else { throw ProbeError.invalid("Event policy") }
    var context: [String: JSON] = [:]
    for (key, value) in try object(declared["context"] ?? .object([:])) {
      context[key] = try resolve(value, model, control.scope)
    }
    var record: [String: JSON] = [
      "envelope": .object([
        "version": .string("v1.0"),
        "action": .object([
          "name": .string(name), "surfaceId": .string("form"),
          "sourceComponentId": .string(control.id),
          "timestamp": .string(timestamp), "context": .object(context),
        ]),
      ])
    ]
    if sendModel { record["dataModel"] = model }
    let result = JSON.object(record)
    _ = try JSON.decode(result.data())
    return result
  }
}
