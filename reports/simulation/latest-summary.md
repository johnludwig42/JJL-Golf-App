# Simulation Lab Summary

## Run Metadata
- Version: v31.0.08
- Timestamp: 2026-08-27T11:22:57.053Z
- Seed: dye-ledger-v31.0.08-default
- Random rounds: 50
- Fixtures run: 25
- Total rounds simulated: 75
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
- buildSneakySandyPoleyLedger
- resolveSneakySandyPoleyProxSelection
- buildSharedSspFacts
- reconcileSharedSspFacts
- applySharedSspFacts
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
- Warnings: 65
- Suspicious outcomes: 1
- Live-vs-mirror exact matches: 75
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
- Warning - press_front_lane: Match Play closed on hole 12; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - press_back_lane: Match Play closed on hole 12; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - press_overall_lane: Match Play closed on hole 12; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - press_match_play: Match Play closed on hole 12; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - press_repress_chain_1: Match Play closed on hole 12; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - press_repress_chain_2: Match Play closed on hole 12; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - press_multiple_independent_chains: Match Play closed on hole 12; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - press_round_limit_exhausted: Match Play closed on hole 12; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - press_mid_round_enable: Match Play closed on hole 12; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - press_disable_after_use_blocked: Match Play closed on hole 12; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - press_limit_reduction_blocked: Match Play closed on hole 12; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - press_shared_sync_reconnect: Match Play closed on hole 12; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - press_reopen_refinish: Match Play closed on hole 12; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - press_frozen_history_reload: Match Play closed on hole 12; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - press_repeated_settlement: Match Play closed on hole 12; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_001: Match Play closed on hole 5; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_002: Match Play closed on hole 16; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_003: Match Play closed on hole 16; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_005: Match Play closed on hole 13; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_006: Match Play closed on hole 17; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_007: Match Play closed on hole 16; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_009: Match Play closed on hole 17; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_010: Match Play closed on hole 8; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_011: Match Play closed on hole 17; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_012: Match Play closed on hole 16; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_013: Match Play closed on hole 17; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_015: Match Play closed on hole 17; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_016: Match Play closed on hole 12; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_017: Match Play closed on hole 16; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_018: Incomplete round has provisional Nassau and settlement output.
- Warning - random_019: Match Play closed on hole 13; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_020: Match Play closed on hole 14; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_021: Match Play closed on hole 13; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_022: Incomplete round has provisional Nassau and settlement output.
- Warning - random_023: Match Play closed on hole 13; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_024: Incomplete round has provisional Nassau and settlement output.
- Warning - random_025: Match Play closed on hole 14; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_026: Match Play closed on hole 17; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_027: Match Play closed on hole 14; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_028: Incomplete round has provisional Nassau and settlement output.
- Warning - random_029: Match Play closed on hole 13; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_030: Match Play closed on hole 13; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_031: Match Play closed on hole 13; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_032: Match Play closed on hole 15; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_033: Match Play closed on hole 7; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_034: Match Play closed on hole 16; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_035: Match Play closed on hole 17; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_037: Incomplete round has provisional Nassau and settlement output.
- Warning - random_039: Match Play closed on hole 8; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_040: Match Play closed on hole 14; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_041: Match Play closed on hole 17; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_043: Match Play closed on hole 14; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_044: Match Play closed on hole 17; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_045: Incomplete round has provisional Nassau and settlement output.
- Warning - random_046: Match Play closed on hole 13; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_047: Match Play closed on hole 7; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_048: Match Play closed on hole 17; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_049: Match Play closed on hole 13; later entered scores should not change the recorded winner without intentional edit handling.
- Warning - random_050: Match Play closed on hole 17; later entered scores should not change the recorded winner without intentional edit handling.

- Suspicious - blowout_match_play: A settlement row exceeds $100; confirm blowout/wager settings are intentional.

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
- close_match_18: 18/18 holes, 1 warning(s), 0 suspicious item(s), settlement Casey pays Blake $48.00; Casey pays Drew $20.00; Casey pays Alex $1.00
- nassau_front_back_split: 18/18 holes, 1 warning(s), 0 suspicious item(s), settlement Casey pays Alex $44.00; Casey pays Blake $12.00; Casey pays Drew $6.00
- net_skins_handicap_stroke: 18/18 holes, 1 warning(s), 0 suspicious item(s), settlement Blake pays Alex $83.00; Casey pays Alex $54.00; Drew pays Alex $34.00
- nine_point_tie_scenarios: 18/18 holes, 1 warning(s), 0 suspicious item(s), settlement Drew pays Alex $56.00; Blake pays Alex $49.00; Casey pays Alex $35.00
- incomplete_round_7_holes: 7/18 holes, 1 warning(s), 0 suspicious item(s), settlement Casey pays Alex $22.00; Blake pays Alex $13.00; Drew pays Alex $10.00
- random_001: 9/9 holes, 1 warning(s), 0 suspicious item(s), settlement Alex pays Drew $55.00; Alex pays Blake $8.00; Casey pays Blake $5.00
- random_003: 18/18 holes, 1 warning(s), 0 suspicious item(s), settlement Alex pays Drew $54.00; Alex pays Blake $8.00; Casey pays Blake $7.00

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
- press_front_lane
- press_back_lane
- press_overall_lane
- press_match_play
- press_repress_chain_1
- press_repress_chain_2
- press_multiple_independent_chains
- press_round_limit_exhausted
- press_mid_round_enable
- press_disable_after_use_blocked
- press_limit_reduction_blocked
- press_shared_sync_reconnect
- press_reopen_refinish
- press_frozen_history_reload
- press_repeated_settlement

## Settlement Totals Across Run
- p1: $-460.00
- p2: $-225.00
- p3: $-80.00
- p4: $765.00
