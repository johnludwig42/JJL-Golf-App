# The Dye Ledger v31.0.59 — Play Screen Refinement

## Scope

Moves collapsed Round rules below score entry and save controls/guidance in both
Classic and Player views. Classic retains grouped Prev / Hole / Next navigation,
readable hole facts, direct Scoreboard access and a 44px overflow control whose
symbol stays on one line. Save and backup status occupy a separate readable row
in both views. The Classic header can scroll normally in keyboard-height viewports.

Scoring, saving, handicap/game calculations, localStorage contracts, offline and
Shared Match behavior are unchanged. No database migration. Paper styles and
report calculations are unchanged; release asset references follow the new version.

## Verification

All seven release gates pass: npm test (1,327/1,327, zero failures/skips), lint
(zero errors, 88 existing warnings), validate, all six check:layout fixtures,
release:sanity (6 PASS, 3 development warnings, zero failures), simulate:compare
(77 exact live/mirror matches, zero differences/failures), and test:simulations
(4/4). The focused browser matrix covers both views at 320/375/430px, light/dark,
normal/32px text, intact Prev/Next words, readable Hole 18, 44px touch targets,
separate long backup-warning status, collapsed rules placement, overflow and
Scoreboard access. Rendered phone screenshots were visually reviewed. A real
service-worker install, offline reload and offline save/advance passed.

QA corrected component-style precedence that wrapped overflow dots, widened the
enlarged-text selector, and updated the prior combo-tee test to require the
approved separate save-status row. An existing setup browser test timed out in
an overlapping run, passed its standalone retest, and passed the final full run
without overlapping browser checks. No unresolved implementation issue was found.
Generated reference reports were restored after verification. Simulation scenario
signals include 61 warnings and one suspicious-outcome flag; no invariant failure
or live/mirror difference occurred.

Physical iPhone acceptance for this refinement remains
pending. The Product Owner confirmed all eight v31.0.58 manual iPhone checks passed
before this release. Four-device Shared Match acceptance remains separate.

## Git and roadmap

Branch: codex/v31.0.59-play-screen-refinement, created from updated main after
v31.0.58 merged in PR #155. Changes remain uncommitted. Preferences and Setup
Density follows this focused refinement; Results/overlays and useful Insights
remain later work.

## Manual iPhone acceptance

1. Classic: Prev / Hole / Next stay together; select Hole 18 and verify its label.
2. Classic: Par, yardage and SI are readable; Scoreboard and overflow remain easy to tap.
3. Save and backup status have a separate readable line in both modes.
4. Classic: Round rules starts collapsed after Save Hole Scores and its guidance.
5. Player: Round rules starts collapsed below golfer entry and Save & Next controls.
6. Expand rules, return to scoring, change scores and save/advance; verify saved values.
7. Repeat with Larger Text and the keyboard open; reach save, navigation and overflow.
8. Check light/dark and portrait/landscape, with no horizontal page overflow or obscured actions.

## Changed files and review

Layout/rendering: index.html, app-components.css, style.css, app.js.
Regression coverage: the focused Play refinement browser test and the existing
combo-tee header test, whose save-status placement expectation now matches scope.
Release identity: package files, manifest, service worker, five immutable branding
assets, and versioned report script references. Documentation: project context,
visual roadmap and these build notes. Report styles/calculations remain untouched.
