# The Dye Ledger v31.0.60 — Assigned Team Index

## Scope

Adds an optional editable team-index control in Players setup for two-player
teams. Prefills the partners' simple average, requires deliberate entry when an
index is missing, and requires a common tee. Each participant saves the same
round-specific assigned index. Its rounded Course Handicap is the final Playing
Handicap, bypassing both round and game allowances. Library indexes stay intact.
Preview, live scoring, cloud publication/hydration, saved reopening and reports
use this saved value. No scramble team-score entry or Flamtana settlement yet.

No SQL migration. Shared metadata carries policy version, indexes and player tees
in existing course_snapshot JSON; handicap_snapshot carries effective values and
provenance. Ordinary rounds retain their calculation and scoring contracts.
All scoring devices must update to .60 or newer for assigned-index rounds.
Current clients block unknown versions and invalid assigned-index contracts;
older installed clients cannot be retroactively blocked by this release.

## Constitutional review

Proposal: Assigned Team Index, v31.0.60; Product Owner John; October 10, 2026.
User authorized implementation in the accepted Decisions and Revisions attachment.

Direct effects: principles 6 (RoundRecord), 7/8 (round facts and derived results),
10/11/12 (historical/frozen integrity), and 16 (Golfer Identity). Additive round
facts replace the calculation index without changing library identity. Completed
records and course snapshots remain preserved. Version 1 identifies the rule.
Indirect effects: principle 5 (owner authority) and 22 (finality). Host-only setup
publication remains authoritative; invalid overrides block scoring/freeze.
No membership, participation, device identity, privacy, deletion, anonymization,
ownership or Event finality change. No Amendment Session is introduced. Existing
frozen records remain byte-preserved. No constitutional conflict identified.

## Verification

All seven release gates pass: npm test (1,339/1,339, zero failures/skips), lint
(zero errors, 88 existing warnings), validate, all six check:layout fixtures,
release:sanity (6 PASS, 3 development warnings, zero failures), simulate:compare
(77 exact live/mirror matches, zero differences/failures), and test:simulations
(4/4). Simulation scenario signals include 56 warnings and one suspicious-outcome
flag, without invariant failures or live/mirror differences.

Focused behavior tests cover signed index math,
both allowance bypasses, unchanged legacy calculations, invalid/unequal/mixed-tee
and unknown-version rejection, frozen-record preservation, library-edit stability,
independent shared hydration and reports. Browser coverage exercises average
prefill, blank-entry and mixed-tee blocking, missing library indexes, opting out,
edited draft reload, saving, reopening and 44px inputs at 320/375/430px in light/dark
appearance with larger text. Phone screenshots were visually reviewed.
The assigned-index Nassau sample passes the report layout gate. A compact
stroke-play sample passes its dedicated packed-page/overflow/font/signed-handicap
audit; the generic layout gate assumes separate Story/Games page labels and is
not suitable for that existing compact archetype. Both QA PDFs were generated.

QA fixed edited draft values being replaced by averages on reload, preserved
signed Course Net strokes and distinguished final PH from relative strokes in
assigned reports. Missing library-index provenance stays null. The first full
run exposed a detached navigation control in an existing balance-dialog browser
test and an incorrect new touch-target test assertion. The balance test now
reacquires its control; both focused checks and the final full suite pass.
Generated reference reports were restored after verification. Physical iPhone
and real two-device Shared Match acceptance remain pending; mocked independent
hydration does not establish live cloud/device acceptance.

## Manual iPhone acceptance

1. Update both devices to .60 or newer; confirm the visible release version.
2. Choose four two-player teams, opt in and verify the four average indexes.
3. Edit an index, leave and reopen setup; blank an index and verify Start blocks.
4. Partners on different tees must block Start; correct the tee and check final HCP.
5. Set round/game allowances below 100%; verify assigned Course/Playing/Game HCP
   remains unchanged. Turn the option off in a fresh setup and check usual behavior.
6. Publish, join from the second device, assign scorers, reload and compare indexes,
   HCP and strokes. Use ordinary individual score entry in this release.
7. Save scores offline, reconnect and check both device cards; reopen saved round.
8. Change a library index afterward; round/report assigned index and strokes remain
   unchanged. Verify readable controls at Larger Text and light/dark settings.

## Git and priority

Branch codex/v31.0.60-assigned-team-index, from main at ffc264d after v31.0.59
merged in PR #156. Changes remain uncommitted for Product Owner review.
Accepted .60/.61/.62 rules and manual fallback are in
docs/FLAMTANA_SPECIAL_BUILD_PLAN.md. These precede all further roadmap work.
