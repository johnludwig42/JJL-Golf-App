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

- v30.3.60 completed: Courses Functionality Audit, Course Library clarity/metadata polish, location-aware dropdown de-dupe, duplicate-save prompts, tee validation, visible tee fallback, and new-round local Course Snapshots.
- Future: canonical Course Catalog, personal Library favorites/defaults/preferred tees with identity, legacy snapshot migration/hardening, authoritative duplicate matching, and dedicated 9-hole course authoring.
- Architecture boundary: v30.3.60 remains a local Course Library plus new-round snapshots. Central canonical identity, cloud user ownership, and legacy snapshot migration are explicitly deferred.

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
- Play v30.3.59 shipped: consistent saved/live featured status, latest-state SSP header, displayed-hole SSP audit wording, Nassau draft parity, and hole-specific honors labeling.
- v30.3.59 add-on shipped: SSP per-player allocation in Quick Scoreboard and combined Final Net Settlement, dedicated settlement wording, golfer-friendly SSP sequence labels, and responsive Featured Match/Honors layout.

## Future release: Starting Hole, Play Routing, and Gambling Segment Basis

- Keep **scorecard order** traditional: Holes 1–18, Front 1–9, Back 10–18. Classic Scorecard remains in this order.
- Add **play routing order** for the order actually played, including Hole 10 starts, shotgun starts, and custom/out-of-sequence routing; the Play tab can eventually follow this route.
- Add an explicit **gambling segment basis** choice: traditional scorecard front/back (recommended default) or first nine played/second nine played.
- Treat this as a dedicated compatibility release affecting Nassau, navigation, reporting, saved matches, and potentially future Presses—not as incidental SSP work.
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

- v30.3.75 establishes authenticated Account and identity/security foundations. Phone/social linking, historical claiming, privacy UI, and cloud history migration remain deferred.
- Cloud saved-match sync later, not now.
- Event ownership.
- Apple Watch companion app exploration.
- Voice entry exploration.
# Future SSP polish

- SSP Momentum Chart using cumulative final SSP point margin shipped in v30.3.57.
# Post-v30.3.61 timing and reporting follow-ups

- Consider explicit pause/resume only if real-world round timing proves materially distorted by weather or long delays.
- Consider richer pace analytics (front/back splits and per-hole delay flags) after `holeFirstCompletedAt` has sufficient production data.
- Continue the deferred separation of active working round state from viewed historical Match Summary state before broader report editing features.
# Post-v30.3.62 Match Summary roadmap

- Add a low-risk user-facing Compact Summary versus Full Detail export toggle using the v30.3.62 section metadata.
- Evaluate a dedicated PDF generation pipeline with automated browser-level pagination and collision assertions.
- Add report themes/branding and shareable web-report links.
- Expand historical saved-match fixtures and two-device Shared Match browser automation.
- Continue richer weather capture and pace-of-play analytics without making either required for report rendering.
- Trip Ledger Architecture Prep: define immutable RoundRecord persistence, schema migration, trip/event aggregation, and append-only settlement transactions.
- Add a local player registry and reusable saved-roster model with stable identity across rounds.
- Add a 1080Ã—1350 Hero-card image export after the report Hero has completed cross-browser PDF QA.
