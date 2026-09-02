# A2UI v1 automated robustness gates

This document defines the repeatable Node.js performance and generated-input gates for the
supported A2UI v1 Candidate profile. These are regression ceilings for protocol parsing, ordered
state updates, and trusted render-plan construction; they are not claims about native frame time or
device memory use.

The maximum-node timing fixture uses inexpensive text nodes so results remain stable. Component-
specific amplification is covered separately by negative tests: cumulative choice-option count and
output, image count, URL and redirect-origin output, total granted transfer bytes and decoded
pixels, validation output, and typed binding reconstruction all fail before unbounded host work can
be created.

## Performance method and budgets

`npm run test:performance` builds the packages and runs `scripts/run-a2ui-performance.mjs` with
explicit garbage collection enabled. The script reports the Node version, platform, architecture,
fixture size, measurements, and fixed budgets as JSON. CI runs the gate on Node.js 22.

Timing measurements use five warm-up runs followed by twenty measured samples and enforce the 95th
percentile. The retained-heap measurement warms the parser first, collects garbage, retains one
parsed envelope, ordered surface snapshot, and native render plan, then collects garbage again.

| Operation     | Workload                                                                       |        Budget |
| ------------- | ------------------------------------------------------------------------------ | ------------: |
| Parse         | One serialized `createSurface` containing 1,024 components                     | p95 <= 100 ms |
| Update        | A batch of 500 sequential data-model updates                                   | p95 <= 250 ms |
| Render plan   | One validated surface containing 1,024 reachable nodes                         | p95 <= 100 ms |
| Retained heap | Parsed envelope, surface store, snapshot, and render plan for 1,024 components |     <= 32 MiB |

The budgets intentionally leave room for shared CI variability while remaining low enough to catch
catastrophic regressions. Any budget change requires a reviewed explanation and before/after
measurements; a faster workstation result alone is not sufficient reason to relax a gate.

## Generated-input coverage

`tests/a2ui-v1-fuzz.test.mjs` uses fixed-seed generators so failures reproduce exactly without a
network service or a probabilistic dependency. The regular test and coverage gates exercise:

- 750 arbitrary bounded JSON values through both A2UI envelope directions, requiring exact message
  ownership for accepted values and controlled `A2uiParseError` rejection otherwise;
- 125 generated lifecycle streams with object/string equivalence, ownership checks, ordered updates,
  and monotonic revisions;
- 150 valid dynamic-list surfaces with bounded expansion, stable unique keys, and trusted component
  names only; and
- 250 graph, component, binding, and function-policy mutations that must fail closed through a
  controlled parser error.

Iteration counts and seeds are compatibility surfaces for the regression gate. Increasing them is
safe after measuring CI cost; reducing them requires a reviewed rationale.

## App-level demonstrations

These gates execute the protocol and render-plan layers under Node.js. The open Expo Go
demonstration track will exercise the shared surface through the React Native primitives baseline
and selected common component libraries, adding exact platform and library evidence.
