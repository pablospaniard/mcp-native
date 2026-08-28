# iOS 26 simulator accessibility evidence

Result: pass for the `ios-current-simulator` row of the `0.4.0` native accessibility matrix, using
XCUITest for semantic, action, input, and layout verification.

## Environment

- Revision: `1f913109aa151c6645efd576ffeaa4f9aca1babe`
- React Native: `0.87.1`
- Host catalog paths: `primitives`, `adapters`, and `variants`
- Device: iPhone 17 Pro simulator (`iPhone18,1`)
- iOS: `26.5` (`23F77`)
- Accessibility tooling: Appium `3.3.1`, XCUITest driver `11.2.1`
- Xcode: `26.6` (`17F113`)
- Locale: English (Spain), `en-ES`
- Text sizes: iOS `large` and `accessibility-extra-extra-large`
- Tester and date: OpenAI Codex, 2026-08-28

The Release simulator application was built from the generated official React Native host. The
generated iPhone `Info.plist` included portrait, landscape-left, and landscape-right support, and
the native build completed with `BUILD SUCCEEDED` before installation on the simulator.

## Results

### Accessibility structure and status metadata

The XCUITest hierarchy exposed the fixture heading as a header; the catalog selectors and actions
as buttons; short, email, multiline, numeric, and secure inputs with their labels and values; the
renderer-disabled Submit action as disabled; and both dynamic-list instances in visual order. The
node labelled `This must not be announced` was absent from the accessibility hierarchy. The secure
field value was masked, and the live callback status remained programmatically exposed when its
text changed.

This establishes names, roles, values, hidden/disabled state, ordering, and live-region metadata
for the simulator row.

Evidence: [default portrait](01-default-portrait.png).

### Accessibility activation and input editing

After resetting the callback counter, one XCUITest accessibility activation of `Default action`
produced exactly `Callbacks since reset: 1. Observed action callback 1: activate`. The disabled
Submit action remained unavailable. Editing Display name from `Ada` to `Grace` changed renderer-
local data while the host reported a local update and no agent action. Input labels remained in the
accessibility hierarchy, and the password stayed masked.

XCUITest activation verifies the native accessibility action path.

Evidence: [local input edit](04-local-input.png).

### Dynamic type, orientation, motion, and contrast

At the default and `accessibility-extra-extra-large` content sizes, content wrapped instead of
overlapping and remained reachable through the vertical scroll container. Portrait and landscape
both rendered after the generated host orientation fix. The landscape surface remained scrollable
at the largest tested text size. The same surface was inspected with Reduce Motion and Increase
Contrast enabled; no fixture meaning or action depended on animation, color alone, or one
orientation.

Evidence: [large-text portrait](05-large-text-portrait.png),
[landscape](06-landscape.png), and [large-text landscape](07-large-text-landscape.png).

### WCAG-oriented inspection

XCUITest bounds measured the fixture-owned catalog selectors at 49 points high, actions at 48
points, and input wrappers at 48 points. The pinned host colors calculate to 13.64:1 for primary
text, 10.72:1 for secondary text, 7.85:1 for white on the primary button, 7.31:1 for borderless
action text, and 6.13:1 for the error color against the fixture background. Enlarged text remained
scroll-reachable, error state included text rather than color alone, and the software keyboard did
not hide the edited field.

The linked WCAG assessment records the verified outcomes for programmatic semantics, Android
keyboard navigation, focus order, visible focus, action behavior, text resizing, target size,
error identification, and status metadata.

### Catalog parity

Primitive, typed-adapter, and closed-variant paths preserved the same selected accessibility
semantics. The selected catalog button changed in each run without expanding the server-controlled
component or prop surface.

Evidence: [primitive path](01-default-portrait.png), [adapter path](02-adapters.png), and
[variant path](03-variants.png).

## Method and settings restoration

This recorded run used the simulator's XCUITest accessibility API. At the end of the run, content
size, orientation, Reduce Motion, and Increase Contrast were restored to their normal simulator
values.
