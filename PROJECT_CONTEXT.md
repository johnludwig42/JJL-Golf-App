# The Dye Ledger — PROJECT_CONTEXT.md

**Version:** 1.0  
**Status:** Living Document  
**Purpose:** Single starting context for Codex, ChatGPT, and future developers.

## 1. Project Identity

The Dye Ledger is an iPhone-first, offline-first Progressive Web App for golf scoring, wagering, statistics, AI-generated storytelling, and long-term golf memories.

Mission:

> The fastest way to score a round today — and the best place to remember your golf life years from now.

Primary pillars:

1. Effortless Scoring
2. Competition
3. Player Improvement
4. Memories & Storytelling

Guiding principles:

- Tell the story.
- Maximize Return on Effort.
- Remember for the golfer.
- Keep scoring fast, simple, and reliable.
- Preserve user data.
- Prefer additive changes.

## 2. Development Roles

**Product Owner**
- Sets product direction.
- Approves scope.
- Tests and accepts releases.

**ChatGPT**
- Product manager, architect, UX advisor, QA reviewer, release planner, documentation author.

**Codex**
- Software engineer.
- Inspects repo.
- Produces plans.
- Edits code after approval.
- Self-reviews.
- Runs checks.
- Reports risks, assumptions, and manual tests.

**GitHub Desktop**
- Local Git review, commits, branches, push/pull/fetch.

**GitHub.com**
- Pull Requests, merges, Actions, Pages deployment.

## 3. Branching Rules

Production branch:

```text
main
```

Release branches:

```text
release/vXX.X.XX
```

Rules:
- Never develop directly on `main`.
- Start each release branch from updated `main`.
- One release = one branch.
- One release = one Codex chat.
- One release = one Pull Request.
- Do not continue normal work on a release branch after it has merged.
- Once deployed, a version is frozen. Later code changes get a new version.

## 4. Standard Release Process

1. Discuss feature/bug with ChatGPT.
2. Assign scope and version.
3. Switch GitHub Desktop to `main`.
4. Fetch and pull latest `main`.
5. Create release branch.
6. Open new Codex chat.
7. Confirm repo path, branch, key files, docs.
8. Ask Codex for implementation plan before edits.
9. Review plan with ChatGPT.
10. Approve implementation.
11. Codex implements.
12. Codex checks and self-reviews.
13. Review summary with ChatGPT.
14. Review diffs in GitHub Desktop.
15. Commit.
16. Push branch.
17. Create PR.
18. Merge to `main`.
19. Wait for GitHub Actions.
20. Validate production.

## 5. Codex Workflow

Codex should always begin by reading this file and relevant docs.

Before edits, Codex must provide:
- files expected to change
- implementation approach
- risks
- assumptions
- data model impacts
- persistence impacts
- backward compatibility considerations
- testing plan

After implementation, Codex must provide:
- changed files
- implementation summary
- checks run
- self-review findings
- unresolved issues
- manual test checklist
- git status/diff summary

Codex must not, without explicit approval:
- merge PRs
- push to `main`
- delete branches
- change Supabase schema
- expose API keys
- add paid API dependencies
- break localStorage compatibility
- broadly refactor unrelated code
- redesign workflows
- suppress legitimate errors
- delete/mutate user data destructively

## 6. Product Guardrails

Always preserve:
- iPhone-first UX
- offline-first operation
- local-first architecture
- saved match compatibility
- template compatibility
- Supabase Course Library behavior
- responsive desktop support
- minimal scoring friction
- accurate settlements
- clear reports
- Recent App Errors empty during normal workflows

Prefer:
- small focused releases
- additive changes
- render-layer fixes before data mutation
- existing pathways over duplicate pathways
- graceful failure states

Avoid:
- unrelated refactoring
- overcomplicated UI
- hidden behavior changes
- scoring/settlement changes without testing

## 7. Current Status

Production baseline when this file was created:

```text
v30.3.42
```

Recent releases:
- v30.3.41 — Effortless Scoring Polish
- v30.3.42 — Duplicate Course Dropdown Fix and initial documentation work

Current release implementation (updated August 1, 2026):

```text
v30.3.80 — Guided Match Setup
```

## 8. Near-Term Roadmap

1. v30.3.78 — Scores, Summary Usability & Player Insights (deployed)
2. v30.3.79 — Shared Match Summary Optimization, Expanded Round Analytics, and clear Scores/Quick Scoreboard roles (deployed)
3. v30.3.80 — Match Setup Navigation & Readiness Redesign (in development)
   - Hub-and-spoke setup overview
   - Course & Round
     - Recent, favorite, nearby, and search-ready course discovery
     - Contextual, golfer-initiated location permission; never required for setup
   - Players
   - Games & Stat Tracking
   - Scoring Control
   - Advanced Options seeded from Preferences
4. v30.3.81 — Competition Rules Contract & Handicap Audit
   - Versioned Game Rules Catalog
   - WHS calculation precision and game-specific allowances
   - Explicit Skins carryover and wager contracts
   - Nassau Gross/Net presentation and Match Play finality wording
5. Match-Derived Product Design System
   - Treat the v30.3.80 Match experience as the reference for all non-Play tabs
   - Standardize tab identity cards, quiet overview pages, destination cards, focused drill-ins, left-aligned destination headers, return behavior, status language, spacing, disclosures, and primary-action hierarchy
   - Preserve each tab's distinct job; shared structure must not make Scores, Library, Insights, More, and Play behave identically
