# Sneaky / Sandy / Poley

Status: v30.3.55 advanced ledger

This document captures the Sneaky / Sandy / Poley source rules and implementation plan. v30.3.55 derives base points, advanced hole points, honors, final team totals, SSP-only settlement, Play tab final preview, and Match Summary reporting.

## Source Rule Summary

- SSP is a two-team points game.
- It requires an even number of participants, exactly two equal teams, and 1 to 4 players per team.
- Individual awards accrue to the player's team.
- Sneaky, Sandy, and Poley can stack.
- Sneaky is 1 point for missed GIR plus one putt for par, and must be par.
- Sandy is 1 point for a Sneaky from a bunker, must be par, and stacks with Sneaky.
- Poley is 1 point for a holed putt longer than the flagstick, must be the player's first putt, and final score must be double bogey or better.
- Greeny is 1 point for GIR on all holes. Validate may require 2 putts or less.
- Prox is 2 points for closest eligible Greeny to the pin on all holes. GIR is required. Validate may require 2 putts or less.
- Low Ball is 2 points for lowest individual net score on the hole, with no points on a push.
- Low Total is 2 points for lowest combined net team score on the hole, with no points on a push.
- Birdie is 2 points for gross birdie and stacks.
- Eagle is 4 points for gross eagle and stacks.
- Take/Keep is based on pre-Take/Keep team points. Keep control may continue across tied holes for the team with the most recent Take.
- Bridge/Re-Bridge are optional per-hole multipliers. Re-Bridge must be called before any player's second shot, preferably before leaving the tee box.
- Umbee is an optional pre-round multiplier based on the other team having no points after Take/Keep.
- Umbee multiplies all points for the qualifying team on that hole.
- Bridge/Re-Bridge and Umbee are cumulative only when setup allows.
- Settlement is net team points x dollar value per point.
- The setup field `pointValue` is stored numerically for later settlement and displayed as a dollar value per point.

## v30.3.53 Scope

- Adds Sneaky / Sandy / Poley as a selectable game in Match Setup.
- Adds setup options for dollar value per point, Validate Greeny/Prox, Bridge/Re-Bridge, Umbee, and Umbee-with-Bridge.
- Disables Smart Score Advance when SSP is active because the scorer should deliberately complete per-hole SSP game/action inputs before leaving the hole.
- Enforces two equal teams, even player count, and max four players per team before saving SSP setup.
- Adds durable local match data for SSP settings and per-hole manual inputs.
- Adds a compact Play tab SSP Game Action section before Stat Tracking.
- Persists manual player awards, Prox selection, Bridge/Re-Bridge selections, and notes by hole.
- Shows inputs-only preview text and setup status.
- Does not change existing scoring, Smart Score Advance, payout, settlement, Match Summary, or Shared Match reconciliation behavior.

## v30.3.54 Base Ledger

- Adds `buildSneakySandyPoleyLedger(match, options)` as the derived base ledger helper.
- Calculates manual Sneaky, Sandy, Poley, Greeny, and Prox points from per-hole manual facts.
- Calculates automatic Birdie, Eagle, Low Ball, and Low Total points from score/net/team data.
- Sums per-hole base points into running team base totals.
- Shows current-hole Base Points in the Play tab SSP section.
- Adds SSP Base status to Quick Scoreboard Active Games.
- Adds conservative Player Detail SSP base-points contribution status.
- Restricts the Prox selector to players with Greeny selected on the current hole.
- Applies Prox input rules in the Play tab: zero Greenies means None, one Greeny auto-selects that player, and multiple Greenies show TBD until the scorer chooses a Greeny player.
- Moves the Optional SSP note lower in the Play tab flow, after SSP inputs/base ledger and Stat Tracking, just before Save Hole Scores.
- Displays `pointValue` as `$ per point` currency while preserving numeric storage.
- Does not store calculated ledger results as authoritative match state.

## v30.3.55 Advanced Ledger

