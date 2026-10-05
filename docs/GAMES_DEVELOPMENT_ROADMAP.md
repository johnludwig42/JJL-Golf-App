# Games Development Roadmap

Approved direction: October 3, 2026. Status: planned; release numbers and dates are unassigned.

This program extends the current development roadmap. It does not replace or reorder existing identity, security, course-library, Insights, Amendment Session, or Memory work. Deliver small focused releases through the established release process.

## Product goal and scope

Make The Dye Ledger the easiest, most trustworthy app for a regular golf group playing several money games. Prioritize reliable shared scoring, repeatable setup, understandable results, and useful game flexibility over matching every competitor format.

Payment tracking is excluded: no paid/unpaid states, payment confirmations, partial-payment records, payment requests, payment integrations, or expense splitting. Existing wager calculations, net positions, and settlement recommendations remain in scope. Trip settlement means a calculated recommended settlement, not tracking actual payments.

The baseline already includes multiple games, individual side matches, match templates, carryover skins, manual/threshold-prompted presses, SSP, 9-Point, Sixes, Wolf, and detailed reports. Audit and extend these paths rather than create replacements. Squabbit's website review is competitive input, not proof of either product's live performance.

## Phase 1 — Shared scoring evidence and repeatable setup

### 1. Four-device Shared Match acceptance — NOW

- Exercise four actual devices using the real cloud path, including assigned scorekeepers, every-hole convergence, simultaneous saves, corrections after upload, stale updates, and competing edits to the same player/hole.
- Cover offline/reconnect, background/resume, reload with pending saves, authorized assignment changes/host recovery, game facts, and finish attempts with outstanding writes.
- Preserve score authority and distinguish local save, pending delivery, confirmed parity, and conflicts requiring review. Do not change conflict rules without reproducible evidence.
- Use a disposable test round/environment and synthetic golfers; retain sanitized diagnostic evidence. The 100-round four-scorekeeper simulation modeled transport and ledger propagation and is not this acceptance gate.
- Acceptance: no lost scores, duplicate wagers, unauthorized overwrites, or false synchronized/final states; all authorized sessions converge after delivery resumes. Real iPhone/PWA behavior must be observed separately from browser automation.

### 2. Reusable group game configurations and shared rules summary — NEXT

- Audit existing Match Templates, saved rosters, and preferences; extend them to save a group's selected games, participants, stakes, allowances, press policy, partnerships, and house rules.
- Start another round from “Our Saturday Game,” select the course/date, and review only relevant changes. Keep current handicaps, tee selection, identity, and assignment validity explicit; never silently reuse stale round facts.
- Give all participants a concise shared rules summary: who plays whom, scoring basis, strokes, ties/carryovers, stakes, declarations, and press rules. Reuse the authoritative versioned rules contract.
- Snapshot the chosen configuration into each round; subsequent template changes must not rewrite prior rounds. Preserve existing template compatibility and offline operation.
- Acceptance target: start a saved group game in under one minute, measured with representative golfers; restored settings and shared summaries match the saved round contract.

## Phase 2 — Explainable wagers and configurable side games

### 3. Live wager explanations — NEXT

- Extend Quick Scoreboard and Games & Results with a concise per-player balance breakdown and drill-in to contributing games, holes, handicap strokes, skins, and nested presses.
- Explain projected versus final results and changes caused by score corrections. Keep points separate from dollars and preserve incomplete-round truth.
- Reuse authoritative calculation/report outputs; no independent presentation-layer scoring engine. Keep the current-hole scoring workspace compact.
- Acceptance: reach a balance explanation within two taps; every displayed component reconciles with game detail and the combined net position in live, saved, shared, and exported views.

### 4. Configurable Dots / Trash — NEXT

- Develop the deferred Junk Games Framework into an individual Dots/Trash game, with optional team scoring and configurable positive/negative point values.
- Initial events: birdie, eagle, sandie, chip-in, closest-to-pin greenie, and three-putt penalty. Support named custom events; make event definitions and eligibility explicit.
- Derive only defensible facts from scores/statistics. Missing statistics remain unknown, not false. Closest-to-pin is not GIR; a zero-putt hole does not by itself prove a chip-in. Request manual facts where needed and preserve attribution/override provenance.
- Define event stacking, gross/net basis, ties, team aggregation, point-to-dollar conversion, and participant scope before implementation. Capture common groups' presets without forcing advanced settings during scoring.
- Preserve SSP's versioned rules and facts; do not change SSP to approximate generic Dots.
- Acceptance: deterministic examples cover multiple earners, negative points, missing inputs, custom events, shared authority, corrections, and independently reconciled points/dollars.

