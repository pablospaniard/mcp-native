import Foundation

enum Corpus {
  static let pin = "8ff4651232ab0e02b0123730b502711170637a3a"

  static func run(bundle: String, suite: JSON, toolResult: JSON) throws -> JSON {
    let timestamp = try string(suite["timestamp"])
    let cases = try array(suite["cases"])
    guard !cases.isEmpty, cases.count <= 64 else { throw ProbeError.harness("Case limit") }
    var engines: [String: JSON] = [:]
    var lifecycle: [String: JSON] = [:]
    for engine in Engine.allCases {
      var runs: [String: JSON] = [:]
      for fixture in cases {
        guard let policy = fixture["host"] else { throw ProbeError.harness("Missing host") }
        let host = try ExperimentHost(
          engine: engine, bundle: bundle, policy: policy, timestamp: timestamp)
        let ticket = host.generation
        var observations: [JSON] = []
        for (index, step) in try array(fixture["steps"]).enumerated() {
          do { observations.append(try host.step(step, ticket: ticket)) } catch {
            throw ProbeError.harness(
              "\(engine.rawValue) \(try string(fixture["id"])) step \(index + 1): \(error)")
          }
        }
        host.close()
        do {
          _ = try host.step(.object(["op": .string("render")]), ticket: ticket)
          throw ProbeError.invalid("Closed host accepted stale ticket")
        } catch ProbeError.harness {}
        runs[try string(fixture["id"])] = .array(observations)
      }
      engines[engine.rawValue] = .object(runs)
      lifecycle[engine.rawValue] = try testHost(
        engine, bundle, cases[0]["host"]!, timestamp, toolResult)
    }
    return .object([
      "engines": .object(engines), "probe": try JavaScriptSession.probe(),
      "lifecycle": .object(lifecycle),
    ])
  }

