# ENGINEERING_DECISIONS.md

# The Dye Ledger – Engineering Decisions

This document records engineering and product-architecture decisions that are considered settled unless the product owner explicitly changes them.

Codex should read this file before making engineering changes.

## 2026-07-23 — Automatic finish requires data completeness

- Gross-score completion is necessary but not sufficient for the automatic finish offer.
- Enabled tracked-stat entries and unresolved SSP facts participate in readiness; disabled features do not.
- The automatic prompt is offered once and dismissal is persisted on the local Round.
- End Round Early remains manual and reports unresolved information.
- This changes presentation and readiness only; existing scoring, settlement, and finalization remain authoritative.

## 2026-07-23 — PWA branding assets are immutable per release

- Canonical source artwork remains in `branding/`.
- Every release creates immutable, version-named derivatives and updates the manifest, HTML, and service-worker references together.
- Previously released versioned assets are never overwritten.

The purpose of this document is to prevent accidental redesign, repeated debate, and inconsistent implementation.

---

## Constitutional Authority

[The Dye Ledger Constitution v1.0](docs/architecture/THE_DYE_LEDGER_CONSTITUTION_v1.0.md) is the highest-level architectural authority for the product and platform.

This document contains lower-level engineering decisions and implementation guidance. It must be interpreted consistently with the Constitution. Any apparent conflict must be escalated before implementation rather than silently resolved in favor of this document.

The approved v30.3.75 identity and Course Library access policies are recorded in [Identity & Security Decisions](docs/architecture/IDENTITY_AND_SECURITY_DECISIONS_v30.3.75.md).

---

## Current Production Version

Historical production reference in this section: v30.3.44. Current repository release: v30.3.75.

Status note: This version reference is historical and stale. It is not a current deployment record and does not alter constitutional authority.

All new work should preserve backward compatibility with existing saved matches, localStorage data, Supabase course data, and installed PWA behavior unless a prompt explicitly authorizes a breaking change.

---

## Core Architecture Decisions

### 1. iPhone-first

The Dye Ledger is an iPhone-first Progressive Web App.

Engineering decisions should prioritize:

* iPhone portrait usability
* thumb-friendly scoring
* outdoor readability
* reliable mobile Safari / installed PWA behavior
* minimal typing during a round

Desktop matters, but desktop should not drive core UX decisions.

Status: Locked.

---

### 2. Offline-first

The app must remain useful during a round without reliable connectivity.

Scores, match state, local courses, saved matches, and active round data must remain available locally.

Cloud features may enhance the product, but they must not become required for normal scoring.

Status: Locked.

---

### 3. Local-first

The golfer’s device is the primary working copy.

Saved matches remain local unless a specific cloud-sync feature is intentionally designed later.

Supabase is currently used primarily for Course Library and selected additive cloud features.

Status: Locked.

---

### 4. Backward compatibility

Existing localStorage data and saved matches must not be broken.

Any data-shape changes must include normalization or migration logic.

New fields should be additive where possible.

Status: Locked.

---

## Shared Match Decisions

### 5. Host owns match setup

The host owns core match metadata, including:

* players
* teams
* games
* course/tee setup
* shared match structure
* player-device assignments

Joined devices should not redesign or overwrite the host’s match setup.

Status: Locked.

---

### 6. Joined devices score assigned players

Joined devices may score only the players assigned to that device.

The product should make assignment status obvious.

A joined device should never be confused about:

* whether it is connected
* which players it may score
* whether its scores are saved locally
* whether its scores have synced to the host

Status: Locked.

---

### 7. Shared Match trust is higher priority than new games

Shared Match reliability, assignment clarity, reload behavior, reconnect behavior, and sync diagnostics must be hardened before adding major new competition formats.

Status: Locked.

---

### 8. Shared Match should remain additive

Shared Match should not compromise normal local scoring.

A non-shared match should remain simple, local, and reliable.

Shared Match logic must not make ordinary scoring more fragile.

Status: Locked.

---

### 8a. Shared Match sync requires score-ledger parity

A successful Shared Match network request is not the same as score parity.

For Shared Match reports and final-looking summaries, the app should pull latest shared scores, reconcile valid remote scored-hole entries into local state, preserve joined-device scores, compare local and remote scored-hole ledgers, and clearly warn when parity is not confirmed.

Status: Locked.

---

## Scoring Decisions

### 9. Scoring is the sacred workflow

Scoring must remain fast, calm, and predictable.

Do not add friction, surprise motion, unnecessary confirmations, or advanced controls directly into the primary scoring path.

Status: Locked.

---

### 10. Smart Score Advance timing

Smart Score Advance should use these default timing concepts:

* Fast: 500 ms
* Normal: 750 ms
* Relaxed: 1000 ms

A future Custom option should be supported architecturally, but custom timing UI does not need to be implemented until specifically requested.

