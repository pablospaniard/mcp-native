# WCAG 2.2 native responsibility assessment

Status: design and host-responsibility guidance for the supported A2UI native subset. Platform and
component-library behavior is validated independently in the Expo Go PoCs and is not a package
release or milestone gate.

WCAG is a web-content standard. W3C's WCAG2Mobile work provides informative guidance for applying
its principles to native mobile applications. MCP Native can enforce only the semantics represented
by its closed protocol and trusted render plan; the host still owns presentation and platform
behavior.

## Library-enforced behavior

The supported renderer boundary:

- derives closed text, button, image, checkbox, adjustable, radio, and tab semantics instead of
  accepting native roles from a server;
- preserves labels, descriptions, disabled and invalid state, validation messages, and live-region
  intent through explicitly selected host props;
- excludes hidden controls from the accessibility tree;
- keeps renderer-local edits local until an explicit action is dispatched;
- prevents invalid buttons from resolving or dispatching their actions; and
- explicitly enables text scaling for supported text and text-input components.

The host implementation remains responsible for choice-item grouping, slider value announcements,
date/time picker semantics, tab selection/focus, modal focus entry/trapping, platform back or escape
dismissal, focus restoration, image failure alternatives, and meaningful icon-only labels. The
typed boundary provides the required values and callbacks but cannot prove that a third-party
component exposes them correctly on a particular OS version.

Automated tests cover those mappings, failure paths, and the rule that arbitrary props and component
implementations cannot cross the host boundary.

## Host and PoC responsibilities

Each Expo Go PoC must check the applicable WCAG 2.2 Level A and AA scenarios for its exact platform,
Expo SDK, React Native version, and component-library version. At minimum, exercise:

- names, roles, values, descriptions, validation messages, and status announcements;
- forward and reverse focus order, visible focus, keyboard avoidance, and absence of focus traps;
- portrait and landscape layout at normal and large system text sizes;
- contrast, non-text contrast, reflow, and touch-target size;
- local input behavior, disabled actions, and single action dispatch; and
- tab traversal/selection, modal focus and dismissal/restoration, adjustable controls, grouped
  choices, image alternatives, and decorative-divider exclusion; and
- platform screen-reader navigation and activation.

Input-purpose metadata, colors, spacing, scroll containers, visible focus styling, keyboard
avoidance, touch-target geometry, and component-library accessibility behavior are host-owned. A
PoC limitation must be fixed in the local adapter or host component; it must not be worked around by
allowing the server to choose native capabilities or unchecked props.

PoC observations belong in that app's README with exact versions and reproduction steps. They do
not establish protocol conformance or package support for other libraries and do not participate in
package release verification.
