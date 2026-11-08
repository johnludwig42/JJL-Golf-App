# v31.0.85 — Offline Page Caching

WP-OFFLINE-01 separates cached navigation pages. Automated browser, upgrade and
release-gate results are recorded below; physical iPhone acceptance is NOT_RUN.

## Change and constitutional review

Main-app navigation remains network-first and updates only the canonical app
shell. Offline Ledger navigation uses the precached Ledger shell; an online
Ledger never replaces the cached app. Other navigation retains browser-default
handling, including honest offline errors. Static caching, installation,
activation and explicit SKIP_WAITING behavior are unchanged.

No score, handicap, wager, settlement, shared authority, storage schema, Story or
frozen RoundRecord calculation changes. Constitution review: saved facts and
frozen results remain protected; no new authority or persistence exception is
introduced in application code. The test-only census exception below records
existing blank-draft regeneration, not permission to replace meaningful drafts.

## Browser and upgrade acceptance

Browser scenarios a–d and f passed under root and /JJL-Golf-App/ hosting. AC6
for that scope is accepted under John’s D1-A exception: while a round is active,
blank setup drafts may be regenerated with only id, sharedMatchId, sharedMatchRef,
sharedMatchCode, sessionId and sessionCreatedAt changing. Meaningful drafts and
other changes remain protected. Settled scenario windows, explicit gap checks
and cumulative comparisons preserve all other protected values and frozen records.

The upgrade test exported the baseline commit, installed its real worker, and
reproduced its cache contamination by both the observer page and the app’s Ledger
export. Returning online to reach the real update controls healed the old cache
before activation. The evidence does not show contamination surviving activation.
The app’s own Check for Updates / Install Update path then activated the new
worker and reloaded the app. The old cache was removed; offline reopening and
the offline Ledger were verified, with exact new cache bytes and unrelated caches
preserved. The test went offline while still in the Ledger before the fresh app
navigation. Both hosting layouts passed, with no forced activation or test bypass.

Upgrade AC6 is accepted under John’s D2 Option A only for the reviewed synthetic
no-games match: featuredCompetition changed from auto to stroke_net through an
ordinary pre-update save while the resolved competition remained stroke_net.
This is recorded existing behavior, not a coded census exception; the test still
reports the path as UNCLASSIFIED. Settlement impact is not established. Other
match-field changes remain subject to review and owner decision.

## Verification

| Check | Actual result |
|---|---|
| Full application suite | 1,733/1,733 PASS; no failures, skips or cancellations; 821.351 seconds |
| Lint | 0 errors, 88 existing warnings |
| Validate | PASS |
| Report layout | 7/7 PASS; reference 8 pages, nine-point/sixes/sixes-points/wolf 5 each, iOS reference 11, Flamtana 7 |
| Targeted release sanity | 8 PASS, 1 expected dirty-tree warning, 0 FAIL |
| Simulation comparison | 77/77 exact, 0 differences/failures; 64 warnings, 1 pre-existing suspicious outcome |
| Simulation tests | 4/4 PASS, no failures/skips |
| Flamtana stress | 50/50 PASS, policy 1 |
| Whitespace check | PASS |

S6 ran each gate once with no gate retries. Simulation random rounds are seeded
from the version, so warning counts can change; the suspicious outcome was already
in the committed report. The simulation mirror does not cover Flamtana; stress
coverage is separate and is not a claim of every policy being verified.

Historical evidence is retained: S1 produced 29 failing assertions against the
unmodified worker (including three synthetic routing guards), then S2 went green.
S4 initially passed 174/177 targeted tests because the Netlify fixture omitted
untracked new icons. S4b’s fixture-only correction left those copied icons unstaged,
preserved assertions and passed 4/4 plus 177/177. The same-version browser/census
run passed 3/3; upgrade checks passed 2/2. Current-version test literals and the
classified active-reference scan were clear.

The S6 generators rewrote 19 tracked artifacts. Under John’s Option R they were
restored byte-for-byte to the retained pre-gate copies; regenerated copies remain
in the external evidence. No report artifacts are included in the release change.

## Physical acceptance and known limitations

Physical iPhone/Safari and Home Screen acceptance: NOT_RUN. Automated Chrome
results do not substitute for WebKit or the separately approved phone checklist.
The page-unload rejection branch remains implemented but not fault-injected.
The full evidence, owner decisions and acceptance-criteria reconciliation are
retained under C:/Projects/dye-ledger-evidence/WP-OFFLINE-01/.

## Backlog

- UNVERIFIED: startup while a round is active may replace a meaningful setup draft
  with a blank draft. This is a code-inspection possibility, not a demonstrated
  defect; the census exception does not approve such replacement.
- I1, observed existing behavior: rendering a no-games round resolves and later
  saves featuredCompetition from auto to stroke_net. Effects on games added later
  and settlement are UNVERIFIED; no application correction was made.
- I2, observed update messaging: Check for Updates can say up to date before the
  replacement finishes installing; the target label uses the registration URL’s
  old query version, and no success confirmation appeared after reload. Activation
  still worked. The causal explanation is supported by code review.
- I4, UNVERIFIED: changing the registration query after reload may produce a second
  update prompt. Watch for this during physical acceptance.