Status: Locked.

---

### 11. No surprising same-hole player-to-player auto-focus

The current scoring experience should avoid surprising automatic movement from one player to another on the same hole unless specifically requested later.

Predictability is more important than automation in score entry.

Status: Locked.

---

### 12. Penalty strokes remain explicit

Penalty strokes should not silently alter gross score unless that behavior already exists and is explicitly preserved.

Penalty entry should remain understandable and user-controlled.

Status: Locked.

---

## Competition Engine Decisions

### 13. Current games must be protected before adding more

Existing supported games include:

* Match Play
* Nassau
* Gross Skins
* Net Skins
* 9-Point

Before adding Wolf, Sixes / Round Robin, Best Ball, or other games, the current competition engine should have stronger regression confidence.

Status: Locked.

---

### 14. Settlement clarity is mandatory

Money math must be explainable.

Final Net Settlement should remain the primary financial summary.

Game-specific details should support the settlement, not compete with it.

Status: Locked.

---

### 15. Net Skins and handicap-based payouts require explanation

Any game result affected by handicap strokes should clearly explain why the result occurred.

This is especially important for Net Skins and future handicap-sensitive games.

Status: Locked.

---

## Match Summary and Reporting Decisions

### 16. Match Summary is a core product surface

The Match Summary is not merely a report.

It is the primary saved artifact of the round.

It should combine:

* outcome
* settlement
* scorecard
* game detail
* statistics
* weather context
* AI recap
* story of the round

Status: Locked.

---

### 17. Classic Scorecard layout is protected

The Classic Scorecard is a signature feature.

Do not materially redesign its layout, symbols, sizing, dot conventions, par/handicap rows, or overall structure unless specifically requested.

Status: Locked.

---

### 18. Final Net Settlement remains primary

Final Net Settlement is the main answer to “who owes whom?”

Do not bury it, duplicate it confusingly, or replace it with less clear financial tables.

Status: Locked.

---

## Course Library Decisions

### 19. Course Library is cloud-assisted, not cloud-dependent

The Course Library supports local and cloud workflows.

The app should remain usable with local courses even when Supabase is unavailable.

Status: Locked.

---

### 20. Course sync is additive and restorative

Course sync should generally add or restore courses.

Cloud deletion is not currently part of the product model.

Do not introduce destructive cloud course behavior unless explicitly requested.

Status: Locked.

---

### 21. Combo tees are advanced course functionality

Combo tees are valuable but should not make normal match setup harder.

When scoring a combo tee, the app should show the actual source tee for the hole when available.

Status: Locked.

---

## AI and Storytelling Decisions

### 22. AI must not invent golf events

AI recap must not fabricate shots, outcomes, quotes, or drama.

If data is incomplete, the recap should acknowledge that naturally or avoid unsupported claims.

Status: Locked.

---

### 23. Story first, stats second

AI and reporting should use statistics to support the story.

The long-term product vision is not a stat dump. It is a round memory.

Status: Locked.

---

### 24. Weather is context, not the story

Weather should be included only when it adds natural context.

It should not dominate the recap unless weather meaningfully affected the round.

Status: Locked.

---

### 25. User approval matters

AI-generated recap content should remain reviewable/editable/approvable.

The user should not lose control of the round’s story.

Status: Locked.

---

## Player Preferences Decisions

### 26. Player Preferences are foundational but should be implemented deliberately

Player Preferences are an important future foundation.

Expected future preference areas include:

* default tee
* usual handicap/index
* stat tracking preference
* preferred Smart Score Advance speed
* future custom Smart Score Advance value
* usual game preferences
* recurring group/player defaults

Do not implement broad Player Preferences unless specifically prompted.

Status: Designed / Deferred.

---

## Future Multi-Tenant Readiness

The Dye Ledger remains local-first today, with no authentication requirement and no cloud saved-match sync requirement in the current product. New engineering should still preserve a clean path toward a future multi-tenant architecture.

Status note: The statement that the product has no authentication requirement describes legacy implementation. It is superseded by Constitution v1.0, Principle 3, and Decision A-000. v30.3.75 must establish formal, durable authentication while preserving offline-first behavior. Anonymous identities may remain only for explicitly approved transitional or guest workflows.

Principles:

1. Engineer today's features so they naturally evolve into tomorrow's cloud platform.
2. Do not assume one device equals one golfer.
3. Do not assume one local player list equals one user.
4. Do not assume one course library equals one user.
5. Do not assume one match owner equals the long-term tenant.
6. Do not assume one shared match participant equals a permanent identity.
7. Separate reference data from user-owned data.
8. Preserve immutable history.
9. Prefer future-compatible persistence shapes.

Reference data examples:

* canonical courses
* tee definitions
* course ratings
* public catalog entries

User-owned data examples:

* favorite courses
* preferred tees
* player preferences
* saved groups
* personal notes

Rounds must own snapshots of the course, player, tee, handicap, and competition data used when the round was played. The truth of the round must not drift when reference data changes later.

When adding persistent data, prefer structures that can later support:

* ownerId
* tenantId
* userId
* catalogId
* courseId
* playerId
* roundId
* eventId
* participantId
* snapshotId

Continue to preserve:

* offline-first scoring
* local-first round ownership
* backward compatibility
* additive migrations
* no authentication requirement in the current product

Status note: The preceding no-authentication item is superseded by Constitution v1.0 and Decision A-000. It must not be treated as the approved final identity architecture.

Status: Principle / Future Architecture. Do not implement multi-tenancy until explicitly planned.

---

## Release Discipline Decisions

### 27. Narrow releases are preferred

Each release should have a clear theme.

Avoid large unrelated refactors.

Avoid mixing feature work, UI redesign, data migrations, and bug fixes unless explicitly requested.

Status: Locked.

---

### 28. Preserve production stability

Do not introduce new features while fixing critical regressions unless the prompt explicitly combines them.

Regression fixes should be narrow and testable.

Status: Locked.

---

### 29. Build notes should be current-version only

Release ZIP files should include only the build notes for the current release version.

Do not include cumulative release notes or multi-version build note files inside release ZIPs unless explicitly requested.

Status: Locked.

---

### 30. Use intent-based navigation and progressive disclosure

As product capability grows, major golfer workflows must not expose implementation structure as one long form or one undifferentiated page.

For complex workflows:

* begin with a concise overview of state, readiness, and the next action
* use focused drill-in destinations rather than a rigid wizard
* allow destinations to be visited in any order unless the domain truly requires sequencing
* autosave reversible draft selections
* keep one authoritative validation contract
* route validation issues directly to the affected control
* show human-facing summaries and move diagnostics behind troubleshooting affordances
* use strong Preferences-derived defaults while making deviations visible and reversible

Navigation redesigns must preserve domain calculations, historical facts, persistence, Shared Match authority, and backward compatibility unless those changes are separately approved.

Status: Locked.

---

### 31. Nearby-course discovery is contextual and privacy-preserving

Course & Round may offer nearby-course suggestions, but location access must be initiated by an explicit golfer action in that context. The app must not request location on launch, continuously track location, log raw coordinates, attach location history to an Account, or require location for Match Setup or scoring.

Approximate location is sufficient. Denied permission, unavailable service, and offline operation must fall back to recent, favorite, saved, and searchable courses without degrading local scoring.

Canonical course coordinates require provenance and correction support. On-device sorting of saved courses is preferred when trustworthy coordinates already exist. Nearby-course discovery remains architecturally separate from future live hole GPS or shot tracking.

Status: Locked.

---

### 32. Nassau rules and handicap views are explicit Round facts

Nassau remains a two-team competition. Each team may contain one through six active golfers, and unequal teams are permitted. Both teams count the same Best N value, which cannot exceed the smaller active roster. A missing score from any active team member keeps the hole unresolved.

New Nassau configurations store a scoring-policy version, Gross or Net basis, Best N count, handicap allowance, and recommendation/custom provenance. Net recommendations follow the approved format matrix; custom and unequal formats use a clearly labeled Dye Ledger recommendation. New setup does not create combined Gross & Net Nassau games, while legacy combined games retain their original Best 1 interpretation.

Presses and Re-Presses inherit the complete parent scoring policy. Shared Match clients that do not understand a newer Nassau capability must fail closed rather than silently calculate a legacy result.

Course Net means full signed Course Handicap. Match Net means competition-relative strokes under the selected game's stored allowance. These are separate scorecard views and report sections; neither may be mislabeled as the other.

Status: Locked.

---

## Future Roadmap Ordering

The current strategic order is:

1. Shared Match Summary and analytics clarity
2. Match Setup navigation and readiness
3. Competition Rules Contract and handicap hardening
4. Match-derived shared design-system foundation
5. Beta Account activation and More navigation
6. Cloud security and ownership activation
7. Library and Courses navigation
8. Scores experience synthesis
9. Insights experience synthesis
10. Stand-alone Play Mode UX, Shared Match language, accessibility, and production confidence
11. Amendment Sessions
12. Foundational Games expansion

   * Wolf
   * Sixes / Round Robin
   * Best Ball
13. Event Edition
14. Memory System, historical analytics, AI season/event recaps, and other strategic features

Status: Current planning assumption.

---

## Default Engineering Rule

When in doubt, prefer:

* additive changes
* backward-compatible data structures
* local-first behavior
* explicit user trust language
* fewer taps
* less setup burden
* better iPhone scoring
* clearer settlement explanations
* no redesign of unrelated systems

If a proposed change violates one of these principles, stop and call it out before implementing.
