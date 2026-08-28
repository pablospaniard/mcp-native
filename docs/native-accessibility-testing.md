# Native accessibility test plan

Status: complete for the `0.4.0` release gate. The Android 17 Google Play emulator row passes with
TalkBack evidence. The iOS 26.5 simulator row passes its XCUITest accessibility semantic and layout
preflight.

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

## Verified environments

- Android is exercised on the pinned Google Play emulator with TalkBack enabled.
- iOS is exercised on the pinned current simulator through XCUITest's accessibility API, verifying
  programmatic names, roles, values, enabled/hidden state, accessibility activation, input
  behavior, layout, and platform settings.
- Record the exact application revision, React Native version, catalog paths, simulator or
  emulator, operating-system version, accessibility tooling version, locale, text-size setting,
  and tester.

## Target platform matrix

The `0.4.0` evidence gate verifies React Native `0.87.1` in two repeatable release environments.

| Required row             | React Native | Environment       | OS target           | Accessibility tool         | Purpose                               |
| ------------------------ | ------------ | ----------------- | ------------------- | -------------------------- | ------------------------------------- |
| iOS current simulator    | `0.87.1`     | iPhone 17 Pro sim | iOS 26.5            | XCUITest accessibility API | current iOS semantic/layout preflight |
| Android current emulator | `0.87.1`     | Google Play image | Android 17 / API 37 | TalkBack                   | reproducible screen-reader lane       |

The iOS row records the exact installed runtime rather than silently relabeling it as a newer patch.
The CI bundle and native preflight matrices continue to exercise React Native `0.87.1` and `0.86.3`;
those build results complement, but do not replace, the recorded accessibility runs.

The package declares a `react-native >=0.76.0 <1` peer range. The release evidence verifies the
matrix above, while CI additionally type-checks and bundles generated hosts on React Native
`0.87.1` and `0.86.3`. React Native `0.87` targets iOS 15.1 and Android 7 / API 24 or newer; its
[release notes](https://reactnative.dev/blog/2026/08/11/react-native-0.87) also set a minimum
compile SDK of 34 and compile SDK 37.

## Test cases

1. Inspect or navigate the complete accessibility surface in both directions. Order follows visual
   and reading order, every visible actionable control is reachable, and hidden content is absent.
2. Confirm text, buttons, field labels, values, hints, validation messages, live-region metadata,
   and button disabled state are exposed accurately. The TalkBack row verifies spoken output and
   the XCUITest row verifies the iOS accessibility representation.
3. Reset the host callback count before accessibility-activating each enabled button. One activation
   must produce a count of exactly one; disabled buttons and failed renderer checks remain disabled.
4. Edit every input type. Labels remain available while values change, secure values remain masked,
   local updates do not create network actions, and submission uses current state.
5. Test the normal size and each supported larger system text size. Text and inputs scale without
   clipping, loss of content, overlap, or unreachable controls. React Native documents
   `allowFontScaling` for [Text](https://reactnative.dev/docs/text.html) and
   [TextInput](https://reactnative.dev/docs/textinput.html); MCP Native supplies it as `true`.
6. Repeat navigation and interaction in portrait and landscape, with reduced motion enabled, and
   with platform contrast-related settings used by the supported matrix. Meaning and action must
   not depend on animation, color alone, or one orientation.
7. Inspect touch targets, visible focus, contrast, zoom/reflow behavior, and error identification
   against the applicable WCAG 2.2 Level AA and platform criteria, recording results for each
   verified environment and catalog path.
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

CI repeats preparation with `0.86.3`. Preparation builds and packs the local packages, invokes the pinned official
React Native Community CLI, installs the tarballs, and runs the host's strict TypeScript check. The
regular CI matrix also creates Android and iOS production Metro bundles for both versions. The
manually dispatched `Native platform preflight` workflow builds installable Android debug APKs and
iOS simulator applications for both versions. The generated iPhone host explicitly supports
portrait plus both landscape orientations.

The generator refuses an output inside the repository and refuses to replace an existing path.
This preserves the one-PoC policy and prevents a cleanup or regeneration command from deleting an
unrelated host.

## Evidence record

Record every environment in `docs/evidence/native-accessibility-0.4.0.json` and attach logs,
screenshots or recordings, and issue links. `npm run native:evidence:check` validates the record
during ordinary development. `npm run native:evidence:verify` is strict: every required case
and row must pass with a full commit SHA, environment metadata, tester/date, and at least one safe
repository-relative artifact or HTTPS evidence link.

The strict evidence command is part of `npm run release:verify`; a successful run confirms that
every release row is passing, complete, well-formed, and backed by reviewable evidence.

The applicable [WCAG 2.2 native assessment](wcag-2.2-native-assessment.md) records fixture scope,
manual checks, not-applicable criteria, and the trusted-host exception for input-purpose metadata.

## Exit criteria

- Every required matrix row passes all applicable cases with reviewable evidence.
- Behavior changes include regression coverage at the closest automated or platform layer.
- Compatibility statements name the verified devices, operating-system versions, design systems,
  and WCAG outcomes precisely.
- The existing security boundary remains intact: remediation cannot introduce remote code,
  arbitrary component resolution, unchecked prop spreading, or server-selected native behavior.
