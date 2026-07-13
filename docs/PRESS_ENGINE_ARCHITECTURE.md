# Press Engine Architecture

## 1. Purpose

v30.3.65 defined a dormant, Nassau-only, direct-child contract. v30.3.66 supersedes those two constraints and enables deliberate production presses for trusted match-play nodes. Presses are child games, never multipliers.

## v30.3.66 production contract

Game escalation capabilities are `PRESS`, `CARRYOVER`, `BRIDGE`, `HAMMER`, or `NONE`. Nassau components, Singles Match Play, and Team/Best-Ball Match Play are `PRESS`; Skins remains `CARRYOVER`; SSP remains `BRIDGE`; stroke games remain `NONE`. This prevents incompatible escalation mechanics from stacking.

Every press keeps stable `gameId`/`pressId`, `parentGameId`, `rootGameId`, `pressDepth`, hole range, declaration identity, inherited stake/basis, lifecycle timestamps, and authority metadata. The schema supports press-of-press trees; production defaults cap roots at three presses and depth one. Legacy games have presses off.

Production triggers are manual and prompt-at-threshold; neither creates money without explicit confirmation. Shared Match creation, voiding, and supersession are host-authoritative. Final presses enter the trusted payout pipeline once, and frozen RoundRecords retain child nodes, events, and component press transactions. `transactions` remains the authoritative net settlement; `pressTransactions` is the auditable component layer. A future Trip Ledger must consume frozen records and must not add both layers together.

Current limitations: joined devices cannot request approval; automatic, custom, double-stake, Hammer, and unlimited-depth behavior are deferred. The initial Play declaration surface is intentionally compact and host-focused.

## Completion safeguards

Confirmation is authoritative, not the dialog preview. The host reruns eligibility against current scores, the current declaration window, parent availability, press limits, duplicate start-hole rules, and the exact stable declaring-side ID shown when the dialog opened. Under `LOSING_SIDE_ONLY`, a tie, lead reversal, final parent, changed start hole, or newly conflicting press rejects the stale confirmation; the app never substitutes a new trailing side.

Threshold prompts use a deterministic identity comprising root, parent and component, declared-for hole, trailing side, threshold, depth, and threshold-state fingerprint. Local `pressPromptState` stores `DISMISSED`, `CONFIRMED`, or `STALE` handling across rerenders and reloads without entering frozen RoundRecords. A different hole, side, parent, depth, or later threshold crossing is a new opportunity.

Shared Match metadata treats the host press collection as authoritative. Merge uses stable press IDs, host-device identity, lifecycle precedence, and timestamps; missing joined-device arrays cannot erase host records, terminal void/supersede state cannot be downgraded, and same-parent/same-depth/same-declared-hole duplicates collapse deterministically without mutating inputs.

Scores and Match Summary include a dedicated Presses audit below game drivers. It preserves parent/depth hierarchy, declarer IDs, declaration and hole ranges, stake, lifecycle, reason, and component ledger impact. Live reports use current authoritative records; settled historical reports clone and render frozen `games[]` and `pressTransactions` without recalculation or mutation.

Live press-of-press declaration UI and broad void/supersede management UI remain deferred, along with joined-device request/approval, automatic creation, custom/double stakes, Hammer, and unlimited depth.

## Parent-first Quick Scoreboard presentation

The Quick Scoreboard explains the base competition before its children. Nassau is presented as explicit Front, Back, and Overall/18 component results, with each press nested beneath its recorded parent component and deeper stored depth shown through restrained indentation. The compact Final Settlement remains the accounting hero, but component wagers, results, lifecycle, and ledger contributions provide the audit path beneath it.

The factual Classic Scorecard is a read-only, collapsed disclosure before Momentum Charts. Nassau charts show visible `+N`, `-N`, and `E` point states with an explicit positive-side orientation. Round Highlight narrative follows the scorecard and charts so narrative never precedes the scoring and momentum evidence that supports it.

## Contextual Play action

Press creation is separated from Quick Scoreboard reporting. Play shows one contextual `Press` button beside `Scoreboard` only when the host is viewing the authoritative active scoring position and at least one opportunity passes the shared eligibility engine. One tap opens a `Create a Press` card listing every currently valid opportunity; selection then opens the existing explicit confirmation.

The active scoring position is the first sequential hole not fully complete, using the existing round-progress model rather than the viewed hole. An untouched active hole is included in the child range. Under `BEFORE_HOLE_STARTED`, any entered score, penalty, user-entered stat, SSP fact, or game input suppresses the opportunity; the engine never advances it silently to the following hole. Under `BEFORE_HOLE_COMPLETED`, a partially entered active hole remains eligible and confirmation names that hole and warns that information already exists. Backward and premature-forward browsing never exposes the action. Multiple opportunities retain configured game order and Nassau Front, Back, Overall order.

