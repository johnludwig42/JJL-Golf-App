# The Dye Ledger v30.3.90 — Shared Match Code Compatibility

## Outcome

v30.3.90 restores normal Match-tab joining for Shared Matches created before canonical `DYE-######` codes were introduced.

## Changes

- New Shared Matches continue to receive only collision-checked `DYE-######` codes.
- The normal Match-tab join flow accepts an exact 12-character legacy Shared Match identifier in addition to a canonical code.
- Existing legacy identifiers remain unchanged so an active match, its device relationships, and its score history are not split or rewritten.
- The host UI labels an older identifier as `Legacy Match Code` and tells the joining player to enter it exactly as displayed.
- Join guidance distinguishes the preferred new format from the compatibility path.

## Compatibility and data safety

- No local rounds, scores, players, courses, preferences, memories, or snapshots are migrated or deleted.
- No Shared Match row is renamed, duplicated, or re-keyed.
- Sign-in, ownership, scoring assignment, settlement, and RoundRecord behavior are unchanged.
- No Supabase schema, migration, policy, secret, or production configuration is changed.

## Verification

- Focused tests cover canonical generation, canonical joining, legacy joining, invalid values, stable legacy identifiers, and UI guidance.
- Full repository tests, validation, syntax, lint, release sanity, and simulations remain release gates.

## Manual acceptance

1. Open an existing match displaying a 12-character Legacy Match Code.
2. On another device, use Match → Join a Match and enter that code exactly.
3. Confirm the existing match loads without creating a second match.
4. Confirm saved scores and assignments remain intact.
5. Create a brand-new Shared Match and confirm its code is `DYE-` plus six digits.

No production Supabase operation was performed while preparing this release.
