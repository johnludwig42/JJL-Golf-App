# v31.0.89 — Recovery Script Versions

## Change

`recovery.html` now loads both recovery scripts with `?v=31.0.89`, like every other release asset. This reduces the chance that a browser reuses an older cached recovery script beside a newer page; it does not rule that out.

The release validator now fails if `recovery.html` lacks either versioned source, so a version bump that misses `recovery.html` fails validation. The staging recovery build test derives the version from `package.json` and checks built files without the query.

No data, storage, scoring, settlement, restore or service-worker precache behavior changes. The new cache name `the-dye-ledger-v31.0.89` replaces v31.0.88 on update.

## Evidence and limitations


- Main was verified live at 14d20ca (v31.0.88 merged). This release was prepared from it on branch `release/v31.0.89`.
- Release checks on the final code: the full suite passed 1,837 of 1,837 tests with no skips. The release validator passed. Lint reports 0 errors and the 93-warning baseline. The simulation comparison had 0 failures and 77 of 77 live-versus-mirror matches; its 60 warnings and 2 suspicious outcomes come from a version-based random seed and are not comparable with earlier counts. Release sanity reported 8 PASS and 1 WARN (uncommitted working tree), with no FAIL. All seven layout checks passed.
- The checks ran under a network guard that blocked outside requests from Node and Chrome. No outside connections were observed.
- A first full run found a midnight build timestamp, which two metadata tests reject; the timestamp was corrected. It also found three screenshot tests that could not write to a missing ignored tmp folder in the fresh worktree; they passed once the folder existed.
- One recovery browser test (AC-R13) failed once when Chrome recorded its own inline icon as a page request. It passed on rerun and on the unchanged baseline, and is treated as intermittent.
- No staging, production or physical-device acceptance has been run for this release. Merge and production verification are pending.

- Before the bump, the targeted staging recovery build test passed 2 of 2, the release validator passed, and a negative control with the old `recovery.html` failed with "recovery.html asset query is stale".
- The separate `recovery-guard.js` loader in `index.html` remains unversioned; it is a separate backlog item.
- The narrow AC6 dispositions, the unestablished settlement impact, and the open DL-35o AC-R8 and F-6 observations carry forward unchanged. The 93-warning lint baseline carries forward.
