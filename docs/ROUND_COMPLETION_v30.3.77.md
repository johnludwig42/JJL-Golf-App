# Round Completion Contract — v30.3.77

The automatic finish offer is intentionally more conservative than gross-score completion.

## States

1. **In progress:** one or more required player scores are missing.
2. **Scoring complete:** all required scores exist, but an enabled data class remains unresolved.
3. **Ready to finish:** all scores, enabled tracked-stat entries, and required SSP facts are resolved.
4. **Finished:** the scorer confirms completion and the existing finalization pipeline freezes the RoundRecord.

Disabled stats and unselected games never block completion. Stat completion is recorded additively on each tracked player/hole when a fully scored hole is saved. Existing saved rounds remain readable and manually finishable; missing completion metadata only suppresses the automatic offer.

The automatic modal appears once when a round becomes Ready to Finish. Reviewing instead of finishing records a dismissal on that local round, so rerenders and reloads do not reopen it. A persistent **Ready to Finish** action remains available.

Manual **End Round Early** remains available from Round Actions. It reports unresolved information, warns that reports or settlements may remain provisional, records the selected reason, and uses the existing finalization pipeline. Merely reaching the last scheduled hole never opens the early-finish dialog automatically.
