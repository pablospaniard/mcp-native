import Foundation

enum Engine: String, CaseIterable { case javascript, swift }

// Same native policy and delivery boundary for both semantic engines.
// All methods are synchronous on the caller's serial executor. Tickets cancel queued admission;
// they do not claim to interrupt an already running JavaScriptCore evaluation.
final class ExperimentHost {
  private var session: SemanticSession?
  private var policy: JSON
  private var seenActions = 0, operations = 0
  private var deliveries: [JSON] = [], results: [JSON] = []
  private(set) var generation = UUID().uuidString

  init(engine: Engine, bundle: String, policy: JSON, timestamp: String) throws {
    let h = try object(policy)
    try keys(h, required: ["componentNames", "functionNames", "eventNames", "authorizeActions"])
    _ = try boolean(h["authorizeActions"])
    for (key, allowed) in [
      ("componentNames", Set(["Column", "List", "Text", "TextField", "CheckBox", "Button"])),
      ("functionNames", Set(["required", "formatDate"])), ("eventNames", Set(["submit"])),
    ] {
      let names = try array(h[key]).map { try string($0) }
      guard Set(names).count == names.count, Set(names).isSubset(of: allowed) else {
        throw ProbeError.harness("Invalid host allowlist")
      }
    }
    self.policy = policy
    switch engine {
    case .javascript:
      session = try JavaScriptSession(bundle: bundle, host: policy, timestamp: timestamp)
    case .swift: session = try NativeSession(host: policy, timestamp: timestamp)
    }
  }

  func close() {
    session?.close()
    session = nil
    generation = UUID().uuidString
    deliveries = []
    results = []
    seenActions = 0
  }

  func toolResult(_ input: JSON, ticket: String) throws -> JSON {
    // Fixed host-owned fixture adapter, not an MCP transport implementation.
    let result = try object(input)
    try keys(result, required: ["content"])
    let content = try array(result["content"])
    guard content.count == 1 else { throw ProbeError.invalid("Ambiguous tool result") }
    let item = try object(content[0])
    try keys(item, required: ["type", "resource"])
    let resource = try object(item["resource"])
    try keys(resource, required: ["uri", "mimeType", "text"])
    guard item["type"] == .string("resource"), resource["uri"] == .string("a2ui://experiment/form"),
      resource["mimeType"] == .string("application/a2ui+json")
    else { throw ProbeError.invalid("Unsupported resource") }
    let source = try string(resource["text"])
    // The comparison server returns exactly one envelope. Streaming is outside this probe.
    let message = try JSON.decode(Data(source.utf8))
    return try step(.object(["op": .string("message"), "message": message]), ticket: ticket)
  }

  func step(_ input: JSON, ticket: String) throws -> JSON {
    guard ticket == generation, let session, operations < 64 else {
      throw ProbeError.harness("Stale, closed, or exhausted host")
    }
    operations += 1
    let step = try object(input)
    let op = try string(step["op"])
    switch op {
    case "message": try keys(step, required: ["op", "message"])
    case "render": try keys(step, required: ["op"])
    case "resolve-event": try keys(step, required: ["op", "sourceComponentId"])
    case "input", "press":
      try keys(step, required: op == "input" ? ["op", "target", "value"] : ["op", "target"])
      let target = try object(step["target"])
      try keys(target, required: ["kind", "label"])
      _ = try identifier(target["label"])
      guard
        (op == "press" ? ["button"] : ["text-field", "checkbox"]).contains(
          try string(target["kind"]))
      else { throw ProbeError.harness("Unknown interaction") }
    default: throw ProbeError.harness("Unknown host operation")
    }
    _ = try JSON.decode(input.data())
    var observation = try object(session.step(input))
    let actions = try array(observation["actions"])
    guard actions.count >= seenActions, actions.count - seenActions <= 1 else {
      throw ProbeError.harness("Invalid action count")
    }
    for record in actions.dropFirst(seenActions) {
      guard op == "press" else { throw ProbeError.harness("Action outside explicit press") }
      let value = try object(record)
      try keys(value, required: ["envelope"], optional: ["dataModel"])
      let envelope = try object(value["envelope"])
      try keys(envelope, required: ["version", "action"])
      let action = try object(envelope["action"])
      try keys(
        action, required: ["name", "surfaceId", "sourceComponentId", "timestamp", "context"])
      guard envelope["version"] == .string("v1.0"), action["surfaceId"] == .string("form"),
        try array(policy["eventNames"]).contains(action["name"] ?? .null)
      else { throw ProbeError.harness("Denied action contract") }
      _ = try identifier(action["sourceComponentId"])
      _ = try object(action["context"])
      _ = try JSON.decode(record.data())
      if try boolean(policy["authorizeActions"]) {
        deliveries.append(record)
        results.append(.string("delivered"))
      } else {
        results.append(.string("denied"))
      }
    }
    seenActions = actions.count
    observation["deliveries"] = .array(deliveries)
    observation["deliveryResults"] = .array(results)
    let output = JSON.object(observation)
    guard try output.data().count <= 1_048_576 else {
      close()
      throw ProbeError.harness("Host observation limit")
    }
    return output
  }
}
