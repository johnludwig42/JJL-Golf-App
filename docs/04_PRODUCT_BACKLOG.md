# The Dye Ledger Product Backlog

## v31.0.06 Play Input-Mode Foundation

- Completed: shared Play input-mode registry/controller boundary.
- Completed: current Play experience preserved as Classic Mode.
- Completed: device-only mode preference, safe fallback, and save-before-switch contract.
- Next: build Player Mode as a renderer over the same controller without duplicating scoring, statistics, synchronization, or reporting.

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
- Complex workflows should begin with a quiet overview and reveal detail only when it becomes useful.
- Product navigation should reflect golfer intent rather than database, component, or implementation structure.
- Routine selections should autosave and remain reversible; confirmation is reserved for destructive, historical, or financially consequential actions.

## 0. Product UX Program

NOW:

- v30.3.79: deployed Shared Match Summary hierarchy, clearer Scores/Quick Scoreboard roles, and expanded round analytics.
- v30.3.80: deployed the Match Setup overview with focused Course & Round, Players, Games & Stat Tracking, Scoring Control, and Advanced Options destinations.
- Design Course & Round around Recent, Favorites, Nearby, and Search. Request location only after the golfer chooses Show Nearby Courses; location remains optional and never blocks setup or scoring.
- Match Setup remains non-linear: sections can be visited in any order, use one persisted draft, and share one authoritative Start Round validation contract.

NEXT:

- v30.3.81: deployed — every configured game states its basis, scoring method, allowance, tie/carryover behavior, stake meaning, escalation behavior, and finality contract; Match Setup uses destination badges and routed validation without a duplicate readiness checklist.
- v30.3.82: completed — adopted the Match experience across Scores, Library, More, and the future Insights landing state using consistent tab identity and focused navigation.
- v30.3.83: completed — made Play current-hole-first, added saved-state-aware PWA updates, improved momentum legibility, and introduced additive round-level Approach Performance analytics.
- v30.3.84: completed — AI Recap Governance & Content Reliability established a repository-controlled content contract, binding deterministic facts, privacy rules, and representative acceptance fixtures.
- v30.3.85: completed — Round Completion & Story Reliability added stat-entry provenance, active-round Memory revisions, explicit AI Recap generation, and versioned Best N Nassau scoring.
- v30.3.86: in development — unify all Nassau result surfaces, correct Game Handicap rounding order, preserve completed-round history pending Amendment Sessions, keep Shared Match Memories append-only pending conflict-safe editing, redact diagnostics, and strengthen release validation.
- Apply the shared experience system to More with Beta Account Activation; then to Library and Courses after ownership/catalog boundaries are ready; then to Scores and Insights.
- Preserve distinct tab purposes rather than cloning Match: configuration, review, browsing, analysis, and settings remain different jobs.
- Deliver a later stand-alone Play Mode UX release centered on the current hole, featured competition, required inputs, completion feedback, and one authoritative save/advance action.
- Keep Quick Scoreboard intentionally concise rather than duplicating the complete Scores experience.
- Replace technical Shared Match language with human states such as Hosting, Joined, Waiting, Needs Review, and Synchronized; retain diagnostics behind troubleshooting.
- Attach restrained Account UX to Beta Account Activation, including explicit local-versus-cloud guidance.
- v30.3.92 Beta Account Activation is in development: email OTP remains the first provider; first-time users explicitly create their own permanent Golfer Identity; no historical local records are uploaded, claimed, matched, or merged; production activation remains a separate approval gate.
- Attach Library and Courses information-architecture work to their later ownership/catalog releases instead of redesigning them twice.
- In the Library and Courses release, add canonical latitude/longitude, provenance, correction controls, and catalog-backed nearby discovery. Permit on-device distance sorting for saved courses when trustworthy coordinates exist.

ACROSS RELEASES:

- Use a controlled status vocabulary.
- Improve empty states, contextual help, undo, Dynamic Type tolerance, VoiceOver order, contrast, touch targets, and text equivalents for charts.
- Preserve one dominant primary action per page.
- Avoid a whole-app visual rewrite; simplify one complete workflow per release.
- Never continuously track golfers for nearby-course discovery. Do not log coordinates or attach raw location history to an Account.

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

FUTURE FOCUSED RELEASE — Shared Match Synchronization Optimization:

