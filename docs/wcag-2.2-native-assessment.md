# WCAG 2.2 native assessment for the 0.4.0 fixture

Status: complete for the narrow `0.4.0` evidence matrix: Android 17 with TalkBack and iOS 26.5
with XCUITest accessibility APIs. Partial and unassessed criteria below are documented limitations,
not hidden release-gate failures.

This assessment targets applicable WCAG 2.2 Level A and AA outcomes for the supported A2UI native
fixture. WCAG is a web-content standard, and W3C's WCAG2Mobile document is informative guidance for
applying it to native mobile applications. Passing the evidence matrix therefore supports a narrow
product-quality claim; it does not make MCP Native, every host application, or every host design
system unqualifiedly WCAG conformant.

The unit under assessment is the generated single-screen fixture host using the pinned protocol
payload and all three supported catalog paths. Results and artifacts are recorded in
`docs/evidence/native-accessibility-0.4.0.json`. For the iOS row, XCUITest verifies programmatic
semantics and layout, not VoiceOver speech or gestures.

## Assessment matrix

| WCAG 2.2 criterion                           | Applicability and scoped result                                                                                                                   | Result                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1.1.1 Non-text Content (A)                   | No meaningful images or non-text content are present on any catalog path.                                                                         | Pass                           |
| 1.3.1 Info and Relationships (A)             | Labels, validation state, roles, and values remained programmatically exposed. Android speech and iOS hierarchy were inspected.                   | Pass                           |
| 1.3.2 Meaningful Sequence (A)                | Android forward/reverse traversal and the ordered iOS hierarchy matched the visual form and dynamic list.                                         | Pass in scoped matrix          |
| 1.3.4 Orientation (AA)                       | The fixture rendered and remained vertically scrollable in portrait and landscape.                                                                | Pass                           |
| 1.3.5 Identify Input Purpose (AA)            | The supported A2UI subset has no closed personal-data purpose vocabulary. Shipping hosts must add this through trusted local components.          | Host-owned exception           |
| 1.4.3 Contrast Minimum (AA)                  | Pinned fixture text ratios range from 6.13:1 to 13.64:1; third-party catalog colors remain host-owned.                                            | Pass for fixture               |
| 1.4.4 Resize Text (AA)                       | Android font scale 2.0 and iOS `accessibility-extra-extra-large` remained readable and scroll-reachable.                                          | Pass                           |
| 1.4.10 Reflow (AA)                           | The single-column screen wrapped and remained reachable without a fixture-owned two-dimensional scroll requirement.                               | Pass                           |
| 1.4.11 Non-text Contrast (AA)                | Borders, controls, and error state remained perceivable under the tested platform contrast settings; other design systems must repeat this check. | Pass for fixture               |
| 1.4.13 Content on Hover or Focus (AA)        | No hover- or focus-triggered overlay is generated.                                                                                                | Pass                           |
| 2.1.1 Keyboard (A)                           | Android DPAD/Enter was exercised. External-keyboard navigation was not exercised on iOS.                                                          | Partial                        |
| 2.1.2 No Keyboard Trap (A)                   | Android forward/reverse navigation left each control; the iOS hierarchy contained no modal or trapped subtree.                                    | Pass in scoped matrix          |
| 2.4.3 Focus Order (A)                        | TalkBack traversal and iOS programmatic order followed visual order. VoiceOver traversal was not run.                                             | Pass in scoped matrix          |
| 2.4.6 Headings and Labels (AA)               | The heading, control labels, descriptions, and errors were descriptive in TalkBack output and the iOS hierarchy.                                  | Pass                           |
| 2.4.7 Focus Visible (AA)                     | TalkBack/DPAD supplied visible focus. iOS external-keyboard and switch-control focus were not assessed.                                           | Partial                        |
| 2.4.11 Focus Not Obscured Minimum (AA)       | Focused/edited content remained visible with the software keyboard, and enlarged layouts remained scrollable.                                     | Pass in scoped matrix          |
| 2.5.1 Pointer Gestures (A)                   | No multipoint or path-based gesture is required.                                                                                                  | Pass                           |
| 2.5.2 Pointer Cancellation (A)               | Platform press components are used, but drag-off cancellation was not manually recorded.                                                          | Not assessed                   |
| 2.5.3 Label in Name (A)                      | Visible button and input labels matched or were contained in their accessible names.                                                              | Pass                           |
| 2.5.4 Motion Actuation (A)                   | No device-motion action is exposed.                                                                                                               | Pass                           |
| 2.5.7 Dragging Movements (AA)                | No renderer action requires dragging; scrolling is platform-owned.                                                                                | Pass                           |
| 2.5.8 Target Size Minimum (AA)               | Fixture-owned wrappers and actions measured at least 48 points/dp high.                                                                           | Pass for fixture               |
| 3.2.1 On Focus (A)                           | Navigation alone did not dispatch an action or change catalog path.                                                                               | Pass                           |
| 3.2.2 On Input (A)                           | Local edits updated renderer-local state without dispatching an agent action.                                                                     | Pass                           |
| 3.3.1 Error Identification (A)               | Invalid fields exposed text and invalid state; Android also produced TalkBack output.                                                             | Pass in scoped matrix          |
| 3.3.2 Labels or Instructions (A)             | Every supported input retained a persistent programmatic label with populated and empty values.                                                   | Pass                           |
| 3.3.3 Error Suggestion (AA)                  | Declared validation messages identified the required correction; iOS spoken delivery was not assessed.                                            | Pass semantics; speech partial |
| 3.3.7 Redundant Entry (A)                    | The fixture has no repeated-entry flow.                                                                                                           | Not applicable                 |
| 3.3.8 Accessible Authentication Minimum (AA) | The fixture demonstrates an obscured field but performs no authentication.                                                                        | Not applicable                 |
| 4.1.2 Name, Role, Value (A)                  | Text, buttons, inputs, hidden/disabled/invalid state, and bound values were verified through TalkBack and the iOS accessibility hierarchy.        | Pass in scoped matrix          |
| 4.1.3 Status Messages (AA)                   | TalkBack announced updates. XCUITest verified iOS live-region/status metadata and changed text, but not spoken output.                            | Partial                        |

## Exceptions and responsibility boundary

- Input-purpose metadata is not accepted from the server because the pinned A2UI subset has no
  closed vocabulary that can safely select native personal-data or credential behavior. A shipping
  host that collects user data must add purpose metadata in trusted locally bundled components.
- Colors, spacing, visible focus, scroll containers, keyboard avoidance, and touch-target geometry
  are host presentation responsibilities. The generated fixture supplies one auditable reference
  implementation; another design system must repeat the catalog-parity inspection.
- VoiceOver, physical-device behavior, external-keyboard traversal on iOS, switch control, and
  drag-off pointer cancellation are not covered by the narrowed `0.4.0` evidence matrix.
- The renderer does not expose media, time limits, flashing content, complex gestures, drag
  actions, authentication, help mechanisms, or multi-screen navigation in this profile. Criteria
  depending exclusively on those features are outside this fixture's applicable boundary.

## Completion rule

The `wcag-inspection` evidence case passes when every required release row and catalog path has a
reviewable inspection and all exceptions, partial outcomes, and unassessed interactions are
recorded. It does not require or imply an unqualified WCAG conformance claim. The strict
`npm run native:evidence:verify` command machine-enforces the two-row `0.4.0` release gate.