- Extends `buildSneakySandyPoleyLedger(match, options)` without removing v30.3.54 base fields.
- Adds per-hole Take/Keep state after base points and before multipliers.
- Adds `honorsByHole` and per-hole honors labels. The first played hole defaults to Team 1, the cumulative final-points leader gets next-hole honors, and ties carry prior honors forward.
- Applies Bridge/Re-Bridge when enabled in setup. Bridge is 2x, Re-Bridge is 4x, and Re-Bridge implies a bridged hole.
- Applies Umbee when enabled in setup and the qualifying team has birdie/eagle points while the other team has zero points after Take/Keep.
- Stacks Umbee with Bridge/Re-Bridge only when `allowUmbeeWithBridge` is enabled.
- Returns final per-hole and team totals: `pointsAfterTakeKeepByTeam`, `bridge`, `umbee`, `finalMultiplierByTeam`, `finalPointsByTeam`, `finalTotalsByTeam`, `finalLeader`, `settlement`, and `honorsByHole`.
- Shows Play tab base points, Take/Keep, multiplier, Umbee, final points, running status, and honors.
- Uses the current on-screen draft gross scores and SSP selections for the Play tab preview before Save Hole Scores.
- Live preview is calculation-only: changing an on-screen gross score refreshes the SSP card, top Play status, and Quick Scoreboard opened from Play, but does not save or sync the score. Blank draft scores stay missing and are never converted to zero.
- Match Setup includes `SSP sequence`. `Hole routing order` is the default and processes the most recent prior ledger-eligible hole in official course routing, skipping missing holes. `Score-entry order` processes holes in the recorded order they first became complete; older matches without that metadata fall back to routing order.
- Take/Keep and cumulative honors both use the selected sequence. Honors for the next sequence hole belongs to the cumulative final-points leader; a cumulative tie carries prior honors forward.
- Honors is shown beside the top Play-tab primary match status with configured team names. The lower SSP card uses compact `SSP Points`, `SSP Match`, and adjustment summaries.
- SSP Momentum Chart (cumulative final SSP margin by hole) is deferred pending advanced-rule stabilization.
- Shared Match SSP sync/reconciliation remains a v30.3.56 limitation; remote draft state is not merged into the local SSP preview.
- Keeps player-specific detail focused on individual base contributions and shows team final standing separately.
- Adds SSP final totals, net points, stakes, settlement, and a hole-by-hole table to Match Summary.
- Does not merge SSP settlement into the existing Final Net Settlement engine.

### Data Flow

```text
match.selectedGames SSP settings
  + match.sneakySandyPoleyInputs manual facts
  + computeMatchMetrics gross/net/team/par data
  + optional stat-tracking GIR/putts
  -> buildSneakySandyPoleyLedger()
  -> Play tab preview / Quick Scoreboard / Player Detail / Match Summary
```

### Validation Assumptions

- Sneaky is manual/scorer-confirmed in v30.3.54 and scores when the selected player makes par. Missing GIR/putt stats do not create a Play tab warning.
- Sandy requires par. Sandy does not auto-award Sneaky; the ledger warns when Sandy is selected without Sneaky.
- Poley requires double bogey or better. First-putt and flagstick length remain manual confirmation.
- Greeny scores from manual input when Validate is off.
- When Validate is on, Greeny and Prox require putts available and 2 or less.
- Prox selection depends on the Greeny input in v30.3.54. The Play tab selector shows None when no players have Greeny, auto-selects the only Greeny, and shows TBD when multiple Greenies exist until the scorer deliberately chooses one.
- Low Ball requires at least one valid net score on each team. Same-team low ties still award that team; cross-team low ties push.
- Low Total requires every player on both teams to have a valid net score.
- Missing scores are never treated as zero.

### Partial-Hole Behavior

- Manual categories that cannot be score-validated are left unawarded with warnings.
- Birdie/Eagle require valid gross score and par.
- Low Ball waits for at least one scored player on each team.
- Low Total waits for all players on both teams.
- Empty holes show zero base points.
- Base ledger warnings are intentionally conservative and do not block scoring.

## Data Model