- Preserve local-first scoring and the existing parity-gated completion contract; do not treat a successful request as confirmed score parity.
- Add per-entry synchronization diagnostics and acknowledgement metadata so a score can be traced from local save through cloud acceptance and host reconciliation.
- Serialize synchronization as local save, pending-score push, cloud acknowledgement, remote pull, and parity verification instead of initiating overlapping push and pull work.
- Introduce a persistent device-local outbox containing only changed score rows; retry safely after offline use, backgrounding, refresh, or interruption and remove entries only after acknowledgement.
- Replace full repeated score/player/team payload writes with minimal idempotent changed-row synchronization where compatibility permits.
- Add immediate remote score-change delivery with bounded polling as a fallback; stop or reduce polling while the app is backgrounded.
- Add participant ID, Device ID, local revision, source timestamp, and server acceptance timestamp to future additive score attribution contracts without using Device as Account, Golfer Identity, role, participation, or ownership.
- Add disposable-environment two-browser automation covering delayed Hole 3, every-hole convergence, par-3 Greenies, Stat Tracking, auto-advance, simultaneous saves, offline/reconnect, backgrounding, refresh during pending upload, and final parity.
- Require evidence from diagnostics or a reproducible test before changing score-conflict or authority behavior.

## 3. Course Library / Course Management

- v30.3.60 completed: Courses Functionality Audit, Course Library clarity/metadata polish, location-aware dropdown de-dupe, duplicate-save prompts, tee validation, visible tee fallback, and new-round local Course Snapshots.
- Immediate stabilization priority before Stat Capture/score-entry redesign and beta work:
  - Prevent approved catalog courses from being rewritten during local draft publication.
  - Batch tee and hole writes; the August 2026 live test took 148.8 seconds, including 137.7 seconds for hole synchronization.
  - Add bounded progress, timeout, retry, interruption recovery, and truthful completion states.
  - Show Local, Draft Uploaded, Approved, and Needs Attention states in Course Management.
  - Add a protected in-app maintainer review and approval action with attribution.
  - Refresh only the affected course after upload or approval instead of reloading the entire catalog.
  - Test create, upload draft, approve, anonymous download, edit, and safe republish across two devices.
  - Audit the 19 existing courses reported as updated during the live test; preserve all production rows and require review before any cleanup or correction.
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

## Near-term Play and Stat Capture redesign

- Establish interchangeable Play input modes over one authoritative Play controller and Round data contract. Input modes may render and collect facts differently, but they must not independently calculate handicaps, competition results, settlement, synchronization, derived statistics, or reports.
- Preserve the current Play experience as **Classic Mode**, optimized for entering and reviewing several golfers together. Introduce the redesigned current-hole-first experience as **Player Mode**, optimized around compact group scoring with one expanded golfer.
- Let the scorekeeper choose Classic or Player Mode as a device preference and switch safely during an active round without losing unsaved work or changing shared Round facts. Keep the Play input-mode preference separate from the None, Casual, Enhanced, and Grind Stat Capture selection.
- Treat Classic Mode as a compatibility surface after Player Mode launches: continue reliability, accessibility, and calculation-integrity fixes, while directing mode-specific innovation to Player Mode unless a feature is required across every input surface.
- Define and test a reusable input-mode contract before building Player Mode. Future Quick Score, solo, voice-assisted, watch/compact-device, scorekeeper, and post-round entry modes must use the same controller rather than duplicate scoring or synchronization rules.
- Replace six equally prominent persistent tabs with three lifecycle-based primary destinations; keep less-frequent destinations in More.
- Make Play a compact current-hole workspace with a hole selector, par and stroke index, Featured Competition status, Shared Match status, team identity, and bold stroke dots rather than “pops.”
- Keep every golfer in compact one-tap score rows and expand only the selected golfer's stat controls. Preserve visible Undo and a dominant Next Hole action; move Memories out of the permanent scoring block.
- Support four modes: None (gross only), Casual (gross, putts, and penalties with defensible derivation), Enhanced (Casual plus fairway direction, green dispersion, bunker/lie, and short-game outcomes), and Grind (more granular shot context). Restrict Grind to a scorekeeper responsible for no more than two golfers.
- Enter the minimum facts and derive everything defensibly. GIR is calculated from gross and putts; missing putts propagate unknown rather than miss; genuine edge-case overrides retain calculated-versus-corrected provenance.
- Version the round's stat-definition contract. Count putts by lie, treat conceded putts as strokes and putts, exclude fringe from GIR, and treat fringe putter strokes as around-the-green shots.
- Keep fairway direction, penalty strokes, bunker/lie involvement, and green miss direction explicit. Prefer the full three-by-three green dispersion grid; retain Short, Left, Green, Right, Long as the compact fallback.
- Use captured coverage to support fairways, GIR, dispersion, putting, penalties, scrambling, sand saves, Birdie-or-Better Conversion on GIR, fairway-conditioned GIR, and evidence-bounded Story insights. A par 5 reached in two and completed with two putts is both GIR and a successful birdie-or-better conversion.
- Prototype and approve the exact Casual, Enhanced, and Grind field sets before changing the live scoring engine.
- Required implementation order: (1) inventory and extract shared Play read/write/validation behavior, (2) define the input-mode contract and safe unsaved-draft handoff, (3) wrap the existing UI as Classic Mode without behavior changes, (4) build Player Mode against that contract, and (5) run calculation-parity, mode-switching, offline, Shared Match, accessibility, and full regression testing before making Player Mode the recommended default.

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
- Focused local-first Memory Photo Attachments release:
  - optional Camera or Photo Library selection from Add Memory on iPhone
  - on-device preview, replace, and remove controls
  - local resize/compression, correct orientation, and metadata/GPS stripping by default
  - versioned IndexedDB media records linked by stable Memory ID and Round ID; never store image data in localStorage
  - existing Memories, rounds, scoring, Shared Match, and offline capture remain compatible
  - no sign-in or cloud upload required; cloud sharing, moderation, collaborative galleries, and AI image analysis remain separately consented future work
  - preserve contributor attribution and keep access removal, withdrawal, anonymization, archival, and permanent deletion as distinct operations
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

