# v31.0.32 — Classic Play Header and Hole Navigation

## Summary

- Restores the sticky Previous, hole selector, and Next navigation controls in Classic Mode.
- Keeps par, yardage, stroke index, Featured Competition status, and save state visible while scoring.
- Moves the single Classic Scoreboard control into the sticky header for no-scroll access.
- Places the existing End Round Early control in a Classic overflow menu without changing its completion or authority rules.
- Removes duplicate Featured Competition presentation from the lower Classic Play surface.
- Preserves Player Mode markup, behavior, and the shared Play controller and Round contract.

## Compatibility

This is a Classic Play presentation and navigation repair only. It does not change scoring, handicaps, games, settlement, statistics, persistence, Shared Match authority, reporting, localStorage, or Supabase.

## Verification

- Focused Classic and Player Mode visibility, navigation, header, action, and shared-controller tests.
- Complete application tests, lint, release validation, simulation comparison, and mobile layout review at 320px and 375px.
