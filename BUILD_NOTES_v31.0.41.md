# The Dye Ledger v31.0.41

## Classic Play Overflow Menu and Featured Competition Row

- Keeps the Classic Play overflow menu inside narrow iPhone viewports and allows its labels to wrap without clipping.
- Gives Classic and Player Mode overflow menus shared sizing, control, layering, and accessibility styling while preserving their separate rendering lifecycles.
- Adds outside-click and Escape dismissal, accurate `aria-expanded` state, focus return to the ellipsis, and close-on-mode-change behavior.
- Keeps the persistent Classic Scoreboard action in the header and avoids duplicating it in the overflow menu.
- Orders the Classic options as Scoring Mode, Stat Mode, and a separated End Round Early action.
- Moves the Classic featured competition status into a compact full-width row so long Sixes standings no longer crowd the hole metadata or header actions.
- Preserves the shared featured-status builder and all scoring, statistics, handicap, settlement, persistence, Shared Match, synchronization, and reporting behavior.

## Documentation

- Moves the planned Wolf release from v31.0.41 to v31.0.42 and renames its approved specification accordingly.
- Corrects only the related release references in the Wolf and Sixes specifications; game-rule content is unchanged.

## Architecture and compatibility

- No database migration.
- No Round, template, localStorage, or Supabase contract change.
- No Constitutional Review is required because this release changes presentation and menu interaction containment only; no constitutional data, authority, scoring, settlement, or historical-record principle is affected.