## Phase 3 — House-rule flexibility

### 5. Skins options and press policy — NEXT

- Extend existing gross/net and carry/no-carry skins with optional birdie tie-breakers, gross-versus-net tie treatment, par-or-better qualification, and next-hole validation.
- Define precedence, natural versus handicap-assisted birdies, multiple qualifiers, carry accounting, incomplete holes, and final-hole validation before coding. Preserve old saved rules and current unresolved-final-carry treatment unless a new rule is explicitly selected.
- Show why each skin was won, tied, carried, pending validation, or expired.
- Evaluate opt-in automatic presses alongside existing manual and threshold prompts. Specify thresholds, re-press depth, caps, eligible segments, authority, and behavior after corrections; automatic creation must be idempotent across devices and reloads.
- Acceptance: golden outcomes for each supported rule combination; no silent changes to old rounds or implicit escalation of agreed stakes.

### 6. Wolf and partnership flexibility — NEXT, after four-player acceptance

- Extend Wolf to three and five players with explicit rotation, opposing-side composition, win/loss points, final-hole assignment, and settlement policies.
- Preserve existing four-player Wolf and Sixes contracts; extend through saved rule versions rather than changing defaults.
- Distinguish Sixes/rotating partners from Six Six Six/changing formats. Evaluate additional underlying team formats only after their score-entry model exists.
- Acceptance: explainable examples and conservation checks for each group size, ties, missing declarations, late corrections, and shared facts.

## Phase 4 — Trips and selected game expansion

### 7. Multiple independent game instances — enabling work

- Audit current selected-game identity and individual side-match support. Where needed, permit independently named instances of the same format with different players, stakes, allowances, and rules.
- Assign stable game-instance identifiers and link presses, results, facts, reports, and round records to the correct instance. Preserve legacy keys and fixtures.
- Acceptance: overlapping games cannot leak settings, double-count results, or mix press chains; aggregate balances reconcile.

### 8. Local-first Trip / Event experience — FUTURE, within Event Edition

- Build on stable golfer identities, saved rosters, immutable RoundRecords, and existing trip/event identifiers.
- Group rounds across courses/dates, rotate groups and partnerships, display cumulative results, and calculate one final recommended settlement without recording payments.
- Include a trip rules overview, round-level drill-in, and provenance. Label partial trips provisional; avoid counting superseded round revisions twice.
- Historical corrections must follow Amendment Session rules; shared trips require approved ownership/access boundaries. Do not equate identical names with golfer identity.
- Acceptance: mixed rosters, missing rounds, multiple courses, amended records, and repeated imports aggregate consistently and preserve round history.

### 9. Additional formats — FUTURE, separate focused releases

- Prioritize Stableford and Quota, then Vegas and standalone Low Ball–Low Total. Confirm scoring tables, handicap policy, stakes, participant limits, ties, and game-specific edge cases before implementation.
- Reuse authoritative score/stat facts; expose Low Ball–Low Total independently without modifying SSP. Define Vegas ordering, birdie effects, and escalation as explicit saved options.
- Later evaluate Scramble, Alternate Shot, Shamble, and changing-format Six Six Six. Introduce a proper team-score entry model first; never fabricate individual statistics or posting scores from a shared-ball score.
- Acceptance: golden examples, save/reload compatibility, shared scoring, clear live standings, provisional/final reporting, and independently reconciled settlements for every added format.

## Input and visual improvement program — NEXT

Development delivery v31.0.48 covers clearer game descriptions and participant guidance, lighter selection rows, expandable handicap settings with preserved values, and Player Mode custom-score contrast and labeling. Local browser and scoring checks are complete; production acceptance is pending. The remaining visual program and game expansions below stay on the roadmap.

Approved October 3, 2026 following the website/illustrated-guide comparison. These are design proposals requiring usability validation, not findings from hands-on use of Squabbit. Integrate them into related phases without a whole-app redesign.

