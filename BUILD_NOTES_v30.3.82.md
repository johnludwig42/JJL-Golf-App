# The Dye Ledger v30.3.82 Build Notes

## Product Experience System

- Extends the Match-derived visual and navigation language to Scores, Library, and More.
- Gives each tab a quiet overview with focused destinations and consistent return behavior.
- Standardizes the first Match, Scores, Library, Insights, and More card with the same semantic structure, left-aligned title hierarchy, spacing, border, and white background.
- Keeps each tab's job distinct: Scores reviews a Round, Library manages saved local records, and More contains preferences, account guidance, utilities, Shared Match tools, and support.
- Reuses the existing sections, forms, render paths, and controls rather than creating duplicate workflows.
- Leaves Play and Insights unchanged.

## Compatibility

- No calculation, settlement, scoring, Shared Match, RoundRecord, course, player, template, preference, memory, or localStorage schema is changed.
- Existing local records and PWA data remain in place through refresh and upgrade.
- Sign-in behavior remains local-first and does not upload, claim, merge, rewrite, or delete historical data.
- No Supabase migration or production data operation is included.

## Deferred

- Beta Account activation and cloud ownership workflows.
- Library/Courses ownership redesign.
- Insights synthesis.
- Stand-alone Play Mode UX.
- Amendment Session UI and additional games.
