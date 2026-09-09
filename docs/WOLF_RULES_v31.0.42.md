# Wolf — Implementation Spec

**Status:** Amended 2026-09-08 — Wolf is **local scoring only** in this release. Shared Match support
is deliberately deferred. Ready for Codex planning.
**Suggested release:** v31.0.42 — Foundational Games: Wolf
**Database migration:** None. No new Shared Match facts channel.
**Precedents to follow:** `nine_point` (per-hole points, head-to-head settlement) for calculation;
`sneaky_sandy_poley` (per-hole manual facts on the match, sequence lock) for the facts model — but
**not** its synchronization layer.

Wolf is the first game in The Dye Ledger where **a per-hole decision by a player, not a score, changes
the money.** That decision has to be captured in Play, locked to a rotation, blocked at round
completion when missing, and reproduced faithfully in the Ledger Entry years later.

---

## 0. What changed in this amendment

The original spec included a full Shared Match facts channel for Wolf declarations, mirroring
`sspFacts` end to end. That is now **deferred to a future release.**

**Why.** Wolf's declaration is a verbal announcement to the group — "I'm taking Ben" — recorded by the
scorekeeper, exactly like everyone's scores. Unlike scores, where each player knows their own and
per-device entry earns its keep, syncing a declaration buys almost nothing even in a group where
everyone has a phone out. Wolf is a one-foursome game.

**What it removes.** The declaration authority rule is gone entirely — there is no longer any
"the Wolf for this hole, or the host, everything else rejected fail-closed." That rule would have made
authorization depend on derived per-hole state, which depends on the locked rotation, which under
`low_points` depends on frozen facts, which depend on sync ordering. Nothing in the codebase does that
today, and this release no longer needs to. Also removed: five sync hook points, the three-way
reconciliation path, conflict surfacing, and the completion parity gate for Wolf.

The repository's own history supports the deferral. v30.3.96 shipped Shared Match identity and
publication work and was followed by three consecutive hotfixes — v30.3.97, v30.3.98, v30.3.99 — then
v31.0.01 as a reliability foundation. Shared Match changes here have historically needed follow-up
releases, and Wolf's would have been the most coupled one yet.

**What it does NOT remove.** The `low_points` final-holes rule and its freeze requirement stay. Sync
ordering was what made the freeze difficult — a device that had not yet received hole 16 computing a
different Wolf. On a single device that problem does not exist. The freeze still has to survive a score
correction to an earlier hole, which is worth having and is now local, deterministic, and easy to test.

**Local-only must fail closed, not merely be untested.** See §7 for the four hard requirements. The
one that will actually bite is local-to-shared conversion: a Wolf round silently becoming shared is the
failure mode to prevent.

---

## 1. Decisions

**Resolved by the Product Owner:**

| # | Decision | Resolution |
|---|---|---|
| W0 | Shared Match | **Not supported in this release.** Wolf is local scoring only, blocked fail-closed per §7. |
| W1 | Points scheme | **Confirmed** as the §3 table: 1 each for a Wolf-side win, 1 each to the opponents, 4 for a winning Lone Wolf, 1 each to the other three when the Lone Wolf loses. Stored as config values, not literals. |
| W2 | Lone Wolf | Enabled. |
| W3 | Blind Wolf | Available as a config toggle, default off. Doubles the Lone Wolf award. |
| W4 | Holes 17 and 18 | **A game setup option** with three values. See §3.1 for the rule, the default, and the freeze requirement. |
| W5 | Player count | Four only. |
| W6 | Scoring basis | Net by default; Gross available. |
| W7 | Undeclared hole | A hole scored but never declared **awards nothing, is disclosed, and blocks automatic round completion** until resolved. The app does not invent a declaration. |
| W8 | Tied hole | No points, no carry. |
| W9 | Settlement | Head-to-head on final point differentials at the saved dollars per point. |
| — | Games picker group | Wolf joins the existing **Rotating Partnerships** group created in v31.0.40. |

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
transfers from the lower to the higher. Zero-sum, and it reuses a tested path.

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

- **Continue the rotation** — Order 1 is Wolf on 17 and Order 2 on 18. This is the base rule and the
  app's default. It is deterministic, knowable at setup, and never surprises anyone.
- **Last place is Wolf** — the player lowest in points is Wolf on 17 and the second-lowest on 18. The
  more commonly played house rule, giving the trailing player a chance to catch up.

`finalHolesRule` is a setup option with three values:

