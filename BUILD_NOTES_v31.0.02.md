# The Dye Ledger v31.0.02 Build Notes

## Release purpose

v31.0.02 adds Ledger Entry as the default and recommended Export report while preserving Match Summary and Classic Scorecard.

## Delivered

- Six-subject hierarchy: Result, Round Story, Leaderboards, Games, Statistics, and Appendix.
- Explicit Gross, full Course Handicap, 100% off-low, and Featured Competition bases.
- Canonical dollars-versus-points labelling and independent reconciliation.
- A dedicated, automatically generated 300–400 word `The Story of the Round` uses authoritative round facts and major-publication editorial pacing without duplicating the Match Summary recap. It is reused in memory for the same unchanged RoundRecord and falls back visibly to a deterministic facts-only story when AI is unavailable.
- Round memories and match-start weather sourced from the RoundRecord with provenance.
- Presses rendered as separate nested ledgers; parent margin charts remain unchanged.
- FINAL, CLINCHED EARLY, and PROVISIONAL treatment with no award to non-finishers.
- Print-aware pagination and greyscale-distinguishable charts.
- Dedicated editorial renderer matching the approved six-page reference design, with self-hosted Archivo, Inter, and IBM Plex Mono fonts.

## Compatibility and security

- Existing local rounds, Shared Matches, scores, games, settlements, memories, and exports are preserved.
- Report generation is read-only and triggers no upload, claim, rewrite, merge, or deletion.
- No production database, Supabase policy, secret, deployment, or remote branch was changed.
- Private identity, device, authentication, and diagnostic fields are excluded.

## Testing

- Focused v31.0.02 contract: 61 non-browser assertions.
- Existing report-layout and full application regressions are required before promotion.
- Browser PDF fit passed in Chrome 151 with six ordered subjects, all bundled fonts loaded, no horizontal overflow, and a six-page reference PDF; all six rendered pages were visually inspected.
- Full automated suite: 356/356 passed. Focused Ledger report suite: 8/8 tests, including all 61 non-browser contract assertions.
- Simulation: 150 rounds (25 fixtures plus 125 generated rounds) completed with zero failures and 150/150 exact live-versus-mirror matches.
- Lint: zero errors and 169 warnings at the repository baseline. Production-dependency audit: zero vulnerabilities.
