# Constitutional Review — v30.3.83

## Principles affected

- **Principles 1, 6, and 13:** Play remains a device working copy of the Round, and update activation requires a successful local save without changing Round ownership or authoritative facts.
- **Principles 7 and 8:** the release changes presentation and update lifecycle only; scores, competitions, settlements, Memories, and derived analytics retain their existing lifecycles.
- **Principle 9:** Add Memory remains available in Play and saved Memories are preserved.
- **Principles 10–12 and 22:** no completed RoundRecord, competition result, settlement, or amendment behavior is changed.

## Compliance

The Play hierarchy is presentation-only. The Quick Scoreboard, scoring engine, game results, settlement, Shared Match facts, and local persistence schema are unchanged. A PWA update may activate during an active round only after visible score inputs match saved state and the final local save succeeds. A failed save or unfinished consequential operation pauses activation.

Fairway-conditioned GIR implements Principles 6–8 as derived analytics computed from recorded Round facts. New RoundRecords preserve additive success and opportunity counts rather than mutable percentages. Under Principles 10–12, existing completed records are not rewritten and unavailable legacy approach data is not inferred.

## Security and deployment boundary

This release does not change Supabase, authentication, RLS, cloud data, secrets, or deployment configuration. No production operation is authorized by these changes.
