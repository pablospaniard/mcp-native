# Native accessibility test plan

Status: target matrix, generated host, CI preflight, WCAG assessment, and strict evidence gate
defined; real-platform runs not yet executed. This document defines evidence required for the
Milestone 4 real-platform accessibility gate; it does not claim VoiceOver, TalkBack, WCAG, or
device coverage.

## Scope and fixture

Exercise a real host application using the base primitive catalog, typed host adapters, and every
closed component variant. The fixture must include normal and hidden text, polite and assertive live
regions, enabled and disabled buttons, valid and invalid text fields, multiline, numeric, and secure
inputs, dynamic-list content, and enough content to scroll in both orientations.

This host is test infrastructure, not another repository example application. Generate it in a
temporary test workspace or exercise it through the supported external host matrix; do not commit a
second native project scaffold under `examples/`.

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

## Target platform matrix

The first gate targets the current stable React Native line and its immediate actively maintained
predecessor. As of 2026-08-27, the official [React Native release
overview](https://reactnative.dev/releases/) identifies those lines as `0.87.x` and `0.86.x`; use
the newest patch in each line. React Native's release policy maintains the latest three minor
series, but MCP Native does not infer platform support from that upstream maintenance window or
from its wider package peer range.

Run the complete fixture in every required row below. Minimum-OS rows protect the deployment floor;
current-OS rows cover current platform behavior. A host may test more versions, form factors, and
design systems, but those results do not replace a required row.

| Required row             | React Native | Environment                              | OS target                          | Assistive technology   | Purpose                                 |
| ------------------------ | ------------ | ---------------------------------------- | ---------------------------------- | ---------------------- | --------------------------------------- |
| iOS minimum              | `0.87.1`     | physical device                          | iOS 15.1                           | VoiceOver              | React Native deployment floor           |
| iOS current              | `0.87.1`     | physical device                          | iOS 26.6.1                         | VoiceOver              | current stable iOS behavior             |
| Android minimum          | `0.87.1`     | physical device                          | Android 7 / API 24                 | TalkBack               | React Native deployment floor           |
| Android current device   | `0.87.1`     | physical device                          | Android 17 / API 37                | TalkBack               | current stable Android behavior         |
| Android current emulator | `0.87.1`     | Google Play image                        | Android 17 / API 37                | TalkBack               | reproducible automation/preflight lane  |
| Previous React Native    | `0.86.3`     | one current physical device per platform | iOS 26.6.1 and Android 17 / API 37 | VoiceOver and TalkBack | immediate maintained-line compatibility |

At the 2026-08-27 matrix snapshot, Apple's [release
feed](https://developer.apple.com/news/releases/) lists iOS 26.6.1 and the Android Developers
[platform overview](https://developer.android.com/about/versions/17) identifies Android 17 / API 37.
An iOS 26.6.1 simulator Accessibility Inspector run is recommended preflight evidence, but it cannot
replace either physical iOS row. Record newer stable OS patches in place of the named current patch
when the matrix is executed, and update this document rather than silently widening a result.

The package's current `react-native >=0.76.0 <1` peer range is an install-compatibility boundary,
not a tested platform claim. Narrow or widen a published support claim only after evidence exists
for the corresponding rows. React Native `0.87` itself targets iOS 15.1 and Android 7 / API 24 or
newer; its [release notes](https://reactnative.dev/blog/2026/08/11/react-native-0.87) also set a
minimum compile SDK of 34 and compile SDK 37. Those build settings belong to the temporary host and
do not expand MCP Native's native component or capability catalog.

## Test cases

1. Navigate the complete surface in both directions. Focus order follows visual and reading order,
   every visible actionable control is reachable, and hidden content is neither focused nor read.
2. Confirm text, buttons, field labels, values, hints, validation messages, live-region updates, and
   button disabled state are announced accurately without duplicate or stale announcements.
3. Reset the host callback count before activating each enabled button with the screen reader. One
   activation must produce a count of exactly one; disabled buttons and failed renderer checks must
   leave the count at zero.
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

## Automated fixture

Use `tests/fixtures/a2ui-v1/accessibility-surface.json` for every matrix row. It covers visible and
hidden text, polite and assertive live regions, enabled and renderer-disabled buttons, valid and
invalid fields, all four text-input variants, every closed view/text/button variant, and a dynamic
list. The repository test suite mounts the same payload through the primitive catalog and verifies
the trusted props, local edits, current-state validation, and observable action callback counts.

For adapter and variant runs, map the fixture through the host's real locally bundled catalog. Do
not edit the protocol fixture to compensate for a host adapter that drops accessibility props. Add
enough host-owned padding/content for scrolling and touch-target inspection; visual layout, colors,
focus treatment, and scroll containers remain host responsibilities rather than server-controlled
wire properties.

`tests/native-host/App.tsx` is the hand-authored host screen. It provides selectable primitive,
typed-adapter, and closed-variant catalog paths, bounded local styling, a scroll container, and a
live status plus a resettable callback count that distinguishes renderer-local edits, one dispatch,
and duplicate dispatches. It is copied
into an official temporary host; no Android/iOS scaffold or independent lockfile is committed.

Use Node.js 22.14 or newer and generate one pinned host outside the repository:

```sh
npm run native:host:prepare -- --react-native 0.87.1 --output /absolute/temporary/host
```

Repeat with `0.86.3`. Preparation builds and packs the local packages, invokes the pinned official
React Native Community CLI, installs the tarballs, and runs the host's strict TypeScript check. The
regular CI matrix also creates Android and iOS production Metro bundles for both versions. The
manually dispatched `Native platform preflight` workflow builds installable Android debug APKs and
iOS simulator applications for both versions; those artifacts are preflight inputs, not physical
device evidence.

The generator refuses an output inside the repository and refuses to replace an existing path.
This preserves the one-PoC policy and prevents a cleanup or regeneration command from deleting an
unrelated host.

## Evidence record

Record every environment in `docs/evidence/native-accessibility-0.4.0.json` and attach logs,
screenshots or recordings, and issue links. `npm run native:evidence:check` validates the pending
record during ordinary development. `npm run native:evidence:verify` is strict: every required case
and row must pass with a full commit SHA, environment metadata, tester/date, and at least one safe
repository-relative artifact or HTTPS evidence link.

The strict evidence command is part of `npm run release:verify`, so a tag cannot pass release
verification while a row is missing, pending, failing, malformed, or unsupported by reviewable
evidence. Do not mark the roadmap platform-accessibility item complete before that command passes.

The applicable [WCAG 2.2 native assessment](wcag-2.2-native-assessment.md) records fixture scope,
manual checks, not-applicable criteria, and the trusted-host exception for input-purpose metadata.

## Exit criteria

- Every required matrix row passes all applicable cases with reviewable evidence.
- Failures have regression tests where automation can represent them and tracked host/platform work
  where it cannot.
- The compatibility matrix names tested behavior narrowly; it does not infer untested devices,
  operating-system versions, design systems, or WCAG conformance.
- The existing security boundary remains intact: remediation cannot introduce remote code,
  arbitrary component resolution, unchecked prop spreading, or server-selected native behavior.