## 2. Terminology

- **Parent Nassau:** the selected Nassau game and its gross or net accounting lane.
- **Parent segment:** `FRONT`, `BACK`, or `OVERALL`.
- **Press:** an independent child match-play wager covering the future holes from its starting hole through its parent segment end.
- **Open parent:** not mathematically decided.
- **Clinched parent:** mathematically decided even though holes may remain.
- **Future holes:** parent-segment holes after the current scoring position.
- **Settled round:** completed or carrying a frozen RoundRecord.

## 3. Locked v1 product decisions

- Presses belong directly to a Nassau parent segment; they are not a generic new game.
- They inherit the parent basis, teams, handicap application, and per-person segment wager.
- Manual creation is the only initial production trigger. Automatic values are schema-ready but dormant.
- No retroactive press: the start is the next future segment hole.
- Multiple independent presses are allowed, default maximum three per segment.
- Duplicate parent-segment/start-hole presses are rejected.
- No recursive press-on-press tree, custom amounts, doubles, or escalating values.
- Shared Match host authority is mandatory.
- A `basis: both` Nassau has two stable parent lanes, `nassau_gross` and `nassau_net`; the creation request must explicitly choose one.

## 4. Match Setup configuration

`match.pressConfig` normalizes to:

```js
{
  pressesEnabled: false,
  pressType: 'MANUAL',
  pressAvailabilityRule: 'OPEN_SEGMENT_ONLY',
  maxPressesPerSegment: 3,
  pressValueRule: 'INHERIT_PARENT',
  pressAuthorityRule: 'HOST_ONLY',
  autoPressThreshold: null
}
```

The maximum is bounded to 1–10. `AUTO` and `MANUAL_AND_AUTO` are schema values only. No controls are exposed in v30.3.65 because that would imply production functionality.

## 5. Availability policies

`OPEN_SEGMENT_ONLY` is the default. It requires an undecided parent plus future holes.

`FUTURE_HOLES_REMAIN` permits a new press after the parent is clinched, provided a future parent-segment hole remains.

Both also require: enabled configuration, selected positive-wager Nassau parent, valid segment and basis, host authority, count below maximum, no duplicate start, and a non-settled/non-reopened/non-ended round.

## 6. Press schema

Schema v1 fields include `pressId`, `roundId`, `parentGameId`, `parentSegmentId`, `parentSegmentType`, `startingHole`, `endingHole`, `triggerType`, stable initiating player/team references, opposing team reference, inherited `wagerAmount`, `scoringMode`, `teamMode`, lifecycle `status`, creation/resolution/void timestamps, source/host device IDs, creator, and `schemaVersion`.

Names are never accounting keys. Team renames do not alter parent or press identity. IDs are deterministic: round + parent segment + starting hole + ordinal.

## 7. Parent Nassau relationship

Stable examples are `nassau_net:front`, `nassau_gross:back`, and `nassau_net:overall`. Ending holes come from the selected course/round hole sequence, not unconditional 9/18 constants. Front is the first up-to-nine selected holes; Back is the remaining selected holes; Overall is the full selected sequence. A nine-hole round has no Back segment.

## 8. Eligibility contract

`getPressEligibility()` returns `eligible`, a stable `reasonCode`, explanatory text, next start, future-hole count, current/max count, parent IDs, openness/clinch flags, inherited wager, and scoring mode.

Reason codes include `PRESSES_DISABLED`, `NO_NASSAU_PARENT`, `BASIS_REQUIRED`, `INVALID_SEGMENT`, `HOST_ONLY`, `ROUND_SETTLED`, `ROUND_REOPENED`, `ROUND_ENDED_EARLY`, `ZERO_PARENT_WAGER`, `NO_FUTURE_HOLES`, `PRESS_LIMIT_REACHED`, `DUPLICATE_STARTING_HOLE`, `PARENT_SEGMENT_DECIDED`, and `ELIGIBLE`.

Partially entered current-hole scores do not fabricate completion. The caller supplies current position when live UI state is newer than saved metrics; the press always starts after that position.

## 9. Lifecycle

- `PENDING`: created before its first eligible hole is complete.
- `ACTIVE`: at least one press hole is complete and the press is undecided.
- `FINAL`: non-zero result with all holes complete or a mathematical clinch.
- `HALVED`: all press holes complete with zero difference.
- `INCOMPLETE`: play ended before a final/halved result.
- `VOIDED`: explicitly cancelled or invalidated; excluded from count and settlement.
- `SUPERSEDED`: replaced by an audited correction; excluded from current settlement.

A pending press may be cancelled before its first hole. Once play begins, v1 requires explicit host voiding rather than deletion. Reopening must supersede prior finalized artifacts rather than silently recalculate them. UI for these operations is deferred.

