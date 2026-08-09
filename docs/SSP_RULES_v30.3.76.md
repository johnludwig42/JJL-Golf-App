# Sneaky / Sandy / Poley Rules — v30.3.76

Status: Product Owner approved July 22, 2026.

## Sequence and Honors

- Standard hole order is the default. Actual play order is optional and follows the immutable first-completion order of holes with gross scores for every player.
- The sequence choice and Starting Honors lock after the first eligible hole. Team 1 is the backward-compatible Starting Honors default. During an active round, the host may correct a locked choice only through explicit confirmation with a reason and Participant/Device attribution; the ledger is then recalculated.
- Honors belongs to the cumulative final SSP points leader. A tie carries the prior Honors team forward.

## Points and control

- Sneaky 1; Sandy 1 and implies Sneaky; Poley 1 and requires double bogey or better; Greeny 1; Prox 2; Low Ball 2; Low Total 2; Birdie 2; Eagle-or-better 4.
- Take and Keep are determined from the two teams' raw points on the current hole, never from cumulative match totals.
- Take awards 2 points when a team that did not win the prior eligible hole wins the current hole. A Take may be earned on the first hole played; that first Take establishes control.
- Keep awards 1 point when the team controlling the most recent Take wins or ties the current eligible hole after winning or tying the prior eligible hole. Control persists across ties.
- A completed 0-0 tie awards a Keep to the controlling team when a prior Take exists. An opening 0-0 tie before any Take awards neither Take nor Keep.
- Only one team may receive a Take or Keep on a hole.
- Same-team Low Ball ties award that team. Cross-team Low Ball ties push. Low Total ties push.

The authoritative calculation order is: raw SSP category points; Take/Keep; Umbee eligibility; Bridge/Re-Bridge multiplier; Umbee multiplier; final hole points; cumulative match totals; next-hole Honors.

## Greeny and Prox

- With validation off, a selected Greeny is eligible.
- With validation on and Stat Tracking on, 0–2 putts validates, 3+ putts invalidates, and missing tracked putts remains provisional.
- With validation on and Stat Tracking off, selecting Greeny also records scorer-confirmed validation; there is no second confirmation tap.
- Prox inherits Greeny eligibility: none for zero eligible Greenies and automatic for one.
- With multiple eligible Greenies on the same team, the scorer may select the closest player or award the team Prox while recording that the closest player is unknown.
- With eligible Greenies on opposing teams, the scorer may select the closest player or explicitly record a Push. A Push is resolved and awards zero Prox points. TBD remains unresolved and blocks authoritative SSP finality.

## Bridge, Re-Bridge, and Umbee

- The team with Honors tees first.
- After that tee shot, the team without Honors may declare Bridge.
- After the second team tees, the Honors team may declare Re-Bridge.
- Both declarations must occur before any second shot. Bridge is 2x and Re-Bridge is 4x, symmetrically applied after Take/Keep.
- New declarations retain declaring team, timestamp, Participant, and Device attribution. Legacy booleans remain valid with unknown attribution.
- Umbee is automatic when enabled: one birdie 2x; two birdies or any eagle-or-better 4x; the opponent must have zero post-Take/Keep points. When explicitly enabled, Umbee can stack with Bridge/Re-Bridge.

## Shared Match and finality

- Assigned scorers control player facts. Participating scoring devices may propose Prox, Bridge/Re-Bridge, and notes.
- Independent fields merge. Same-field conflicts require host attention. The host publishes the authoritative result.
- Live previews are permitted, but incomplete gross scoring, invalid declarations, unresolved validation or Prox, and material Shared Match conflicts are provisional and cannot create a final settlement or advance authoritative Take/Keep, cumulative total, or Honors state.
- The frozen settlement remains per-player, equal-team, zero-sum, and included exactly once.

## Compatibility

- Existing SSP rounds, first-completion order, booleans, scores, and settlements are preserved.
- Legacy Sandy-only input normalizes to Sandy plus Sneaky.
- Legacy active pending Greenies require review and are never silently validated.
- Completed historical facts are not rewritten.

## Deferred

Generic scoring overrides, complete Amendment Session UI, historical claiming, new games/Junk framework, broad report redesign, new AI services, and the full physical two-device beta campaign are outside this release.
