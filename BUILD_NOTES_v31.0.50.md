# The Dye Ledger v31.0.50 — Saved Group Setups & Round Rules

## Behavior

- Select an existing saved group setup directly from the Match landing screen or new-round overview. Existing Match Templates remain compatible and available for rename, duplicate and delete.
- Save a group setup from the overview. Templates are local to this device; they preserve golfer IDs, teams, game configurations, stakes, allowances, press policies, rotating-game order/point schedules and entry preferences.
- Loading creates a new draft with today's date and fresh identity, scores and statistics. Notes, recaps, results, cloud identity and previous scorer assignments are not imported. Current library handicap indexes are used.
- Missing courses, golfers and tees produce visible review notices; existing readiness and submission checks protect round creation. Review course, tees and handicap values before starting.
- Round rules are available before starting and during Play on every device that has the saved round, using its selected games and versioned rules contract. Includes stakes, tie/carry rules, participant/order lists, press limits and applicable point-value examples.
- Later template edits do not rewrite rounds. Templates cannot be applied while editing or playing an existing round.
- Explicit zero-percent round allowances are retained through setup, normalization and cloud serialization rather than becoming 100%. Game rules are otherwise unchanged.

## Verification

- 50 saved-configuration cases passed, including missing library entries, fresh shared/local identities, zero allowance, nested Wolf point schedules and isolation from the source template.
- All 32 regression checks passed, including browser save/select/start/reload, legacy landing selection, missing-library readiness, active-round protection, preference behavior and prior Wolf/setup checks.
- Scoring comparison passed 50 random rounds plus 27 fixed fixtures: zero failures and zero live/mirror differences. It reported 55 informational warnings and one settlement-size review flag; these are not calculation differences.
- Phone layout at 375px was visually reviewed. Rules text is readable, the loaded setup name remains selected, and no horizontal overflow was observed in the tested flow.
- Lint: zero errors and 88 existing warnings. Release metadata/assets/syntax validation and whitespace checks passed.

## Promotion and acceptance

No Supabase migration. No commit, push, merge or production deployment performed by Codex. Branch: `codex/v31.0.50-saved-group-setups`.

Manual acceptance: save a representative group setup, select it on a phone, review a different course/tee, start a round, and inspect Round Rules from a joined shared device. The under-one-minute usability target and actual four-device cloud/PWA acceptance remain unverified. Group setups themselves are stored locally, not synchronized between devices.
