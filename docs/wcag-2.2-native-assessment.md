# WCAG 2.2 native responsibility assessment

Status: design and host-responsibility guidance for the supported A2UI native subset. The open Expo
Go demonstration track can add platform and component-library evidence to the automated package
release gates.

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

## Host and demonstration responsibilities

Each Expo Go demonstration should check the applicable WCAG 2.2 Level A and AA scenarios for its
exact platform, Expo SDK, React Native version, and component-library version. At minimum, exercise:

- names, roles, values, descriptions, validation messages, and status announcements;
- forward and reverse focus order, visible focus, keyboard avoidance, and absence of focus traps;
- portrait and landscape layout at normal and large system text sizes;
- contrast, non-text contrast, reflow, and touch-target size;
- local input behavior, disabled actions, and single action dispatch; and
- tab traversal/selection, modal focus and dismissal/restoration, adjustable controls, grouped
  choices, image alternatives, and decorative-divider exclusion; and
- platform screen-reader navigation and activation.

Input-purpose metadata, colors, spacing, scroll containers, visible focus styling, keyboard
avoidance, touch-target geometry, and component-library accessibility behavior are host-owned. Fix
demonstration limitations in the local adapter or host component while preserving that host-owned
capability boundary.

Demonstration observations belong in that app's README with exact versions and reproduction steps.
They provide support evidence for that exact library and version set; protocol conformance remains
covered by the package-level gates.
