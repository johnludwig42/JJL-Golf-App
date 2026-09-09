# Constitutional Review — v31.0.42 Wolf

## Scope

Adds Wolf as an independent, local-only competition. No existing competition logic is refactored or reinterpreted.

## Source of truth

- `selectedGames[].key === 'wolf'` stores the normalized rules and ordered four-player roster.
- `wolfInputs[holeNumber]` stores the declaration, partner, timestamp, and optional note.
- `wolfOrderLockedAt` and `wolfFinalHoleAssignments` preserve lifecycle decisions.
- Scores remain in the existing player score arrays; Wolf never uses `match.players[].team` or `metrics.teams`.

## Derivation and settlement

- A single hole comparison derives both the winner and all point awards.
- Net strokes use one round-level low Game Handicap reference across the four Wolf golfers.
- Ties award zero and never carry.
- Money is derived from final individual point differentials across all six unique player pairs.
- Scored but undeclared holes remain unresolved and block finalization.

## Persistence and compatibility

- Existing local records normalize additively; missing Wolf fields do not affect non-Wolf rounds.
- Unknown fields on Wolf hole inputs are retained.
- Present-only DOM saving changes Wolf facts only when the Wolf entry control is mounted.
- No database migration or Supabase schema change is required.

## Shared Match boundary

- Wolf is disabled in setup when Shared Match is active.
- Enabling Shared Match with Wolf selected is refused.
- Save/readiness validation provides a second fail-closed guard.
- Wolf configuration is excluded from cloud serialization and ignored during cloud hydration.

## Presentation and auditability

- Classic and Player Mode call the same Wolf entry renderer.
- Live status, quick scoreboards, player detail, payout reports, Story input, and Ledger Entry use the same computed result.
- Ledger output declares the basis, per-point stake, declarations, hole winners, points, and settlement.

## Conclusion

The release preserves separation between recorded facts, deterministic derivation, and money settlement. It is backward compatible, local-only by design, and introduces no hidden cloud or team-model dependency.
