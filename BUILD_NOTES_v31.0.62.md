# The Dye Ledger v31.0.62 — Flamtana Special

## Scope and decisions

One game with four separately funded wagers, default $20 per golfer each:
Featured team net total; Group team net totals (T1/T2 and T3/T4); Foursome sum of
per-hole lower team net scores; Calcutta following the finalized Featured result.
All scoring wagers are stroke play. Foursome scores have their own series.

Requires eight golfers, four two-player teams, 18 holes, Two-man Scramble,
assigned team indexes and Shared Match assigned-player scoring. Fixed foursomes
and two scoring devices remain. All eight Calcutta picks are required before
Start; each golfer may back their own team. Stakes, picks and tie rules lock at
Start. Both devices must run .62 or newer; old installed clients cannot be
retroactively blocked. No new schema or scoring sync protocol.

Card-off applies only at finalization: split (default), 18 backwards, back nine /
last six / last three / 18, or last six / last three / 18. Saved net hole values
are compared and evidence retained. Exhaustion splits. Calcutta divides the pool
by winning teams, then by backers; an unbacked share pays the two partners.
Integer-cent allocation keeps every component zero-sum; odd cents go in stable
ID order. Historical frozen records are preserved.

Pending copy explicitly says to re-enter the team score to resolve, or deliberately
clear it. The end-of-round review lists each unresolved team once and links to its
hole with the same remedy. The untouched-input guard remains. Host fallback: if a scoring device
drops out, the host can enter or correct all four teams in Classic. Keep fixed
foursome assignments and verify backup/parity before finishing; no reassignment
to a single device is required. The guidance is shown below the team controls.

Play shows per-foursome completed-hole counts alongside whole-field progress.
The underlying whole-field completion rule remains. Team report entries are
explicit team facts, with separate eight-golfer payment identities. Individual
statistics, accolades and posting interpretations remain suppressed.
Stories use a deterministic four-wager summary. Story fact payloads carry the
saved team/foursome series, picks, money and tie evidence without individual stats.

## Constitutional review

Proposal: Flamtana Special .62; Owner John; October 10, 2026. Authorized by
“Proceed to v31.0.62” with seven carry-forward notes.
Direct principles: 6 (authoritative RoundRecord), 7/8 (facts and derived results),
10/11/12 (preserved frozen history), 15 (round-owned competitions), 22 (finality).
Indirect: 2/5 (existing host authority), 16 (membership separate from identity).
No completed-record rewrite, Amendment Session, Event Record change, role or
ownership change, identity change, membership/attendance change, privacy operation
or deletion. Additive game configuration/result snapshots only. No constitutional
conflict identified.

## Early two-device Pending answer

Independent engines hydrate actual cloud score rows. Unequal and partial partner
pairs remain Pending on the reader and block completion/freeze on both sides.
Giving the reader host authority does not bypass equality; repairing the pair
permits freeze. Incremental score refresh also remains Pending until the matching
partner arrives. This verifies receiving logic, not live delivery/reconnect timing.
John's live .61 rehearsal remains separate.

A joined scorer that loaded before Start now receives the host's Start timestamp
and saved Flamtana settings through the ordinary metadata refresh. The .61 refresh
path did not apply the later Start timestamp. The additive Flamtana configuration
uses the existing course snapshot JSON; the metadata query remains unchanged.
Host edits are not overwritten, and frozen rounds ignore these setup updates.

## Verification

Focused engine checks (10) and browser checks (3) pass, including actual hydration
and incremental score refresh, all three scoring wager card-offs, exact-cent
Calcutta, more-than-18/signed handicaps, draft recovery and frozen preservation.
All seven report layout fixtures pass. Flamtana renders seven desktop PDF pages
and nine on the simulated iOS print surface, with verified physical page counts.
Lint: zero errors, 88 existing warnings. Release validation passes. Simulation
comparison: 77 exact matches, zero differences/failures, 62 warnings and one
suspicious outcome; simulation tests 4/4 pass. Full regression suite: 1,362/1,362 pass.

Default release sanity: six passes, three development warnings, zero failures.
The version-targeted legacy sanity command has seven passes, one working-tree
warning and one branch-name failure because it requires release/v31.0.62. The
verified branch follows the configured codex/ prefix; build notes, versions, assets
and unmerged-path checks pass. This naming limitation is not hidden by the default
check. Physical iPhone and live two-device acceptance remain pending.

## Implementation review

App/setup/controller changes are confined to the team format and new game.
Report team entries have an explicit field set and frozen reports read saved
membership, names, scores and strokes. Payment identities remain eight golfers.
The report includes card-off evidence, all eight picks, a Calcutta net ledger and
independent Foursome series. Every component cross-foots in integer cents. Ordinary
game calculations, record schema, host roles and Shared Match completion/parity
flow remain unchanged. The local draft and cloud metadata additions are additive.

Changed groups: app and setup UI; report rendering/layout acceptance; the dedicated
fixture generator and HTML/PDF fixture; release metadata/icons; focused tests;
project context and priority documents. Generated older reference reports and
simulation output are excluded from the release changes.

## Manual acceptance

1. Update both devices to .62, configure the strict scramble format and only
   Flamtana Special. Verify four default $20 stakes and the saved tie rule.
2. Create/join/assign before Start. Verify missing Calcutta picks and invalid
   foursome assignments block Start. Enter all eight picks including an own-team
   pick; start and verify stakes/picks/tie rule cannot change.
3. Score the groups on different holes. Verify foursome progress differs while
   field completion waits for all teams. Recheck narrow widths/Larger Text.
4. Create a Pending pair through delayed arrival; on both devices confirm the
   remedy is visible and settlement stays blocked. Re-enter to resolve; deliberate
   clear still clears both partners and untouched Save preserves the mismatch.
5. Disconnect the second scorer. Host corrects/saves that foursome without changing
   assignments. Reconnect and verify partner equality, backup and shared parity.
6. Compare all four team net cards and both per-hole-minimum foursome cards against
   a hand worksheet. Test ties with each card-off and exhausted comparisons.
7. Check Calcutta with unequal backer counts, tied teams, unbacked winner and own
   picks. Cross-foot each component and combined eight-player positions to zero.
8. Finish only after all 18 holes and parity. Reopen frozen round; verify card-off
   evidence, payment names, four-wager Story and HTML/PDF graphic/scorecards.
   Old individual and .61 no-wager records must retain their saved interpretation.

## Git

Branch codex/v31.0.62-flamtana-special from origin/main a8e2fba (PR #158).
Changes remain uncommitted. No push, merge, deploy or production migration.
Final change list: 13 modified tracked files (360 insertions, 114 deletions) and
12 new files: build notes, five immutable icons, three report fixture artifacts,
the fixture generator and two focused test files. No deleted files or whitespace
errors. Older generated references and simulation outputs restored to baseline.

## Additional 50-round stress verification

At the Product Owner’s request, 50 additional scoring-to-report scenarios pass.
Independent expected calculations validate every component; all 50 HTML reports
and PDFs render without errors or overflow. Includes 25 desktop and 25 simulated
iOS print runs. Median report rendering plus PDF generation: 725 ms;
95th percentile: 786 ms; maximum: 815 ms. No app changes needed.
See reports/FLAMTANA_STRESS_TEST_RESULTS.md for per-run PDFs, timing and limits.
The reusable runner is scripts/stress-flamtana.mjs; artifacts stay in ignored QA
storage. This adds two verification files to the prior 25-file change list.
