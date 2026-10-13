# v31.0.72 — Flamtana Story and Round Finish

John approved the four-item proposal: verified AI stories for Flamtana, repair
Save Story & Preview Ledger, projected settlement and remote return to Create/Join
when the host finishes. Started clean from committed .71 (e850c1b), on
codex/v31.0.72-flamtana-round-finish. Other event-freeze restrictions remain.

## Findings and changes

- Flamtana previously bypassed AI. Its payload also lacked the deployed story
  service's required content-spec version, authoritativeFacts and players array.
  The client now sends frozen team/foursome series, wager results, complete card-off
  evidence, partners, tees, picks, net positions, Memories and weather, plus
  identity-only golfer rows. No individual scoring/statistics/posting is invented.
  The existing service accepts this contract; **no server-function deployment or
  database migration is required**. Existing saved stories are retained; use
  Regenerate Story to replace an earlier facts-only draft explicitly.
- AI follows the existing repair/validation/fallback workflow. Flamtana checks
  reject supported false total/winner claim patterns, match-play notation and
  invented individual scores/statistics. Requests have a 45-second timeout.
  User review remains necessary; narrative auditing is not a proof of every
  possible natural-language claim.
- Reproduced the Save failure: the prior Flamtana fallback omitted saved Memories
  and weather, which are blocking validation requirements. The fallback now includes
  both, plus golfers with positive net positions. Validation remains enforced.
  Local Story persistence must succeed before preview navigation; failure keeps
  the review/edit screen open. Report-transfer failures retain the saved Story
  and explain how to retry. Successful mobile preview stays in the current tab.
  Older raw drafts also display and save the required Memory/weather additions
  consistently. Explicit edits remain subject to the same factual validation.
- Scoreboard projects Featured, both Group contests, Foursome, Calcutta and combined
  golfer nets using common completed holes within each contest. Ties project a
  split; card-offs remain finalize-gated. Unavailable contests show Pending.
  Projections never feed the settlement engine, outbox or frozen RoundRecord.
  Existing final payment instructions continue to use saved final settlement.
- Found the remote limbo cause: fetchSharedMatchMetadata put lifecycle fields in
  its diagnostic snapshot but omitted them from its returned metadata. Completion
  now reaches the remote working copy. The remote preserves the host's frozen
  record in Library, saves locally, then returns to Match's Create/Join choices.
  It clears neither queued scores nor unfinished entries. Such cases retain a
  visible recovery warning; unsaved fields are captured for recovery where storage
  allows. Publishing pauses after host completion is received, preserving those
  local writes for host review rather than altering a frozen scorecard. Background
  retries check host completion before sending remote queued operations; remote
  owned scores that differ from the frozen record also block automatic exit.
  Captured unsaved entries survive reload and repeated metadata updates, and the
  recovery warning shows the team, hole and entered value.

## Constitutional review

Owner: John Ludwig. Date: October 12, 2026. Principles 1/5 preserve ownership and
host authority; 6/8 separate frozen facts from working copies and projections;
9 preserves recorded Memories; 10/11/12 preserve historical versions without
silent rewriting; 22 preserves finality; 23 preserves participation and records.
Stories remain reviewed presentation artifacts through the existing acceptance
workflow. No completed RoundRecord is recalculated or overwritten, no identity or
membership changes, and no deletion/access removal or Amendment Session occurs.
No constitutional conflict identified.

## Verification

- New focused coverage: 6 unit cases and 6 browser cases. Includes AI request and
  repair, false claim rejection, fallback Memories/weather, Save-to-preview,
  primary-store failure, report-transfer failure/retry, remote normal completion,
  unconfirmed outbox, offline retry after host completion, late score differences,
  unsaved fields/reload and storage failure. The old source-only
  completed-review assertion is replaced by actual browser return-to-Match coverage.
- Projected table checked at 320/375/430px and 32px root text; cells retain complete
  labels/amounts inside an accessible horizontal scroll region. Names stay visible
  and combined net comes first. A 375px screenshot was inspected. Game Summary
  says Not settled rather than displaying a misleading pre-finalization $0.
- Full 18-hole two-context rehearsal: same account, actual create/join/assign/Start,
  opposite scoring order, 144 cloud score rows and parity on both sides, host freeze,
  remote adoption of the exact frozen record and return to Create/Join, then an
  8-page Ledger report. Network uses an isolated local Supabase API test double.
- Flamtana stress: 50/50 policy-2 cases and reports pass. All games, payments,
  settlement-player data, picks and complete evidence are byte-identical to .70
  off-low cases. Page ranges unchanged: Split 7–8, Hole 18 8–10, Back nine 7–8,
  Last six 8–10. Settlement/card-off functions remain unchanged.
- Layout: 7/7, 46 pages; page counts and extracted text unchanged. Original PDF
  bytes restored after verification to avoid metadata-only churn.
- Lint: 0 errors, 88 existing warnings. Validate passes. Release sanity: 6 pass,
  3 development warnings, 0 fail. Simulation tests 4/4; comparison 77/77 exact,
  0 differences/failures, 55 warnings, 1 suspicious outcome. Flamtana remains outside
  the mirror as previously deferred; its stress/rehearsal coverage is separate.
- Final full regression suite: **1,424/1,424 pass**, 0 failures/skips (590.5 seconds),
  including the reconnect/conflict safeguards. An earlier full run also passed.
- One concurrent desktop story-navigation run timed out. The same two desktop
  scenarios passed in isolation (2/2) and in the final serial full suite; no
  application defect was reproduced from that concurrent timeout.

Local API/browser tests do not replace actual two-iPhone or live AI-provider
acceptance. No live service writes, commits, push or deployment. Both phones must
install .72 to receive this remote completion behavior. Previously saved/accepted
stories are preserved; regenerate a draft explicitly where needed. If the host
finishes while a phone has pending scores, do not clear its data: it stays available
for host review and cannot silently upload into a frozen round.
