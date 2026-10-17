# v31.0.75 — Flamtana Hole Tees

Started clean from committed v31.0.74 (e828bfe), on
codex/v31.0.75-flamtana-hole-tees. John requested the specific tee used on the
current hole rather than the overall combo selection in Flamtana Play.

- Team rows now use the existing hole-specific tee resolver and saved round
  course snapshot, matching the established Play header behavior.
- Each team's label follows hole navigation independently (for example Blue on
  Hole 1 and White on Hole 2). Ordinary tees retain their existing labels.
- An unresolved combo source says "Hole tee not recorded" rather than claiming
  the overall combo is a physical tee. No tee assignment or course data is changed.
- Scoring, strokes, handicaps, wagers, saving, sharing and frozen records are
  unchanged. This display fix also applies to existing Flamtana working rounds.
- Fresh cache and immutable branding assets. No SQL or service deployment changes.

## Verification

Focused browser acceptance passes in Classic and Player configurations: opposing
combo assignments, holes 1/2/18, ordinary tees, missing source, saved snapshot
precedence over an edited library, par-based score entry and both-partner saving.
Course snapshot, selected games and saved tee IDs remain unchanged. Widths
320/375/430, 32px text and 44px touch targets pass.

- Lint: 0 errors, 88 existing warnings. Validate passes. Release sanity:
  6 pass, 3 development warnings, 0 failures.
- Simulation comparison: 77/77 exact, 0 differences/failures, 62 warnings and
  2 suspicious outcomes; simulation tests 4/4. Flamtana's simulation-mirror gap
  remains deferred; the full suite retains its dedicated new/legacy engine cases.
- Layout: 7/7, 46 pages. All seven reference PDFs retain their original page
  counts and extracted text; original PDF bytes preserved.
- Full regression: **1,440/1,440 pass**, 0 failures/skips (512.8 seconds).

No commit, push or deployment performed; actual iPhone acceptance remains
separate. Update the app to see this label correction in existing rounds; a new
round is not required.
