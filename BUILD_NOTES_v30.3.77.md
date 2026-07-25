# The Dye Ledger v30.3.77 — PWA Branding & Round Completion Reliability

## Final release refinements

- Player and handicap-tee assignments remain independent during round setup. Leaving an unchanged player field never rebuilds the picker or recaptures focus, so players and tees may be completed in any order; missing tees are enforced only by round readiness/start validation.
- The player-field × action clears only that slot's golfer, preserves its team and tee, and immediately returns the removed golfer to the available-player choices without changing neighboring slots.
- Quick Scoreboard momentum retains its competitive holes/points scale and shows exactly one competitive-state label per data point; redundant dollar annotations are omitted.
- Scores momentum charts show the same competitive-state value at every data point, and the selected player/team perspective now remains authoritative instead of automatically reverting to the current leader.
- A deterministic calculation-assurance matrix now cross-checks known Course/Playing Handicap answers, relative and posting stroke allocation, Classic Scorecard gross/net totals, momentum ranges and both perspectives, and completed Singles Match settlement balance.
- Scores now includes a compact **Scoring by Hole Par** table inside Stats, after player statistics and before Score Distribution. The Match Summary retains the fuller version with gross averages, performance relative to par, and scored-hole counts. Missing holes are excluded and incomplete rounds are labeled provisional.
- On-screen Classic Scorecards keep only the Player column fixed while Team and all subsequent columns scroll beneath it. Printed and exported scorecards are unchanged.
- The Scores Round Status hero now leads with the selected featured competition. When no featured game applies, it explicitly labels the fallback as **Best Net Score**.
- Featured Singles Match Play now always uses its authoritative live or final match status instead of falling through to an unavailable-result message; the existing **X of X holes completed** line is unchanged.
- Player Leaderboard result columns—Gross, Net, Net to Par, and Postable—use equal centered widths with tabular numerals. The Classic Scorecard is unchanged.
- Section magnification/Focus View is intentionally deferred to a dedicated accessibility release.

## Included

- Product Owner-approved `New Icon 050326.png` artwork, preserved as the canonical master and exported into immutable release-specific PWA icons for the manifest, iPhone Home Screen, header, favicons, and service-worker cache.
- A repeatable branding-version script and release verification checklist.
- Configuration-aware automatic round completion across gross scores, enabled stat tracking, and unresolved SSP facts.
- A once-per-round automatic Ready to Finish prompt with persisted dismissal.
- A persistent Ready to Finish action after dismissal.
- Manual End Round Early remains available but is never opened merely because the scorer reached the final scheduled hole.
- Early-finish guidance identifies unresolved information and warns when reports or settlements may remain provisional.

## Compatibility

All persistence changes are additive. Existing local rounds, players, templates, preferences, memories, snapshots, Shared Match codes and assignments, scores, SSP facts, Presses, settlements, and RoundRecords remain intact. Existing saved rounds without stat-completion metadata remain manually finishable and are never rewritten or uploaded automatically.

## Deployment

No database migration is included or required. Production Supabase, production data, secrets, deployment configuration, and remote branches are not changed by this implementation.

## Manual acceptance

- [ ] Remove the prior installed iPhone PWA, install v30.3.77 fresh, and confirm the approved icon and launch presentation.
- [ ] Confirm favicon, header art, app name, theme color, and background color.
- [ ] Upgrade with existing local rounds/preferences and confirm retention.
- [ ] Complete a round with Stat Tracking off and confirm the automatic offer appears once.
- [ ] With Stat Tracking on, confirm gross scores alone do not trigger the offer; saving all tracked stats does.
- [ ] Confirm unresolved SSP validation/conflict prevents the automatic offer.
- [ ] Dismiss the offer, reload, and confirm it stays dismissed while Ready to Finish remains available.
- [ ] Reach the final scheduled hole with missing information and confirm End Round Early does not open automatically.
- [ ] Manually end early and confirm the reason, provisional warning, summary, and saved round are correct.
