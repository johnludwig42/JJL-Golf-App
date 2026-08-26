# v31.0.07 — Player Mode Core Score Entry

## Outcome

Player Mode is now a selectable Play experience built on the shared v31.0.06 input controller. Classic Mode remains available and unchanged.

## Player Mode

- Dedicated Player Mode card markup replaces the incompatible Classic table layout, preventing narrow-screen clipping.
- Mobile hierarchy now prioritizes the hole header, featured result, team score lanes, selected-player detail, and sticky hole actions.
- The persistent mode selector is hidden while Player Mode is active; Classic remains available from the Player Mode overflow menu and Player Preferences.
- Current-hole, tap-first gross score choices keep par centered with two values on either side and a distinct Other action.
- Selected scores use a stronger filled, inset-ring treatment that remains clear in bright outdoor conditions.
- One selected golfer expands into detailed stat entry.
- Team, tee, and handicap strokes remain visible; strokes use bold dots rather than “pops.”
- Featured competition status and Shared Match controls remain authoritative and shared.
- None, Casual, Enhanced, and Grind stat-detail preferences are available.
- Games & Stat Tracking now exposes round-specific Score Keeping and Stat Tracking modes initialized from the device defaults in More → Preferences.
- Changing modes for an active round preserves all recorded scores and statistical facts; Player Mode also exposes the active stat level in its overflow menu.
- Grind falls back to Enhanced when the device is responsible for more than two golfers.
- Putts use the same six-choice rhythm as gross score: 0 through 4 plus Other.
- Fairway choices include directional visuals and a consistent fairway/flag icon rather than a device-dependent emoji. Enhanced/Grind use a 3×3 approach keypad with computed GIR at the center.

## Stat integrity

- GIR is calculated from gross score, putting-surface putts, and par.
- Missing or default putts propagate an unknown GIR rather than a fabricated miss.
- Manual GIR corrections retain override provenance.
- Fairway and exact approach-miss direction plus bunker involvement are stored as additive hole facts.
- Approach dispersion is included in on-screen statistics, hole-by-hole detail, the Ledger Entry export, and eligible Story of the Round facts.
- Classic and Player Mode continue to use the same persistence, scoring, competition, sync, and report paths.

## Deployment

No database migration is required. Existing rounds remain compatible.
