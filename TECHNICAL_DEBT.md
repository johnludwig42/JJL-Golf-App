# TECHNICAL_DEBT.md

# The Dye Ledger – Technical Debt and Deferred Work

This document records known technical debt, intentional compromises, deferred enhancements, and future architecture work.

Codex should read this file before making engineering changes.

The purpose of this document is to help Codex distinguish between:

* something broken
* something intentionally deferred
* something planned for later
* something that should not be redesigned yet

---

## Current Production Version

Current production version: v30.3.55

---

## Highest Priority Technical Debt

## 1. Shared Match reliability and trust

### Current state

Shared Match exists and is conceptually correct:

* host creates match
* joiner enters code
* host assigns players
* joined devices score assigned players
* scores sync back to the shared match

### Known concern

The workflow needs hardening around:

* assignment persistence
* participant identity
* host versus joined-device authority
* reload behavior
* reconnect behavior
* offline scoring
* stale views
* pending score visibility
* sync status clarity
* simultaneous scoring edge cases

### Why it matters

Golfers will not trust an app that creates uncertainty around scores, assignments, or money.

### Near-term direction

Prioritize a Shared Match Trust Release before major new features.

Expected improvements may include:

* joined-device status strip
* host Shared Match Control Center
* clearer assignment state
* local save confirmation
* pending sync indication
* last pulled / last pushed indicators
* reload and reconnect test matrix

### v30.3.50 progress

The app now has scored-hole ledger extraction, parity comparison, missing-entry detection, player-hole conflict detection, joined-device score preservation, Match Summary reconciliation warnings, and unit-level shared-match ledger tests.

Remaining debt includes full two-device browser automation, richer conflict resolution UI, offline replay/retry acceptance testing, and production-device validation for reload/reconnect flows.

Status: Must address before broad use.

---

## 1a. Sneaky / Sandy / Poley scoring completion

### Current state

v30.3.53 adds SSP setup, team validation, durable local settings, and Play tab manual inputs.

v30.3.54 adds the base SSP point ledger for manual Sneaky, Sandy, Poley, Greeny, Prox, automatic Birdie, Eagle, Low Ball, Low Total, Play tab base-point previews, Quick Scoreboard status, and Player Detail contribution summaries.

v30.3.55 adds Take/Keep, honors, Bridge/Re-Bridge, Umbee, final SSP points, SSP-only settlement, Match Summary reporting, outdoor-readable selected chips, centered chip rows, and live draft preview.

### Known concern

Full Shared Match SSP input reconciliation is intentionally deferred. Scores sync through the existing shared score path, but SSP manual inputs still need conflict-aware shared-state handling before multi-device SSP settlement should be considered authoritative.

Additional deferred SSP polish includes optional manual overrides for Low Ball, Low Total, and Honors, plus printed/PDF layout optimization for large SSP ledgers.

### Near-term direction

Use `docs/05_SNEAKY_SANDY_POLEY.md` as the source for v30.3.56 Shared Match SSP Sync and Reconciliation: sync scores plus SSP manual inputs, detect conflicts, derive the same ledger on every device, and pull latest shared SSP state before settlement/reporting.

Status: Planned follow-up for v30.3.56.

---

## 2. Automated validation and test harness

### Current state

Validation and test scripts have been referenced, but the automated test harness is not yet strong enough for the product’s complexity.

### Known concern

The app contains significant scoring and settlement logic, including:

* Match Play
* Nassau
* Gross Skins
* Net Skins
* 9-Point
* Final Net Settlement
* Shared Match score merging

These systems require executable regression confidence.

### Near-term direction

Create or restore working scripts for:

* syntax checks
* release validation
* scoring regression tests
* settlement golden cases
* shared match state tests

### Suggested test categories

* Match Play known results
* Nassau front/back/overall known results
* Gross Skins carryovers
* Net Skins handicap stroke examples
* 9-Point known outcomes
* Final Net Settlement across multiple games
* save/reload preservation
* shared match host/joiner score merge
* assigned player permission rules

Status: Must address before major Competition Engine expansion.

---

