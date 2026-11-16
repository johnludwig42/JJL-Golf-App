# v31.0.88 — Round Recovery

**Owner-accepted on a physical iPhone, with limits.** See Physical acceptance.

## Recovery

- Data Tools offers **Save recovery file**. The app verifies the export before downloading it. The release precaches the versioned export module so an installed app can load it offline from its cache. FU10 is not applicable by design.
- Open the recovery page in a separate, empty browser profile to verify and restore a file. The startup guard protects restored data and holds restored Shared Match score writes. An interrupted restore leaves that profile single-use.
- After a verified restore, reselect the same hash-verified file with network access allowed to view its accepted Ledgers read-only. The viewer uses the accepted snapshot as saved. The comparison evidence covers the reviewed fixtures and presentation-neutral cases. It did not demonstrate an actual Nassau press or a facts-only Story correction.
- If storage requires a reduced restore, preserve the active round, both holds, and the mandatory records. Among optional records, prefer unfinished rounds, then completed rounds without an accepted Ledger, then completed rounds with one. Prefer newer rounds within each group. Rounds omitted from restored storage remain in the original file. The restore fails closed if mandatory data cannot fit or verification fails.

## Physical acceptance (owner-reported)

John tested the reviewed build on staging on November 15, 2026, using an iPhone 15 Pro Max on iOS 26.6.2 and synthetic rounds. Staging first served the reviewed files byte for byte, apart from Netlify's approved sign-in link rewrite in `index.html`. `recovery.html` was served unchanged. Three screenshots were retained. Results not shown in them rest on John's report.

| Check | Result | Screenshot evidence |
|---|---|---|
| D0: STAGING banner and v31.0.88 in Safari and the Home Screen app | PASS (reported) | None. The recovery file records v31.0.88 and the staging origin. |
| D1: Home Screen app relaunches offline; rounds and Ledgers open | PASS (reported) | None |
| D2: Save recovery file offline, through the share sheet to Files | PASS (reported) | The saved file verifies section by section |
| D3: recovery page in a new Safari Private Browsing tab accepts the empty profile | PASS (reported) | A Private tab reached the isolation step |
| D4: offline verify and Recover into empty profile | PASS | Offline verification of all sections and three rounds; all three rounds restored with matching hashes |
| D5: viewer refuses offline; online it shows the accepted Ledger, Return and Print preview work | PASS (reported) | The restored file re-verified for read-only viewing, with View Ledger offered for both accepted rounds |
| D6: reload during restore | Not reproducible by hand | None. The restore finished before the tab could be reloaded. |
| D7: export after its opener reloads (C-1) | Observation only | None. Recorded as confirmed, without detail. |

Interrupted-restore behavior was not observed on the iPhone. The single-use profile after an interrupted restore rests on the Chromium evidence. iPhone storage capacity was not tested.

## Evidence and limitations

- Chromium verified capped restore with simulated limits and an actual Chromium quota error. These results do not establish iPhone capacity.
- Chromium verified automatic and manual Print, unchanged content, and Return for the reviewed restored-profile scorecard and summary exports (FU9). After the originating tab reloads, an already-open export can remain readable while its controls stop working (C-1). The print-document observation remains open.
- Accepted R1-F evidence includes the two-part DL-36 gate and the narrow upgrade AC6 dispositions, which cover two records each in DL-36 Part 1 and R1-G G-5 Part 1. The raw upgrade results remain available. The effect on settlement was not established.
- Release checks on the final code: the full suite passed 1,837 of 1,837 tests across 178 files, with no skips, including 89 staging-tooling tests. The release validator passed. Lint reports 0 errors and the 93-warning baseline. The simulation comparison matched the reviewed baseline. Release sanity reported 7 PASS, 1 WARN and 1 FAIL; the FAIL was the branch-name check, which John accepted. Layout checks were NOT_RUN.
- The original DL-35o AC-R8 request and the separate F-6 score-input failure remain open observations. FU8 remains investigation-only. O-G1, versioning the remaining recovery scripts, is deferred. The 93-warning lint baseline carries forward.