SSP setup is stored as an additive selected game config:

```js
{
  key: 'sneaky_sandy_poley',
  enabled: true,
  pointValue: 1, // dollar value per point
  validateGreenyProx: false,
  allowBridgeRebridge: false,
  allowUmbee: false,
  allowUmbeeWithBridge: false,
  version: 1
}
```

Manual hole inputs are stored on the match:

```js
{
  sneakySandyPoleyInputs: {
    "1": {
      holeNumber: 1,
      players: {
        [playerId]: {
          sneaky: false,
          sandy: false,
          poley: false,
          greeny: false
        }
      },
      proxPlayerId: "",
      bridge: false,
      rebridge: false,
      notes: ""
    }
  }
}
```

Manual inputs are user-entered facts. Future calculated ledgers should derive from scores, stat inputs where appropriate, SSP settings, and these manual inputs.

## Order Of Operations

1. Read gross scores, net scores, teams, and SSP manual inputs.
2. Resolve player-team mapping.
3. Award manual Sneaky, Sandy, Poley, Greeny, and Prox where valid.
4. Calculate Low Ball and Low Total from net scores, with ties pushing for no points.
5. Calculate gross Birdie and Eagle bonuses.
6. Build pre-Take/Keep team points.
7. Apply Take/Keep state.
8. Determine whether Umbee qualifies from points after Take/Keep.
9. Apply Bridge/Re-Bridge multiplier.
10. Apply Umbee multiplier when qualifying.
11. Apply cumulative multiplier behavior only when setup allows.
12. Produce hole ledger, final team totals, honors, net point differential, and settlement.

## Settlement

Settlement is based on final SSP team point differential multiplied by `$ per point`.

Example: if Irish finishes +6 points and point value is `$2.00`, E&Y pays Irish `$12.00`.

The SSP settlement is displayed in the SSP reporting section and kept separate from Final Net Settlement until a broader payout aggregation pass is designed.

## Outdoor Play Notes

- Selected Sneaky, Sandy, Poley, and Greeny chips use a high-contrast filled state with white bold text, thicker border, and checkmark label.
- Chip rows stay inside each player card and are centered, with wrapping on narrow screens.
- The Optional SSP note remains below SSP inputs and Stat Tracking, immediately before Save Hole Scores.

## Live Preview And Save Behavior

- The Play tab SSP preview uses draft gross scores and current SSP selections while the scorer is still on the hole.
- Preview updates are display calculations; they do not bypass the existing save flow.
- Saved match persistence remains based on the normal score and SSP input update paths.

## Deferred Builds

v30.3.54 - SSP Hole Inputs and Core Point Ledger (shipped)

- Use manual SSP inputs.
- Calculate Low Ball, Low Total, Birdie, and Eagle.
- Validate Greeny/Prox if enabled.
- Produce hole-by-hole pre-multiplier ledger.
- Begin team point totals.

v30.3.55 - SSP Advanced Rules, Honors, Settlement, and Reporting

- Implement Take/Keep state machine. (shipped)
- Implement honors carry-forward. (shipped)
- Implement Bridge/Re-Bridge multipliers. (shipped)
- Implement Umbee and cumulative multiplier option. (shipped)
- Add Match Summary and settlement output. (shipped)
- Add tests and simulation coverage. (shipped)

v30.3.56 - SSP Shared Match Sync and Reconciliation

- Sync scores plus SSP manual inputs across devices.
- Ensure every device derives the same SSP ledger from shared state.
- Detect conflicts instead of silently overwriting scorer-entered SSP facts.
- Pull latest shared SSP state before final settlement/reporting.

## Warnings

- Full Shared Match SSP input reconciliation remains deferred.
- Bridge/Re-Bridge timing is not mechanically enforced.
- Poley first-putt and flagstick length remain scorer-confirmed.
- Sandy bunker source remains scorer-confirmed.
- Some group-specific SSP variants may require future options.
- Manual overrides for Low Ball, Low Total, and Honors remain deferred.
- Printed/PDF SSP reporting may need future layout refinement.
