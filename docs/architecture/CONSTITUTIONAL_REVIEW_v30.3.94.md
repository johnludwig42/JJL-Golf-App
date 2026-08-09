# Constitutional Review — v30.3.94 SSP Scoring Integrity

## Principles affected

- **Principles 1, 6, 7, and 13:** SSP results remain Round-owned competitive facts derived from gross scores and explicit game inputs.
- **Principles 8 and 10:** Raw SSP points, Take/Keep awards, multipliers, and settlements are preserved as auditable historical facts; completed RoundRecords are not silently rewritten.
- **Principles 11 and 12:** Unresolved live SSP inputs remain provisional. This release does not extend the legacy correction path or implement Amendment Sessions.
- **Principles 15 and 22:** SSP finality and settlement remain within the RoundRecord that owns the competition. Unresolved facts cannot produce a final settlement.
- **Principle 23:** No access, privacy, deletion, or retention behavior changes.

## Compliance

The release corrects the SSP state machine so Take/Keep depends on raw hole points rather than cumulative totals, preserves control through eligible ties, and prevents unresolved holes from advancing authoritative control, totals, Honors, or settlement. Prox gains explicit same-team unknown-player and opposing-team Push outcomes without inventing a canonical player fact. Existing scores, local rounds, Shared Match identities, and historical records are not uploaded, claimed, deleted, or rewritten.

## Security and synchronization boundaries

The additive `proxResolution` fact travels in the existing Shared Match SSP envelope and remains subject to the existing field-conflict and host-publication rules. No database schema, RLS policy, authentication flow, scoring assignment, or production service is changed.

## Conflicts

No constitutional conflict identified.
