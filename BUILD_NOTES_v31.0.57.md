# The Dye Ledger v31.0.57 — Component Consistency

## Scope

Adds a screen-only component stylesheet for common control heights, padding,
shapes, focus/pressed/disabled states, card/list spacing and overlay headings.
Classic stepper and player-name controls have 44px minimum touch heights.
Special scoring grids retain their layout, controller and saved-state contracts.
Sheets/dialogs scroll within viewport limits; supported overlays subtract the
existing keyboard offset. Sheet headers remain reachable while the body scrolls.
Reduced-motion preferences disable control transitions.

The light build-date footer now uses full-opacity secondary ink, wraps with
larger text and sits below content instead of covering controls. Memory Cancel
moves into its sticky header using the existing ID and handler. New browser
checks cover footer contrast, visible control height,
keyboard focus, real dialog dismissal and a keyboard-sized sheet viewport.
The legacy exact-color refactor suites run without the new screen component layer;
current dark, larger-text, component and scoring suites exercise the full app.
Print comparisons remain exact, using the independent fixed paper stylesheet.

app.js changes release metadata only. No domain, scoring, Round/record, storage,
Supabase or Shared Match changes. No migration, navigation or icon conversion.
Twenty-three legacy important declarations are removed from card spacing,
player-name sizing and numeric stepper geometry: total 640 → 617.
The component stylesheet itself has zero important declarations.

## Verification

All seven release gates pass: npm test (1,274/1,274, no skips); lint (zero errors,
88 pre-existing warnings); validate; six check:layout fixtures including iOS;
standard release:sanity (6 PASS, 3 development warnings, zero failures);
simulate:compare (77 exact live/mirror matches, zero failures/differences); and
test:simulations (4/4). Current dark appearance, doubled-text/reduced-keyboard
scoring, component states, header alignment, Wolf declarations, saved-setup
selection and exact paper/foundation comparisons all pass.

The footer intercepted the saved-setup button under the previous fixed layout;
moving it into flow fixes the interaction without changing saved-setup logic.
Memory Cancel remains reachable after scrolling a reduced-height sheet and uses
the existing close handler. Generated report outputs are restored after checks.

Real iPhone checks remain pending: both appearances, Larger Text, keyboard-open
scoring and overlay controls, portrait/landscape. Browser viewport checks are not
hardware acceptance. Promotion-specific sanity expects a release branch;
the standard development check was used on this `codex/` branch.

## Git and roadmap

Branch: `codex/v31.0.57-component-consistency`. Uncommitted and undeployed.
v31.0.58 follows with Play/Insights consistency and tab icon migration.
Bottom navigation remains deferred.
