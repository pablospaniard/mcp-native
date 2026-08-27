# Android 17 emulator accessibility evidence

Result: pass for the `android-current-emulator` row of the `0.4.0` native accessibility matrix.

## Environment

- Revision: `f7c240bc25e092f502abaca21b496f76b6160fb5`
- React Native: `0.87.1`
- Host catalog paths: `primitives`, `adapters`, and `variants`
- Device: `MCP_Native_API_37` Pixel 9 Pro AVD, Google Play ARM64 image
- Android: 17 / API 37, fingerprint
  `google/sdk_gphone64_arm64/emu64a:17/CE2A.260420.019/15611780:user/release-keys`
- TalkBack: `17.0.0.889642762` (`versionCode=60201234`, `targetSdk=37`)
- Locale: English (United States), `en-US`
- Text sizes: Android font scales `1.0` and `2.0`
- Tester and date: OpenAI Codex, 2026-08-27
- Native build preflight: [GitHub Actions run 33115851723](https://github.com/pablospaniard/mcp-native/actions/runs/33115851723)

TalkBack was the bound accessibility service with touch exploration enabled. Its developer
`Display speech output` option made spoken output reviewable in screenshots. Reproducible keyboard
navigation used DPAD forward/back and Enter while TalkBack remained bound; touch exploration and
the Android keyboard were used for field editing.

## Results

### Focus navigation

Forward and reverse navigation followed the visual order through the complete scroll surface.
Navigation auto-scrolled to both dynamic-list instances, skipped the hidden accessibility node and
the renderer-disabled Submit action, and retained a visible platform focus indicator. The root
scroll view did not become a duplicate full-screen focus target.

Evidence: [forward navigation](10-forward-navigation.png),
[reverse navigation](11-reverse-navigation.png), and
[landscape auto-scroll](07-large-text-landscape.png).

### Announcements

TalkBack speech output identified the heading, selected catalog buttons, button roles, field
labels, invalid-email messages, dynamic-list text, and live callback status. The password field was
announced as a password with only its character count and the host description `Secure value`; its
contents were not spoken as plain text. The polite callback live region announced its new count
after activation, and the assertive form status remained exposed on every catalog path.

Evidence: [password announcement](05-password-announcement.png) and
[live action status](01-primitives-action.png).

### Screen-reader actions

With the callback count at zero, one Enter activation on the TalkBack-focused default action
produced exactly one `activate` callback. The same check passed for primitive, adapter, and variant
catalogs. Renderer-disabled Submit was skipped and could not dispatch.

Evidence: [primitive action](01-primitives-action.png),
[adapter action](08-adapters-action.png), and [variant action](09-variants-action.png).

### Input editing

The short text, email, multiline, numeric, and obscured inputs accepted native edits with TalkBack
enabled. Each edit changed the renderer-local model while the callback count stayed at zero. Email
validation updated locally, the numeric field kept its numeric keyboard, multiline content remained
editable, and the obscured input exposed only a character count.

Evidence: [name edit](02-name-edit.png), [email edit](02-email-edit.png),
[multiline edit](03-multiline-edit.png), [number edit](04-number-edit.png), and
[password semantics](05-password-announcement.png).

### Dynamic type, orientation, motion, and contrast

At font scale `2.0`, content remained readable and reachable without overlap or lost controls in
portrait and landscape. DPAD navigation auto-scrolled the enlarged landscape layout. The same
navigation and actions passed with all three Android animation scales set to zero and high-text
contrast enabled; meaning did not depend on color, motion, or orientation.

Evidence: [large-text portrait](06-large-text-portrait.png) and
[large-text landscape with high contrast](07-large-text-landscape.png).

### WCAG-oriented inspection

Host controls and fields have a minimum 48 dp height, exceeding the applicable 24 by 24 CSS-pixel
target-size threshold. TalkBack supplied a visible green focus indicator. Measured fixture contrast
ratios were 13.64:1 for primary text, 10.72:1 for secondary text, 7.85:1 for white on the primary
button, 7.31:1 for borderless action text, and 6.13:1 for the error color against the fixture
background. Enlarged text reflowed and remained scroll-reachable; error state included visible text
and TalkBack output rather than color alone.

This row assesses the pinned fixture and trusted host mapping. It is not a general WCAG claim for
arbitrary host design systems.

### Catalog parity

Primitive, typed-adapter, and closed-variant paths preserved labels, roles, disabled state, field
semantics, live status, local edits, dynamic-list order, and one-callback action behavior. The
variant path changed presentation without expanding the server-controlled component or prop
surface.

Evidence: [adapter action](08-adapters-action.png), [variant action](09-variants-action.png), and
[forward dynamic-list navigation](10-forward-navigation.png).

## Settings restoration

After the run, font scale, orientation, high-text contrast, and animation scales were restored to
their normal emulator values. TalkBack remained enabled for follow-up review.
