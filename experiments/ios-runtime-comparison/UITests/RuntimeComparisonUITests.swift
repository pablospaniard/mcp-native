import XCTest

final class RuntimeComparisonUITests: XCTestCase {
  @MainActor
  func testJavaScriptCoreRoundTrip() throws { try roundTrip(swift: false) }
  @MainActor
  func testSwiftRoundTrip() throws { try roundTrip(swift: true) }

  @MainActor
  private func roundTrip(swift: Bool) throws {
    let app = XCUIApplication()
    app.launchArguments = ["--conformance"] + (swift ? ["--swift"] : [])
    app.launch()
    XCTAssertTrue(app.staticTexts["conformance"].waitForExistence(timeout: 30))
    XCTAssertEqual(app.staticTexts["conformance"].label, "Conformance complete")
    XCTAssertEqual(app.staticTexts["engine"].label, swift ? "swift" : "javascript")
    let field = app.textFields["field-Name"]
    XCTAssertEqual(field.value as? String, "Ada")
    field.tap()
    field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 3) + "Native")
    XCTAssertEqual(field.value as? String, "Native")
    let consent = app.switches["checkbox-Consent"]
    XCTAssertTrue(consent.exists)
    consent.tap()
    XCTAssertEqual(consent.value as? String, "1")
    let submit = app.buttons["button-Submit"]
    XCTAssertTrue(submit.isEnabled)
    submit.tap()
    XCTAssertEqual(app.staticTexts["status"].label, "Delivered 1")
    app.buttons["close"].tap()
    XCTAssertFalse(field.exists)
    XCTAssertEqual(app.staticTexts["status"].label, "Session closed")
    app.buttons["reset"].tap()
    XCTAssertEqual(field.value as? String, "Ada")
    XCTAssertEqual(consent.value as? String, "0")
    // Native controls expose real labels/traits; this is not a manual VoiceOver audit.
    XCTAssertEqual(field.label, "Name")
    XCTAssertEqual(consent.label, "Consent")
  }
}
