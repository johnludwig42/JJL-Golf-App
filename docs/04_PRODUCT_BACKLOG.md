# The Dye Ledger Product Backlog

Version: 1.0
Status: Living Document

This backlog is the source of approved product direction. It is not a release plan, and not every item is scheduled.

Priority labels:

- NOW: Needed before commercial launch or required for core trust.
- NEXT: High-value product maturity item.
- FUTURE: Strategic vision or later-platform work.

## Product Principles

- The Dye Ledger must preserve the truth of the round.
- Accuracy before reliability.
- Reliability before convenience.
- The product must be at least as effortless as paper while dramatically more valuable than paper.
- The Play tab is the golfer's command center.
- Engineer today's features so they naturally evolve into tomorrow's multi-tenant platform.
- Statistics should become insights, and insights should become coaching.
- The product should solve problems competitors do not solve, rather than chasing feature parity.

## 1. Play Experience

NOW:

- Play tab is the golfer's command center. (v30.3.51 shipped first polish pass)
- Quick Scoreboard modal from Play tab. (v30.3.51 shipped)
- Player Detail modal polish. (v30.3.51 shipped)
- Long player names truncate with ellipsis. (v30.3.51 shipped)
- Keep Team / Gross / Strokes / Net visible without horizontal scrolling. (v30.3.51 shipped)
- Remove tee name from hole header. (v30.3.51 shipped)
- Player row shows tee name and yardage. (v30.3.51 shipped)
- Combo tees show actual tee and yardage for current hole. (v30.3.51 shipped)
- One-line Nassau status. (v30.3.51 shipped)
- Dash instead of 0 when no stroke received. (v30.3.51 shipped)
- Hole selector arrow polish without changing box size. (v30.3.51 shipped)
- Stat tracking plus-button spacing. (v30.3.51 shipped)
- Preserve current Stat Tracking header. (v30.3.51 shipped)
- Capture round elapsed time for recap/reporting, but no live hole timer. (v30.3.51 shipped additive metadata)

Approved Nassau status format:

```text
Nassau: Front: Team 1 +1 * Back: Team 2 +1 * 18: AS
```

Rules:

- Show only when Nassau is active.
- Use actual team names where available.
- Always show the side that is ahead.
- Never use negative values.
- Keep it on one line.

## 2. Shared Match

NOW:

- Shared Match Persistence & Reconciliation.
- Device score parity.
- Host/joiner score ledger comparison.
- Final reconciliation before Match Summary.
- Offline/reconnect handling.
- Sync diagnostics.
- Stale local state detection.
- Conflict/authority rules.
- Acceptance test matrix from real two-device usage.

## 3. Course Library / Course Management

NEXT:

- Hybrid architecture:

```text
Canonical Course Catalog -> User Course Library -> Round Course Snapshot
```

- Current course sync is transitional.
- Multi-image course upload.
- AI Draft Course.
- Review/correction workflow.
- Save to My Courses.
- Eventual submit-to-catalog flow.
- Favorite courses.
- Default tees.
- Combo tees.
- Duplicate detection.
- Curated catalog governance.
- Immutable round course snapshots.

## 4. Player Library / Player Management

NEXT:

- Future Player Directory.
- User Player Library.
- Round Player Snapshot.
- Player preferences.
- Default tee.
- Handicap/index.
- Stat tracking preference.
- Smart Score Advance preference.
- Usual partners/groups.
- Future identity model.

## 5. Competition Engine

NEXT:

- Current-game regression protection.
- Golden expected-output snapshots.
- Sneaky / Sandy / Poley base ledger shipped in v30.3.54: manual SSP inputs, net Low Ball / Low Total, gross Birdie / Eagle, Validate Greeny/Prox, Play tab preview, Quick Scoreboard status, and focused regression tests.
- Sneaky / Sandy / Poley v30.3.55 shipped: Take/Keep state machine, honors indicator/carry-forward, Bridge/Re-Bridge multipliers, Umbee multiplier, SSP final points, SSP settlement, Match Summary reporting, outdoor-readable selected chips, centered chip rows, live draft preview, and expanded regression coverage.
- Sneaky / Sandy / Poley v30.3.56 shipped: Shared Match SSP settings/input/sequence sync, assigned-player authority, host-owned hole facts, three-way conflict detection, SSP trust status, and final shared-state pull before settlement/reporting.
- SSP v30.3.57 shipped: final-point Momentum Chart, deterministic Quick Scoreboard trend, clearer live/saved status, hole-card/reporting polish, and baseline print improvements.
- Play v30.3.58 shipped: Sandy-implies-Sneaky UI/ledger consistency, featured competition-aware Play status, separate SSP honors line, and small-iPhone header polish.
- SSP follow-ups: polished field-by-field conflict-resolution UI, randomized two-device SSP simulation expansion, optional manual overrides, deeper printed/PDF optimization, Junk Games Framework abstraction, and AI narrative trends in future recaps (not live Quick Scoreboard).

FUTURE:

- Wolf.
- Sixes / Round Robin.
- Best Ball.
- Press Engine.

## 6. Analytics & Coaching

NEXT:

- Short-term and long-term analytics.
- Statistics -> insights -> coaching progression.
- Analytics should help golfers improve, not merely show data.
- Player trends.
- Course trends.
- Competition trends.
- Partner/opponent trends.
- AI coaching insights.

FUTURE:

- Future GPS/shot-distance consideration, but not near-term priority.

## 7. Memories & Storytelling

NEXT:

- AI Round Recap.
- One-tap memory capture.
- Automatic story moments.
- Round elapsed time in recap/reporting.

FUTURE:

- AI Event Recap.
- Trip Recap.
- Memory System.
- Photos.
- Voice notes.

## 8. Platform / Architecture

NOW:

- Recurring Product Reviews every five releases.

NEXT:

- Future multi-tenant architecture.
- Canonical catalogs.
- Tenant/user/round/event boundaries.

FUTURE:

- Authentication later, not now.
- Cloud saved-match sync later, not now.
- Event ownership.
- Apple Watch companion app exploration.
- Voice entry exploration.
# Future SSP polish

- SSP Momentum Chart using cumulative final SSP point margin shipped in v30.3.57.
