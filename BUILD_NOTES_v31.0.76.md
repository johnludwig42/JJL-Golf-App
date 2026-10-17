# v31.0.76 — Shared Round Ledger Recovery

Started clean from committed .75 (49f826f), on
codex/v31.0.76-frozen-ledger-preview. John requested recovery of the existing
event round and Story without re-entering scores.

## Diagnosis and scope

The host diagnostics show a successful latest sync, zero outbox operations,
24 local scored entries missing from the cloud comparison, zero conflicts and
no local-save failure. Historic sign-in failures are not the current error.
"Save Story" confirms that the round has not yet completed. Upload deliberately
uses changed rows in the durable outbox after its initial seeding; an empty queue
does not recreate scored entries missing from the server. Repeated ordinary sync
can therefore succeed without closing this gap. The supplied diagnostic does not
prove when or why the 24 cloud scored entries became absent.

- Host-only, unfinished-Flamtana recovery notice appears in Play and Scores when
  local scored entries are missing remotely. Review reads fresh cloud rows and
  lists team, hole and gross. Resend reads again and requires the same review.
- Only complete/equal partner pairs with valid gross scores are eligible. Existing
  conflicting scores or withdrawn cloud rows block recovery; nothing silently
  overrides them. Both partners use stampSharedScoreWrite and the existing durable
  operation/receipt path. Explicit host overrides permit recovery of the remote
  foursome's saved team scores through the same authority rules as host takeover.
- Queue preparation occurs in memory, preserving other rounds' operations. Working
  metadata is saved before committing the staged queue; storage failure stops
  delivery and retains the score/Story facts. Failed delivery retains queued work.
  Recovery requests have a bounded wait and can safely be retried.
- After verified upload/pull, standard parity-gated completion/freeze remains in
  force. Existing generated Story is retained for Save Story & Preview Ledger.
- After Start, all eight golfers may be reassigned to the host for takeover without
  triggering the fresh-start two-device check. Valid joined-player assignments are
  still required. Fresh rounds still require the original two distinct devices.
  The setup action reads Continue Scoring for an already-started round.
- Independently reproduced: even a completed frozen round's new Ledger preview
  awaited cloud reconciliation again. A matching completed frozen RoundRecord now
  opens locally without that redundant wait. It never marks cloud parity confirmed
  and does not bypass unfinished-round finalization.
- John additionally authorized mid-round game removal. In event-options (policy 3)
  rounds, Play → Round rules → Manage games (host) offers removal of each enabled
  competition. Confirmation names its per-golfer buy-in and total pool. Removal
  persists the existing enabled flag, then schedules normal host metadata sync;
  the existing settlement/report paths omit that game and its buy-ins/payouts.
  Other components remain byte-identical. Calcutta remains independent if The Big
  Game is removed. At least one competition must remain; re-adding after Start,
  legacy policy conversion, non-host changes and frozen-round edits stay blocked.
  Failed local saving restores the original configuration. Scores and Story stay
  saved; the UI reminds the host to review Story references to removed games.
- No score values, remaining games' wager rules, course snapshots, identity/SQL
  policies, local storage keys or schema migrations change. Existing rounds remain.

## Recovery after publishing

1. Install the update on the host. Keep the existing saved round.
2. In Play, choose **Review missing scores** in **Recover missing cloud scores**.
3. Check the listed team/hole scores, then **Resend reviewed scores**.
4. Once all scores are confirmed, **Complete Round**. Review the existing Story,
   then **Save Story & Preview Ledger**. No regeneration is required.
5. If signed out, sign into the original host account and retry. A conflicting,
   withdrawn or Pending score needs review rather than automatic replacement.

## Constitutional review

Owner/approval: John, October 17, 2026, explicitly requested a round-preserving
update. Principles 6–8 and 10: frozen RoundRecords remain report authority and
are never altered; recovery changes delivery metadata, not local score facts.
Principles 2, 5, 15 and 22: host authority and normal round-owned finalization
remain; recovery cannot finalize a round or assert parity on its own. No change to
identity, historical participation, membership, privacy/deletion or Event Records.
No constitutional conflict identified; no Amendment Session is introduced.

## Verification

Eleven focused behavioral tests pass: 24 missing/zero queued recovery; partner,
authority/conflict/withdrawal/frozen guards; changed-score/storage-failure controls;
local frozen report with preserved Story; unfrozen reconciliation retained; actual
iPhone-UA Ledger/PDF navigation under nonresponding cloud; and host review →
24 durable writes → 144 confirmed rows → completion/freeze → existing Story/report,
including all players reassigned to the host and fresh-start restrictions retained.
The browser service is a local API test double, not production writes.

Release checks: lint has 0 errors / 88 existing warnings; validate passes;
check:layout passes all 7 references (46 pages total). Extracted text and page
counts match the committed PDFs; metadata-only PDF changes were discarded.
simulate:compare: 77 exact matches, 0 differences/failures, 57 warnings and
1 suspicious outcome; test:simulations passes 4/4. The simulation mirror still
does not exercise Flamtana. Generic release:sanity has 6 PASS / 3 WARN / 0 FAIL.
With an explicit v31.0.76 argument it has 7 PASS / 1 WARN / 1 FAIL solely because
it expects release/v31.0.76 rather than this codex branch; build-note, version and
asset checks pass. No branch-policy or gate changes made to hide that mismatch.

Full suite: 1,450 passed, 0 failed, 0 skipped. The subsequent final focused run
passes all 11, including the additional browser removal/confirmation test not
collected by the already-running full suite. Removal is tested against all five
components for unchanged remaining settlements, reload and remote metadata,
authority/frozen/last-game guards and failed-storage rollback.
No commit, push or deployment performed.
Actual phone recovery remains John's acceptance step after publishing.
