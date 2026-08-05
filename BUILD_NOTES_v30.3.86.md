# The Dye Ledger v30.3.86 Build Notes

## Release purpose

v30.3.86 is a focused scoring-integrity and audit-remediation release. It does not redesign Play, change production Supabase, or migrate local data.

## Implemented

- Routes Nassau status in Scores, executive summaries, recap facts, Match Net presentation, and settlement through the saved Best N policy.
- Corrects Game Handicap calculation order by applying the allowance and rounding each player's Game Handicap before allocating strokes from the lowest rounded result.
- Documents and tests unequal-team settlement: every losing player owes one component stake and the pot is divided equally among winning players.
- Keeps active local Memories editable with revision history.
- Makes completed/frozen-round Memories read-only pending Amendment Sessions.
- Keeps Shared Match Memories append-only pending revision-aware, conflict-safe editing.
- Removes Memory text and private round/player details from diagnostics; detailed diagnostics are opt-in and redacted.
- Repairs the iPhone installation-dialog HTML structure.
- Prevents automatic cloud-course refresh from replacing complete local scorecard imports or pending local tee repairs with stale, incomplete cloud hole data.
- Groups Play score entry beneath full-width team headings so team names remain readable without changing Shared Match visibility, scoring capability, or synchronization.
- Adds actual Featured Competition “Gets” totals and front/back stroke distribution to Play, calculated from the saved stroke indexes.
- Adds the shared Course Net/Match Net control to the Quick Scoreboard Classic Scorecard.
- Streamlines Play score entry by removing the redundant Scoring Input label and tightening player-row spacing without reducing scoring touch targets.
- Labels Front 9, Back 9, and custom Selected 9 stroke summaries from the holes being played rather than from whether a golfer receives a stroke.
- Adds the shared Course Net/Match Net control to each golfer's Player Detail Classic Scorecard.
- Replaces the ambiguous legacy Player Detail Net tile with separately labeled Course Net and Featured Competition Match Net totals from the same authoritative scorecard engines.
- Adds a prominent Create New Match action to the completed Match Summary while preserving the finished RoundRecord and existing post-round history.
- Retains the existing Save Hole Scores control and behavior for release safety.
- Reclaims vertical Play space by removing redundant team player-count labels and tightening mobile card, navigation, table-header, and team-heading spacing without shrinking score-entry controls.
- Updates Nassau rules language, release metadata, immutable PWA assets, and default release coverage.

## Compatibility and persistence

- No localStorage key or persisted record is deleted or renamed.
- Existing rounds, scores, statistics, Memories, Shared Match codes, participant/device facts, settlements, course snapshots, and PWA data remain intact.
- Legacy Nassau records retain their saved legacy interpretation.
- No automatic upload, identity claim, historical rewrite, or bulk synchronization occurs.

## Security and deployment

- No migration was created or applied.
- No production Supabase schema, RLS policy, data, secret, Edge Function, or deployment was changed.
- Live production schema state remains outside this local release validation.

## Deferred

- Full Amendment Session UI and cloud publication of corrected RoundRecord versions.
- Conflict-safe editable Shared Match Memory revisions.
- Historical claiming, privacy-management UI, phone/social provider linking, and cloud history migration.

## Manual acceptance

- Compare Play strokes, Featured Competition status, Quick Scoreboard, Scores Nassau result, Match Net scorecard, Match Summary, and settlement for the same Best N match.
- Verify 1-v-1 at 100%, 2-v-2 Best 1 at 90%, 4-v-4 Best 2 at 85%, plus handicaps, rounding boundaries, unequal teams, and an incomplete active-player score.
- Verify active local Memory editing, completed-round read-only behavior, and Shared Match append-only Memory behavior.
- Upgrade an installed iPhone PWA and confirm existing local rounds and data remain available.
- Import and save an 18-hole scorecard, refresh the cloud course library, and confirm all 18 holes and the correct tee par remain intact before publishing.
- On Play, verify zero-stroke and stroked golfers receive the same correct nine-hole side label, player rows remain easy to tap, and Player Detail switches between Course Net and Featured Competition Match Net.
- From a completed Match Summary, start a new match and confirm the completed round remains available in history; verify Player Detail totals agree exactly with its Course Net and Match Net scorecards.

## Automated verification

- Full regression suite: 318 passed, 0 failed, plus the default pretest release gate.
- Focused v30.3.86/v30.3.85 suite: 23 passed, 0 failed.
- Focused mobile scoring and Quick Scoreboard UX suite: 21 passed, 0 failed.
- Extended simulation: 2,525 rounds, 0 failures, and 2,525 exact live-versus-mirror matches.
- Release validation: passed.
- Release sanity: 8 passed, 1 expected working-tree warning, 0 failed.
- Syntax checks: application, service worker, live adapter, and simulation engine passed.
- Lint: 0 errors and 160 pre-existing warnings.