## 3. iPhone PWA acceptance testing

### Current state

The app has received extensive iPhone-focused polish.

### Known concern

Some behavior can only be trusted after real-device testing:

* installed PWA launch
* service worker update behavior
* keyboard behavior
* focus handling
* scrolling
* sticky controls
* safe-area layout
* double taps
* outdoor readability
* resume after lock screen
* reload mid-round

### Near-term direction

Create a repeatable iPhone acceptance checklist and run it before major production releases.

Status: Required for product confidence.

---

## 4. Save/resume/reload/offline confidence

### Current state

The app is designed to be local-first and offline-first.

### Known concern

Trust depends on brutal acceptance testing around:

* reload mid-hole
* closing the browser
* reopening installed PWA
* resuming next day
* completing a match
* reopening completed matches
* editing completed matches
* restoring older saved matches
* offline scoring
* reconnecting after offline use

### Near-term direction

Add explicit user-facing trust language where appropriate:

* “Saved on this device”
* “Offline — scores are saved locally”
* “Waiting to sync”
* “Synced”
* “Cloud unavailable — local scoring still works”

Status: Must address as part of production hardening.

---

## Product UX Debt

## 5. Match Setup complexity

### Current state

Match Setup is powerful but dense.

### Known concern

A golfer near the first tee may face too many decisions:

* course
* tee
* players
* teams
* games
* stat tracking
* Smart Score Advance
* Shared Match
* templates
* weather
* readiness indicators

### Near-term direction

Replace the single long setup form with a hub-and-spoke navigation model in v30.3.80.

The clean landing page will summarize five independently accessible destinations:

1. Course & Round
2. Players
3. Games & Stat Tracking
4. Scoring Control
5. Advanced Options seeded from Preferences

This is not a rigid wizard. Golfers may visit sections in any order, selections autosave into one draft, and the landing page owns readiness and Start Round. Destination status badges provide the normal readiness signal. A failed Start Round action routes to the first affected destination and retains specific validation guidance instead of showing a persistent duplicate checklist. Existing calculation, persistence, Shared Match, template, and validation contracts remain authoritative during the navigation redesign.

Status: Implemented in v30.3.80 and simplified in v30.3.81; retain as a usability and manual-acceptance watch item.

Status: Should address before Version 1.0.

---

## 6. Player Preferences Foundation

### Current state

Player data exists, but persistent player-level preferences are not yet fully established.

### Known concern

The app repeatedly asks for information that could eventually be remembered.

### Future preference areas

* default tee
* handicap index
* course handicap handling
* stat tracking preference
* Smart Score Advance preference
* future custom Smart Score Advance timing
* usual partners
* usual games
* usual team assignments
* preferred report/stat visibility

### Near-term direction

Design carefully before implementing.

Do not bolt this on casually.

Player Preferences should become a simplifying layer, not another configuration burden.

Status: Designed / Deferred.

---

## 7. Lightweight stats mode

### Current state

Stat tracking can capture valuable information.

### Known concern

Full stat tracking may be too much effort for casual golfers.

### Future direction

Consider stat modes:

* Off
* Basic: putts and penalties
* Standard: putts, penalties, fairway, GIR
* Advanced: up-and-downs, sandies, additional future stats

### Product principle

Stats should earn their place by improving the story, the golfer’s understanding, or the recap.

Status: Deferred.

---

## 8. First-time handicap guidance

### Current state

Handicap support exists.

### Known concern

New or casual golfers may not understand index, course handicap, or net scoring.

### Future direction

Add plain-language guidance such as:

“Leave blank or 0 if you do not use handicaps.”

“Net games use handicap strokes to make the match fair.”

Status: Should address during setup simplification.

---

## Reporting and Storytelling Debt

## 9. Match Summary hierarchy

### Current state

Match Summary is strong and central to the product.

### Known concern

The report can still feel more like a complete ledger than a story-first memory.

### Future direction

Improve hierarchy around:

* who won
* how they won
* who owes whom
* turning point
* memorable moment
* scorecard
* details

Status: Should address before Version 1.0 polish.

