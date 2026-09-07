# Wolf — Draft Implementation Spec

**Status:** Product Owner decisions recorded 2026-09-07; ready for Codex planning
**Suggested release:** v31.0.41 — Foundational Games: Wolf (ships after Sixes)
**Database migration:** None. New Shared Match facts channel inside the existing `sharedMatchMeta`.
**Precedents to follow:** `nine_point` (per-hole points, head-to-head settlement) for calculation;
`sneaky_sandy_poley` (per-hole manual facts, sequence lock, shared reconciliation) for everything else.

Wolf is materially harder than Sixes. It is the first game in The Dye Ledger where **a per-hole
decision by a player, not a score, changes the money.** That decision has to be captured in Play,
locked to a rotation, synchronized across devices, reconciled on conflict, blocked at round completion
when missing, and reproduced faithfully in the Ledger Entry years later. The SSP subsystem already
solves every one of those problems; Wolf should reuse its shape rather than invent a second one.

---

## 1. Decisions

**Resolved by the Product Owner:**

| # | Decision | Resolution |
|---|---|---|
| W1 | Points scheme | **Confirmed** as the §3 table: 1 each for a Wolf-side win, 1 each to the opponents, 4 for a winning Lone Wolf, 1 each to the other three when the Lone Wolf loses. Stored as config values, not literals. |
| W4 | Holes 17 and 18 | **A game setup option** with three values. See §3.1 for the rule, the default, and the freeze requirement. |
| W7 | Undeclared hole | A hole scored but never declared **awards nothing, is disclosed, and blocks automatic round completion** until resolved. The app does not invent a declaration. |
| — | Shared Match declaration authority | A device may declare for a hole if it is **assigned the Wolf for that hole, or is the host**. Every other write is rejected fail-closed. |
| — | Games picker group | A new fourth group, **Rotating Partnerships**, shared with Sixes. |

**Still open — proceeding on the defaults below unless the Product Owner says otherwise:**

| # | Decision | Default assumed |
|---|---|---|
| W2 | **Lone Wolf** enabled? | Yes |
| W3 | **Blind Wolf** (declared before anyone tees off, double the Lone Wolf award) enabled? | Available as a config toggle, default off |
| W5 | **Player count.** Four only in v1, or also 3 and 5? | Four only |
| W6 | **Scoring basis** default. | Net |
| W8 | **Tie on a hole.** No points, or carry the hole's points forward. | No points, no carry |
| W9 | **Settlement.** Head-to-head on final point differentials at `$ per point`, identical to 9-Point. | Head-to-head differentials |

---

## 2. Game definition

**Players:** exactly four, selected into the game (W5).

**Rotation order** is a saved ordered list `[P1, P2, P3, P4]`. The Wolf on a hole is
`order[(position - 1) % 4]`, where `position` is the hole's index in the **played scoring sequence**,
not its hole number. A shotgun start on hole 7 makes P1 the Wolf on hole 7.

**On each hole** the Wolf makes exactly one declaration:

- `partner:<playerId>` — the Wolf takes one of the other three. The hole is 2v2.
- `lone` — the Wolf plays alone. The hole is 1v3.
- `blind` — the Wolf declares alone before anyone tees off (W3). The hole is 1v3 at a higher award.

**Side scores** use best ball on the configured basis: the Wolf side is the low ball of the Wolf and
partner (or just the Wolf when alone), the opponents' side is the low ball of the other players.

**Points** are awarded per §3. Points are the authoritative unit; dollars are points times the stake.

**Settlement:** final point totals settle head-to-head across all six unique pairs, exactly as
`computeNinePointResults` already does. For each pair, the point differential times `$ per point`
transfers from the lower to the higher. This produces a zero-sum result and reuses a tested path.

**Finality:** the game is final when every played hole has four scores and a resolved declaration.

---

## 3. Default points table (W1)

| Situation | Award |
|---|---|
| Wolf + partner win the hole | 1 point each to the Wolf and partner |
| Opponents win the hole | 1 point each to the two opponents |
| Lone Wolf wins | 4 points to the Wolf |
| Lone Wolf loses | 1 point each to the other three |
| Blind Wolf wins | 8 points to the Wolf |
| Blind Wolf loses | 1 point each to the other three |
| Hole tied | No points (W8) |

Store these as named config values rather than literals in the calculation, so a group can adjust the
scheme without a code change and so the Ledger Entry can state the scheme that was actually in force.

---

