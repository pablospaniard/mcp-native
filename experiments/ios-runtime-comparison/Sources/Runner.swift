import Foundation

@main
struct Runner {
  static func main() throws {
    guard CommandLine.arguments.count == 4 else {
      throw ProbeError.harness("Usage: runner runtime.js inputs.json tool-result.json")
    }
    let bundle = try String(contentsOfFile: CommandLine.arguments[1], encoding: .utf8)
    let suite = try JSON.decode(Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[2])))
    let toolResult = try JSON.decode(
      Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[3])))
    let output = try Corpus.run(bundle: bundle, suite: suite, toolResult: toolResult)
    FileHandle.standardOutput.write(try output.data())
  }
}
