# The Dye Ledger v31.0.53 — System Dark Mode

## Scope

Adds an automatic screen-only dark palette using the semantic token foundation.
Charcoal-green surfaces, off-white text and distinct positive/warning/negative
ink follow device appearance without adding a saved preference. Native controls,
browser theme color, selected buttons and focus states follow the palette.

The frozen light stylesheet remains unchanged. Printed scorecards, generated
reports and Ledger Entry remain light. Export controls displayed within the app
use screen colors independently of their light documents. Diagnostic access
remains More → App Support → Technical diagnostics.

`-webkit-text-size-adjust:100%` is retained for the typography release, where its
removal and iOS Larger Text can be assessed together on real hardware. No type,
spacing, icon, navigation or component redesign is included.

No scoring, settlements, Round contract, RoundRecords, localStorage, Supabase or
Shared Match behavior changes. Production JavaScript changes only release
identity and module-cache URLs. New cache identity and five immutable branding
assets are included. No database migration is required.

## Verification

- `npm test`: all 1,161 tests passed; zero failures, skips or cancellations.
- Dark browser coverage passed 30 phone/desktop surface cases plus appearance
  switching, focused-input/hover and Ledger Entry light-color isolation cases.
  The minimum measured ordinary-text contrast was 5.81:1, above the 4.5:1 AA
  requirement. Measurements cover 3,158 text/input nodes across the surface cases.
- Exact light computed-style and PNG comparisons passed 20 paired surface cases
  plus an actual scorecard print-media comparison under a dark system preference.
  Dark changes preserve geometry. Report screen paint/pixels and print colors
  remain independent of system appearance.
- Contract tests verify all 316 dark overrides, their registry and screen scope,
  fixed print families, unchanged light declarations and existing drift rules.
- `npm run lint`: zero errors and 88 existing warnings. `npm run validate` and
  whitespace checks passed. `npm run release:sanity`: six passes, three expected
  warnings (uncommitted work and omitted target-version argument), zero failures.
- `npm run simulate:compare`: 77 scenarios (27 fixtures and 50 random rounds),
  zero failures and zero live/mirror differences; 59 informational warnings and
  one settlement-size review flag. `npm run test:simulations`: all four passed.
- The existing menu-focus browser fixture now runs offline with inert workers
  and no external requests. This removes background-update races from its local
  containment/focus assertions; production behavior is unchanged.
- `npm run check:layout`: all six HTML/PDF/iOS fixtures passed. Generated report
  and simulation output files were restored afterward, preserving the original
  committed references and keeping the release focused.

## Acceptance

Branch: `codex/v31.0.53-dark-mode`. No commit, push, merge, deployment or migration
performed by Codex. Real iPhone acceptance is separate and remains required:
switch dark/light appearance, enable Larger Text and open the keyboard during
Classic and Player Mode scoring. Review native selects, status colors and focus
indicators, then print/export a report while the device is dark.