---

## 10. Settlement explanation

### Current state

Final Net Settlement is the primary financial answer.

### Known concern

Settlement must be impossible to misunderstand.

### Future direction

Add clearer wording where needed:

* provisional versus final
* game-level detail versus final net amount
* net skins handicap explanation
* 9-Point explanation
* Nassau front/back/overall explanation
* deterministic settlement-row normalization for equivalent payment paths in simulation/live-vs-mirror comparison

The simulation engine can currently produce equivalent settlement rows with identical final player totals but different payment paths. Validation should normalize economically equivalent settlements consistently before comparing live-vs-mirror settlement rows.

Status: Should address during reporting polish.

---

## 11. AI recap quality examples

### Current state

AI recap direction is strong.

### Known concern

Output quality depends on prompts, available data, notes, memories, and edge-case handling.

### Future direction

Create canned acceptance examples:

* normal 18-hole match
* incomplete round
* no notes
* weather-heavy round
* dramatic match
* one-sided match
* shared match
* stats-heavy round

Evaluate for:

* factual accuracy
* tone
* story quality
* no invented events
* natural weather use
* settlement accuracy

Status: Deferred but important.

---

## 12. Automatic storytelling engine

### Current state

AI recap can use available match data and notes.

### Known concern

The app should infer more memorable moments automatically.

### Future detected moments

* first birdie
* best hole
* worst hole
* match-clinching hole
* comeback
* lead change
* skin carryover
* low net hole
* net eagle
* 9-Point swing
* partner/team highlight
* unusual weather impact

Status: Future Vision.

---

## Course Library Debt

## 13. Course duplicate handling and curation

### Current state

Course Library supports local/cloud sync.

### Known concern

Duplicate prevention, curation, and governance need polish before broad public use.

### Future direction

Improve:

* duplicate detection
* sync error messaging
* source-of-truth language
* publish/download clarity
* moderation/curation strategy

Status: Should address before broad use.

---

## 14. Supabase Course Library write model

### Current state

Course Library cloud writes are permissive for beta convenience.

### Known concern

This may not be appropriate for a broader public course library.

### Future direction

Before broader release, evaluate:

* RLS tightening
* moderation
* ownership
* admin-only curation
* duplicate approval
* abuse prevention

Status: Deferred until broader distribution.

---

## Competition Engine Deferred Work

## 15. Wolf

### Current state

Not yet implemented.

### Dependency

Do not implement until current game regression confidence improves.

Status: Future after Competition Engine hardening.

---

## 16. Sixes / Round Robin

### Current state

Not yet implemented.

### Dependency

Requires careful team rotation, settlement rules, reporting, and potentially event-style pairing logic.

Status: Future after Competition Engine hardening.

---

## 17. Best Ball

### Current state

Not yet implemented.

### Dependency

Requires clean team scoring rules, net/gross clarity, and reporting clarity.

Status: Future after Competition Engine hardening.

---

## 18. Press Engine

### Current state

Strategic future enhancement.

### Product direction

Press support should likely extend the Nassau engine rather than become an unrelated game.

### Future capabilities

* front press
* back press
* overall press
* automatic press
* manual press
* multiple presses
* settlement integration

Status: Future Vision.

---

## Event Edition Deferred Work

## 19. Event Edition

### Current state

Strategic roadmap item after core competition completion.

### Future capabilities

* multi-round event management
* event dashboard
* event leaderboard
* event settlement
* event AI recap
* trip/event summary
* league-like support

### Deferred items

The following should not be implemented prematurely:

* photo books
* memory timeline
* social sharing
* advanced league commissioner tools

Status: Future Vision.

---

## Memory System Deferred Work

## 20. Round Memory System

### Current state

The product has early memory concepts through notes, AI recap, reports, and saved matches.

### Future direction

Every round should eventually own its memories.

Potential future memory types:

* notes
* photos
* weather
* AI recap
* important shots
* player highlights
* trip/event context
* historical milestones

Status: Future Vision.

---

## 21. Historical Analytics and AI Insights

### Current state

Not yet implemented.