  private static func testHost(
    _ engine: Engine, _ bundle: String, _ policy: JSON, _ timestamp: String, _ toolResult: JSON
  ) throws -> JSON {
    let host = try ExperimentHost(
      engine: engine, bundle: bundle, policy: policy, timestamp: timestamp)
    let ticket = host.generation
    _ = try host.toolResult(toolResult, ticket: ticket)
    let input = JSON.object([
      "op": .string("input"),
      "target": .object(["kind": .string("text-field"), "label": .string("Name")]),
      "value": .string("Native round trip"),
    ])
    _ = try host.step(input, ticket: ticket)
    let press = JSON.object([
      "op": .string("press"),
      "target": .object(["kind": .string("button"), "label": .string("Submit")]),
    ])
    let result = try host.step(press, ticket: ticket)
    let delivered = try array(result["deliveries"])
    guard delivered.count == 1,
      delivered[0]["envelope"]?["action"]?["context"]?["name"] == .string("Native round trip")
    else {
      throw ProbeError.harness("Tool-result-to-action round trip failed")
    }
    host.close()
    do {
      _ = try host.step(press, ticket: ticket)
      throw ProbeError.invalid("Cancelled press dispatched")
    } catch ProbeError.harness {}
    let replacement = try ExperimentHost(
      engine: engine, bundle: bundle, policy: policy, timestamp: timestamp)
    do {
      _ = try replacement.step(press, ticket: ticket)
      throw ProbeError.invalid("Prior generation accepted")
    } catch ProbeError.harness {}
    let fresh = try replacement.toolResult(toolResult, ticket: replacement.generation)
    guard try array(fresh["actions"]).isEmpty, try array(fresh["localChanges"]).isEmpty else {
      throw ProbeError.harness("Session state leaked")
    }
    var bad = try object(toolResult)
    var content = try array(bad["content"])
    var item = try object(content[0])
    var resource = try object(item["resource"])
    resource["mimeType"] = .string("text/html")
    item["resource"] = .object(resource)
    content[0] = .object(item)
    bad["content"] = .array(content)
    do {
      _ = try replacement.toolResult(.object(bad), ticket: replacement.generation)
      throw ProbeError.harness("Unknown MIME accepted")
    } catch ProbeError.invalid {}
    let cycle = JSON.object([
      "op": .string("message"),
      "message": .object([
        "version": .string("v1.0"),
        "updateComponents": .object([
          "surfaceId": .string("form"),
          "components": .array([
            .object([
              "id": .string("root"), "component": .string("Column"),
              "children": .array([.string("root")]),
            ])
          ]),
        ]),
      ]),
    ])
    guard
      try replacement.step(cycle, ticket: replacement.generation)["outcome"]
        == .string("surface-rejected")
    else {
      throw ProbeError.harness("Component cycle accepted")
    }
    let required = JSON.object([
      "op": .string("message"),
      "message": .object([
        "version": .string("v1.0"),
        "updateComponents": .object([
          "surfaceId": .string("form"),
          "components": .array([
            .object([
              "id": .string("root"), "component": .string("TextField"),
              "label": .string("Whitespace"),
              "value": .string(" "),
              "checks": .array([
                .object([
                  "condition": .object([
                    "call": .string("required"), "args": .object(["value": .string(" ")]),
                  ]),
                  "message": .string("Required"),
                ])
              ]),
            ])
          ]),
        ]),
      ]),
    ])
    let whitespace = try replacement.step(required, ticket: replacement.generation)
    guard try array(whitespace["view"]).first?["invalid"] == .bool(false) else {
      throw ProbeError.harness("Required incorrectly trimmed whitespace")
    }
    replacement.close()
    var datePolicy = try object(policy)
    datePolicy["functionNames"] = .array([.string("required"), .string("formatDate")])
    let dateHost = try ExperimentHost(
      engine: engine, bundle: bundle, policy: .object(datePolicy), timestamp: timestamp)
    _ = try dateHost.toolResult(toolResult, ticket: dateHost.generation)
    var dateInput = try object(input)
    dateInput["value"] = .string("2026-09-12")
    _ = try dateHost.step(.object(dateInput), ticket: dateHost.generation)
    let formatUpdate = JSON.object([
      "op": .string("message"),
      "message": .object([
        "version": .string("v1.0"),
        "updateComponents": .object([
          "surfaceId": .string("form"),
          "components": .array([
            .object([
              "id": .string("greeting"), "component": .string("Text"),
              "text": .object([
                "call": .string("formatDate"),
                "args": .object([
                  "value": .object(["path": .string("/name")]), "format": .string("yyyy-MM-dd"),
                ]),
              ]),
            ])
          ]),
        ]),
      ]),
    ])
    guard
      try dateHost.step(formatUpdate, ticket: dateHost.generation)["outcome"] == .string("accepted")
    else {
      throw ProbeError.harness("Server-only preflight overrode a valid local date")
    }
    dateHost.close()
    do {
      _ = try JSON.decode(
        Data((String(repeating: "[", count: 65) + "0" + String(repeating: "]", count: 65)).utf8))
      throw ProbeError.harness("Excessive JSON depth accepted")
    } catch ProbeError.invalid {}
    do {
      _ = try writePointer(
        .object([:]), String(repeating: "/a", count: 65), .bool(true), existing: false)
      throw ProbeError.harness("Excessive pointer depth accepted")
    } catch ProbeError.invalid {}
    do {
      _ = try JSON.decode(Data(#"{"é":1}"#.utf8))
      throw ProbeError.harness("Non-ASCII JSON key accepted by restricted probe")
    } catch ProbeError.invalid {}
    do {
      _ = try identifier(.string("é"))
      throw ProbeError.harness("Non-ASCII identifier accepted by restricted probe")
    } catch ProbeError.invalid {}
    return .object([
      "toolResultRoundTrip": .bool(true), "cancelledPress": .bool(true),
      "staleGeneration": .bool(true), "freshSession": .bool(true),
      "unknownMIMERejected": .bool(true), "cycleRejected": .bool(true),
      "requiredWhitespace": .bool(true), "jsonAndPointerDepthBounded": .bool(true),
      "localOverridesInvalidServerDate": .bool(true),
      "asciiRestrictionsEnforced": .bool(true),
    ])
  }
}
