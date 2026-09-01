# v31.0.26 — Imported Scorecard Draft Reliability

## Summary

- Keeps Course Name, City, State, Country, tee details, and hole corrections in a live imported-scorecard working draft.
- Preserves imported-scorecard edits across unrelated `renderAll()` refreshes, including background cloud activity.
- Restores the focused control, cursor selection, expanded tee sections, and review-panel scroll position after an unavoidable rebuild.
- Retains stable imported tee identities while the draft is edited.
- Leaves Course Library persistence, publishing, scoring, synchronization, and Ledger Entry behavior unchanged.

## Verification

- Focused imported-scorecard draft regression tests.
- Complete application test suite.
- Lint, release validation, release sanity, simulation comparison, and Ledger Entry layout acceptance.
- Mobile and desktop visual review of the imported-scorecard editor.
