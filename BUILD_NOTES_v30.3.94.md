# The Dye Ledger v30.3.94 — SSP Scoring Integrity

## Scope

- Corrects Take/Keep sequencing to use raw points on each eligible hole, including first-hole Takes and 0-0 Keeps after control exists.
- Prevents unresolved SSP facts from advancing authoritative Take/Keep control, cumulative totals, Honors, or final settlement while retaining a clearly provisional preview.
- Adds explicit same-team Prox with unknown closest player and opposing-team Prox Push outcomes; TBD remains unresolved.
- Changes the SSP audit table's first points column to Raw SSP Points and keeps unresolved reports provisional.

## Compatibility

The persistence change is additive. Existing `proxPlayerId`, SSP inputs, scores, local rounds, Shared Match facts, and unknown future fields remain compatible. No localStorage record is deleted or rewritten in bulk. No database migration is required.

## Security and production status

No Supabase schema, RLS policy, authentication configuration, production data, deployment, or remote branch was changed by this implementation.

## Verification

- Deterministic SSP coverage includes opening ties, post-Take 0-0 Keeps, unresolved-hole authority isolation, same-team unknown-player Prox, opposing-team Push, Shared Match transport, audit labeling, and provisional report finality.
- Focused v30.3.94/SSP suite: 60/60 passed.
- Existing preflight suite: 61/61 passed. Full application suite: 356/356 passed.
- Syntax checks, release validation, and diff whitespace checks passed.
- Lint: zero errors and 163 pre-existing warnings.
- Standard and extended simulations: 200 total rounds, zero failures, zero live-versus-mirror differences. Existing simulation warnings/suspicious-outcome heuristics remained non-blocking.

## Manual acceptance before promotion

- On an installed iPhone PWA, confirm an opening 0-0 tie awards no Take/Keep and a later 0-0 tie awards Keep to the team controlling the most recent Take.
- Confirm same-team Greenies permit a team Prox with the closest player unrecorded; opposing-team Greenies permit an explicit Push; leaving Prox at TBD remains visibly provisional.
- Confirm an unresolved SSP hole does not advance authoritative totals, Honors, settlement, or the following hole's Take/Keep control.
- In a two-device Shared Match, confirm the Prox resolution converges and the host publishes the same SSP ledger and settlement.
- Confirm the Match Summary audit begins with Raw SSP Points and unresolved SSP results never appear as Final or as a $0 payout.
- Confirm existing local rounds remain present after the PWA upgrade.
