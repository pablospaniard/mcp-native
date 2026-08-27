# WCAG 2.2 native assessment for the 0.4.0 fixture

Status: assessment scope defined; the Android 17 Google Play emulator row passes, while criterion
results remain pending until the six required physical-device rows are complete.

This assessment targets applicable WCAG 2.2 Level A and AA outcomes for the supported A2UI native
fixture. WCAG is a web-content standard, and W3C's WCAG2Mobile document is informative guidance for
applying it to native mobile applications. Passing this matrix therefore supports a narrow product
quality claim; it does not make MCP Native, every host application, or every host design system
unqualifiedly WCAG conformant.

The unit under assessment is the generated single-screen fixture host using the pinned protocol
payload, each supported catalog path, and every required iOS/Android row. Results belong in
`docs/evidence/native-accessibility-0.4.0.json`; screenshots, recordings, inspector output, and issue
links are evidence rather than prose claims in this file.

## Assessment matrix

| WCAG 2.2 criterion                           | Applicability to the fixture                                                                               | Required evidence                                                                                                                      | Result               |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1.1.1 Non-text Content (A)                   | No meaningful images or non-text content are present.                                                      | Confirm no generated catalog path adds meaningful unlabeled imagery.                                                                   | Pending              |
| 1.3.1 Info and Relationships (A)             | Labels, validation state, and component roles must remain programmatically available.                      | Accessibility tree and screen-reader output for each catalog path.                                                                     | Pending              |
| 1.3.2 Meaningful Sequence (A)                | Reading and focus order must match the rendered form and dynamic list.                                     | Forward/reverse navigation recording.                                                                                                  | Pending              |
| 1.3.4 Orientation (AA)                       | The fixture must remain usable in portrait and landscape.                                                  | Screenshots and interaction recording in both orientations.                                                                            | Pending              |
| 1.3.5 Identify Input Purpose (AA)            | A2UI's supported subset does not provide a closed personal-data purpose vocabulary.                        | Record as a host-owned exception; shipping hosts must add purpose metadata through trusted local components when collecting user data. | Host-owned exception |
| 1.4.3 Contrast Minimum (AA)                  | Fixture-owned text colors target at least 4.5:1; third-party catalogs remain host-owned.                   | Platform color/contrast inspection for each catalog path and state.                                                                    | Pending              |
| 1.4.4 Resize Text (AA)                       | Renderer text and inputs explicitly allow font scaling.                                                    | Every supported larger system text size without loss or clipping.                                                                      | Pending              |
| 1.4.10 Reflow (AA)                           | The single-column screen must remain reachable without two-dimensional scrolling at larger text.           | Large-text portrait/landscape inspection.                                                                                              | Pending              |
| 1.4.11 Non-text Contrast (AA)                | Input borders, focus indication, validation state, and controls must remain perceivable.                   | Platform contrast inspection in normal and contrast-related settings.                                                                  | Pending              |
| 1.4.13 Content on Hover or Focus (AA)        | No hover/focus-triggered overlay is generated.                                                             | Confirm all catalog paths retain this behavior.                                                                                        | Pending              |
| 2.1.1 Keyboard (A)                           | Inputs and controls must work with supported external keyboard/navigation mechanisms.                      | Platform keyboard navigation preflight where supported.                                                                                | Pending              |
| 2.1.2 No Keyboard Trap (A)                   | Focus must leave every input and control.                                                                  | Forward/reverse navigation recording.                                                                                                  | Pending              |
| 2.4.3 Focus Order (A)                        | Focus must follow visual and reading order, including dynamic-list instances.                              | VoiceOver/TalkBack traversal recording.                                                                                                | Pending              |
| 2.4.6 Headings and Labels (AA)               | Host heading and renderer-selected control labels must describe their purpose.                             | Accessibility tree and spoken-label inspection.                                                                                        | Pending              |
| 2.4.7 Focus Visible (AA)                     | Host components must retain platform-visible focus indication.                                             | Keyboard/switch-access preflight and screenshots.                                                                                      | Pending              |
| 2.4.11 Focus Not Obscured Minimum (AA)       | Focused content must remain visible while scrolling and while the software keyboard is open.               | Input and final-control recordings at normal and large text.                                                                           | Pending              |
| 2.5.1 Pointer Gestures (A)                   | No multipoint or path-based gesture is required.                                                           | Confirm all actions remain single activation or text entry.                                                                            | Pending              |
| 2.5.2 Pointer Cancellation (A)               | Host press components use platform press cancellation behavior.                                            | Drag-off/cancel preflight for host-owned buttons.                                                                                      | Pending              |
| 2.5.3 Label in Name (A)                      | Visible button/input text must be contained in the accessible name.                                        | Compare visible and announced labels.                                                                                                  | Pending              |
| 2.5.4 Motion Actuation (A)                   | No device-motion action is exposed.                                                                        | Confirm the host adds no motion-only behavior.                                                                                         | Pending              |
| 2.5.7 Dragging Movements (AA)                | No renderer action requires dragging.                                                                      | Confirm scrolling is the only platform-owned drag behavior.                                                                            | Pending              |
| 2.5.8 Target Size Minimum (AA)               | Fixture-owned interactive wrappers use a 48-point/dp minimum; platform primitives require inspection.      | Touch-target bounds for all controls and catalog paths.                                                                                | Pending              |
| 3.2.1 On Focus (A)                           | Focus alone must not dispatch actions or change catalog path.                                              | Navigation recording and action-status output.                                                                                         | Pending              |
| 3.2.2 On Input (A)                           | Local edits may update bound text but must not dispatch an agent action.                                   | Edit fields and inspect the host status output.                                                                                        | Pending              |
| 3.3.1 Error Identification (A)               | Invalid fields expose validation messages and invalid state.                                               | Accessibility tree and spoken-error output before/after correction.                                                                    | Pending              |
| 3.3.2 Labels or Instructions (A)             | Every supported input has a persistent accessible label.                                                   | Screen-reader navigation with empty and populated values.                                                                              | Pending              |
| 3.3.3 Error Suggestion (AA)                  | Declared validation messages identify the required correction.                                             | Spoken and visual validation-message inspection.                                                                                       | Pending              |
| 3.3.7 Redundant Entry (A)                    | The fixture has no repeated-entry flow.                                                                    | Confirm no generated catalog path adds one.                                                                                            | Pending              |
| 3.3.8 Accessible Authentication Minimum (AA) | The fixture demonstrates an obscured field but performs no authentication.                                 | Record as not applicable to this single-screen renderer fixture.                                                                       | Not applicable       |
| 4.1.2 Name, Role, Value (A)                  | Text, buttons, inputs, disabled/invalid state, hidden content, and bound values must be exposed correctly. | Platform accessibility tree plus VoiceOver/TalkBack output.                                                                            | Pending              |
| 4.1.3 Status Messages (AA)                   | Polite/assertive bound regions and host action status must be announced without forced focus.              | VoiceOver/TalkBack recordings for updates.                                                                                             | Pending              |

## Exceptions and responsibility boundary

- Input-purpose metadata is not accepted from the server because the pinned A2UI subset has no
  closed vocabulary that can safely select native personal-data or credential behavior. A shipping
  host that collects user data must add purpose metadata in trusted locally bundled components and
  test it as part of that product's assessment.
- Colors, spacing, visible focus, scroll containers, keyboard avoidance, and touch-target geometry
  are host presentation responsibilities. The generated fixture supplies one auditable reference
  implementation; another design system must repeat the catalog-parity case.
- VoiceOver, TalkBack, system text rendering, and platform control behavior are platform outcomes.
  Unit tests and simulator inspection are useful preflight evidence but cannot replace the physical
  rows required by the release gate.
- The renderer does not expose media, time limits, flashing content, complex gestures, drag actions,
  authentication, help mechanisms, or multi-screen navigation in this profile. Criteria depending
  exclusively on those features are outside this fixture's applicable boundary.

## Completion rule

Replace a pending result only after every required platform row and all three catalog paths have
reviewable evidence. Any failure must become a tracked issue and, where representable, a regression
test. The strict `npm run native:evidence:verify` command is the machine-enforced `0.4.0` release
gate.