## 3.1 Holes 17 and 18 (W4)

With four players, sixteen holes is four clean rotations and everyone has been Wolf an equal number of
times. Wolf is a folk game with no governing body, so there is no single official rule for the last
two holes. Two conventions are widely published:

- **Continue the rotation** — Order 1 is Wolf on 17 and Order 2 on 18. This is the base rule, and it
  is what the app should do when nobody chooses otherwise. It is deterministic, knowable at setup, and
  never surprises anyone.
- **Last place is Wolf** — the player lowest in points is Wolf on 17 and the second-lowest on 18. This
  is the more commonly played house rule, deliberately giving the trailing player a chance to catch up
  and making the finish the most competitive stretch of the round.

`finalHolesRule` is a setup option with three values:

| Value | Behavior |
|---|---|
| `continue` | **Default.** Rotation continues: Order 1 on position 17, Order 2 on position 18. |
| `low_points` | The player with the fewest points is Wolf on 17; the second-fewest on 18. |
| `none` | No Wolf on 17 and 18. The holes are scored but award no Wolf points. |

### The freeze requirement for `low_points`

`low_points` is the only rule in either game where **the Wolf's identity is derived from live
standings rather than from setup.** That has consequences the implementation must handle explicitly:

1. The Wolf for position 17 is unknowable until position 16 is complete and scored.
2. If a score on an earlier hole is later corrected, a naive implementation would silently reassign
   who was Wolf on 17 and 18 and rewrite money that has already been played for.
3. In a Shared Match, two devices holding different score states would compute different Wolves for
   the same hole.

Therefore: **when `low_points` is selected, the app freezes the hole-17 and hole-18 Wolf assignments at
the moment their qualifying hole first becomes complete, and stores them as saved facts.** Position 17
freezes when position 16 first completes; position 18 freezes when position 17 first completes. The
codebase already records `holeFirstCompletedAt`, which is the correct trigger.

Once frozen, the assignment does not move, even if a later score correction changes the standings.
The Ledger Entry discloses the frozen assignment and the standings it was based on, so the record
explains itself years later.

**Tie-break**, applied only at freeze time and in this order:

1. Fewest points.
2. If still tied, the player earlier in the saved rotation order.

This is fully deterministic, so every device reaches the same answer from the same frozen facts.

If the Product Owner would rather avoid the freeze machinery entirely, `continue` and `none` both
remain available and neither needs it — only `low_points` does.

---

## 4. Data model

### 4.1 Game config in `match.selectedGames`

```js
{
  key: 'wolf',
  basis: 'net',               // 'gross' | 'net'                       (W6)
  playerIds: [],              // exactly 4, ordered — the rotation
  allowLoneWolf: true,        //                                       (W2)
  allowBlindWolf: false,      //                                       (W3)
  finalHolesRule: 'continue', // 'continue' | 'low_points' | 'none'    (W4)
  tieTreatment: 'no_points',  // 'no_points' | 'carry'                 (W8)
  points: {
    teamWin: 1,
    opponentsWin: 1,
    loneWolfWin: 4,
    loneWolfLoss: 1,
    blindWolfWin: 8,
    blindWolfLoss: 1,
  },
  pointValue: 1,              // dollars per point
  handicapAllowanceMode: 'recommended',
  handicapAllowancePercent: 100,
  rulesCatalogVersion: 1,
}
```

### 4.2 Per-hole manual facts on the match

A new top-level `match.wolfInputs`, keyed by hole number as a string, exactly mirroring
`match.sneakySandyPoleyInputs`:

```js
match.wolfInputs = {
  '7': {
    holeNumber: 7,
    choice: 'partner',        // 'partner' | 'lone' | 'blind' | ''
    partnerPlayerId: '',      // required and validated when choice === 'partner'
    declaredAt: '',           // ISO timestamp
    declaredByParticipantId: '',
    declaredByDeviceId: '',
    notes: '',                // <= 240 chars
  },
}
```

Required companions, one-for-one with the SSP functions at app.js ~3567–3765:

- `getDefaultWolfHoleInput(match, holeNumber)`
- `normalizeWolfHoleInput(match, raw, holeNumber)` — must reject a `partnerPlayerId` that is not one of
  the other three Wolf players for that hole, and must reject `blind` when `allowBlindWolf` is false
- `normalizeWolfInputs(match)`
- `getWolfHoleInput(match, holeNumber)`

### 4.3 Rotation lock

