# The Dye Ledger v30.3.78 — Scores, Summary Usability & Player Insights

## Completed release scope

- Saving or navigating to a different scoring hole moves the viewport to the active-hole header after the local save succeeds. The transition respects reduced-motion preferences and does not open the iPhone keyboard.
- Match Status, Classic Scorecard, Stats, and Round Notes, Memories & Recap are independent closed-by-default disclosures on Scores.
- A disclosure opened by the golfer remains open through ordinary Scores re-rendering.
- Summary printing and PDF output still include disclosure content regardless of its on-screen state.
- End Round Early and Ready to Finish remain in their existing location and retain the v30.3.77 completion contract.
- v30.3.78 uses a new application cache and immutable release-specific PWA asset names without changing the approved artwork.
- Scores and Match Summary share one derived Player Insights model covering gross scoring average, Birdie-or-Better rate, Par-or-Better rate, bogey avoidance, and Birdie Conversion. Birdie Conversion is explicitly birdie-or-better on a recorded green in regulation and displays both percentage and converted-GIR count.
- Player Insights use completed, scored holes only, exclude missing information, remain provisional for incomplete rounds, and are never persisted as duplicate historical facts.
- Display-only hole, side, and round yardages use thousands separators; numeric yardage entry remains unchanged.
- SSP momentum keeps cumulative points as the chart geometry and adds exactly one cumulative team-money label to each data point on Scores, Quick Scoreboard, RoundRecord, and Match Summary views.
- The Scores Stats score-distribution table omits categories that are zero for every player in the round. Quick Scoreboard and Match Summary retain their stable full-category layouts.

## Explicitly deferred to v30.3.79

- Complete the broader Shared Match Summary hierarchy and iPhone-readability redesign.
- Expand round analytics beyond the Player Insights, scoring-by-par, and Score Distribution views included here.
- Extend presentation coverage for additional statistics across active rounds, completed rounds, frozen RoundRecords, Shared Match, and Match Summary/PDF.
- Perform the broader two-device Shared Match, installed-iPhone PWA upgrade/data-retention, and final Match Summary/PDF visual-acceptance matrix.

These deferrals are intentional scope boundaries, not known defects in the implemented v30.3.78 features.

## Compatibility

The release remains additive and offline-first. It does not change score, handicap, game, Press, SSP, settlement, RoundRecord, identity, ownership, or synchronization authority. It does not upload, claim, merge, rewrite, deduplicate, or delete historical local rounds.

## Deployment

No database migration is included or required by the implemented usability slice. Production Supabase, production data, secrets, and deployment configuration have not been changed.

## Manual acceptance

- [ ] In a long SSP scoring form, save a hole and confirm the next hole header is visible at the top of the viewport.
- [ ] Confirm Save, Next, Previous, and hole-jump navigation retain the correct hole facts.
- [ ] Confirm no viewport movement occurs when the displayed hole does not change.
- [ ] Confirm Match Status, Classic Scorecard, Stats, and Round Notes/Memories/Recap initially load closed.
- [ ] Open each disclosure and confirm ordinary Scores updates do not close it.
- [ ] Produce a Match Summary PDF and confirm all disclosure content remains present.
- [ ] Confirm End Round Early and Ready to Finish are unchanged.
- [ ] Confirm 1,000+ yard side and total values display with commas while yardage inputs remain editable numbers.
- [ ] Confirm SSP momentum lines use points and every dot shows one correctly signed cumulative dollar value at the configured stake.
- [ ] Confirm Singles and other non-SSP momentum charts retain competitive-state labels.
- [ ] Confirm Scores hides all-zero score-distribution categories and Match Summary retains its fixed distribution columns.
