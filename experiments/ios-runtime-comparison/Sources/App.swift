import SwiftUI

@MainActor
final class AppModel: ObservableObject {
  @Published var engine: Engine = .javascript
  @Published var observation: JSON = .object([:])
  @Published var status = "Ready"
  @Published var conformance = "Not run"
  private var host: ExperimentHost?
  private var bundle = ""
  private var suite: JSON = .null
  private var tool: JSON = .null

  init() {
    do {
      func resource(_ name: String, _ ext: String) throws -> Data {
        guard let url = Bundle.main.url(forResource: name, withExtension: ext) else {
          throw ProbeError.harness("Missing bundled fixture")
        }
        return try Data(contentsOf: url)
      }
      bundle = String(decoding: try resource("runtime", "js"), as: UTF8.self)
      suite = try JSON.decode(resource("inputs", "json"))
      tool = try JSON.decode(resource("tool-result", "json"))
      if CommandLine.arguments.contains("--swift") { engine = .swift }
      if CommandLine.arguments.contains("--conformance") {
        let result = try Corpus.run(bundle: bundle, suite: suite, toolResult: tool)
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        try result.data().write(
          to: documents.appendingPathComponent("conformance.json"), options: .atomic)
        conformance = "Conformance complete"
      }
      reset()
    } catch {
      status = "Experiment failed"
      conformance = "Conformance failed"
    }
  }

  func reset() {
    host?.close()
    do {
      let cases = try array(suite["cases"])
      guard let policy = cases.first?["host"] else { throw ProbeError.harness("Missing policy") }
      let next = try ExperimentHost(
        engine: engine, bundle: bundle, policy: policy, timestamp: string(suite["timestamp"]))
      host = next
      observation = try next.toolResult(tool, ticket: next.generation)
      status = "Ready"
    } catch {
      host = nil
      observation = .object([:])
      status = "Experiment failed"
    }
  }

  func stop() {
    host?.close()
    host = nil
    observation = .object([:])
    status = "Session closed"
  }

  func send(_ step: JSON) {
    guard let host else { return }
    do {
      observation = try host.step(step, ticket: host.generation)
      let delivered = try array(observation["deliveries"])
      status = delivered.isEmpty ? "Ready" : "Delivered \(delivered.count)"
    } catch {
      stop()
      status = "Experiment failed"
    }
  }

  func edit(kind: String, label: String, value: JSON) {
    send(
      .object([
        "op": .string("input"),
        "target": .object(["kind": .string(kind), "label": .string(label)]), "value": value,
      ]))
  }
  func press(label: String) {
    send(
      .object([
        "op": .string("press"),
        "target": .object(["kind": .string("button"), "label": .string(label)]),
      ]))
  }
}

struct SemanticView: View {
  let node: JSON
  @ObservedObject var model: AppModel
  private var label: String { (try? string(node["label"])) ?? "" }
  var body: some View {
    switch node["kind"] {
    case .string("group"):
      VStack(alignment: .leading, spacing: 16) {
        ForEach(Array(((try? array(node["children"])) ?? []).enumerated()), id: \.offset) {
          _, child in
          SemanticView(node: child, model: model)
        }
      }
    case .string("text"):
      Text((try? string(node["text"])) ?? "").font(.body)
    case .string("text-field"):
      VStack(alignment: .leading) {
        Text(label)
        TextField(
          label,
          text: Binding(
            get: { (try? string(node["value"])) ?? "" },
            set: { model.edit(kind: "text-field", label: label, value: .string($0)) }
          )
        )
        .textFieldStyle(.roundedBorder)
        .accessibilityLabel(label)
        .accessibilityIdentifier("field-\(label)")
        messages
      }
    case .string("checkbox"):
      Toggle(
        label,
        isOn: Binding(
          get: { (try? boolean(node["value"])) ?? false },
          set: { model.edit(kind: "checkbox", label: label, value: .bool($0)) }
        )
      )
      .accessibilityIdentifier("checkbox-\(label)")
    case .string("button"):
      Button(label) { model.press(label: label) }
        .buttonStyle(.borderedProminent)
        .disabled(node["disabled"] == .bool(true))
        .accessibilityIdentifier("button-\(label)")
      messages
    default: Text("Unsupported view")
    }
  }
  private var messages: some View {
    ForEach(Array(((try? array(node["validationMessages"])) ?? []).enumerated()), id: \.offset) {
      _, message in
      Text((try? string(message)) ?? "").font(.caption).foregroundStyle(.red)
    }
  }
}

@main
struct RuntimeComparisonApp: App {
  @StateObject private var model = AppModel()
  var body: some Scene {
    WindowGroup {
      ScrollView {
        VStack(alignment: .leading, spacing: 24) {
          Text("Native runtime comparison").font(.title)
          Picker("Engine", selection: $model.engine) {
            Text("JavaScriptCore").tag(Engine.javascript)
            Text("Swift").tag(Engine.swift)
          }.pickerStyle(.segmented).onChange(of: model.engine) { _, _ in model.reset() }
          Text(model.engine.rawValue).accessibilityIdentifier("engine")
          ForEach(Array(((try? array(model.observation["view"])) ?? []).enumerated()), id: \.offset)
          { _, node in
            SemanticView(node: node, model: model)
          }
          Text(model.status).accessibilityIdentifier("status")
          Text(model.conformance).font(.caption).accessibilityIdentifier("conformance")
          HStack {
            Button("Reset session") { model.reset() }.accessibilityIdentifier("reset")
            Button("Close session") { model.stop() }.accessibilityIdentifier("close")
          }
        }.padding(24)
      }
    }
  }
}