`match.wolfOrderLockedAt`, `match.wolfOrderLockedByParticipantId`, `match.wolfOrderLockedByDeviceId`,
following `sspSequenceLockedAt`. The order locks the moment the first hole is scored. After that the
setup control is read-only. Without this, reordering mid-round silently reassigns who was Wolf on
already-played holes and rewrites the money.

### 4.4 Frozen final-hole assignments

Only used when `finalHolesRule === 'low_points'` (§3.1). Both entries are written once and never
recomputed:

```js
match.wolfFinalHoleAssignments = {
  '17': { playerId: '', frozenAt: '', standings: { [playerId]: points } },
  '18': { playerId: '', frozenAt: '', standings: { [playerId]: points } },
};
```

`standings` is stored so the Ledger Entry can show why that player was Wolf, and so a later score
correction is visibly reconciled rather than silently rewriting history. Freeze position 17 when
position 16 first completes and position 18 when position 17 first completes, keyed off the existing
`holeFirstCompletedAt`. These entries travel with the Shared Match facts in §7.

---

## 5. Calculation contract

New `computeWolfResults(match, metrics, cfg)`, structured like `computeNinePointResults`:

```js
{
  basis, pointValue, points, playerIds: [4], players: [4],
  holes: [{
    holeNumber, position,
    wolfPlayerId,
    choice, partnerPlayerId,
    declared: false,
    scored: false,           // all four have gross scores
    resolved: false,         // scored AND declared
    wolfSidePlayerIds: [], opponentPlayerIds: [],
    wolfSideScore: null, opponentScore: null,
    winner: 'wolf' | 'opponents' | 'tied' | null,
    points: { [playerId]: number },
    runningTotals: { ... },
  }],
  totals: { [playerId]: number },
  amounts: { [playerId]: number },
  settlements: [ /* optimalSettlementRows(amounts) */ ],
  unresolvedHoles: [ /* hole numbers scored but not declared */ ],
  resolvedHoles: 0,
}
```

Order of operations per hole:

1. Determine the Wolf from the locked order and the hole's played position. For positions 17 and 18,
   apply `finalHolesRule`: under `low_points` read the **frozen** assignment from
   `match.wolfFinalHoleAssignments` and never recompute it from current standings; under `none` the
   hole awards no Wolf points and needs no declaration.
2. If the hole is not fully scored, mark `scored: false` and award nothing. Never guess.
3. If the hole is scored but not declared, mark `resolved: false`, award nothing, and add the hole to
   `unresolvedHoles`. This is a first-class state, not an error.
4. Otherwise build the two sides, reduce each to its best ball on the configured basis, compare, and
   award points from `cfg.points`.

Head-to-head settlement across all six pairs, then `optimalSettlementRows(amounts)`.

**Handicap:** identical rule to Sixes. Apply the game allowance to each unrounded Course Handicap,
round each Game Handicap, then allocate relative strokes from the lowest Game Handicap **among the
four Wolf players, constant for the whole round.** The low man does not change when the Wolf changes.

**Do not use `match.players[].team` or `metrics.teams`.** Wolf sides change every hole. Read only
`metrics.holeResults[].playerScores[]`.

---

## 6. Play experience

The declaration control renders through the existing hole card, in **both** render paths — Classic at
app.js ~17352 and Player Mode at ~17676 — the same way `renderSneakySandyPoleyEntry` does. Add
`renderWolfEntry(match, hole, metrics)` and call it from both. Neither mode calculates independently.

The control shows:

- Who the Wolf is on this hole, derived and not editable.
- Three or four choices: each of the other three players by name, plus **Lone Wolf**, plus **Blind
  Wolf** when enabled.
- The current declaration, clearly stated, with the ability to change it while the hole is editable.
- The resulting sides once declared, so the group can confirm before scoring.

**`applyCurrentHoleDomToMatch` invariant.** The Wolf control is an accordion input. It must only be
applied when it is actually present in the DOM. An absent control must never clear a saved
declaration. This is the single highest-risk regression in this release and belongs in the test plan
as an explicit case.

**Completion gate.** `unresolvedHoles` must block automatic round completion and surface a clear
review prompt, mirroring `hasUnresolvedSneakySandyPoleyValidation` at ~6143. Wording should name the
holes: `Wolf is undeclared on holes 4 and 11. Declare or the holes score no points.` Per W7, the
Product Owner may instead choose to default undeclared holes to Lone Wolf; that would remove the gate
and is the simpler build, but it invents a fact the golfers did not state.

