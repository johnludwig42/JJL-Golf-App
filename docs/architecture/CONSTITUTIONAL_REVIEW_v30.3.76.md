# Constitutional Review — v30.3.76 SSP Rules, Routing & Finality

## Decision

Compliant. This release refines a Round-owned competition without changing Account, Golfer Identity, or ownership boundaries.

## Principles implemented or affected

- Principles 1, 6, 7, and 13: SSP inputs, sequence, results, and settlement remain Round facts in the RoundRecord.
- Principles 2 and 5: administrative finality remains with the Round Owner/host; scoring capability is not treated as ownership.
- Principles 8 and 10: first-completion order, declarations, attribution, and finalized settlement are historical facts; completed versions are not silently overwritten.
- Principles 11 and 12: active-round sequence correction requires confirmation, reason, attribution, and recalculation; completed-round correction remains deferred to Amendment Sessions.
- Principles 15 and 22: SSP is a single-Round competition and finalizes in its RoundRecord.
- Principle 23: this release introduces no identity merge, deletion, or privacy shortcut.

## Boundaries

- Participant, Device, scoring assignment, and Owner/host remain distinct.
- Shared Match participants need not authenticate.
- No cloud schema, RLS, production Supabase, historical record, or settlement logic outside SSP is changed.
- Legacy local reopen remains isolated and is not extended into the cloud architecture.

## Risks and mitigations

- Out-of-order play could change Honors incorrectly: actual order uses immutable first-completion metadata.
- A declaration could be assigned to the wrong side: new facts store expected declarer team and ledger validation rejects contradictory attribution.
- Partial facts could pay prematurely: unresolved facts and conflicts mark settlement provisional.
- Upgrade could rewrite legacy facts: normalization is additive and legacy attribution remains unknown.
