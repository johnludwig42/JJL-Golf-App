# Sixes (6-6-6) — Implementation Spec

**Status:** Amended 2026-09-08 after Product Owner clarification. Supersedes the version committed in
`6efb23c`. Ready for Codex re-planning.
**Suggested release:** v31.0.40 — Foundational Games: Sixes
**Database migration:** None
**Precedents to follow:** `nine_point` for the ordered player selection, per-hole points, and
head-to-head settlement; Nassau for the per-segment wager and its per-person stake transfer.

Sixes derives entirely from saved gross scores plus a saved player order. It introduces no new
per-hole manual input, no new Shared Match facts channel, and no new validation gate. Wolf does all
three, which is why the two ship as separate releases with Sixes first.

---

## 0. What changed in this amendment

The original spec scored Sixes only as **three independent six-hole match-play wagers**, mirroring
Nassau's Front/Back/Overall. That is the common published form. The Product Owner's own annual family
competition uses a different house rule — **individual points**, where partnerships rotate to create
the matchups but the money follows each player's point total across the whole round.

Both are now in scope. Sixes ships with a **scoring mode** selected at setup:

| Mode | Money unit | Settlement | Default |
|---|---|---|---|
| `points` | Each player's individual point total | Head-to-head differentials across all six player pairs at `$ per point`, exactly as `computeNinePointResults` does | **Yes** |
| `segments` | Each six-hole segment, won or halved | Three independent wagers at `$ per segment`, Nassau stake semantics | No |

The hole-level comparison is identical in both modes — better ball of each pair, lower score wins,
equal halves. Only the roll-up and the settlement differ. Build the hole comparison once and branch
only at the roll-up, so the two modes can never disagree about who won a hole.

Also settled in this amendment: Aggregate team scoring and total-strokes segment results are **not**
implemented. Best Ball and match play are the only implemented values. Their config fields are
retained so either can be added additively later.

**One cost worth naming.** Two modes means two settlement paths and two presentation headlines, which
is a meaningful increase in test surface over a single-mode release. The plan below covers both
properly; if the release runs long, `segments` is the one to defer, since `points` is the mode actually
in use.

---

## 1. Decisions

**Resolved by the Product Owner:**

| # | Decision | Resolution |
|---|---|---|
| D1 | Format | **Rotating partnerships** across three six-hole segments, each player partnering each other player exactly once. Not the variant where the format changes every six holes. |
| D2 | Team score on a hole | **Best Ball** — the lower of the two partners' balls. Aggregate is reserved, not implemented. |
| D3 | Scoring mode | **Both.** `points` (default) and `segments`, selected at setup. |
| D4 | Points mode award | One point to **each** player on the side that wins a hole. |
| D5 | Segments mode wager | Three independent wagers, one per six-hole segment. No additional overall wager. |
| D6 | Hole count | **18 holes required.** Block Sixes at setup for any other scoring sequence. |
| D7 | Halved hole | **No points and no money.** Recorded as halved; does not carry in either mode. |
| D8 | Points mode settlement | **Head-to-head point differentials** across all six unique pairs at the saved dollars per point. Zero-sum. |
| D9 | Segments mode settlement | Nassau semantics — each losing player owes the segment stake; the collected amount divides equally among the winning players. |
| — | Games picker group | A new fourth group, **Rotating Partnerships**, holding Sixes and later Wolf. |

---

## 2. Game definition

### 2.1 Common to both modes

**Players:** exactly four, selected into the game. The match may contain more; only the four selected
play Sixes.

**Player order** is a saved, ordered list of those four — `[P1, P2, P3, P4]`. Order determines the
partnership rotation and nothing else.

**Partnerships** rotate by segment so each player partners each other player exactly once:

| Segment | Positions | Side A | Side B |
|---|---|---|---|
| 1 | 1–6 | P1 + P2 | P3 + P4 |
| 2 | 7–12 | P1 + P3 | P2 + P4 |
| 3 | 13–18 | P1 + P4 | P2 + P3 |

**Segments are defined by position in the played scoring sequence, not by hole number.** This is the
convention Nassau already uses for Front and Back. A shotgun start beginning on hole 7 still produces
three consecutive six-hole segments; the first is holes 7–12.

**Hole result.** Each side's hole score is the **lower of its two partners' balls** on the configured
basis. The lower side score wins the hole. Equal side scores halve it. A hole is skipped entirely
unless all four selected players have a gross score.

### 2.2 `points` mode (default)

