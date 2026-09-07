# Sixes (6-6-6) — Draft Implementation Spec

**Status:** Product Owner decisions recorded 2026-09-07; ready for Codex planning
**Suggested release:** v31.0.40 — Foundational Games: Sixes
**Database migration:** None
**Precedent to follow:** `nine_point` (derived-only game, own player selection, head-to-head settlement)

Sixes is the simpler of the two Foundational Games because **every fact it needs already exists**. It
derives entirely from saved gross scores plus a saved player order. It introduces no new per-hole
manual input, no new Shared Match facts channel, and no new validation gate. Wolf does all three,
which is why the two should ship as separate releases with Sixes first.

---

## 1. Decisions

**Resolved by the Product Owner:**

| # | Decision | Resolution |
|---|---|---|
| D1 | Format | **Rotating partnerships** across three six-hole segments, each player partnering each other player exactly once. Not the variant where the format changes every six holes. |
| — | Games picker group | A new fourth group, **Rotating Partnerships**, holding Sixes and later Wolf. |

**Still open — proceeding on the defaults below unless the Product Owner says otherwise:**

| # | Decision | Default assumed |
|---|---|---|
| D2 | Team score on a hole: **Best Ball** (low ball of the pair) or **Aggregate** (both balls added). | Best Ball, Aggregate as a config option |
| D3 | Segment result: **match play** (holes won inside the segment) or **total strokes** for the segment. | Match play |
| D4 | Stake shape: one amount per segment (three wagers, like Nassau's Front/Back/Overall), or points per hole won. | One amount per segment |
| D5 | A fourth "overall" wager across all 18 on top of the three segments? | No |
| D6 | Non-18-hole rounds: block Sixes at setup, or allow a 9-hole "3-3-3" variant. | Block; require 18 |
| D7 | A tied segment is halved and pays nothing. Confirm. | Halved, no money |

---

## 2. Game definition

**Players:** exactly four, selected into the game. The match may contain more; only the four selected
play Sixes.

**Player order** is a saved, ordered list of those four — `[P1, P2, P3, P4]`. Order determines the
rotation and nothing else.

**Partnerships** rotate by segment so each player partners each other player exactly once:

| Segment | Positions | Side A | Side B |
|---|---|---|---|
| 1 | 1–6 | P1 + P2 | P3 + P4 |
| 2 | 7–12 | P1 + P3 | P2 + P4 |
| 3 | 13–18 | P1 + P4 | P2 + P3 |

**Segments are defined by position in the played scoring sequence, not by hole number.** This is the
same convention Nassau already uses for Front and Back. A shotgun start beginning on hole 7 still
produces three consecutive six-hole segments; the first is holes 7–12.

**Hole result:** the two sides' hole scores are compared on the configured basis. Lower wins the hole.
Equal scores halve it.

**Segment result:** the side winning more holes inside its six wins the segment. Equal holes halves it.

**Settlement:** each segment is an independent wager at the saved per-segment stake. Stake semantics
match Nassau exactly — *each losing player owes the segment stake; the collected amount is divided
equally among the winning players.* At 2v2 with a $5 stake, each loser pays $5 and each winner
receives $5.

**Finality:** a segment is final when its six holes are complete, or when the result is mathematically
decided (a side is up by more holes than remain in that segment).

---

## 3. Handicap contract

Sixes is Net by default; Gross available.

Strokes are allocated **once for the whole round**, not per segment:

1. Apply the game-specific allowance percent to each player's unrounded Course Handicap.
2. Round each result to produce that player's Game Handicap.
3. Allocate relative strokes from the **lowest Game Handicap among the four Sixes players**, constant
   for all 18 holes.

Recomputing the low handicap per segment would make a player's net score on hole 7 depend on who they
were partnered with. That is wrong, and it would break parity with every other net game in the app.
Call this out explicitly to Codex — it is the most likely implementation mistake in this spec.

Use the existing helpers: `normalizeHandicapAllowancePercent`, `playingHandicapFromInputs`, and
`getSideMatchNetHoleScore` for per-hole net values, which is the same path `computeNinePointResults`
uses.

Recommended allowance for four-ball best-ball pairings is 90% under WHS guidance. Reuse the shape of
`getRecommendedNassauAllowance` rather than hard-coding, so the disclosure line stays truthful.

---

## 4. Critical architectural constraint

**Sixes must not use `match.players[].team` or `metrics.teams`.**

Partnerships change twice mid-round. The existing team machinery assumes a fixed team assignment for
the whole round and feeds Nassau, Team Match, Team Stroke, team Skins, and the team scorecards. Sixes
computes its own pairings per segment and reads only `metrics.holeResults[].playerScores[]`.

`computeNinePointResults` is the correct structural model: it takes its own `playerIds` from config,
walks `metrics.holeResults`, and never touches teams.

---

## 5. Data model

Lives in the game config inside `match.selectedGames`. No new top-level match fields, no migration.

```js
{
  key: 'sixes',
  basis: 'net',                 // 'gross' | 'net'
  playerIds: [],                // exactly 4, ordered — defines the rotation
  teamScoringMode: 'best_ball', // 'best_ball' | 'aggregate'   (D2)
  segmentResultMode: 'match',   // 'match' | 'strokes'         (D3)
  stakePerSegment: 5,
  handicapAllowanceMode: 'recommended',
  handicapAllowancePercent: 90,
  rulesCatalogVersion: 1,
}
```

**Order lock.** Once the first hole of the round is scored, `playerIds` must become read-only for the
rest of the round. Changing the order mid-round would silently rewrite which partnership owned
already-played holes. Follow the `sspSequenceLockedAt` precedent, or simply disable the setup control
once `metrics.completed > 0`. The locked-control option is cheaper and sufficient here.

---

## 6. Calculation contract

New function `computeSixesResults(match, metrics, cfg)`, modeled directly on
`computeNinePointResults`, returning:

```js
{
  basis, stakePerSegment, teamScoringMode, segmentResultMode,
  playerIds: [4],
  players: [4 player metric objects],
  segments: [{
    index: 1,
    label: 'Holes 1-6',
    holePositions: [1,2,3,4,5,6],
    holeNumbers: [1,2,3,4,5,6],
    sideA: { playerIds: [id, id], label: 'Name & Name' },
    sideB: { playerIds: [id, id], label: 'Name & Name' },
    holes: [{ holeNumber, completed, aScore, bScore, winner: 'A' | 'B' | 'halved' | null }],
    holesWonA, holesWonB,
    decided: false,   // mathematically settled
    complete: false,  // all six scored
    winner: 'A' | 'B' | 'halved' | null,
    statusText: '2 up thru 4',
  }],
  amounts: { [playerId]: number },
  settlements: [ /* optimalSettlementRows(amounts) */ ],
  completedHoles: 0,
}
```

Order of operations per hole:

1. Skip the hole entirely unless all four selected players have a gross score. A partial hole
   contributes nothing and never guesses.
2. Resolve each player's hole value on the configured basis.
3. Reduce each side to its hole score by `teamScoringMode`.
4. Compare and record `winner`.

Then per segment, tally holes won, determine `decided` and `winner`, and post the stake using the same
per-person transfer semantics `computeLivePayoutGames` already applies for Nassau
(`transferTeamStakePerPerson`), but with the segment's own two-man sides rather than match teams.

Settle with `optimalSettlementRows(amounts)` so payment rows match every other game.

---

## 7. Competition Rules Catalog entry

Add to `COMPETITION_RULES_CATALOG` (app.js ~line 499). Draft text:

```js
sixes: Object.freeze({
  scoringMethod: 'Three independent six-hole matches with rotating partnerships; each player partners each other player for exactly one segment',
  allowance: 'Game-specific allowance is applied to each unrounded Course Handicap, then each Game Handicap is rounded before strokes are allocated from the lowest Game Handicap among the four Sixes players, constant for the whole round',
  tieTreatment: 'A tied hole is halved; a tied segment is halved and pays nothing',
  stakeMeaning: 'Each losing player owes the saved segment stake; the collected amount is divided equally among the winning players',
  escalation: 'No implicit escalation',
  finality: 'A segment is final when its six holes are complete or the result is mathematically decided',
}),
```

Adding a new key does not require bumping `COMPETITION_RULES_CATALOG_VERSION`; changing existing
entries does. Confirm with the Product Owner before any bump, since stamped rounds carry the version.

---

## 8. Setup experience

**Games picker group.** Add a fourth group to `GAME_SELECTION_GROUPS`, **Rotating Partnerships**,
holding Sixes now and Wolf in v31.0.41. Sixes belongs in neither "Nassau & Match Play" nor "Stroke &
Hole Games." Approved by the Product Owner.

**Config card** (`renderGamesPicker`, follow the `nine_point` card at ~line 20997):

- Four ordered player selects labelled **Order 1–4**, mutually exclusive, reusing the
  `getNinePointPlayerOptions` exclusion pattern generalized to four slots.
- A live pairing preview showing all three segments and their partnerships. This is the most valuable
  control on the card — players want to see who they are paired with before agreeing to the game.
- Scoring basis, team scoring mode, segment result mode, allowance mode and percent, `$ per segment`.
- A disclosure line stating the allowance recommendation and its authority, matching Nassau's pattern.

**Setup validation** (`saveMatch`, ~line 23212):

- `Sixes requires 4 assigned players.`
- `Select 4 players in order for Sixes.` when `playerIds` is not four unique ids.
- `Sixes requires an 18-hole round.` per D6.

**Readiness checklist** (~line 20384): add a Sixes row confirming four ordered players and 18 holes.

---

## 9. Presentation

| Surface | Requirement |
|---|---|
| Play header / featured status | `getPrimaryMatchStatusLine` (~10341): `Sixes: Seg 2 — Chad & Pat 1 up thru 9` |
| Quick Scoreboard row | `buildQuickScoreboardGameStatusRows` (~17832): three compact segment chips with status |
| Match status detail | ~10486: tiles for Basis, each segment's status, `$ / segment` |
| Scores tab | A Sixes card mirroring `ninePointScorecardCard` in `index.html`, rendered by a new `buildSixesScorecard(match, metrics)` — three blocks, one per segment, each showing the pairing, the six holes, holes won, and the result |
| Player detail | `buildPlayerDetailGameStatusBlock` (~11470): this player's three partners and per-segment contribution |
| Games summary | `buildSelectedGamesSummary` (~19203) |
| Ledger Entry | New export section following the 9-Point Ledger pattern at ~8106. Points are not the unit here — state segment results and money, and include the rotation table so the report is self-explanatory years later |
| Live payouts | `computeLivePayoutGames` (~19089) with `group: 'team'` and explicit `paymentLines` per segment |

Every surface must state **which segment** a result belongs to. A bare "Sixes: 1 up" is meaningless.

---

## 10. Shared Match

No new facts channel. Sixes derives from scores that already synchronize, and its config travels in
`selectedGames` through `buildSelectedGamesForCloud`. Verify only:

- The config survives `buildSelectedGamesForCloud` and join hydration with `playerIds` order intact.
- A joined non-host device renders identical segment results from the same scores.
- The completion parity gate includes Sixes amounts.

---

## 11. Integration checklist for Codex

Every site below is where `nine_point` appears today. Line numbers are from `release/v31.0.39`.

1. `GAME_LIBRARY` ~480 — `{ key: 'sixes', label: 'Sixes (6-6-6)' }`
2. `GAME_SELECTION_GROUPS` ~492
3. `COMPETITION_RULES_CATALOG` ~499
4. Game priority map ~2151 (suggest `sixes: 25`, between `singles_match` and `skins`)
5. `resolveAutoFeaturedCompetition` ~2419
6. Implicit-net key list ~2445
7. Featured result summary ~2518
8. Early-completion guard list ~6161 — **add `sixes`**; the round must not clinch until all three segments are decided
9. Live engine adapter descriptor ~6668
10. AI recap game summary payload ~7301 — segments, pairings, results
11. Ledger Entry export section ~8106 and ~8150
12. `getPrimaryMatchStatusLine` ~10341
13. Match status detail ~10486
14. Gross game payment detail label ~10730
15. `buildPlayerDetailGameStatusBlock` ~11470
16. Scores tab card render ~12033
17. Quick Scoreboard status row ~17832
18. `computeLivePayoutGames` ~19089
19. `buildSelectedGamesSummary` ~19203
20. Setup readiness ~20384
21. `getDefaultGameConfigs` ~20594
22. `renderGamesPicker` config card ~20997
23. `collectSelectedGames` field collection ~21061
24. `saveMatch` validation ~23212
25. `index.html` — `sixesScorecardCard` and `sixesScorecard` containers
26. `style.css` — segment block styles
27. Release chores — new cache name in `service-worker.js`, `manifest.json` version, immutable branding filenames, `package.json` version

---

## 12. Invariants preserved

- One Play controller and one Round contract; Classic and Player Mode render the same Sixes state.
- Partial holes contribute nothing; unknown stays unknown and outside every denominator.
- Course snapshots, RoundRecords, and localStorage compatibility untouched — the config is additive
  inside `selectedGames`, and rounds without Sixes are unaffected.
- Settlement remains authoritative and zero-sum.
- No hard-coded release version in tests; use the shared release-identity helper.

---

## 13. Test plan

New `tests/v31.0.40-sixes.test.js`:

1. Rotation is correct for all three segments given a known four-player order.
2. Rotation follows played position, not hole number — a shotgun start on hole 7 yields segments
   7–12, 13–18, 1–6.
3. Best Ball and Aggregate produce the documented side scores on a hand-built hole.
4. A hole missing one of the four scores contributes to no segment and no denominator.
5. Net strokes are allocated from the lowest Game Handicap among the four and do **not** change
   between segments.
6. A segment decided 4&2 reports `decided: true` before its sixth hole is scored.
7. A halved segment pays nothing.
8. Settlement is zero-sum across the four players and matches `optimalSettlementRows`.
9. Setup rejects fewer than four players, a duplicate in the order, and a non-18-hole round.
10. The config survives a cloud round-trip with order intact.
11. The rules catalog exposes the Sixes contract with all six fields populated.

Run `npm test`, then simulation comparison, release sanity, validation, lint, and layout checks.

---

## 14. Deferred

- Presses on Sixes segments.
- A fourth overall wager (D5).
- The 9-hole 3-3-3 variant (D6).
- Six- and eight-player rotations.
- Auto-suggested order by handicap balance.
