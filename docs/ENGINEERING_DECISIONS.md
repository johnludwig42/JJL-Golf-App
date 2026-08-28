# The Dye Ledger — Engineering Decisions

## 2026-08-27 — Ledger Entry is the interim destination for per-round tracked-statistic analysis

**Status:** Accepted for v31.0.10; revisit when the planned Insights destination supports cross-round aggregation.

Ledger Entry is the deliberate interim home for analysis derived from the facts captured during a single Round through Enhanced and Grind stat tracking. This is not intended to establish Ledger Entry as the permanent destination for player-development analytics.

Rate statistics are most useful with multi-round denominators and ultimately belong in the planned Insights experience. The current application does not yet provide authoritative cross-round aggregation, however, and leaving the newly captured Grind facts unsurfaced would provide no return for the additional scoring effort. Ledger Entry therefore presents truthful per-round analysis now, with denominators and tracking completeness disclosed.

This decision follows Constitution Principle 7: Rounds own their historical facts, while career statistics and historical analytics are derived rather than duplicated. Ledger Entry derives its per-round analysis from the authoritative Round facts; it does not create a second historical-statistics store. Future Insights work should continue deriving career and trend analysis from authoritative RoundRecords.
