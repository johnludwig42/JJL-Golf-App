# The Dye Ledger v31.0.64 — Flamtana Setup and Scoring

## Authorized scope

One tee selector per team in Two-man Scramble setup, applying to both partners.
Teams may use different tees. Preserve individual tee selection for ordinary
rounds, stored per-participant tee IDs and the existing same-tee/index validation.
Mixed legacy pair selections remain unresolved until deliberately corrected.

Restore team +/− score controls using the existing Play workflow. First tap on a
blank score enters that team's hole par; subsequent taps adjust within 1–25.
Deliberate taps mark Pending input as touched, while untouched Save preserves a
mismatch. Both partners retain the ordinary authority/outbox/save contract.
Comfortable 44px targets and larger-text layouts are preserved.

Remote was on .62 and reported “match not found.” Membership can be accepted
before the scorecard download fails. The old loader masked every uncached download
failure as not-found. Separate authorization/download failures, identify the
failing query table, preserve original runtime cause, and record only bounded
phase/table/kind/code/time/accepted-state diagnostics. No auth tokens, raw backend
messages, identities or scores are recorded in this diagnostic. Support Copy
Diagnostics includes the last failed join. Successful download clears it.
An accepted join with an invisible match row is not labeled a wrong code.
Permission, expired-session, connection and genuine RPC not-found cases differ.
Existing cached recovery and secure join admission remain unchanged.

Start refreshes device registration when online, then validates the existing
foursome assignments and eight picks. Valid offline assignments remain usable.
Readiness separates registered devices from confirmed scorecard access and lists
the two foursome assignments. Joining does not automatically reassign golfers.

No wager engine, settlement, evidence schema, database/RLS, account requirement,
RoundRecord rewrite or production migration. Actual cloud access on the affected
phone is not proven repaired: retry with .64 and inspect Support diagnostics if
still blocked. A backend permission/visibility issue may require a separate fix.

## Constitutional review

Owner John; October 10, 2026. Authorized by “Please proceed” after confirming
one tee per pair, different tees allowed between teams, remote version .62.
Direct: 6 (saved facts), 10/11/12 (frozen preservation), 22 (finality safeguards).
Indirect: 2/5 (existing host/scorer authority), 7/8 (facts versus diagnostics),
16 (saved membership/identity unaffected), 23 (bounded sanitized diagnostics).
No completed-record changes, ownership/roles, Event Record, membership/attendance,
privacy/deletion operations or Amendment Session. No conflict identified.

## Verification

Full suite: 1,373/1,373 pass. Five focused unit and two browser scenarios cover
permission/visibility/auth/network classification, secure admission order, cached
recovery, refreshed/offline readiness, mixed tee preservation, draft reload,
team-specific hole par, paired Pending correction, 44px targets and non-overlap at
32px text. Two older security assertions now exercise actual admission behavior
instead of the former loader source layout. Final focused admission checks 14/14
pass after clarifying registration-stage wording.

Lint: zero errors, 88 existing warnings. Release validation and all seven report
layout gates pass. Default release sanity: six passes, three development warnings,
zero failures. Simulation comparison: 77 exact matches, no differences/failures
(61 warnings, one suspicious outcome); simulation tests 4/4 pass. These mirror
simulations do not cover Flamtana. Its dedicated 50-run stress check passes with
component amounts, combined payments and complete evidence byte-identical to the
prior baseline. All three protected wager functions are byte-identical to .63.
Physical two-device/iPhone acceptance and the reported live access issue remain
pending a retry; classified diagnostics enable the actual backend cause to be
identified without guessing.

## Manual acceptance

1. Update both phones to .64 and verify the version. Create/join before Start.
2. Choose one tee per team; verify both partner previews update, other teams may
   differ, and saved/reopened selections match. Ordinary rounds retain individual
   selectors. Started-round tees/indexes remain fixed.
3. Retry the reported join. If blocked, copy Support diagnostics and report the
   Last Shared Join Failure phase, kind, table and code. Confirm no generic
   not-found message hides a permission/download failure.
4. Host assigns T1/T2 to one phone and T3/T4 to the other. Complete eight Calcutta
   picks; verify Start guidance for invalid assignments. Confirm remote has opened
   the scorecard, then start and verify the timestamp reaches it.
5. On both phones, tap + or − on a blank score: first tap enters the team's par;
   subsequent taps change it. Save, reload and check both partners agree.
6. Resolve a Pending pair with a deliberate stepper tap; untouched Save must still
   preserve the mismatch. Check explicit clearing, corrections and authority.
7. Check 320/375/430px, larger text and offline/reconnect. Finish only with equal
   partner scores and verified parity; old frozen rounds remain unchanged.

## Git

Clean startup on .63 at 08b2b11, merged via PR #160. Branch
codex/v31.0.64-flamtana-setup-scoring starts from origin/main 684c06a.
Changes remain uncommitted. No push, merge or deployment.

## Final implementation review

Changed groups: setup/Play controls, the shared join loading/error boundary and
Support diagnostics, Start readiness, scoped legacy score-control CSS, release
metadata/icons, two focused test files, two updated security tests and project
context/build notes. New shared-join diagnostics use a separate additive bounded
localStorage key; no user round data is cleared. No SQL/RLS change. Wager bodies,
saved evidence and frozen records are preserved. Generated reference reports and
simulation outputs restored to the clean baseline; QA copies retained. No deleted
files or whitespace errors. Uncommitted for Product Owner review.
