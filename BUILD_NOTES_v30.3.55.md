# BUILD_NOTES_v30.3.55.md

Build v30.3.55 - SSP Advanced Rules, Honors, Settlement, Reporting, and Outdoor Play Polish

## Release Theme

Complete Sneaky / Sandy / Poley as a playable, auditable team game by adding Take/Keep, honors, Bridge/Re-Bridge, Umbee, final points, SSP-only settlement, Match Summary reporting, and outdoor-readable Play tab controls.

## Changes Made

- Updated release metadata from v30.3.54 to v30.3.55.
- Extended `buildSneakySandyPoleyLedger(match, options)` while preserving v30.3.54 base fields.
- Added Take/Keep state machine based on pre-Take/Keep team points.
- Added honors calculation with cumulative final-points leader and tie carry-forward.
- Added Bridge/Re-Bridge multiplier scoring, including disabled-setup warnings.
- Added Umbee multiplier scoring with optional Bridge/Re-Bridge stacking.
- Added final per-hole points, final team totals, final leader, and SSP settlement.
- Updated Play tab SSP preview to show base, Take/Keep, multiplier, Umbee, final, running status, and honors.
- Updated preview refresh so draft gross scores and SSP inputs update before Save Hole Scores.
- Draft/on-screen gross scores now drive the SSP card, Play-tab primary status, and Quick Scoreboard when opened from Play, without persisting the draft or changing Save Hole Scores behavior.
- Added Match Setup `SSP sequence`: `Hole routing order` (default/backward-compatible) or `Score-entry order`. Routing skips unscored holes; entry mode uses recorded first-completed order and safely falls back to routing for older matches without order metadata.
- Moved current-hole honors into the top Play status, using configured team names, and removed the duplicate lower-card honors heading.
- Renamed the Play pill from `Final Points` to `SSP Points` and the standalone `Running` presentation to `SSP Match`.
- Compacted Take/Keep, Bridge/Re-Bridge, and Umbee into a wrapping one-line adjustment summary.
- Added routing/entry, skipped-hole, honors, and 100 deterministic generated SSP regression cases to `npm run test:ssp`.
- SSP Momentum Chart is intentionally deferred until the advanced rule engine stabilizes.
- Shared Match SSP sync and reconciliation remains deferred to v30.3.56.
- Updated Quick Scoreboard SSP status to use final totals.
- Kept Player Detail player-specific SSP rows on base contributions and added team SSP final standing.
- Added SSP final totals, stakes, settlement, and hole-by-hole audit table to Match Summary.
- Improved selected SSP chips with filled high-contrast state, white bold text, thicker border, and checkmark labels.
- Centered SSP chip rows inside player cards with mobile wrapping.
- Documented Shared Match SSP input reconciliation as v30.3.56 follow-up.

## Ledger Shape

The SSP ledger now returns base and final values:

- `baseTotalsByTeam` / `totalsByTeam`
- `finalTotalsByTeam`
- per-hole `takeKeep`, `pointsAfterTakeKeepByTeam`, `bridge`, `umbee`, `finalMultiplierByTeam`, `finalPointsByTeam`
- `honorsByHole`
- `finalLeader`
- `settlement`

Calculated results remain derived, not authoritative saved match state.

## Known Limitations

- Full Shared Match SSP input reconciliation remains deferred.
- Bridge/Re-Bridge timing is not mechanically enforced.
- Poley first-putt and flagstick length remain scorer-confirmed.
- Sandy bunker source remains scorer-confirmed.
- Manual overrides for Low Ball, Low Total, and Honors remain deferred.
- Printed/PDF SSP reporting may need future layout refinement.
- Draft preview is display-first and normal save flow still controls committed scoring.

## Tests

Validation status is recorded in the final Codex report for this build.
