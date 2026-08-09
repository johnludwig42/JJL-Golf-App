# The Dye Ledger v30.3.99 Build Notes

## Release purpose

This narrow hotfix makes `DYE-######` the only supported Shared Match code format.

## Implementation

- Generates a fresh canonical code for every new Shared Match.
- Generates a fresh canonical code when an existing local Match becomes shared.
- Generates a fresh canonical code for a subsequent round.
- Reuses a code only when an existing Shared Match already has a canonical `DYE-######` code.
- Prevents a 12-character local record identifier from being presented as a Legacy Match Code.
- Rejects pre-beta 12-character codes in the join workflow and removes legacy-code join guidance.
- Directs users editing an old legacy Shared Match to Create New Match instead of silently changing cloud identity.

## Compatibility and persistence

- Existing canonical Shared Matches continue to use their established code.
- Legacy records remain untouched and are not migrated, rewritten, or deleted, but their old codes are no longer joinable.
- Existing local rounds, scores, courses, players, preferences, memories, and PWA data remain intact.
- Scoring, handicap, game, settlement, synchronization, recap, and reporting calculations are unchanged.

## Database and deployment

- No database migration is required.
- No production database, RLS policy, production data, secret, deployment, main branch, or remote branch was changed during implementation.

## Manual acceptance

1. Confirm the footer displays v30.3.99.
2. Create a completely new Shared Match and confirm its code matches `DYE-######`.
3. Convert a local-only Match to Shared Match and confirm it receives `DYE-######`.
4. Edit an existing canonical Shared Match and confirm its `DYE-######` code remains unchanged.
5. Confirm an old legacy Shared Match directs the user to Create New Match.
6. Confirm a 12-character legacy code is rejected by the join form.
7. Join the new match from a second Device and confirm assignments and score synchronization.
