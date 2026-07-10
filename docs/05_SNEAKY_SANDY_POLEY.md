# Sneaky / Sandy / Poley

Status: v30.3.54 base ledger

This document captures the Sneaky / Sandy / Poley source rules and implementation plan. v30.3.54 produces a base-point ledger only; final settlement, Take/Keep, honors, Bridge/Re-Bridge multiplier math, Umbee multiplier math, and full Match Summary reporting remain deferred.

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

### Data Flow

```text
match.selectedGames SSP settings
  + match.sneakySandyPoleyInputs manual facts
  + computeMatchMetrics gross/net/team/par data
  + optional stat-tracking GIR/putts
  -> buildSneakySandyPoleyLedger()
  -> Play tab preview / Quick Scoreboard / Player Detail
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

## Order Of Operations For Future Ledger

1. Read gross scores, net scores, teams, and SSP manual inputs.
2. Resolve player-team mapping.
3. Award manual Sneaky, Sandy, Poley, Greeny, and Prox where valid.
4. Calculate Low Ball and Low Total from net scores, with ties pushing for no points.
5. Calculate gross Birdie and Eagle bonuses.
6. Build pre-Take/Keep team points.
7. Apply Take/Keep state.
8. Apply Bridge/Re-Bridge multiplier.
9. Apply Umbee multiplier when qualifying.
10. Apply cumulative multiplier behavior only when setup allows.
11. Produce hole ledger, team totals, net point differential, and settlement.

## Deferred Builds

v30.3.54 - SSP Hole Inputs and Core Point Ledger (shipped)

- Use manual SSP inputs.
- Calculate Low Ball, Low Total, Birdie, and Eagle.
- Validate Greeny/Prox if enabled.
- Produce hole-by-hole pre-multiplier ledger.
- Begin team point totals.

v30.3.55 - SSP Advanced Rules, Honors, Settlement, and Reporting

- Implement Take/Keep state machine.
- Implement honors carry-forward.
- Implement Bridge/Re-Bridge multipliers.
- Implement Umbee and cumulative multiplier option.
- Add Match Summary and settlement output.
- Add tests and simulation coverage.

## Warnings

- v30.3.54 is base points only.
- Do not include SSP base ledger totals in settlement or Final Net Settlement.
- Take/Keep, honors, Bridge/Re-Bridge multiplier math, Umbee multiplier math, and SSP settlement remain deferred.
- Shared Match score sync remains preserved, but full SSP input reconciliation is not complete in v30.3.54.