---

## 7. Shared Match

Wolf declarations are manual facts and need a real synchronization channel. Copy the SSP pattern
end to end:

- `buildSharedWolfFacts(match)` — settings, inputs, order lock, frozen final-hole assignments (§4.4),
  `updatedAt`, `sourceDeviceId`
- `flattenSharedWolfFacts(facts)` — field-level flattening for three-way comparison
- `reconcileSharedWolfFacts(local, remote, baseline, { isHost })` — baseline three-way merge, surfacing
  conflicts rather than silently overwriting
- `applySharedWolfFacts(match, facts, { baseline })`
- `match.sharedWolfBaseline`, `match.sharedWolfUpdatedAt`, `match.sharedWolfSourceDeviceId`,
  `match.sharedWolfConflicts`

Hook points, mirroring `sspFacts` exactly:

| Site | Line (v31.0.39) | Action |
|---|---|---|
| `course_snapshot.sharedMatchMeta` | ~13410 | add `wolfFacts: buildSharedWolfFacts(match)` |
| Sync reconciliation | ~13675–13689 | reconcile and apply |
| Baseline capture | ~13741 | store `sharedWolfBaseline` |
| Join hydration | ~13889 | seed `wolfInputs`, baseline, sync state |
| Live meta fetch default | ~14096 | add `wolfFacts: null` |

**Declaration authority — approved.** A device may set the declaration for a hole if it is assigned
the Wolf for that hole, or if it is the host. Every other device's write is rejected fail-closed. This
is stricter than SSP and looser than Greenies, and it matches how a real group behaves: the Wolf calls
it, and the host can correct it. A rejected write must produce a clear, non-destructive message and
leave the local declaration untouched, never a silent no-op.

**Order lock and frozen final-hole assignments** resolve deterministically on conflict, following
`selectDeterministicSspSequenceLock`. Because both are written once from facts every device can
reproduce, a conflict here indicates a real divergence and should be surfaced, not merged.

---

## 8. Competition Rules Catalog entry

```js
wolf: Object.freeze({
  scoringMethod: 'A rotating Wolf on each hole takes a partner or plays alone; best ball on each side decides the hole and points are awarded from the saved Wolf points scheme',
  allowance: 'Game-specific allowance is applied to each unrounded Course Handicap, then each Game Handicap is rounded before strokes are allocated from the lowest Game Handicap among the four Wolf players, constant for the whole round',
  tieTreatment: 'A tied hole awards no points and does not carry',
  stakeMeaning: 'Final point differentials settle head-to-head at the saved dollars per point',
  escalation: 'Lone Wolf and Blind Wolf awards follow the saved Wolf points scheme; no implicit escalation',
  finality: 'Final when every played hole has four scores and a resolved Wolf declaration',
}),
```

Update the tie and escalation strings if W3 or W8 change.

---

## 9. Setup experience

Config card, following `nine_point` at ~20997:

- Four ordered player selects labelled **Order 1–4**, mutually exclusive.
- A rotation preview: `H1 Chad · H2 Pat · H3 Ben · H4 John · repeating`, plus the H17/H18 treatment
  stated in words per `finalHolesRule` — `Order 1 and Order 2 are Wolf again`, `Lowest two in points
  are Wolf, decided after 16`, or `No Wolf on 17 and 18`.
- Scoring basis, `$ per point`, Lone Wolf toggle, Blind Wolf toggle, tie treatment.
- **Final holes** select with the three `finalHolesRule` values, defaulting to `continue`. When
  `low_points` is chosen, show a one-line disclosure that the last two Wolves are decided by standings
  after hole 16 and then fixed for the rest of the round.
- The six point values, grouped and labelled, with the default scheme preselected.
- A disclosure line naming the allowance and its authority.

Validation in `saveMatch` (~23212):

- `Wolf requires 4 assigned players.`
- `Select 4 players in order for Wolf.`
- `Blind Wolf requires Lone Wolf to be enabled.` if that dependency holds under W3.
- Point values must be finite and non-negative.

Readiness checklist (~20384): a Wolf row confirming four ordered players and a resolved points scheme.

---

## 10. Presentation