On a won hole, **each of the two players on the winning side receives one point.** A halved hole awards
nothing and does not carry. Exactly two points are distributed on each decided hole, and 36 across a
complete 18-hole round.

Final point totals settle head-to-head across all six unique player pairs. For each pair, the point
differential times `pointValue` transfers from the lower total to the higher. Copy the settlement loop
from `computeNinePointResults` rather than inventing new math.

Segments still exist in this mode, but carry no money. Their hole records are retained as informational
facts for the scoreboard and Ledger Entry, and must be visibly labelled as such.

**Finality:** final when every played hole has four valid scores. No early clinch — points accrue to
the last hole.

### 2.3 `segments` mode

Each six-hole segment is an independent match. The side winning more holes inside its six wins the
segment; equal holes halves it. Each segment is a separate wager at `stakePerSegment`, using Nassau's
stake semantics: each losing player owes the stake, and the collected amount divides equally among the
winning players. At 2v2 with a $5 stake, each loser pays $5 and each winner receives $5.

**Finality:** a segment is final when its six holes are complete, or when the result is mathematically
decided — a side is up by more holes than remain in that segment. The round is not complete until all
three segments are decided.

Player point totals are still computed and displayed in this mode as informational context, but they
carry no money.

---

## 3. Handicap contract

Sixes is Net by default; Gross available. Identical in both modes.

Strokes are allocated **once for the whole round**, not per segment:

1. Apply the game-specific allowance percent to each player's unrounded Course Handicap.
2. Round each result to produce that player's Game Handicap.
3. Allocate relative strokes from the **lowest Game Handicap among the four Sixes players**, constant
   for all 18 holes.

Recomputing the low handicap per segment would make a player's net score on hole 7 depend on who they
were partnered with. That is wrong, and it would break parity with every other net game in the app.
This remains the most likely implementation mistake in this spec.

Use the existing helpers: `normalizeHandicapAllowancePercent`, `playingHandicapFromInputs`, and
`getSideMatchNetHoleScore` for per-hole net values — the same path `computeNinePointResults` uses.

Recommended allowance for four-ball best-ball pairings is 90% under WHS guidance. Reuse the shape of
`getRecommendedNassauAllowance` rather than hard-coding, so the disclosure line stays truthful.

---

## 4. Critical architectural constraints

**Sixes must not use `match.players[].team` or `metrics.teams`.** Partnerships change twice mid-round.
The existing team machinery assumes a fixed assignment for the whole round and feeds Nassau, Team
Match, Team Stroke, team Skins, and the team scorecards. Sixes computes its own pairings per segment
and reads only `metrics.holeResults[].playerScores[]`.

**Sixes cannot call `transferTeamStakePerPerson`.** That helper is local to `computeLivePayoutGames`
and resolves members through fixed `metrics.teams`. In `segments` mode, replicate its arithmetic
against the segment's own two player-ID pairs: total pot equals the stake times the number of losers,
divided equally among the winners.

**Build the hole comparison once.** Both modes must consume one shared per-hole result. If the hole
comparison is written twice, the two modes will eventually disagree about who won a hole, and the
scoreboard will contradict the Ledger.

---

## 5. Data model

Lives in the game config inside `match.selectedGames`. No new top-level match fields, no migration.

```js
{
  key: 'sixes',
  mode: 'points',               // 'points' | 'segments'
  basis: 'net',                 // 'gross' | 'net'
  playerIds: [],                // exactly 4, ordered — defines the rotation
  teamScoringMode: 'best_ball', // reserved; 'best_ball' is the only implemented value

  // points mode
  pointsPerHoleWin: 1,          // points to EACH player on the winning side
  pointValue: 1,                // dollars per point

  // segments mode
  stakePerSegment: 5,
  segmentResultMode: 'match',   // reserved; 'match' is the only implemented value

  handicapAllowanceMode: 'recommended',
  handicapAllowancePercent: 90,
  rulesCatalogVersion: 1,
}
```

Both modes' fields are always present and normalized, so switching mode at setup never leaves a config
half-populated. `teamScoringMode`, `segmentResultMode`, and `pointsPerHoleWin` are stored so alternates
can be added additively later. Do not build UI controls or calculation branches for values other than
the defaults, and do not show dead options in Match Setup.

**Order lock.** Once the first hole of the round is scored, `playerIds` **and `mode`** must become
read-only for the rest of the round. Changing the order would rewrite which partnership owned
already-played holes; changing the mode mid-round would change what the already-played holes were
worth. Disabling both setup controls once `metrics.completed > 0` is sufficient.

---

## 6. Calculation contract

