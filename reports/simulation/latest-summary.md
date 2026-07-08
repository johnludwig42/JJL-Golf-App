# Simulation Lab Summary

## Run Metadata
- Version: v30.3.47
- Timestamp: 2026-07-08T12:12:23.703Z
- Seed: dye-ledger-v30.3.47-default
- Random rounds: 100
- Fixtures run: 10
- Total rounds simulated: 110
- Adapter mode: compare
- Games tested: match_play, nassau, net_skins, nine_point, skins

## Adapter Coverage Summary
- Adapter implementation: vm-app-js
- Live functions used:
- normalizeMatch
- computeMatchMetrics
- computeLivePayoutGames
- getPayoutReportContext
- optimalSettlementRows
- computeTeamGameDiffs
- computeNassauDiffsForBasis
- computeSkinResults
- computeNinePointResults
- Mirrored functions still used:
- Simulation fixture generation and normalization
- Simulation invariant checks
- Live-vs-mirror comparison classification
- Unsupported live adapter coverage:
- Browser-rendered Match Summary markup
- Actual localStorage save/reload I/O
- Shared Match cloud sync and two-device browser behavior
- Manual iPhone PWA service-worker lifecycle

## Pass/Fail Summary
- Failures: 0
- Warnings: 82
- Suspicious outcomes: 2
- Live-vs-mirror exact matches: 110
- Live-vs-mirror warnings/differences: 0

## Failures
- None

## Invariant Failures
- None

## Live-vs-Mirror Differences
- None

## Warnings / Suspicious Outcomes
- Warning - close_match_18: Match Play closed on hole 16; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - blowout_match_play: Match Play closed on hole 10; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - nassau_front_back_split: Match Play closed on hole 16; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - net_skins_handicap_stroke: Match Play closed on hole 17; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - nine_point_tie_scenarios: Match Play closed on hole 17; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - incomplete_round_7_holes: Incomplete round has provisional Nassau and settlement output.
- Warning - random_002: Match Play closed on hole 15; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_003: Match Play closed on hole 12; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_003: Incomplete round has provisional Nassau and settlement output.
- Warning - random_004: Match Play closed on hole 15; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_006: Match Play closed on hole 13; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_008: Match Play closed on hole 7; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_010: Incomplete round has provisional Nassau and settlement output.
- Warning - random_011: Match Play closed on hole 15; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_012: Match Play closed on hole 11; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_015: Match Play closed on hole 14; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_016: Match Play closed on hole 17; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_017: Match Play closed on hole 14; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_018: Incomplete round has provisional Nassau and settlement output.
- Warning - random_019: Incomplete round has provisional Nassau and settlement output.
- Warning - random_020: Incomplete round has provisional Nassau and settlement output.
- Warning - random_021: Match Play closed on hole 12; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_022: Match Play closed on hole 12; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_024: Match Play closed on hole 15; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_025: Match Play closed on hole 17; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_026: Match Play closed on hole 8; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_027: Match Play closed on hole 10; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_028: Incomplete round has provisional Nassau and settlement output.
- Warning - random_029: Match Play closed on hole 16; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_030: Match Play closed on hole 16; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_031: Match Play closed on hole 13; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_033: Match Play closed on hole 16; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_035: Incomplete round has provisional Nassau and settlement output.
- Warning - random_036: Match Play closed on hole 16; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_037: Match Play closed on hole 16; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_038: Match Play closed on hole 12; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_039: Match Play closed on hole 15; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_040: Match Play closed on hole 8; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_041: Match Play closed on hole 12; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_041: Incomplete round has provisional Nassau and settlement output.
- Warning - random_042: Match Play closed on hole 16; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_043: Incomplete round has provisional Nassau and settlement output.
- Warning - random_044: Incomplete round has provisional Nassau and settlement output.
- Warning - random_045: Match Play closed on hole 16; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_046: Match Play closed on hole 7; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_049: Incomplete round has provisional Nassau and settlement output.
- Warning - random_051: Match Play closed on hole 7; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_052: Match Play closed on hole 16; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_053: Match Play closed on hole 17; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_055: Match Play closed on hole 17; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_056: Match Play closed on hole 17; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_057: Match Play closed on hole 17; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_058: Match Play closed on hole 14; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_059: Match Play closed on hole 17; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_063: Match Play closed on hole 16; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_064: Match Play closed on hole 15; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_065: Match Play closed on hole 14; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_066: Match Play closed on hole 17; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_067: Match Play closed on hole 16; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_069: Match Play closed on hole 17; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_071: Match Play closed on hole 6; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_073: Match Play closed on hole 16; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_074: Match Play closed on hole 12; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_075: Match Play closed on hole 14; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_076: Match Play closed on hole 17; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_077: Incomplete round has provisional Nassau and settlement output.
- Warning - random_078: Match Play closed on hole 14; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_079: Match Play closed on hole 14; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_080: Incomplete round has provisional Nassau and settlement output.
- Warning - random_081: Match Play closed on hole 16; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_083: Match Play closed on hole 16; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_084: Match Play closed on hole 17; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_086: Incomplete round has provisional Nassau and settlement output.
- Warning - random_087: Match Play closed on hole 8; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_089: Incomplete round has provisional Nassau and settlement output.
- Warning - random_090: Match Play closed on hole 12; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_091: Incomplete round has provisional Nassau and settlement output.
- Warning - random_092: Match Play closed on hole 14; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_093: Incomplete round has provisional Nassau and settlement output.
- Warning - random_094: Match Play closed on hole 14; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_095: Match Play closed on hole 8; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_096: Match Play closed on hole 15; later entered scores should not change the recorded winner without intentional edit handling.

