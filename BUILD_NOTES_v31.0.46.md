# The Dye Ledger v31.0.46 — Specialty Game Play Context

## Outcome

- Adds a shared current-pairing presentation to Classic and Player Mode.
- Shows the active Sixes segment and its two partnerships on the current hole.
- Shows the current Wolf and declaration state, including declared partner, Lone Wolf, and Blind Wolf sides.
- Separates playing-group context from 9-Point, Sixes, and Wolf competitive standings.

## Presentation hierarchy

1. Current hole information.
2. Current pairing or Wolf declaration responsibility, when applicable.
3. Featured competition standings.
4. Score and stat controls.

## Compatibility

- No scoring or settlement changes.
- No persistence, localStorage, Supabase, Shared Match, or Ledger Entry contract changes.
- No database migration.

## Verification

- Browser coverage exercises Sixes points and segment modes, undeclared and declared Wolf states, and 9-Point in both Classic and Player Mode.
- Mobile-width screenshots verify the hierarchy and horizontal fit at 375 pixels.
