# v31.0.86 — Report Print Fallback

WP-PRINT-01 improves Ledger Print feedback and adds a passive, self-contained
HTML report-file fallback. Owner-attested iPhone results (see Physical acceptance)
show Home Screen direct printing working; Safari direct printing still fails and
is a known, accepted limitation. Safari direct printing is not fixed.

## Behavior and preservation

- Print and Save keep the browser's trusted tap. If layout or file preparation
  is incomplete, a readiness message requests another tap.
- Conditional fallback guidance appears when print options may not have opened.
  Print events are feedback, never evidence of a successful print.
- Standalone/Home Screen reports no longer automatically print. Normal tabs
  retain their existing automatic-print behavior.
- Accepted and unavailable acceptance actions use status labels. Completed-round,
  Story, repeat-accept and unlock-confirmation protections remain in place.
- Save report file shares or downloads HTML, not PDF. The copy contains the
  displayed pages, embedded local fonts (system fonts on fetch failure), and its
  own strict security policy. It excludes application controls, scripts and
  transfer state. Each download tap creates a fresh file URL, so saving still
  works after back-forward restoration.
- The report page permits only same-origin font reads; tests lock the nine font
  paths, omitted credentials, refused redirects and the exact security policy.

No scoring, settlement, round snapshot, storage-schema or shared-authority
changes. Constitution review: authoritative historical facts and frozen results
remain preserved; export is derived from the displayed report. Worker changes
are release identity and asset references only; offline behavior is unchanged.

## Verification

Group 1: 16/16 print/export tests, 19/19 corrected legacy checks and 194/194
targeted regressions passed. The legacy checks overlap the regression set.
Chrome simulated print/share behavior and a real Chrome download after actual
back-forward-cache restoration were verified. These do not establish iOS behavior.

Group 2 release identity: five immutable icons match their canonical bytes; older
icons remain. App and worker behavior masks match the pre-release source. There
are no active old-version references, unclassified scan hits or hard-coded current
version literals in tests. The previous release note and historical records remain.

| Check | Actual result |
|---|---|
| S3 targeted set | 210/210 PASS; zero failures, skips or cancellations |
| Full application suite | 1,749/1,749 PASS; zero failures, skips or cancellations; 884.495 seconds |
| New print tests within full suite | Executed and passed; none skipped |
| Lint | 0 errors, 88 existing warnings |
| Report layout | 7/7 PASS; reference 8 pages, nine-point/sixes/sixes-points/wolf 5 each, iOS reference 11, Flamtana 7 |
| Release sanity | 8 PASS, 1 expected dirty-tree WARN, 0 FAIL |
| Simulation comparison | 77/77 exact, 0 differences/failures; 57 warnings and 1 pre-existing suspicious outcome |
| Simulation tests | 4/4 PASS |
| Flamtana stress | 50/50 PASS, policy 1 |
| Validation | S3 PASS; final validation PASS on the final documentation bytes |

Each broad gate ran once with no corrective retries. Simulation randomness uses
the release version; warning counts can change. The suspicious blowout_match_play
fixture outcome matches the pre-gate report. The simulation mirror does not cover
Flamtana; its policy-1 stress coverage is separate, not a claim about every policy.

Under approved Option R, all 19 gate-generated artifacts were retained in both
forms and restored byte-for-byte to their pre-gate copies. No reports/ changes
remain, and restoration changed no package source. Final facts-only documentation
updates follow the frozen runtime checks; the final handoff identifies their hashes.

## Physical acceptance (owner-attested)

John tested the reviewed v31.0.86 build on staging on November 8, 2026, using
an iPhone 15 Pro Max on iOS 26.6.2 and synthetic rounds. These results are John's
attestation; no screenshots or PDFs were retained, and they were not independently
observed.

| Check | Home Screen app | Safari tab |
|---|---|---|
| PA8c: direct Print opens native printing | PASS; only after tapping Print / Save PDF | FAIL; print options did not open |
| Conditional fallback message | Not reached | Appeared as designed |
| PA8a: saved HTML opens with every page readable | NOT_RUN; fallback not reached | PASS |
| PA8b: Print / Save PDF from the opened HTML | NOT_RUN | PASS; readable saved PDF, matching scores and settlement |
| PDF from direct printing | Saved, reopened readable, sent by text; recipient confirmed readable pages and matching scores and settlement | Not applicable |
| Reopen accepted Ledger, tap Print again | PASS | Not recorded |
| Return preserves scores, settlement and Story; accepted Ledger reopens | PASS | PASS |

- Objective: MET (owner-attested) through Home Screen direct printing, under the
  package rule (Home Screen PA8c, or Home Screen PA8a and PA8b).
- D9 was not triggered: no saved-file open or print check failed.
- Safari direct printing is a known limitation, mitigated by the verified Safari
  HTML fallback. It is not fixed, and whether it predates v31.0.86 is unknown.
- The original reporter's Safari response is pending and is recorded separately.
- John accepted these limitations and authorized the merge.

## Deployment (independently verified)

- Staging: the hosted v31.0.86 files matched the reviewed build (41/41 non-HTML
  files exact; HTML exact after the disclosed, previously approved staging-host
  additions).
- Production: PR #198 merged as abcb5a5ec97f8f606ab0ee09e5b7ed0544486fc0, whose
  tree equals the reviewed release commit 5d11dbb. GitHub Pages run 42525483809
  completed successfully for that commit. Neither check proves phone behavior.

## Limits and open decisions

- Home Screen HTML fallback (PA8a/PA8b): NOT_RUN. Safari direct printing: FAIL,
  accepted as a known limitation; follow-up is a backlog item, not part of this release.
- S3 and full-suite navigation census show only the prior D1-A blank-draft
  exception. Detailed upgrade census retains the expected D2 PENDING_REVIEW
  classification for featuredCompetition auto to stroke_net in the existing
  no-games fixture, plus approved backup/draft behavior. No new unclassified
  path or persistence exception was introduced or accepted here. Broader
  settlement effects remain unverified as previously recorded.
- Broader sharing, scorecard/summary exports, saved-score storage and the
  WP-OFFLINE-01 backlog remain outside scope. No storage cleanup or AI work.