6. Beta Account Activation, Account UX & More Navigation
   - Apply the shared design system first to More
   - Organize Account & Security, Preferences, Press Preferences, Shared Match & Connectivity, Data & Diagnostics, and About as focused destinations
7. Cloud Security & Ownership Activation
8. Library & Courses Navigation
   - Canonical course coordinates, provenance, correction, and catalog-backed nearby lookup
   - On-device nearby sorting for saved courses when trustworthy coordinates are available
   - Apply the shared design system to Rounds, Golfers, Courses, Match Templates, and Memories after ownership/catalog boundaries are ready
9. Scores Experience Synthesis
   - Apply the shared design system to Round Status, Scorecards, Games & Results, Statistics, and Notes & Memories
   - Preserve authoritative scoring, settlement, completed-round history, and the established Quick Scoreboard/Match Summary boundaries
10. Insights Experience Synthesis
   - Organize insights around golfer questions: My Game, Scoring Trends, Hole Performance, Games & Competition, and Round Comparisons
   - Continue deriving analytics from authoritative Round facts rather than duplicating history
11. Stand-Alone Play Mode UX, Shared Match Language, Accessibility & Production Hardening
   - Keep Play distinct as the current-hole scoring instrument
   - Evaluate compact active-play chrome, mobile scoring rows, progressive game detail, explicit completion feedback, and one authoritative save/advance action
12. Amendment Sessions
13. Foundational Games Expansion
   - Wolf
   - Sixes / Round Robin
   - Best Ball
14. Event Edition Foundation

UX work follows a progressive-disclosure program rather than a whole-app rewrite. Each release simplifies one complete workflow while preserving local-first storage, scoring truth, Shared Match authority, and backward compatibility. See `docs/UX_PRODUCT_STRATEGY.md`.

## 9. Foundational Games

Audit and harden:
- Match Play
- Nassau
- Gross Skins
- Net Skins
- 9-Point

Add before Event Edition:
- Wolf
- Sixes / Round Robin
- Best Ball

Stableford can be developed later and should not delay the core wagering/group-game library.

Future:
- Press Engine
- Junk Games Framework

## 10. Documentation Strategy

Maintain practical documentation alongside code.

Important docs:
- `docs/01_Development_Playbook.md`
- `docs/02_Release_Workflow.md`
- `PROJECT_CONTEXT.md`
- future Codex workflow guide
- future roadmap document
- future architecture guide

Focus now on practical owner/operator documentation, not overbuilt public-company documentation.

## 11. Release Notes Rules

Each release includes:

```text
BUILD_NOTES_vXX.X.XX.md
```

Build notes should cover only the current release. Historical build notes may remain in Git, but release artifacts should include only current release notes.

## 12. Versioning Rules

Before production:
- release branch may receive multiple fixes
- version remains the same

After production:
- version is frozen
- later code changes require a new version

## 13. Weather Context Direction

Weather context should:
- capture only after match creation/start
- use normal browser geolocation permission behavior
- be non-blocking
- fail gracefully
- not populate Recent App Errors for expected failures
- round stored coordinates to reduce precision
- use a no-secret API such as Open-Meteo if appropriate
- store weather with the match/round, not templates
- feed AI Round Recap naturally, not as a forced paragraph

Expected handled failure states:
- permission denied
- offline
- geolocation unavailable
- timeout
- API unavailable
- malformed response

## 14. Long-Term Vision

The Dye Ledger becomes three products in one:

**During the Round**  
Fastest, easiest scoring app.

**After the Round**  
Best recap, competition, settlement, and reporting experience.

**Years Later**  
A golfer’s personal golf history, memory system, improvement journal, and storytelling engine.

Long-term possibilities:
- Event Edition
- AI Trip/Event Recaps
- Round UUID
- Memory System
- Photo integration
- Player Development
- Historical Analytics
- AI Coaching
- One-Thumb Scoring
- Native iOS/Android wrapper after PWA maturity

The app is not intended to become a social network. Sharing should use existing social platforms.

## 15. Starter Prompt for Codex

```text
You are working on The Dye Ledger.

Use the local repository at:

C:\Projects\JJL-Golf-App

Before making any changes, read PROJECT_CONTEXT.md and the docs folder.

Confirm:
1. active branch
2. current app version
3. key files found
4. relevant docs read

Do not edit files yet.

After confirming, wait for the release-specific planning prompt.
```

## 16. Starter Prompt for ChatGPT

```text
We are continuing development of The Dye Ledger.

Current workflow:
ChatGPT for product/architecture/review; Codex for implementation; GitHub Desktop for commits; GitHub.com for PR/merge/deploy.

Production baseline when PROJECT_CONTEXT.md was created: v30.3.42.

Near-term roadmap:
Weather Context, Scoring & Setup Polish, Preferences, Competition Engine Audit, Wolf, Sixes/Round Robin, Best Ball, Production Hardening, Event Edition.

Product philosophy:
iPhone-first, offline-first, local-first, effortless scoring, competition, player improvement, memories/storytelling, Maximize Return on Effort, Remember for the Golfer.

Help me plan and review the next release.
```

## 17. Closing Principle

The Dye Ledger should become easier to use as it becomes more powerful.

Every release should either:
- reduce effort during the round
- improve competition accuracy
- enrich the story
- preserve memories
- improve reliability
- prepare the architecture for future growth