### Future direction

Potential future insights:

* player trends
* scoring trends
* partner/team history
* course history
* head-to-head history
* season recaps
* trip recaps
* AI coaching observations

Status: Future Vision.

---

## 22. Shared Match persistence and reconciliation

Shared Match needs a stronger reconciliation layer before broad trust.

Future work should compare host and joined-device score ledgers, detect stale local state, handle offline/reconnect windows, clarify authority rules, and require final reconciliation before Match Summary.

Status: High priority trust work.

---

## 23. Course architecture transition

Current course sync is transitional architecture.

The intended long-term model is:

```text
Canonical Course Catalog -> User Course Library -> Round Course Snapshot
```

Future work should support canonical catalog entries, user favorites/default tees/combo tees, multi-image course upload, AI Draft Course review, duplicate detection, curated catalog governance, and immutable round course snapshots.

Status: Strategic architecture debt.

---

## 24. Player architecture transition

The intended long-term model is:

```text
Player Directory -> User Player Library -> Round Player Snapshot
```

Future work should support player preferences, default tee, handicap/index, stat tracking preference, Smart Score Advance preference, usual partners/groups, and a future identity model without breaking local-first scoring.

Status: Strategic architecture debt.

---

## 25. Future multi-tenant readiness

The app remains local-first and unauthenticated today, but new persistence shapes should avoid assumptions that block a later tenant/user/round/event model.

Future-compatible data should be able to evolve toward ownerId, tenantId, userId, catalogId, courseId, playerId, roundId, eventId, participantId, and snapshotId.

Status: Principle / Deferred implementation.

---

## 26. Release workflow and branch-risk reduction

Release safety depends on starting from the correct branch, verifying clean state, preserving prior build notes, and reviewing Codex output before commit.

The release sanity script is a helper, not a substitute for Product Owner review. Known limitations include local environment differences, Git availability, and the fact that it reports repository state but cannot prove product behavior.

The generated report at reports/simulation/latest-summary.md is currently a mutable validation artifact. Release cleanup should revert it when changes are only generated-report churn; future work should decide whether to stop tracking the latest report or refresh it only through an intentional report-update step.

Completed-round Scores viewing still temporarily uses `activeMatchId` in v30.3.60 so existing export, recap, settlement, and summary handlers retain one match target. A future state-model pass should separate the active working round from a viewed historical-summary ID; the current explicit Done/Match exit flow intentionally avoids that broader release-risk refactor.

Status: Ongoing process hardening.

---

## 27. Apple Watch companion exploration

An Apple Watch companion app may eventually support glanceable scoring, simple score entry, or on-course prompts.

This is exploration only and should not distract from iPhone PWA trust, scoring speed, and Shared Match reliability.

Status: Future exploration.

---

## 28. Voice entry exploration

Voice entry may eventually reduce scoring friction, especially during play.

Future work should evaluate accuracy, privacy, offline behavior, noisy outdoor conditions, and correction workflows before implementation.

Status: Future exploration.

---

## 29. Analytics and coaching roadmap

Statistics should become insights, and insights should become coaching.

Future analytics should help golfers improve, not merely display data. Candidate areas include player trends, course trends, competition trends, partner/opponent trends, and AI coaching insights. GPS and shot-distance ideas remain possible but are not near-term priorities.

Status: Future product maturity.

---

## 30. Recurring Product Review cadence

Every five releases, schedule a Product Review to revisit backlog priority, technical debt, acceptance findings, and whether the product is still solving problems competitors do not solve.

Status: Process recommendation.

---

## 31. Play tab visual acceptance automation

v30.3.51 improves the Play tab command-center surface with compact score rows, Quick Scoreboard, per-player tee/yardage display, and modal polish. Remaining debt is real-device and automated visual acceptance around narrow iPhone widths, especially long names, mixed/combo tees, stat steppers, and modal scrolling.

Future work should add a repeatable Play-tab visual QA path with representative fixtures for:

* long player names
* mixed tees and combo tees
* Nassau active/inactive states
* stat tracking on/off
* Shared Match assigned-player read-only rows