# v30.3.87 AI Recap Service Reliability

- [x] Parse raw Responses API structured output reliably.
- [x] Preserve reviewable drafts after deterministic validation failures.
- [x] Add one controlled correction attempt and actionable sanitized failure states.
- [x] Keep scoring, Match Summary, accepted recaps, and local persistence independent of provider availability.
- [ ] Inventory and deploy to an explicitly approved non-production Supabase project.
- [ ] Complete synthetic end-to-end provider testing and abuse/failure acceptance.
- [ ] Deploy to production only after separate Product Owner approval.

# v30.3.88 Course Library Reliability

- [x] Normalize common United States country aliases for course matching and rendered-option deduplication.
- [x] Prevent identical reviewed scorecard imports from appending another local course record.
- [x] Preserve all existing local courses and historical round snapshots without automatic cleanup or migration.
- [x] Add deterministic coverage for alias matching, non-destructive rendering, and idempotent imports.
- [x] Guarantee verified match-start weather appears in the AI Recap, with a final Weather fallback after Memories.
- [x] Paginate cloud hole-catalog reads beyond 1,000 rows and reject partial cloud replacement of complete local tees.
- [ ] Recover Purgatory Golf Club from an older export, another browser profile, or the inactive staging project if separately authorized.
- [ ] Design an explicit, previewable historical duplicate-cleanup workflow; do not silently merge or delete records.
- v30.3.89: in development — harden two-device Shared Match reconciliation and completion parity; add Sync Now, readable sync status, responsive settlements, full Greenies net positions, accurate build timestamps, clearer round-story headings, additive preferred golfer names, and PDF section pagination.
# v30.3.90 — Shared Match Code Compatibility

- Restore normal Match-tab joining for existing 12-character Shared Match identifiers while keeping `DYE-######` as the sole format generated for new matches.
# v30.3.91 — Match Summary Clarity & Layout

- Delivered: dual Classic Scorecard audit views, analytics terminology correction, recap evidence rules, and PDF layout refinements.
- Manual acceptance: verify a generated four-player Nassau PDF on iPhone and desktop before promotion.

# v31.0.02 — Ledger Entry Report

- [x] Make Ledger Entry the default and recommended Export type.
- [x] Preserve Match Summary and Classic Scorecard.
- [x] Declare Gross, full Course Handicap, 100% off-low, and selected Featured Competition bases.
- [x] Separate points and dollars and reconcile each independently.
- [x] Render Presses as separate nested ledgers.
- [x] Include recap, memory, weather, and provenance without private identifiers.
- [x] Preserve incomplete-round truth with PROVISIONAL treatment.
- [x] Complete browser PDF fit and visual acceptance on real app fixtures (Chrome 151; eight-page reference PDF inspected).