| Value | Behavior |
|---|---|
| `continue` | **Default.** Rotation continues: Order 1 on position 17, Order 2 on position 18. |
| `low_points` | The player with the fewest points is Wolf on 17; the second-fewest on 18. |
| `none` | No Wolf on 17 and 18. The holes are scored but award no Wolf points and need no declaration. |

### The freeze requirement for `low_points`

`low_points` is the only rule in the game where **the Wolf's identity is derived from live standings
rather than from setup.** Even on a single device that has consequences:

1. The Wolf for position 17 is unknowable until position 16 is complete and scored.
2. If a score on an earlier hole is later corrected, a naive implementation would silently reassign who
   was Wolf on 17 and 18 and rewrite money that has already been played for.

Therefore: **when `low_points` is selected, the app freezes the hole-17 and hole-18 Wolf assignments at
the moment their qualifying hole first becomes complete, and stores them as saved facts.** Position 17
freezes when position 16 first completes; position 18 freezes when position 17 first completes. The
codebase already records `holeFirstCompletedAt`, which is the correct trigger.

Once frozen, the assignment does not move, even if a later score correction changes the standings. The
Ledger Entry discloses the frozen assignment and the standings it was based on, so the record explains
itself years later.

**Tie-break**, applied only at freeze time and in this order:

1. Fewest points.
2. If still tied, the player earlier in the saved rotation order.

Because sync is out of scope in this release, the freeze has no cross-device divergence to guard
against — only score corrections. It stays fully deterministic.

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
  finalHolesRule: 'continue', // 'continue' | 'low_points' | 'none'     (W4)
  tieTreatment: 'no_points',  // reserved; 'no_points' is the only implemented value (W8)
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

A new top-level `match.wolfInputs`, keyed by hole number as a string, mirroring the shape of
`match.sneakySandyPoleyInputs`:

```js
match.wolfInputs = {
  '7': {
    holeNumber: 7,
    choice: 'partner',        // 'partner' | 'lone' | 'blind' | ''
    partnerPlayerId: '',      // required and validated when choice === 'partner'
    declaredAt: '',           // ISO timestamp
    notes: '',                // <= 240 chars
  },
}
```

Device and participant attribution fields are intentionally absent — there is one scoring device in
this release. A future Shared Match release adds them; their absence must not break forward
compatibility, so normalization must tolerate unknown extra keys rather than rejecting the input.

Required companions, one-for-one with the SSP functions at app.js ~3567–3765:

- `getDefaultWolfHoleInput(match, holeNumber)`
- `normalizeWolfHoleInput(match, raw, holeNumber)` — must reject a `partnerPlayerId` that is not one of
  the other three Wolf players for that hole, and must reject `blind` when `allowBlindWolf` is false
- `normalizeWolfInputs(match)`
- `getWolfHoleInput(match, holeNumber)`

### 4.3 Rotation lock

`match.wolfOrderLockedAt`, following `sspSequenceLockedAt`. The order locks the moment the first hole
is scored. After that the setup control is read-only. Without this, reordering mid-round silently
reassigns who was Wolf on already-played holes and rewrites the money.

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
`holeFirstCompletedAt`.

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

**Handicap:** apply the game allowance to each unrounded Course Handicap, round each Game Handicap,
then allocate relative strokes from the lowest Game Handicap **among the four Wolf players, constant
for the whole round.** The low man does not change when the Wolf changes.

**Do not use `match.players[].team` or `metrics.teams`.** Wolf sides change every hole. Read only
`metrics.holeResults[].playerScores[]`.

---

## 6. Play experience

The declaration control renders through the existing hole card, in **both** render paths — Classic and
Player Mode — the same way `renderSneakySandyPoleyEntry` does. Add
`renderWolfEntry(match, hole, metrics)` and call it from both. Neither mode calculates independently.

The control shows:

- Who the Wolf is on this hole, derived and not editable.
- Three or four choices: each of the other three players by name, plus **Lone Wolf**, plus **Blind
  Wolf** when enabled.
- The current declaration, clearly stated, with the ability to change it while the hole is editable.
- The resulting sides once declared, so the group can confirm before scoring.

**`applyCurrentHoleDomToMatch` invariant.** The Wolf control is an accordion input. It must only be
applied when it is actually present in the DOM. An absent control must never clear a saved
declaration. This is the single highest-risk regression in this release and belongs in the test plan as
an explicit case.

**Completion gate.** `unresolvedHoles` must block automatic round completion and surface a clear
review prompt, mirroring `hasUnresolvedSneakySandyPoleyValidation` at ~6143. Wording should name the
holes: `Wolf is undeclared on holes 4 and 11. Declare or the holes score no points.`

---

## 7. Shared Match — excluded, fail closed