Status: Deferred acceptance hardening.

---

## Known “Do Not Accidentally Redesign” Areas

Avoid redesigning these unless specifically prompted:

* Classic Scorecard
* Final Net Settlement
* local-first saved matches
* Course Library additive sync model
* offline-first scoring
* iPhone-first scoring controls
* Shared Match host ownership model
* joined-device assigned-player model
* current AI recap factuality rules
* current release ZIP build-notes convention

---

## Technical Debt Prioritization

Highest priority:

1. Shared Match trust
2. automated validation and regression tests
3. iPhone PWA acceptance
4. save/resume/reload/offline confidence
5. settlement clarity
6. Quick Match / setup simplification

Medium priority:

1. Player Preferences Foundation
2. reporting hierarchy
3. lightweight stats mode
4. Course Library duplicate handling
5. AI recap acceptance examples
6. diagnostics language

Future priority:

1. Wolf
2. Sixes / Round Robin
3. Best Ball
4. Event Edition
5. Press Engine
6. Memory System
7. historical analytics
8. AI season/event recaps

---

## Default Rule for Codex

If a future prompt asks for a specific release, implement only that release unless explicitly instructed otherwise.

Do not pull future-vision items into near-term work.

Do not redesign settled architecture to solve a narrow bug.

Do not add new features while fixing trust, scoring, settlement, or sync issues unless the prompt explicitly asks for them.

When uncertain, preserve the current local-first, offline-first, iPhone-first architecture.
## Course Library and snapshots

- Legacy matches created before v30.3.60 may not contain `courseSnapshot` and therefore continue resolving current Library data. A future migration/hardening pass should snapshot safely when historical source data can be established without guessing.
- Duplicate course matching is heuristic. A canonical catalog needs stable facility/course identity rather than normalized name/location alone.
- Saved tee authoring remains 18-hole-first; 9-hole rounds select a segment from that data. Dedicated 9-hole course authoring/import compatibility remains future work.
- AI scorecard extraction still requires manual review for ambiguous layouts, combo tees, and incomplete par/SI/yardage panels.
- Multi-file import depends on the deployed scorecard-import service supporting the documented `files` array. The client combines files into one request/review workflow but does not independently merge multiple backend course objects.
## v30.3.61 timing and report follow-ups

Automatic timing intentionally has no pause model. `holeFirstCompletedAt` is backward-compatible optional metadata and should remain merge-safe for older Shared Match clients. A future version may derive active-play intervals, but must not rewrite original first-completion timestamps. Browser/PDF pagination remains dependent on WebKit/Chromium print engines and needs representative iPhone manual QA.
## Deferred — Match Summary v2 / Analyst Report Layout

A dedicated future release should separate executive and full-detail report modes, add compact/full PDF options, establish a refined report design system and narrative hierarchy, evaluate a dedicated PDF generation pipeline, strengthen weather capture reliability, and expand pace-of-play analytics. v30.3.61 intentionally limits work to release-blocking polish and pagination fixes.
## v30.3.62 Match Summary v2 follow-ups

The report now exposes main/appendix, summary/detail, and print-priority metadata, but only Full Detail is user-facing. Future work should add compact/full composition without duplicating builders, introduce browser-rendered pagination assertions or a dedicated PDF pipeline, and add real historical saved-match fixtures. Device-specific print headers, footers, font metrics, and page breaking remain outside deterministic helper tests.

## v30.3.63 Trip Ledger architecture prep

- Persist/freeze `RoundRecord` only after defining explicit schema migrations, immutable settlement snapshots, and legacy recovery rules.
- Add a local player registry and saved-roster model so trip aggregation does not depend on display names or round-scoped fallback IDs.
- Promote structured settlement transactions into an append-only ledger with stable game, round, event/trip, and source/audit references.
- Add trip/event aggregation above immutable round transactions; never parse report HTML or narrative text.
- Add historical RoundRecord migration fixtures before migrating existing saved matches.
- Add 1080Ã—1350 shareable Hero image export, compact/full composition modes, and browser-level PDF pagination assertions.