- Suspicious - blowout_match_play: A settlement row exceeds $100; confirm blowout/wager settings are intentional.
- Suspicious - random_029: A settlement row exceeds $100; confirm blowout/wager settings are intentional.

## High-Risk Areas Still Not Covered
- Browser-rendered Match Summary markup
- Actual localStorage save/reload I/O
- Shared Match cloud sync and two-device browser behavior
- Manual iPhone PWA service-worker lifecycle

## Interesting Product Observations
- The current scoring model benefits from deterministic examples because money outcomes can be correct while still difficult to explain by eye.
- Incomplete rounds need careful wording: the math can reconcile, but product language should remain provisional.
- 9-Point is especially well suited to invariant testing because every completed hole must allocate exactly 9 points.
- Shared Match authority can be modeled without a browser, but real trust still requires two-device automation or manual verification.

## Interesting Rounds
- blowout_match_play: 18/18 holes, 1 warning(s), 1 suspicious item(s), settlement Blake pays Alex $111.00; Blake pays Casey $40.00; Drew pays Casey $46.00
- random_003: 13/18 holes, 2 warning(s), 0 suspicious item(s), settlement Casey pays Blake $84.00; Casey pays Drew $1.00; Alex pays Drew $35.00
- random_029: 18/18 holes, 1 warning(s), 1 suspicious item(s), settlement Blake pays Casey $107.00; Drew pays Casey $9.00; Drew pays Alex $11.00
- random_041: 14/18 holes, 2 warning(s), 0 suspicious item(s), settlement Alex pays Drew $54.00; Alex pays Blake $6.00; Casey pays Blake $44.00
- close_match_18: 18/18 holes, 1 warning(s), 0 suspicious item(s), settlement Casey pays Blake $48.00; Casey pays Drew $20.00; Casey pays Alex $1.00
- nassau_front_back_split: 18/18 holes, 1 warning(s), 0 suspicious item(s), settlement Casey pays Alex $44.00; Casey pays Blake $12.00; Casey pays Drew $6.00
- net_skins_handicap_stroke: 18/18 holes, 1 warning(s), 0 suspicious item(s), settlement Blake pays Alex $83.00; Casey pays Alex $54.00; Drew pays Alex $34.00
- nine_point_tie_scenarios: 18/18 holes, 1 warning(s), 0 suspicious item(s), settlement Drew pays Alex $56.00; Blake pays Alex $49.00; Casey pays Alex $35.00

## Suggested Engineering Follow-Ups
- Store deterministic expected outcomes beside fixtures once product-owner intent is confirmed.
- Add simulation output to future release validation checklists.
- Consider a small fixture loader for saved localStorage match payloads.

## Suggested UX/Product Improvements
- Consider clearer provisional labels in Match Summary for incomplete Nassau and settlement views.
- Consider inline net-skin explanations that show gross score, stroke received, and resulting net score.
- Consider a compact Match Play clinch note when a match is mathematically closed before hole 18.

## Top 10 Highest-ROI Improvements
1. Add fixture-specific golden JSON snapshots now that live-vs-mirror settlement output can be compared.
2. Add golden JSON snapshots for representative final settlements and game-level payout detail.
3. Promote Shared Match assignment checks from model-only tests to browser/device automation.
4. Add explicit provisional/final language assertions for incomplete rounds in Match Summary output.
5. Add fixture-specific expected outcomes for Nassau split and skins winner detail.
6. Add a saved-match backward-compatibility fixture pack from real historical saved match shapes.
7. Add carryover-specific skins rule documentation because current app behavior awards only unique low holes.
8. Add CLI diffing for report output so surprising product observations are easier to spot release to release.
9. Add iPhone PWA manual acceptance result capture beside simulation findings.
10. Add focused tests around post-clinch score edits and how they should affect Match Play reporting.

## Fixtures
- close_match_18
- blowout_match_play
- nassau_front_back_split
- gross_skins_carryover
- net_skins_handicap_stroke
- nine_point_tie_scenarios
- incomplete_round_7_holes
- save_reload_mid_round
- shared_match_two_device_assignment_model
- host_correction_after_joiner_score

## Settlement Totals Across Run
- p1: $-2445.00
- p2: $378.00
- p3: $73.00
- p4: $1994.00
