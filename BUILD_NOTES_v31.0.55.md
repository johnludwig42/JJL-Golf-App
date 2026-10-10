# The Dye Ledger v31.0.55 - Type and Spacing Scale

## Scope

Adds eight shared screen type roles, four weights, three leading roles and a
logical spacing scale. Replaces 407 non-print font-size declarations and over
1,100 spacing declarations, reduces heavy weights and removes 27 screen uppercase
transformations. Captions have an 11px floor; body/input text has a 16px floor.

Touch WebKit uses its native system-body Dynamic Type hook. Browser roots remain
preference-based elsewhere. Text-size-adjust is no longer locked at 100%.
Score choices/actions, preference segments, readbacks and library identities
reflow with larger text. Score and stake inputs gain enough content height.
SVG annotation text compensates for viewBox scaling through a presentation-only
observer. Chart layout reserves room for larger annotations and thins crowded
labels while preserving every data point, value and scoring scale.

`app-print.css` preserves the original paper typography/spacing and print cascade.
Ledger Entry and separate report-window styling remain unchanged. The stylesheet
font exception inventory shrinks from 197 entries to four fixed print entries.
New drift checks enforce the registry and reject undeclared or local overrides.

No scoring, Round/record contract, localStorage, Supabase, Shared Match or input
controller change. Production `app.js` changes release identity and chart
presentation geometry only. New worker
assets and immutable branding filenames are included. No migration is required.
Buttons/switches/sheets, icon migration and bottom navigation remain outside this
release; the component layer follows in v31.0.56.

## Verification

Focused checks pass: type-registry/drift tests; screen readability/reflow through
200% root text; minimum floors; reduced keyboard viewports in Classic/Player Mode;
boundary widths; dark contrast; unchanged light colors and exact printed metrics.
Release gates: 1,224 tests pass; lint has zero errors and 88 existing warnings;
validation passes; all six PDF layout fixtures pass; release sanity has zero
failures (the uncommitted working tree and omitted promotion target are warnings).
Live/mirror scoring agrees exactly in all 77 comparison rounds; simulation
tests pass. A target-specific promotion sanity check expects a `release/v31.0.55`
branch; this work remains on the requested `codex/` development branch.
The final chart-edge alignment change also passes 66 focused browser/scoring
checks, including horizontal SVG-label bounds at enlarged text sizes.

## Acceptance and Git

Branch: `codex/v31.0.55-type-spacing-scale`. Changes are uncommitted and undeployed.
Real iPhone acceptance remains required: Larger Text at default and accessibility
sizes, Classic and Player scoring with the keyboard open, orientation changes,
light/dark appearance, and print/save. Browser emulation is not physical acceptance.