Prioritize clearer game selection, simpler settings, and contextual game inputs first. Shared rules preview belongs with reusable group setup; active-game navigation, skins visibility, and balance drill-ins belong with wager explanations.

| Improvement | Scope and roadmap placement | Acceptance |
| --- | --- | --- |
| Clearer game selection | Phase 1: compact descriptions, supported player counts, and scoring style. Explain rotating partners versus changing formats; retain existing specialty-game header context. | Golfers can select a suitable game and explain its basic format without external help. Unsupported participant counts have clear guidance. |
| Simpler game settings | Phases 1 and 3: show participants, gross/net, and stakes first. Expand unusual house rules on demand; summarize selected non-default rules. | Disclosure preserves saved choices and validation; essential settings remain readable on a small iPhone. |
| Contextual game inputs | Phases 2 and 3: refine current-hole Wolf choices, Greenies, and future Dots controls beside score entry. Clearly identify missing required declarations; show only relevant inputs. | Hole/game switching preserves drafts and facts. Authority/read-only states are clear; optional events do not become mandatory score inputs. Extend existing controls rather than duplicate them. |
| Compact active-game selector | Phase 2: prototype game chips or an equivalent compact selector with concise current status. Reveal selected-game detail without crowding score entry. | Multiple games and long names fit or scroll accessibly. Inspecting a game never implicitly changes rules, scores, or the saved Featured Competition. |
| Hole-level skins visibility | Phase 2 over existing carryover logic, extended in Phase 3: show current skin value, carry count, winner, and pending/expired status. Example: “Hole 8: worth 3 skins.” | Authoritative values reconcile with skins totals after corrections and handle missing scores truthfully. |
| Shared rules preview | Phase 1: show agreed settings before starting, including an applicable points-to-dollars example; keep the summary available during play. | All participants see the saved contract, including authorized changes, with readable offline access. |
| Tappable balance explanations | Phase 2: a player balance opens game contributions, then contributing holes, handicap strokes, and presses. | Breakdown is reachable within two taps; components reconcile and distinguish projected/final results. |

Use the established Play controller and design system. Keep Player Mode the main surface for mode-specific innovation; preserve required game facts and correctness across Classic and Player Mode. Preserve save/undo, hole navigation, shared authority, and points/dollars distinctions. Do not request extra facts merely to populate a visual.

Acceptance includes small-iPhone review in both modes with long names, enlarged text, multiple games, offline/pending states, and missing declarations. Verify touch targets, contrast, focus/VoiceOver order, selected states, and no collision with score controls. Measure gross-score entry separately from optional statistics and game facts. Prototype the active-game selector before choosing its final visual treatment.

## Measurement and release gates

Use the same representative tasks when comparing products. These are proposed targets, not achieved results:

| Task | Target |
| --- | --- |
| Start a saved group game | Under one minute |
| Enter four golfers' hole scores | Median under 15 seconds, gross scoring only; report stat/game-fact overhead separately |
| Explain a player's balance | Within two taps |
| Recover connectivity | No lost scores, duplicate wagers, or false parity claims |
| Correct a completed round | Explicit amendment, reproducible recalculation, preserved original record |
| Finish a round or trip | Clear provisional/final game results and recommended settlement |

Each release must include applicable calculation fixtures, legacy save/template compatibility, offline persistence, Shared Match authority, and real small-iPhone usability evidence. Agree precise scope and release number at release planning; do not treat this roadmap as authorization to deploy, migrate production, or modify historical data.

Competitive references reviewed October 3, 2026: [formats](https://squabbitgolf.com/help/groups/gamesAndFormats/gamesAndFormatsGroup.html), [skins](https://squabbitgolf.com/help/groups/gamesAndFormats/articles/skins/skins.html), [Dots](https://squabbitgolf.com/help/groups/gamesAndFormats/articles/dots/dots.html), [Wolf](https://squabbitgolf.com/help/groups/gamesAndFormats/articles/wolf/wolf.html), [presses](https://squabbitgolf.com/help/groups/gamesAndFormats/articles/pressesArticle.html), and [multiple formats](https://squabbitgolf.com/help/groups/tournament/articles/creatingATournament/creatingATournament.html).