New function `computeSixesResults(match, metrics, cfg)`, modeled on `computeNinePointResults`:

```js
{
  mode, basis, pointValue, pointsPerHoleWin, stakePerSegment,
  playerIds: [4],
  players: [4 player metric objects],

  // shared, mode-independent
  holes: [{
    holeNumber, position, segmentIndex,
    sideA: { playerIds: [id, id], score: null },
    sideB: { playerIds: [id, id], score: null },
    completed: false,           // all four have gross scores
    winner: 'A' | 'B' | 'halved' | null,
    points: { [playerId]: 0 },  // populated in both modes
    runningTotals: { ... },
  }],
  segments: [{
    index: 1,
    label: 'Holes 1-6',
    holeNumbers: [1,2,3,4,5,6],
    sideA: { playerIds: [id, id], label: 'Name & Name' },
    sideB: { playerIds: [id, id], label: 'Name & Name' },
    holesWonA, holesWonB, holesHalved,
    pointsByPlayer: { [playerId]: 0 },
    complete: false,
    decided: false,             // segments mode only — mathematically settled
    winner: 'A' | 'B' | 'halved' | null,
    statusText: '2 up thru 4',
  }],
  totals: { [playerId]: number },   // point totals, both modes

  // mode-dependent
  amounts: { [playerId]: number },
  leaderboard: [{ playerId, name, total, amount, teeName }],
  settlements: [ /* optimalSettlementRows(amounts) */ ],
  completedHoles: 0,
}
```

Order of operations:

1. **Per hole, shared.** Skip unless all four have a gross score — a partial hole contributes nothing,
   awards nothing, and never guesses. Resolve each player's value on the basis, reduce each side to its
   lower ball, compare, set `winner`, and award `pointsPerHoleWin` to each player on the winning side.
   Points are populated in both modes; only their monetary meaning differs.
2. **Roll up segments, shared.** Group hole records; tally holes won and halved and points by player.
3. **Settle, mode-dependent.**
   - `points`: for each of the six unique player pairs, transfer `(totalA - totalB) * pointValue`.
   - `segments`: for each segment, determine `decided` and `winner`, then post `stakePerSegment`
     against that segment's own player-ID pairs using the Nassau per-person arithmetic in §4.
4. Produce payment rows with `optimalSettlementRows(amounts)` in both modes.

In `points` mode, `segments[].winner` and `decided` are informational and must not influence `amounts`.
In `segments` mode, `totals` are informational and must not influence `amounts`. Both directions belong
in the test plan.

---

## 7. Competition Rules Catalog entry

Add a base entry to `COMPETITION_RULES_CATALOG` (app.js ~line 499) and override the mode-dependent
fields in `getCompetitionRulesContract`, following the precedent already there for Skins `carryoverMode`:

```js
sixes: Object.freeze({
  scoringMethod: 'Partnerships rotate every six holes so each player partners each other player once; the lower better ball wins the hole',
  allowance: 'Game-specific allowance is applied to each unrounded Course Handicap, then each Game Handicap is rounded before strokes are allocated from the lowest Game Handicap among the four Sixes players, constant for the whole round',
  tieTreatment: 'A tied hole is halved, awards nothing, and does not carry',
  stakeMeaning: 'Set by the saved scoring mode',
  escalation: 'No implicit escalation',
  finality: 'Set by the saved scoring mode',
}),
```

Mode overrides:

| Field | `points` | `segments` |
|---|---|---|
| `scoringMethod` | append *"and awards one point to each player on the winning side"* | append *"and the side winning more holes wins the six-hole segment"* |
| `stakeMeaning` | *"Final point differentials settle head-to-head at the saved dollars per point"* | *"Each losing player owes the saved segment stake; the collected amount is divided equally among the winning players"* |
| `finality` | *"Final when every played hole has four valid scores"* | *"A segment is final when its six holes are complete or the result is mathematically decided"* |

Adding a new key does not require bumping `COMPETITION_RULES_CATALOG_VERSION`. Do not bump it.

---

## 8. Setup experience

**Games picker group.** Add a fourth group to `GAME_SELECTION_GROUPS`, **Rotating Partnerships**,
holding Sixes now and Wolf in v31.0.42.

**Config card** (`renderGamesPicker`, follow the `nine_point` card at ~line 20997):

- Four ordered player selects labelled **Order 1–4**, mutually exclusive, reusing the
  `getNinePointPlayerOptions` exclusion pattern generalized to four slots.
- A live pairing preview showing all three segments and their partnerships. This is the most valuable
  control on the card — players want to see who they are paired with before agreeing to the game.