## 10. Scoring

A press is independent match play across its own range. The dormant lifecycle helper uses the existing Nassau hole outcome adapter, which already applies the parent gross/net and handicap conventions. It does not implement another handicap or Nassau engine. Ties, live leads, clinches, finals, incomplete rounds, teams, singles-ready identity, combo tees, and shortened rounds retain their underlying production truth.

## 11. Settlement

`buildPressSettlementShape()` is not connected to production totals. It prepares stable press/parent metadata, per-player amounts, deterministic payer/payee transaction IDs, and zero-sum cross-foot validation. It mirrors the existing Nassau convention: every losing-team player pays the inherited per-person stake and the pot is divided equally across winning-team players. Halved, incomplete, pending, voided, and superseded presses contribute zero.

v30.3.66 must add each final press as a separate payout-game contribution. It must not hide press money inside the parent Nassau row or derive it from prose.

## 12. Shared Match authority

Only the host may create, void, confirm, or finalize authoritative presses. Joined devices may display host-synchronized configuration/records but receive `HOST_ONLY` for creation. Existing Shared Match metadata carries the dormant structures; no new distributed protocol exists.

For offline/stale/simultaneous attempts, the host determines the authoritative current position and ID. Duplicate parent/start validation runs again at host acceptance. Host disconnect leaves presses displayable but blocks mutation. Conflicts are surfaced or rejected; they are never silently merged. Future request/approval is deferred.

## 13. Frozen RoundRecord behavior

Current production freezing is unchanged in v30.3.65. v30.3.66 must freeze stable press transaction records alongside other game contributions. Report viewing must consume, not regenerate, frozen transactions. Reopened records remain in snapshot history and corrected completion creates an auditable replacement.

## 14. Trip Ledger aggregation

> A future Trip Ledger must sum frozen press transactions from finalized RoundRecords. It must not recalculate historical press outcomes using current game logic.

Press IDs, parent IDs, payer/payee player IDs, currency/version metadata, and transaction IDs must survive export/import and synchronization. Voided/superseded records are excluded. Future currency mismatches must block aggregation rather than convert implicitly.

## 15. v30.3.66 UI contract

- **Match Setup:** Allow presses, availability policy, maximum, inherited value, host-only authority, and later automatic threshold.
- **Play:** deliberate confirmation showing parent, start/end, value, and eligibility explanation; never a one-tap wager.
- **Quick Scoreboard:** nest press rows under Nassau with start, wager, current/final status, and separate money contribution.
- **Scores:** show press results in competition detail without overcrowding; momentum only when meaningful.

## 16. Edge cases

- Tied/open parents may be pressed; clinched parents depend on policy.
- A press may start on the final eligible hole; none may start after it.
- Zero/missing wager, maximum reached, and duplicate start are ineligible.
- Either team may initiate multiple independent presses within the maximum.
- Same-name players remain distinct by ID; team rename is presentation only.
- Short rounds use selected-hole ranges; no Back exists when no back holes exist.
- Early-ended, conceded, completed, frozen, or reopened rounds block new creation.
- Incomplete scores do not become zeros and do not retroactively move the start.
- Invalid/accidental records are voided; corrected records are superseded.
- Gross and net parents remain separate; `both` requires an explicit lane.
- Combo tees and later handicap changes use the round snapshot and inherited production adapter.
- Legacy matches get disabled defaults and no fabricated records.
- Host-unavailable or stale joined devices cannot create authoritative records.

## 17. Legacy compatibility

All fields are additive. Legacy matches normalize to disabled configuration and an empty array. Unknown fields are retained by object spreading. No historical presses, destructive migration, login, cloud dependency, or startup bulk write is introduced.

## 18. Known limitations

No production creation, payout integration, edit/void UI, automatic trigger, request/approval, notification, generic press game, custom value, currency extension, or cloud conflict protocol is implemented.

## 19. Explicitly deferred features

Production Match Setup controls; Play action/confirmation; auto presses; press requests; void/supersession UI; payout-game integration; RoundRecord press transactions; Quick Scoreboard/Scores display; notifications; custom/double/escalating presses; recursive presses; cloud schema changes.

## 20. v30.3.66 implementation checklist

1. Expose configuration controls without changing defaults.
2. Call eligibility using current unsaved scoring position.
3. Require confirmation and host revalidation.
4. Persist/synchronize the normalized draft; prevent duplicate IDs/starts.
5. Render lifecycle and parent relationship.
6. Add final press contribution to the existing payout-game pipeline exactly once.
7. Freeze separate stable press transactions and test historical stability.
8. Add explicit host void/supersede audit behavior.
9. Add Quick Scoreboard and Scores nested presentation.
10. Complete two-device, offline, shortened-round, gross/net/both, reopen, reconciliation, and manual mobile QA.

