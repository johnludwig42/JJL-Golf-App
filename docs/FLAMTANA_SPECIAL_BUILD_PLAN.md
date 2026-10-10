# Flamtana Special — accepted delivery plan

Approved October 10, 2026 for Friday, October 16, 2026. These three releases take
priority over all further roadmap work. Only v31.0.60 is currently authorized for
implementation. Preserve correctness in .61; flag any anticipated .62 delay early
enough to prepare manual settlement.

## v31.0.60 — Assigned Team Index

Optional editable index for each two-player team, prefilled with the simple
average of its partners' library Handicap Indexes. Missing library indexes require
deliberate entry. Both partners use the same tee. Save the assigned index on each
round participant; never change either library index. Course Handicap is
round(index × slope / 113 + rating − par) and is the final Playing Handicap.
Bypass both round and game allowances; preserve existing stroke-allocation
conventions. Preview, live scoring, cloud reload, saved reopening and reports
must use the same contract. Ordinary rounds retain their current calculations.

No scramble scoring or new wager is introduced in .60. All scoring devices must
run .60 or newer when assigned indexes are used: older installed clients cannot
be retroactively prevented from calculating with library indexes. Current clients
reject unknown policy versions and incomplete/unequal index or mixed-tee setups.
No database migration; additive metadata uses existing JSON snapshots.

## v31.0.61 — Two-man Scramble

Eight golfers, four teams, 18 holes. Fixed foursomes: T1+T2 and T3+T4, each on its
own device and potentially different holes. Classic has one row per team. The
shared Play controller collects team ID, hole and gross, validates the whole team,
then writes both partners through the normal scoring path. Missing controls leave
facts untouched; explicitly clearing a visible score clears both partners.

Partner equality is required before any team-hole score is authoritative. Pending
or inconsistent pairs remain visible and block final settlement. Team completion
and whole-field hole completion are distinct. Verify correction, clearing, retry,
offline/reconnect, reload and reassignment. Partners and both teams in a foursome
must share an assigned device, with all eight golfers assigned before Start.
Blocking Start must still permit create/join/assign. Assess older-client policy;
"no new sync protocol" is a hoped-for outcome, not a premise.

Save a team-scored marker into frozen RoundRecords immediately. Exclude copied
shared-ball scores from individual averages, distributions, signature statistics
and postable interpretations. Disable individual stat capture. Defer Player Mode,
Grind, general scramble variants and configurable foursomes.

## v31.0.62 — Flamtana Special

Four $20-per-player wagers by default ($80 maximum exposure per golfer):

1. Featured: lowest team net total among all four teams.
2. Group: team net total, T1 versus T2 and T3 versus T4.
3. Foursome: sum of each hole's lower team net score, F1 versus F2. For team
   scores 3/6 and 6/3, the foursome total is 6, not 9. No match play or hole counting.
4. Calcutta: each golfer backs one featured team, including their own if desired;
   all eight picks required before Start. Resolve after the featured result.

Tie method configurable: split (default), hole 18 backwards, back nine then last
six then last three then 18, or last six then last three then 18. Card-off applies
to all three scoring wagers, using their displayed saved net hole values. Apply
only at finalization/freeze; exhaustion splits. Retain finalization evidence.

For a tied Calcutta, divide the pool equally among tied teams, then divide each
team's share among its backers. An unbacked team's share goes equally to its two
players. A sole unbacked winner in a $160 pool gives $80 gross to each partner,
or +$60 net after their own stakes; the other six are −$20. Cross-foot is zero.

Deliver a self-contained four-component game, team scorecard and report fixture.
Every scoring component uses a cumulative/stroke-play archetype. The foursome
needs its own derived side and per-hole series. Reuse the existing stroke-play
graphic with seriesByHole/round.sides where suitable. HTML, PDF and layout gate
are mandatory. Deterministic story must be accurate and plain, name the four
wagers and suppress duplicated individual accolades. Generated-story facts and
verification must follow the same rule. Elaborate prose may wait.

## Manual settlement fallback

Assume .62 may slip. .60/.61 must leave trustworthy saved hole cards. Prepare a
worksheet with each team's net score for holes 1–18, four team totals, F1's
min(T1,T2) on each hole and F2's min(T3,T4), summed foursome totals, the eight
Calcutta picks and the chosen tie method. Totals alone cannot settle wager 3.
Resolve card-off in configured order, settle the three scoring wagers, then
Calcutta, and check that combined net positions sum to zero. Do not improvise
the per-hole-minimum calculation after the round.
