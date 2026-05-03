# The Dye Ledger v27.29 Build Notes

## Changes

- Added a compact Stat Tracking Summary to the Match Summary PDF/export view when stat tracking is enabled and at least one hole is fully completed.
- The PDF stat summary shows Player, Fairways, GIR, Avg Putts, Up & Downs, and Sandies.
- PDF stat summary uses completed holes only and excludes partial holes.
- Updated new tee creation for an existing course so par by hole and stroke index by hole are copied from an existing saved tee while keeping yardages blank.
- Updated app, manifest, service worker cache, and README version references to v27.29.

## Guardrails

- No scoring calculation changes.
- No payout logic changes.
- No Classic Scorecard rendering or export architecture changes.
- No score-entry or stat-input UI changes.
