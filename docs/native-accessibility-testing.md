# Native accessibility test plan

Status: planned, not yet executed. This document defines evidence required for the Milestone 4
real-platform accessibility gate; it does not claim VoiceOver, TalkBack, WCAG, or device coverage.

## Scope and fixture

Exercise a real host application using the base primitive catalog, typed host adapters, and every
closed component variant. The fixture must include normal and hidden text, polite and assertive live
regions, enabled and disabled buttons, valid and invalid text fields, multiline, numeric, and secure
inputs, dynamic-list content, and enough content to scroll in both orientations.

The server remains unable to choose native roles, accessibility state, font-scaling policy,
accessibility actions, component implementations, or arbitrary props. Tests must confirm that host
adapter mappings preserve the renderer-selected semantics.

## Required environments

- VoiceOver behavior must be verified on a physical iOS device. React Native's
  [accessibility guide](https://reactnative.dev/docs/accessibility.html) notes that VoiceOver is not
  available through the simulator; Accessibility Inspector is useful preflight evidence but is not
  a device-test substitute.
- TalkBack must be verified on an Android device and on the supported emulator image described in
  the same React Native accessibility guide.
- Record the exact application revision, React Native version, host catalog, device or emulator,
  operating-system version, assistive-technology version, locale, text-size setting, and tester.

The supported iOS and Android version matrix is intentionally not defined by this plan. That
separate roadmap item must be resolved before the platform gate can pass.

## Test cases

1. Navigate the complete surface in both directions. Focus order follows visual and reading order,
   every visible actionable control is reachable, and hidden content is neither focused nor read.
2. Confirm text, buttons, field labels, values, hints, validation messages, live-region updates, and
   button disabled state are announced accurately without duplicate or stale announcements.
3. Activate every enabled button using the screen reader. Each activation dispatches exactly once;
   disabled buttons and failed renderer checks dispatch nothing.
4. Edit every input type. Labels remain available while values change, secure values are not spoken
   as plain text, local updates do not create network actions, and submission uses current state.
5. Test the normal size and each supported larger system text size. Text and inputs scale without
   clipping, loss of content, overlap, or unreachable controls. React Native documents
   `allowFontScaling` for [Text](https://reactnative.dev/docs/text.html) and
   [TextInput](https://reactnative.dev/docs/textinput.html); MCP Native supplies it as `true`.
6. Repeat navigation and interaction in portrait and landscape, with reduced motion enabled, and
   with platform contrast-related settings used by the supported matrix. Meaning and action must
   not depend on animation, color alone, or one orientation.
7. Inspect touch targets, visible focus, contrast, zoom/reflow behavior, and error identification
   against the applicable WCAG 2.2 Level AA and platform criteria. Record exceptions rather than
   treating a host design-system result as a library-wide guarantee.
8. Repeat the relevant cases for base primitives, adapters, and variants. A host mapping that drops
   a selected semantic is a failed integration even when the underlying component renders.

## Evidence record

Create one row per environment and attach logs, screenshots or recordings, and issue links. Do not
mark the roadmap platform-accessibility item complete while any required row is missing or failing.

| Revision         | Platform/device | OS and RN | Assistive technology | Catalog path | Date/tester | Result  | Evidence/issues |
| ---------------- | --------------- | --------- | -------------------- | ------------ | ----------- | ------- | --------------- |
| Not yet recorded | —               | —         | —                    | —            | —           | Not run | —               |

## Exit criteria

- Every required matrix row passes all applicable cases with reviewable evidence.
- Failures have regression tests where automation can represent them and tracked host/platform work
  where it cannot.
- The compatibility matrix names tested behavior narrowly; it does not infer untested devices,
  operating-system versions, design systems, or WCAG conformance.
- The existing security boundary remains intact: remediation cannot introduce remote code,
  arbitrary component resolution, unchecked prop spreading, or server-selected native behavior.
