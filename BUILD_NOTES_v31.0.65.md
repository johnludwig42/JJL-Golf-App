# The Dye Ledger v31.0.65 — Shared Match Storage Recovery

## Scope and diagnosis

Remote .64 diagnostic: download phase, no query table, code 22. This is consistent
with QuotaExceededError thrown by the redundant cloud bundle cache write after
successful cloud reads. Registration visible on the host does not prove a local
save. Actual physical-phone recovery must be confirmed after publication.

Cloud bundle caching is best effort. Its failure no longer hides a successful
cloud read or throws a generic download error. The joined match must successfully
persist locally before rendering, success confirmation or scheduling score sync.
On a primary quota failure, retry after reclaiming only re-downloadable cloud
bundle keys. The existing persistence contract may reclaim its redundant state
backup. Preserve authoritative primary state, outboxes, drafts, preferences and
finish/course-publish recovery. If saving still fails, restore pre-join memory and
active match and surface an explicit storage diagnostic. No automatic deletion of
rounds or website data. No database, RLS, authority, wager or frozen-record changes.

## Constitutional review

Authorized by John: “Ok, please proceed” after storage diagnosis. Principles 6,
10–12 and 23 apply: preserve authoritative and frozen facts, distinguish redundant
cloud copies from historical records, and keep diagnostics bounded. No conflict.

## Verification

Results recorded below after completion. Physical acceptance: both devices on .65,
retry Join, confirm scorecard and assigned team access, enter/save a score, reopen
and confirm persistence. If blocked, retain data and send Last Shared Join Failure.

Focused verification: 33/33 storage, persistence and secure-admission checks pass.
A separate real Chromium storage-quota scenario passes: fill localStorage until
QuotaExceededError code 22, reject an oversized optional cache, reclaim only cloud
copies, persist joined scores and retain prior facts/outbox, then refuse an
oversized primary record and preserve both the prior stored and active match.

Lint: zero errors, 88 existing warnings. Release validation passes. Release sanity:
6 PASS, 3 development WARN, 0 FAIL. Simulation comparison: 77 exact, zero differences
or failures (58 warnings, one suspicious outcome); simulation tests 4/4 pass.
The simulation mirror still does not cover Flamtana; post-event work remains paused.
All seven report layout gates pass; Flamtana reference remains seven pages.
Flamtana stress: 50/50 reports pass; each component settlement, combined payments
and complete saved evidence are byte-identical to the .64 baseline. The three
protected wager functions are unchanged. Generated reference files are restored
rather than included in this storage-only release.

Full suite: npm test passes 1,378/1,378, zero failures or skips. The additional real
browser quota test was added while the full suite was running and passes separately
1/1; all current test files have been exercised. Focused tests and the full suite
run against the final application code. Initial sandbox-only attempts could not
connect to localhost; the completed browser gates ran with authorized local access.
