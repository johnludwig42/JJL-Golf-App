# The Dye Ledger v31.0.45 — Wolf Setup Reliability

## Outcome

- Restores successful Wolf Match Setup submission by initializing scoring authority before synchronous Wolf validation.
- Preserves the intended validation precedence: Shared Match Wolf is rejected as local-only before any account or legacy-code checks.
- Replaces false-confidence source matching with browser execution of new, edited, repeated-tap, Shared Match rejection, and non-Wolf submission paths.
- Confirms the exception occurred before round construction or persistence; no partial rounds or data repair are involved.

## Readiness audit

- A fully assigned four-player local Wolf setup with valid tees and ordered Wolf players reports ready and submits successfully.
- “Players selected” covers the Match roster only. Wolf, Sixes, and 9-Point retain separate ordered participant requirements, which can legitimately keep Games & Stat Tracking in Needs attention.
- No reproducible stale readiness-state defect was found in this release. No readiness or saved-draft semantics were changed without a failing case.

## Compatibility

- No scoring, settlement, Play presentation, persistence schema, Shared Match data contract, or Ledger Entry calculation changes.
- Existing localStorage and Supabase shapes remain compatible.
- No database migration.

## Deferred presentation review

- A shared current-pairing line for Sixes and Wolf in Classic and Player Mode.
- Consistent placement and information hierarchy for 9-Point and Sixes live standings.
- These are candidates for a focused v31.0.46 Play presentation release.
