# The Dye Ledger v30.0 – Multi-Round Session Foundation

## Release Theme
Keep the group together.

## What Changed
- Added a lightweight local `sessionId`, `sessionName`, `roundNumber`, and related session metadata to matches.
- Existing saved matches automatically behave as one-round sessions through normalization.
- After a round is finished, users now see a post-round action prompt:
  - View Match Summary
  - Play Another Round with This Group
  - Start Completely New Match
- Added a Start Another Round flow that copies forward group setup while creating a clean new round.
- Added a lightweight Session Summary card in Settings / More.
- Updated visible version references to v30.0.

## Copy Forward Behavior
The Start Another Round workflow carries forward:
- Players
- Team assignments
- Player colors through existing player records
- Scoring mode
- Shared match devices and player assignments
- Stat tracking preferences
- Handicap allowance and applicable round settings

## Clean New Round Behavior
The new round intentionally resets:
- Scores
- Hole statistics
- Notes
- Round completion status
- Course
- Tee selections
- Games
- Betting results
- Match summaries
- AI recap content

## Backward Compatibility
No localStorage key change was made. Existing matches are normalized in place and receive session metadata only when loaded by the app. No user migration step is required.

## Architecture Notes
- Sessions are local only.
- No Supabase schema changes.
- No authentication changes.
- No scoring, handicap, Nassau, stat, AI import, or Match Summary calculation changes.
