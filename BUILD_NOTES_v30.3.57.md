# Build Notes v30.3.57 — SSP Reporting, Momentum and Scoreboard Polish

## Release theme

Make Sneaky / Sandy / Poley status, reporting, and momentum clearer and more trustworthy without changing scoring, settlement, Take/Keep, honors, Bridge/Re-Bridge, Umbee, or Shared Match reconciliation rules.

## Shipped

- Added SSP Momentum to Match Summary, using cumulative final SSP point margin in the configured routing or score-entry sequence. Skipped/unplayed holes are omitted.
- Added an offline-safe deterministic SSP trend to Quick Scoreboard, prioritizing lead changes, recent three-hole swings, and largest single-hole swings.
- Locked document scrolling while Quick Scoreboard is open while preserving internal modal scrolling.
- Added golf-native `E` formatting for even-par gross/net reporting; non-to-par zero values remain numeric.
- Play Net cells now show an em dash until gross score entry exists.
- Clarified saved `SSP Match` versus unsaved `Live SSP` preview status.
- Renamed the Play SSP flow to Points Before Multiplier, Multiplier, and Final Hole Total. Take/Keep remains in the audit list and is included before multiplication.
- Polished Match Summary labels, final-point audit data, mobile SVG momentum presentation, and print keep-together behavior.

## Tests and validation

Passed `node --check` for app/service worker, both release sanity commands, `git diff --check`, all focused SSP and Shared Match suites, simulation/live-engine suites, `npm test`, and `npm run test:run`. All four requested simulation modes completed with zero failures and exact live-vs-mirror parity; the generated latest summary was inspected and reverted.

## Known limitations

- Quick Scoreboard trend is deterministic, not AI-generated, and is intentionally a compact line rather than a chart.
- SSP Momentum represents final points, not dollars.
- Browser print engines may paginate a long SSP audit table differently; deeper PDF optimization remains future work.
- Field-by-field Shared Match SSP conflict resolution and randomized two-device SSP-specific simulation remain deferred.
