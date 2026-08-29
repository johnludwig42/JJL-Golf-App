# The Dye Ledger v31.0.16

## Ledger Entry statistics pagination

- Paginates each statistics category independently so compact player tables stay together when they fit on a fresh page.
- Repeats category and column context only when a genuinely oversized table must split.
- Prevents Performance by Par and similar four-player tables from stranding one or two golfers on otherwise sparse continuation pages.
- Preserves the established iOS print-surface height that prevents blank or black trailing PDF pages.

## Best-ball partnership analysis

- Adds deterministic Ham & Egg partnership statistics for qualifying two-player sides in one-counting-ball Nassau and Team Match competitions.
- Reuses the authoritative per-hole team score resolver and the game’s explicit gross or net basis.
- Reports inclusive partner contributions, two-stroke rescues, tied-hole redundancy, contributor alternations, strokes saved, and a bounded partnership rating when at least six eligible holes provide a meaningful range.
- Excludes incomplete holes and omits the entire section when the competition or roster is ineligible.
- Keeps partnership analysis independent of stat-tracking mode, so it works with None, Casual, Enhanced, and Grind whenever the required scores exist.

## Compatibility

- No scoring, settlement, Shared Match, Course Library, localStorage, RoundRecord schema, or Supabase behavior changes.
- Existing accepted Ledger Entry snapshots remain unchanged and readable; newly generated reports receive the additive partnership projection when eligible.
- No database migration.