- **Scoring mode** select, defaulting to `points`:
  - *Player points* — *Winning a hole earns one point for each player on the winning side. Money
    settles on final point totals.*
  - *Segment matches* — *Each six-hole segment is its own match and its own bet.*
- The stake control follows the mode: `$ per point` for `points`, `$ per segment` for `segments`. Show
  only the one that applies; never both at once.
- Scoring basis, allowance mode and percent, and the allowance disclosure line matching Nassau's
  pattern.

**Setup validation** (`saveMatch`, ~line 23212, and the match-start validation path):

- `Sixes requires 4 assigned players.`
- `Select 4 players in order for Sixes.` when `playerIds` is not four unique ids.
- `Sixes requires an 18-hole round.`
- The mode must be one of the two supported values after normalization.

**Readiness checklist** (~line 20384): a Sixes row confirming four ordered players, 18 holes, and the
selected scoring mode.

---

## 9. Presentation

**The headline follows the mode.** In `points` mode the authoritative display unit is player points,
with segment records as supporting texture. In `segments` mode the headline is the three segment
results, with point totals as context. No surface may present the informational unit as if it were the
money.

| Surface | `points` mode | `segments` mode |
|---|---|---|
| Featured status ~10341 | `Sixes: John 7 pts thru 9` | `Sixes: Seg 2 — Chad & Pat 1 up thru 9` |
| Quick Scoreboard ~17832 | Four point totals, leader first | Three segment chips with status |
| Match status detail ~10486 | Basis, leader, `$ / point`, holes complete | Basis, each segment's status, `$ / segment` |
| Games summary ~19203 | Point totals and `$ / point` | Segment results and `$ / segment` |
| Live payouts ~19089 | `group: 'individual'`, head-to-head payment lines | `group: 'team'`, payment lines per segment |

Shared across both modes:

| Surface | Requirement |
|---|---|
| Scores tab | A Sixes card mirroring `ninePointScorecardCard` in `index.html`, from a new `buildSixesScorecard(match, metrics)`: one row per player, one column per hole showing points earned, running total, and payout — plus the three segment blocks showing each pairing and its hole record. The mode determines which half is emphasized and which is labelled informational |
| Player detail ~11470 | This player's three partners and the record alongside each |
| Ledger Entry ~8106 | A Sixes Ledger section: the scoring mode in force, the saved rotation order, all three pairings, the hole-by-hole record, per-player points, segment results, and reconciled settlements. State plainly which unit carried the money |
| AI Story facts ~7301 | Rotation, per-segment partner records, and final standings. "You went 4–2 with Pat and 1–5 with Ben" is exactly the kind of fact the Story should have |

Every segment-level display must identify its segment. A bare "Sixes: 1 up" is meaningless.

---

## 10. Shared Match

No new facts channel. Sixes derives from scores that already synchronize, and its config travels in
`selectedGames` through `buildSelectedGamesForCloud`, which clones complete configurations. Verify only:

- The config survives cloud serialization and join hydration with `playerIds` order **and `mode`**
  intact.
- A joined non-host device computes identical pairings, points, segment results, and settlements from
  the same scores.
- The completion parity gate includes Sixes amounts in both modes.
- Only the host can change the saved game configuration, under existing authority rules.

---

## 11. Integration checklist for Codex

Every site below is where `nine_point` appears today. Line numbers are from `release/v31.0.39` and will
have shifted — verify each against current code rather than trusting them.

1. `GAME_LIBRARY` ~480 — `{ key: 'sixes', label: 'Sixes (6-6-6)' }`
2. `GAME_SELECTION_GROUPS` ~492 — new Rotating Partnerships group
3. `COMPETITION_RULES_CATALOG` ~499 plus the mode overrides in `getCompetitionRulesContract`
4. Game priority map ~2151 (suggest `sixes: 41`, adjacent to `nine_point: 40`)
5. `resolveAutoFeaturedCompetition` ~2419
6. Implicit-net key list ~2445
7. Featured result summary ~2518 — mode-aware
8. Early-completion guard list ~6161 — **add `sixes`**. In `points` mode points accrue to the final
   hole, so the round must never report clinched early; in `segments` mode it must not complete until
   all three segments are decided