Wolf is **not available in a Shared Match** in this release. There is no `wolfFacts` channel, no
reconciliation, no declaration authority rule, and Wolf never participates in the completion parity
gate.

Exclusion must be enforced, not merely undocumented. Four hard requirements:

1. **Block Wolf at setup when the match is or will be shared.** Disable the picker pill with an
   explanatory tooltip. The precedent already exists: `renderGamesPicker` disables `singles_match` via
   `singlesBlocked` with a `blockedTitle` when the setup does not qualify. Reuse that mechanism
   verbatim, with a message such as *"Wolf is available for local scoring only in this release."*
2. **Block local-to-shared conversion when Wolf is selected.** This is the path that will actually
   bite. The app supports converting a local match to a Shared Match, and a Wolf round silently
   becoming shared is the failure mode to prevent. It needs its own explicit refusal, its own clear
   message, and its own test.
3. **`buildSelectedGamesForCloud` must not publish a Wolf config.** If a joining device encounters one
   regardless — a forward-version round, say — it must refuse it and degrade safely through the
   existing unknown-game normalization rather than rendering a partial game or a wrong settlement.
4. **Wolf never enters the completion parity gate**, since it cannot be shared. Confirm no Wolf amount
   reaches parity comparison.

Forward compatibility: `match.wolfInputs`, `wolfOrderLockedAt`, and `wolfFinalHoleAssignments` are
additive on the match, so when a future release adds synchronization, existing local Wolf rounds open
unchanged.

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

Adding a new key does not require bumping `COMPETITION_RULES_CATALOG_VERSION`. Do not bump it.

---

## 9. Setup experience

Config card, following `nine_point` at ~20997:

- Four ordered player selects labelled **Order 1–4**, mutually exclusive.
- A rotation preview: `H1 Chad · H2 Pat · H3 Ben · H4 John · repeating`, plus the H17/H18 treatment
  stated in words per `finalHolesRule` — `Order 1 and Order 2 are Wolf again`, `Lowest two in points
  are Wolf, decided after 16`, or `No Wolf on 17 and 18`.
- Scoring basis, `$ per point`, Lone Wolf toggle, Blind Wolf toggle.
- **Final holes** select with the three `finalHolesRule` values, defaulting to `continue`. When
  `low_points` is chosen, show a one-line disclosure that the last two Wolves are decided by standings
  after hole 16 and then fixed for the rest of the round.
- The six point values, grouped and labelled, with the default scheme preselected.
- A disclosure line naming the allowance and its authority.
- A one-line note that Wolf is local scoring only in this release.

Validation in `saveMatch` and the match-start path:

- `Wolf requires 4 assigned players.`
- `Select 4 players in order for Wolf.`
- `Blind Wolf requires Lone Wolf to be enabled.`
- Point values must be finite and non-negative.
- `Wolf is available for local scoring only in this release.` when the match is or becomes shared.

Readiness checklist (~20384): a Wolf row confirming four ordered players, a resolved points scheme, and
a local (non-shared) match.

---

## 10. Presentation

| Surface | Requirement |
|---|---|
| Play header | Wolf on this hole plus the running leader |
| `getPrimaryMatchStatusLine` | `Wolf: Chad 11 pts thru 9` |
| Quick Scoreboard | Point totals, plus a badge when holes are undeclared |
| Match status detail | Tiles for Basis, `$ / point`, leader, undeclared count |
| Scores tab | A `wolfScorecardCard` mirroring `ninePointScorecardCard`: one row per player, one column per hole showing points, with the Wolf and the choice marked on each hole |
| Player detail | Holes as Wolf, lone attempts and successes, points earned |
| Games summary | Leader, points, undeclared holes |
| Ledger Entry | A Wolf Ledger section. It must state the points scheme in force, list every hole with its Wolf, choice, sides, and result, disclose any hole that scored nothing because it was undeclared, and — under `low_points` — state the frozen hole-17 and hole-18 assignments and the standings they were based on |
| Live payouts | `group: 'individual'`, with `paymentLines` from the head-to-head differentials |
| AI recap payload | Wolf identity, choices, and outcomes per hole — rich narrative material the Story should have |

Note that v31.0.41 changed the Classic Play header and overflow menu. Wolf's featured status string
must be verified against the new full-width featured competition row, not the old narrow metadata
column.

---

## 11. Integration checklist for Codex

The same integration sites listed in §11 of `docs/SIXES_RULES_v31.0.40.md`, with `wolf` in place of
`sixes`, plus:

- `renderWolfEntry` called from both Play render paths (Classic and Player Mode)
- `applyCurrentHoleDomToMatch` — Wolf declaration handled as a present-only input
- Round completion gate alongside `hasUnresolvedSneakySandyPoleyValidation`
- Early-completion guard list — **add `wolf`**; points accrue to the final hole
- The four §7 fail-closed sites: picker pill disable, local-to-shared conversion refusal,
  `buildSelectedGamesForCloud` exclusion, and parity-gate exclusion
- `index.html` — the Play entry container and the Scores tab `wolfScorecardCard`
- `style.css` — declaration control and Wolf scorecard styles
- Release chores — new cache name, `manifest.json` version, immutable branding filenames,
  `package.json` bump to 31.0.42

**All line numbers in the Sixes checklist predate v31.0.40 and v31.0.41.** Both shipped, and v31.0.41
changed the Play header and overflow menu directly. Verify every site against current code.

---

## 12. Invariants preserved

- One Play controller and one Round contract; Classic and Player Mode render the same Wolf state and
  neither calculates independently.
- `applyCurrentHoleDomToMatch` applies only inputs present in the DOM; an absent Wolf control never
  clears a saved declaration.
- Unknown stays unknown: an undeclared hole scores nothing and is disclosed rather than assumed.
- Shared Match behavior is unchanged, because Wolf is excluded from it fail-closed.
- Grind remains limited to four editable golfers; Wolf's four-player requirement is compatible.
- Completed RoundRecords, course snapshots, and localStorage compatibility are untouched.
- Sixes scoring shipped in v31.0.40 and is frozen. Do not refactor it, and do not extract shared
  abstractions between Sixes and Wolf.

---

## 13. Test plan

New `tests/v31.0.42-wolf.test.js`:

1. Rotation assigns the correct Wolf for positions 1–16 given a known order.
2. Rotation follows played position, not hole number, under a shotgun start.
3. Each `finalHolesRule` produces the documented Wolf on positions 17 and 18.
4. Under `low_points`, the position-17 Wolf freezes when position 16 first completes, and a later
   correction to an earlier hole's score does **not** move it.
5. Under `low_points`, a points tie at freeze time resolves to the player earlier in the rotation
   order.
6. Under `none`, positions 17 and 18 are scored, award no Wolf points, and require no declaration.
7. Every row of the default points table awards correctly, including both tie cases.
8. Lone Wolf compares the Wolf's single ball against the best ball of the other three.
9. Blind Wolf awards the doubled value and is rejected when the toggle is off.
10. A hole scored but undeclared awards nothing, appears in `unresolvedHoles`, and blocks completion.
11. A partner id outside the other three for that hole is rejected by normalization.
12. Normalization tolerates unknown extra keys in a hole input without discarding valid fields.
13. Net strokes come from the lowest Game Handicap among the four and do not change per hole.
14. Settlement is zero-sum and matches `optimalSettlementRows`.
15. **Regression:** rendering a hole card without the Wolf control, then saving, preserves the existing
    declaration.
16. Reordering is refused once the round has a scored hole.
17. **Fail-closed:** Wolf cannot be selected for a Shared Match, and the picker states why.
18. **Fail-closed:** converting a local match with Wolf to a Shared Match is refused with a clear
    message, and the local round is left intact.
19. **Fail-closed:** `buildSelectedGamesForCloud` publishes no Wolf config, and a Wolf config arriving
    from a foreign source degrades safely without producing a settlement.
20. No Wolf amount reaches the completion parity comparison.
21. Existing games are unchanged in a mixed-game round, including one with Sixes.
22. Classic and Player Mode report identical Wolf state.
23. The rules catalog exposes the Wolf contract with all six fields populated.

Final checks: focused v31.0.42 tests, full `npm test`, simulation comparison, release sanity,
validation, lint, Ledger layout checks with a real Wolf fixture, and an iPhone-width visual review at
320, 375, and 430. **No two-device acceptance run is required in this release** — Wolf is local only —
but confirm an existing Shared Match round is unaffected by the release.

---

## 14. Deferred

- **Shared Match support for Wolf**, including the `wolfFacts` channel, three-way reconciliation,
  declaration authority scoped to the hole's Wolf or the host, conflict surfacing, and parity-gated
  completion. This is its own release with its own two-device acceptance run.
- Three-, five-, and six-player Wolf (W5).
- Pig / Lone Wolf carryover variants.
- Carry treatment for tied holes (`tieTreatment`).
- Presses on Wolf.
- Automatic Wolf order suggestion by handicap or by previous-round finish.
- Declaration timestamps used to enforce declaration-before-tee-shot ordering; v1 records the timestamp
  but does not police it.
