# The Dye Ledger v30.3.72 — Shared Match Experience & Regression Completion

Release theme: **Confidence Across Devices**

## Summary

v30.3.72 completes the existing Shared Match experience without redesigning Match Setup, Play, Scores, Press, navigation, identity, or RoundRecord. The release preserves all v30.3.71 work and adds deterministic assignment revisions, authorized score conflict resolution, automatic reconnect retry, standardized trust states, focused recovery actions, technical reason codes, and expanded exactly-once regression coverage.

## Root causes and corrective action

Player assignments were transported as a flat host-owned map. That preserved basic authority but provided no per-player revision, allowing a stale joined copy to be indistinguishable from a current host assignment. Assignments now carry host-authored participant, revision, updated-at, and updated-by fields. Newer revisions replace older state; stale replays, orphaned player rows, and joined overwrite attempts are rejected deterministically.

Score merging previously filled missing scores and reported conflicts but did not formalize the requested winner for conflicting valid writes. Local player/hole changes now retain writer metadata. Reconciliation accepts the newest valid write from the participant currently assigned to that player, ignores identical or stale delivery, and prevents a non-owner write. Stable match/player/hole cloud IDs continue to make accepted writes replacements rather than additional score rows.

The prior trust pill had several legacy labels and could report a successful push without confirmed parity. It now uses only Synced, Syncing, Saved Locally, Offline, and Needs Attention. Synced is reserved for confirmed score parity.

## Assignment, offline, SSP, Press, and finish behavior

Host assignment revisions survive join, refresh, restart, team/player-count changes, replay, and repeated synchronization. Offline changes persist locally first. Reconnection schedules an immediate retry automatically, with manual Retry Sync available when needed. SSP retains its three-way fact-envelope reconciliation; Press retains stable-ID host-authoritative merging. Duplicate SSP and Press delivery is ignored and recorded diagnostically. The host remains the only author of final structure and the frozen RoundRecord.

## Diagnostics

Technical diagnostics add reason codes for assignment rejection/replacement, retained offline scores, ignored stale/duplicate scores, ignored duplicate Press/SSP facts, reconnect, authoritative overwrite, and prevented joined overwrite. Golfer-facing copy remains concise and does not expose protocol terminology.

## Regression coverage

`tests/shared-match-completion.test.js` covers assignment revisions, stale and joined replay, authorized score conflict rules, all five trust states, expanded diagnostic labels/actions, all reason codes, and 120 varied synchronization cycles. The cycle matrix repeatedly delivers scores, transactions, Presses, SSP envelopes, and RoundRecord identities and asserts exactly-once results.

## Manual QA remaining

Use two physical devices to verify join, assignment/reassignment, disconnect, offline score entry, browser refresh, installed-PWA suspend/resume, reconnect, Press receipt, SSP receipt, host finish, and identical settlement/ledger/winner/frozen RoundRecord/history. No login, messaging, notification, new game, or new dashboard was added.

## Validation

- `node --check app.js`: pass.
- `node --check service-worker.js`: pass.
- `npm test`: 191 passed, 0 failed, 0 skipped.
- `npm run test:run`: 191 passed, 0 failed, 0 skipped.
- Focused Shared Match, SSP, and Press regression run: 90 passed, 0 failed.
- `npm run simulate`, `npm run simulate:live`, and `npm run simulate:compare`: 75 rounds each, 0 failures, 75/75 exact live-to-mirror matches.
- `npm run simulate:100`: 125 total rounds (25 fixtures plus 100 random), 0 failures, 125/125 exact live-to-mirror matches. The one suspicious result is the intentional high-value `blowout_match_play` fixture; it is not an invariant failure.
- `npm run release:sanity -- v30.3.72`: 8 pass, 1 expected dirty-tree warning, 0 fail.
- `git diff --check`: pass; Git reported informational LF-to-CRLF working-copy warnings only.
- Rendered browser QA: v30.3.72 shell loaded at 390 x 844, no horizontal overflow, and 0 console errors.
- `npm run lint`: unavailable because the declared local ESLint executable is not installed. No dependencies were installed.

## Scope and Git confirmation

The app remains v30.3.72. No commit, push, merge, or pull request is performed by Codex.
