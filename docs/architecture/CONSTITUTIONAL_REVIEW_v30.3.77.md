# v30.3.77 Constitutional Review

## Affected principles

- **Principles 1, 6, 7, and 8:** devices remain working copies and Round facts remain distinct from living configuration. The release changes only when completion is offered; it does not change score, game, settlement, or RoundRecord ownership.
- **Principle 10:** completed RoundRecords are still produced by the existing finalization path and are never silently overwritten.
- **Principles 11 and 12:** this release does not expand legacy reopen or implement Amendment Sessions.
- **Principles 13 and 22:** enabled competition facts must be resolved before the app automatically presents a Round as ready to finalize.

## Compliance

The new stat marker and prompt-dismissal timestamp are additive local fields. Old rounds, unknown fields, Shared Match facts, local scoring, and manual early completion remain available. No historical round is uploaded, claimed, rewritten, deduplicated, deleted, or automatically finalized.

The icon pipeline affects application presentation only. It does not alter identity, ownership, privacy, access, or historical facts.

## Deferred

Amendment Sessions, historical cloud claiming, cloud RoundRecord publication, and broader competition-engine finality remain outside this release.
