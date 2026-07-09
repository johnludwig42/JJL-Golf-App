# BUILD_NOTES_v30.3.49.md

Build v30.3.49 - Engineering Foundation & Release Hardening

## Release Theme
Engineering Foundation & Release Hardening: strengthen release workflow, add read-only release sanity checks, document future architecture principles, and formalize approved product direction.

## Objectives
- Harden release workflow documentation.
- Add a safe release sanity checker.
- Add future multi-tenant engineering principles.
- Create the formal Product Backlog.
- Update active version metadata to v30.3.49.

## Files Changed
- app.js
- index.html
- manifest.json
- package.json
- package-lock.json
- service-worker.js
- scripts/simulation-engine.js
- scripts/release-sanity-check.js
- docs/02_Release_Workflow.md
- docs/04_PRODUCT_BACKLOG.md
- ENGINEERING_DECISIONS.md
- TECHNICAL_DEBT.md
- BUILD_NOTES_v30.3.49.md

## Release Workflow Changes
- Strengthened the Pre-Codex Release Checklist.
- Added a Post-Codex Review Checklist.
- Added branch recovery guidance for wrong-branch starts.
- Added merge conflict guidance.
- Clarified that production acceptance requires live deployment, live version verification, smoke tests, and Product Owner approval.

## Sanity Script Behavior
- Added `scripts/release-sanity-check.js`.
- Added `npm run release:sanity`.
- The script is read-only and reports PASS / WARN / FAIL for:
  - current branch
  - working tree cleanliness
  - unmerged paths
  - conflict markers
  - required core files
  - target build notes
  - version metadata consistency
  - simulation/live-engine file presence
- Conflict-marker scanning covers tracked files and untracked files that are not ignored by Git.
- Expected usage:

```bash
node scripts/release-sanity-check.js v30.3.49
npm run release:sanity -- v30.3.49
```

## Simulation Harness Metadata
- Refactored Simulation Lab version and default seed metadata to derive from package.json.
- This removes the stale hardcoded v30.3.47 simulation label and keeps future simulation reports aligned with active release metadata.
- `reports/simulation/latest-summary.md` was regenerated during validation, confirmed as generated-report churn, and reverted so it is not included in the release commit.

## Multi-Tenant Readiness Documentation
- Added Future Multi-Tenant Readiness to ENGINEERING_DECISIONS.md.
- Reinforced that the app remains local-first today.
- Documented future-compatible assumptions around ownerId, tenantId, userId, catalogId, courseId, playerId, roundId, eventId, participantId, and snapshotId.
- Reinforced immutable round history and separation of reference data from user-owned data.

## Product Backlog Summary
- Created docs/04_PRODUCT_BACKLOG.md as the central source of approved product direction.
- Organized backlog categories:
  - Play Experience
  - Shared Match
  - Course Library / Course Management
  - Player Library / Player Management
  - Competition Engine
  - Analytics & Coaching
  - Memories & Storytelling
  - Platform / Architecture
- Added NOW / NEXT / FUTURE priority labels.

## Technical Debt Updates
- Added entries for Shared Match persistence and reconciliation.
- Added course architecture transition: Canonical Course Catalog -> User Course Library -> Round Course Snapshot.
- Added player architecture transition: Player Directory -> User Player Library -> Round Player Snapshot.
- Added future multi-tenant readiness debt.
- Added release workflow and branch-risk reduction notes.
- Added Apple Watch, voice entry, analytics/coaching, and five-release Product Review cadence notes.

## Passed Validation Commands
- `node --check app.js` - passed.
- `node --check service-worker.js` - passed.
- `node --check scripts/release-sanity-check.js` - passed.
- `node --check scripts/simulation-engine.js` - passed.
- `node scripts/release-sanity-check.js v30.3.49` - passed with 7 PASS, 1 WARN, 0 FAIL. The WARN is expected because the release working tree has uncommitted changes during Codex work.
- `npm run release:sanity -- v30.3.49` - passed with 7 PASS, 1 WARN, 0 FAIL. The WARN is expected because the release working tree has uncommitted changes during Codex work.
- `git diff --check` - initially failed because docs/02_Release_Workflow.md included literal conflict marker examples; fixed by rewording the guidance. Final run passed with line-ending normalization warnings only.
- `npm run simulate` - passed. 60 rounds, 0 failures, 41 warnings, 1 suspicious outcome, 0 live-vs-mirror differences.
- `npm run simulate:100` - initially blocked by sandbox report-write permissions, then passed after escalation. 110 rounds, 0 failures, 78 warnings, 1 suspicious outcome, 0 live-vs-mirror differences.
- `npm run simulate:live` - initially blocked by sandbox report-write permissions, then passed after escalation. 60 rounds, 0 failures, 41 warnings, 1 suspicious outcome, 0 live-vs-mirror differences.
- `npm run simulate:compare` - initially blocked by sandbox report-write permissions, then passed after escalation. 60 rounds, 0 failures, 41 warnings, 1 suspicious outcome, 0 live-vs-mirror differences.
- `npm run test:simulations` - passed. 3 tests passed.
- `npm run test:live-engine` - passed. 4 tests passed.
- `npm test` - passed. 7 tests passed.
- `npm run test:run` - passed. 7 tests passed through the npm test alias.

## Not-Run / Unavailable Validation Commands
- `npm run lint` - unavailable because `eslint` is not installed or available on PATH in this working copy.
- `npm run validate` - unavailable because `scripts/validate-release.js` does not exist in this working copy.
- `npm run test:money` - unavailable because `tests/money-math.test.js` does not exist in this working copy.
- Active version search for stale v30.3.48 / 30.3.48 references in active metadata files passed after updates.

## Known Limitations
- The release sanity script reports repository state but cannot prove product behavior.
- The script depends on local Git and readable text files.
- Conflict-marker detection intentionally targets real start/end marker lines and avoids failing on documentation examples.

## Recommended Next Release
Recommended next release: v30.3.50 – Shared Match Persistence & Reconciliation.

Shared Match trust remains the highest product risk because two devices must produce the same match state and Match Summary for the same round. Play Experience polish should follow after Shared Match reconciliation is hardened.