9. Live engine adapter descriptor ~6668 — `unit: 'points'`, `lowWins: false`, like `nine_point`
10. AI recap game summary payload ~7301
11. Ledger Entry export section ~8106 and ~8150
12. `getPrimaryMatchStatusLine` ~10341
13. Match status detail ~10486
14. Gross game payment detail label ~10730
15. `buildPlayerDetailGameStatusBlock` ~11470
16. Scores tab card render and clearing logic ~12033
17. Quick Scoreboard status row ~17832
18. `computeLivePayoutGames` ~19089 — both settlement branches
19. `buildSelectedGamesSummary` ~19203
20. Setup readiness ~20384
21. `getDefaultGameConfigs` ~20594
22. `renderGamesPicker` config card ~20997 — including mode-dependent stake control
23. `collectSelectedGames` field collection ~21061 — collect both modes' fields
24. `saveMatch` validation ~23212, plus the match-start validation path
25. Match normalization and rules stamping
26. `index.html` — `sixesScorecardCard` and `sixesScorecard` containers
27. `style.css` — point-table and segment-block styles
28. Live-engine test exports and simulation coverage
29. Ledger Entry fixture generator and layout checker — add real Sixes fixtures for **both** modes; the
    generic layout command would otherwise pass without rendering the new tables
30. Release chores — new cache name in `service-worker.js`, `manifest.json` version, immutable branding
    filenames, `package.json` bump to 31.0.40

`PROJECT_CONTEXT.md` records Sixes as the current release. Do not revise roadmap sequencing.

---

## 12. Invariants preserved

- One Play controller and one Round contract; Classic and Player Mode render the same Sixes state and
  neither calculates independently.
- One hole comparison feeds both modes; the two can never disagree about who won a hole.
- Partial holes contribute nothing; unknown stays unknown and outside every denominator. An unplayed
  hole is never a halve, a loss, or a zero.
- Course snapshots, RoundRecords, and localStorage compatibility untouched — the config is additive
  inside `selectedGames`, and rounds without Sixes are unaffected.
- Settlement remains authoritative and zero-sum in both modes.
- Shared Match stays authority-scoped and parity-gated at completion.
- No hard-coded release version in tests; use the shared release-identity helper.

---

## 13. Test plan

New `tests/v31.0.40-sixes.test.js`.

**Shared:**

1. Rotation is correct for all three segments given a known four-player order.
2. Rotation follows played position, not hole number — a shotgun start on hole 7 yields segments
   7–12, 13–18, 1–6.
3. Best Ball reduces each side to the lower of its two partners' balls on a hand-built hole.
4. A hole missing one of the four scores awards nothing and enters no denominator.
5. Net strokes are allocated from the lowest Game Handicap among the four and do **not** change
   between segments.
6. Plus-handicap and positive-handicap allocation both behave correctly.
7. Both modes produce identical `holes[].winner` values from the same scores.
8. Player order and mode are read-only once a hole is scored.
9. Setup rejects fewer than four players, a duplicate in the order, a non-18-hole round, and an
   unsupported mode.
10. Mixed-game round: existing games are unchanged when Sixes is added alongside them.
11. Classic and Player Mode report identical Sixes state.
12. The rules catalog exposes the Sixes contract with all six fields populated, with the correct
    mode-dependent `stakeMeaning` and `finality`.

**`points` mode:**

13. A won hole awards one point to **each** of the two players on the winning side, and nothing to the
    losing side.
14. A halved hole awards nothing and does not carry.
15. Exactly two points are distributed per decided hole, and 36 across a complete round.
16. Head-to-head settlement across all six pairs is zero-sum and matches `optimalSettlementRows`.
17. Segment records are informational: a segment result cannot change `totals` or `amounts`.
18. The round does not report clinched or complete before the final hole is scored.

**`segments` mode:**

19. A segment decided 4&2 reports `decided: true` before its sixth hole is scored.
20. A halved segment pays nothing.
21. Segment settlement is zero-sum, pays per losing player, and divides equally among winners.
22. Point totals are informational: they cannot change `amounts`.
23. The round does not complete until all three segments are decided.

**Both modes:**

24. Cloud round-trip preserves order and mode, and a joined device computes identical results and
    settlements.
25. Ledger Entry reconciles the money to its stated unit, and both Sixes tables meet print width,
    pagination, and orphan protection at iPhone and letter widths.

Final checks: focused v31.0.40 tests, full `npm test`, simulation comparison, release sanity,
validation, lint, Ledger layout checks, and an iPhone-width visual review.

---

## 14. Deferred

- Aggregate team scoring (`teamScoringMode`).
- Total-strokes segment results (`segmentResultMode`).
- An additional overall wager on top of the three segments.
- Presses on Sixes segments.
- Stableford-style per-hole point awards against handicap.
- Six- and eight-player rotations.
- Auto-suggested order by handicap balance.