| Surface | Requirement |
|---|---|
| Play header | Wolf on this hole plus the running leader |
| `getPrimaryMatchStatusLine` ~10341 | `Wolf: Chad 11 pts thru 9` |
| Quick Scoreboard ~17832 | Point totals, plus a badge when holes are undeclared |
| Match status detail ~10486 | Tiles for Basis, `$ / point`, leader, undeclared count |
| Scores tab ~12033 | A `wolfScorecardCard` mirroring `ninePointScorecardCard`: one row per player, one column per hole, showing points, with the Wolf and the choice marked on each hole |
| Player detail ~11470 | Holes as Wolf, lone attempts and successes, points earned |
| Games summary ~19203 | Leader, points, undeclared holes |
| Ledger Entry ~8106 | A Wolf Ledger section. It must state the points scheme in force, list every hole with its Wolf, choice, sides, and result, disclose any hole that scored nothing because it was undeclared, and — under `low_points` — state the frozen hole-17 and hole-18 assignments and the standings they were based on |
| Live payouts ~19089 | `group: 'individual'`, with `paymentLines` from the head-to-head differentials |
| AI recap payload ~7301 | Wolf identity, choices, and outcomes per hole — this is rich narrative material and the Story should have it |

---

## 11. Integration checklist for Codex

The same 27 sites listed in the Sixes spec, plus the Shared Match facts channel in §7, plus:

28. `renderWolfEntry` called from both Play render paths (~17352 Classic, ~17676 Player Mode)
29. `applyCurrentHoleDomToMatch` — Wolf declaration handled as a present-only input
30. Round completion gate alongside `hasUnresolvedSneakySandyPoleyValidation` (~6143)
31. Early-completion guard list ~6161 — **add `wolf`**; points accrue to the final hole
32. `index.html` — the Play entry container and the Scores tab `wolfScorecardCard`
33. `style.css` — declaration control and Wolf scorecard styles

---

## 12. Invariants preserved

- One Play controller and one Round contract; Classic and Player Mode render the same Wolf state and
  neither calculates independently.
- `applyCurrentHoleDomToMatch` applies only inputs present in the DOM; an absent Wolf control never
  clears a saved declaration.
- Unknown stays unknown: an undeclared hole scores nothing and is disclosed rather than assumed.
- Shared Match stays authority-scoped, outbox-backed, idempotent, and parity-gated at completion.
- Grind remains limited to four editable golfers; Wolf's four-player requirement is compatible.
- Completed RoundRecords, course snapshots, and localStorage compatibility are untouched.

---

## 13. Test plan

New `tests/v31.0.41-wolf.test.js`:

1. Rotation assigns the correct Wolf for positions 1–16 given a known order.
2. Rotation follows played position, not hole number, under a shotgun start.
3. Each `finalHolesRule` produces the documented Wolf on positions 17 and 18.
3a. Under `low_points`, the position-17 Wolf freezes when position 16 first completes, and a later
    correction to an earlier hole's score does **not** move it.
3b. Under `low_points`, a points tie at freeze time resolves to the player earlier in the rotation
    order, and two devices with the same frozen facts agree.
3c. Under `none`, positions 17 and 18 are scored, award no Wolf points, and require no declaration.
4. Every row of the default points table awards correctly, including both tie cases.
5. Lone Wolf compares the Wolf's single ball against the best ball of the other three.
6. Blind Wolf awards the doubled value and is rejected when the toggle is off.
7. A hole scored but undeclared awards nothing, appears in `unresolvedHoles`, and blocks completion.
8. A partner id outside the other three for that hole is rejected by normalization.
9. Net strokes come from the lowest Game Handicap among the four and do not change per hole.
10. Settlement is zero-sum and matches `optimalSettlementRows`.
11. **Regression:** rendering a hole card without the Wolf control, then saving, preserves the existing
    declaration.
12. Reordering is refused once the round has a scored hole.
13. Shared Match: two devices declaring different partners on the same hole produce a surfaced
    conflict, not a silent overwrite.
14. Shared Match: a joined device that is not the Wolf and not the host cannot write a declaration.
15. A joined device hydrates existing declarations on join and renders identical points.
16. The rules catalog exposes the Wolf contract with all six fields populated.

Run `npm test`, then simulation comparison, release sanity, validation, lint, layout checks, and a
two-device Shared Match acceptance run covering declaration, conflict, and completion.

---

## 14. Deferred

- Three-, five-, and six-player Wolf (W5).
- Pig / Lone Wolf carryover variants.
- Presses on Wolf.
- Automatic Wolf order suggestion by handicap or by previous-round finish.
- Declaration timestamps used to enforce declaration-before-tee-shot ordering; v1 records the timestamp
  but does not police it.
