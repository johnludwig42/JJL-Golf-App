# The Dye Ledger Product UX Strategy

Status: Approved planning direction  
Updated: July 30, 2026

## Product objective

The Dye Ledger should feel powerful without asking golfers to manage its complexity. The interface must organize capability around golfer intent:

1. What is happening?
2. What needs attention?
3. What should happen next?
4. Where can the golfer inspect detail?
5. Which uncommon controls can remain deferred?

The product should reveal the right amount of complexity at the moment it becomes useful.

## Interaction model

- Use concise overview pages for complex domains.
- Use focused drill-in destinations with clear titles and standard back behavior.
- Prefer hub-and-spoke navigation over long forms, nested disclosures, or rigid wizards.
- Allow independent tasks in any order.
- Autosave reversible draft work.
- Keep validation centralized and link each issue to the affected control.
- Use Preferences to provide strong defaults, clearly summarize inherited values, and support per-round changes.
- Reserve confirmation for destructive actions, historical publication, privacy consequences, and financial finality.
- Prefer undo for safe reversible actions.

## Release integration

### Match-derived product design system

The v30.3.80 Match experience is the reference pattern for every non-Play tab. The shared system consists of:

- a concise tab identity card;
- a quiet overview made of tappable destination cards;
- focused drill-in pages with a left-aligned title, concise purpose statement, and predictable return action;
- consistent typography, spacing, borders, disclosure controls, status language, empty states, and primary-action hierarchy;
- progressive disclosure for advanced, diagnostic, or infrequently used controls.

Consistency applies to navigation and interaction hierarchy, not to domain purpose. Match remains guided configuration; Scores remains review and interpretation; Library remains browsing and management; Insights remains analytical exploration; More remains settings and account management; and Play remains a focused scoring instrument.

### v30.3.79 — Summary and analytics clarity

- Optimize Shared Match Summary hierarchy and iPhone readability.
- Define distinct jobs for Scores, Quick Scoreboard, and Match Summary.
- Keep Quick Scoreboard focused on information needed without leaving the current hole.
- Expand deterministic round analytics and maintain textual equivalents for charts.

### v30.3.80 — Match Setup navigation and readiness

- Introduce the Match Setup overview.
- Add Course & Round, Players, Games & Stat Tracking, Scoring Control, and Advanced Options destinations.
- Organize Course & Round discovery into Recent, Favorites, Nearby, and Search.
- Show nearby courses only after a golfer-initiated Use Current Location or Show Nearby Courses action.
- Explain the purpose before the operating-system permission prompt and keep approximate location sufficient.
- Preserve normal setup when permission is denied, location is unavailable, or the device is offline.
- Show concise summaries, readiness state, warnings, and chevrons on the overview.
- Preserve independent player/tee selection and non-linear setup.
- Keep Start Round and its authoritative validation on the overview.
- Route validation issues directly to their destination and field.
- Preserve existing draft, template, Preferences, Shared Match, calculation, and persistence contracts.

### v30.3.81 — Competition Rules Contract and handicap audit

- Add a versioned Game Rules Catalog.
- State basis, scoring method, effective allowance, tie/carryover treatment, stake meaning, Press behavior, and finality for each game.
- Correct WHS calculation precision and support game-specific allowances without rewriting historical records.
- Establish explicit Skins carryover choices and final unresolved-value treatment.
- Clarify Nassau Gross/Net results and conventional Match Play result wording.

### Beta Account and cloud activation

- Present Account status, local/cloud boundaries, session state, and sign-out in human language.
- Never imply that sign-in uploads, claims, merges, rewrites, or deletes local history.
- Add cloud ownership controls only when the security architecture is activated.
- Apply the shared destination-card and drill-in pattern to More, beginning with Account & Security, Preferences, Press Preferences, Shared Match & Connectivity, Data & Diagnostics, and About.

### Play and Shared Match production polish

- Treat Play as an instrument panel for the current hole.
- Prioritize hole context, featured result, order/honors, required input, and next action.
- Move diagnostics and reconciliation details behind troubleshooting.
- Use human Shared Match states while retaining technical evidence for support.
- Complete accessibility, installed-iPhone, offline, and two-device acceptance.
- Deliver Play refinement as a stand-alone release after the non-Play design system is established. Evaluate compact active-play chrome, mobile-first player scoring rows, progressive SSP/game detail, explicit completion feedback, and a single authoritative save/advance action.

### Library and Courses

- Introduce overview destinations for Rounds, Golfers, Templates, Courses, and Memories when ownership/catalog work reaches those domains.
- Keep course selection, course review, course editing, and scorecard import as distinct tasks.
- Add governed course coordinates with provenance and correction support.
- Support catalog-backed nearby lookup and private on-device sorting of saved courses.
- Do not redesign Library or Courses twice before their cloud ownership model is ready.

### Scores synthesis

- Use a quiet Scores overview with focused destinations for Round Status, Scorecards, Games & Results, Statistics, and Notes & Memories.
- Preserve the established roles of Scores, Quick Scoreboard, and Match Summary.
- Do not change scoring, handicap, competition, settlement, or completed-round facts as part of the navigation work.

### Insights synthesis

- Organize the Insights overview around golfer questions: My Game, Scoring Trends, Hole Performance, Games & Competition, and Round Comparisons.
- Keep detailed charts and filters within focused destinations and provide textual equivalents.
- Derive insights from authoritative Round facts; do not duplicate or rewrite historical records.

## Location and nearby-course boundary

- Location access is contextual, optional, and initiated by the golfer.
- The app must not request location on launch or continuously track the golfer.
- Nearby discovery should prefer useful results: recent nearby courses, favorite nearby courses, then other nearby courses.
- Raw device coordinates must not be logged or attached to Account history.
- Local courses and scoring remain available when permission is denied or service is unavailable.
- Previously saved courses with trustworthy coordinates may be sorted on-device without a network call.
- Nearby-course discovery is separate from any future live hole GPS, shot-distance, or background-location capability.

## Cross-product quality bar

- iPhone-first layouts with minimum touch targets.
- Dynamic text and long-name tolerance.
- High contrast and no color-only meaning.
- Logical VoiceOver order and descriptive control names.
- Reduced-motion support.
- Text summaries for visual charts.
- Consistent Ready, In Progress, Needs Attention, Waiting, Complete, Offline, Synchronized, and Provisional language.
- One dominant primary action per page.
- Useful empty states that explain purpose and offer one next action.

## Architectural boundary

UX releases change presentation and navigation first. They do not silently change scoring, settlement, identity, ownership, RoundRecord, Shared Match authority, or persistence. Any domain-contract change requires its own Constitutional Review, migration/compatibility analysis where applicable, and deterministic tests.
