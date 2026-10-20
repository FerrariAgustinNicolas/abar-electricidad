# H2 complementary UI validation corrections

The externally requested real-browser check reproduced three scoped presentation/accessibility defects on the approved H2 code: the Home heading inherited a dark global heading color over a dark hero, the enabled quantity-stepper text inherited white over a light background, and native fragment skip links resolved against the application's root base URL instead of focusing the current route's main region. Public navigation links also lacked visual separation.

## Minimal correction

- Scope the Home heading and detail-stepper colors locally; preserve shared tokens and data behavior.
- Give public navigation a wrapping flex gap, without changing destinations.
- In each existing layout, cancel the skip link's default navigation and focus its own main element with tabindex minus one. Retain the current route, filters and fragment; do not change authentication, logout or route guards.
- Preserve all catalog, stock and money contracts. No backend source change is required.

## Evidence boundary

Two skip-link regressions observed RED, then four focused layout/detail tests passed. The affected frontend build/lint and 79 tests across 16 files passed; backend suites were deliberately not repeated. Independent isolated verification passed four focused tests and two keyboard-generated-click probes, with 61 source hashes unchanged. Real browser Tab/Enter now focuses the appropriate main region on all six requested routes, preserving the URL; subsequent Tab reaches the first content control. Stock's internally scrolling table responds to keyboard Right at 360 pixels without widening the document.

The complete visual matrix, before/after screenshots, integrated fixture smoke, zoom limitations and exact delivery commit are recorded in the complementary milestone report. These observations are not a global WCAG, Figma or production certification.

Risk: item 3 — public and H1 administrator layouts are shared. Independent scoped verification and explicit unchanged logout/navigation assertions cover the correction; no security policy or business operation was changed.
