# The Dye Ledger v31.0.61 — Two-man Scramble

## Scope

Adds an explicit Two-man Scramble setup option for eight golfers, four two-player
teams and 18 holes. Requires assigned team indexes, common partner tees and a
Shared Match using assigned-player scoring. T1 + T2 use one device; T3 + T4 use
another. Creation, joining and assignment remain available before Start. Start
and score writes require a complete valid assignment. All scoring devices must
run .61 or newer; older installed clients cannot be retroactively blocked.

Classic displays one score control per team and uses the existing Play controller,
local save and authority-scoped Shared Match outbox. A team edit validates team,
hole, score and both partners before changing either score. Clear writes both
partners to blank. Absent controls preserve scores. An untouched unequal pair
stays pending; only deliberate entry or clear resolves it. Separately arriving
partner writes are unresolved until equal. They cannot complete a hole or freeze
a settlement. Team totals count one shared-ball score and advance separately
from whole-field completion. Course Net uses signed full Course Handicap.

Additive teamScoringPolicyVersion metadata survives local saves and cloud
hydration. Frozen RoundRecords mark team-scored facts and individual statistics
ineligibility. Individual capture, averages, distributions, signature statistics,
best-ball partnership attribution and handicap posting do not apply. Reports
use four team entries, preserve partner membership and omit individual awards,
statistics and adjusted posting totals. Existing frozen records are preserved.

Format, roster, tees and assigned indexes are fixed once scoring starts. Stories
use deterministic summaries of saved team scorecards, with no generated individual
accolades. Classic identifies each team index and Playing Handicap; Setup explicitly
labels Foursome 1 and Foursome 2.

Player Mode, individual stats, configurable foursomes and general scramble
variants are deferred. Scramble games are unselected in .61; the four Flamtana
wagers belong to .62. No SQL migration, new account requirement or production
deployment is included.

## Constitutional review

Proposal: Two-man Scramble, v31.0.61; Product Owner John; October 10, 2026.
Implementation authorized by “Done. Let's go ahead and start with v31.0.61.”
Direct: principles 6 (RoundRecord), 7/8 (facts versus derived analytics), 10/11/12
(historical and frozen integrity), 22 (finality). Shared-ball facts retain their
format and cannot enter individual statistics. Inconsistent pairs block finality.
Indirect: 2/5 (roles and owner authority), 16 (Golfer Identity). Existing owner,
assignment and identity contracts remain; the team is a round-specific grouping.
No completed-record rewrite, Event Record change, membership/attendance change,
privacy operation, deletion or Amendment Session. No conflict identified.

## Verification

Focused engine checks (8) and browser checks (2) pass. The full regression suite passes
1,349/1,349 checks. Release validation passes; lint has zero errors and 88 existing warnings.
All six standard report layouts pass. The scramble report renders four pages with
no overflow or individual statistics. Simulation comparison has 77 exact matches,
zero differences and zero failures (64 warnings and one suspicious outcome).
Simulation tests pass 4/4. Release sanity has six passes, three development warnings
and no failures. Physical iPhone and real two-device cloud acceptance remain pending. Automated local recovery and hydration checks do not prove live
cloud operation or cross-device concurrency.

## Manual acceptance

1. Update both scoring devices to .61 or newer. Choose Two-man Scramble, four
   teams/two partners, 18 holes, assigned indexes and Shared assigned-player mode.
2. Leave games unselected. Create, join and assign before starting. Verify Start
   blocks missing assignments, split partners/foursomes and both groups on one
   device; assign T1/T2 together and T3/T4 together on a different device.
3. Start and confirm one Classic row per team, appropriate device authority and
   signed team Course Net. Compare Larger Text and both appearances on iPhone.
4. Score the foursomes on different holes. Each team advances independently;
   whole-field completion waits for all four teams. Save and reopen both devices.
5. Correct and explicitly clear a team score. Both partners must agree after
   synchronization; missing controls must leave other teams' cards untouched.
6. Save offline, reload, reconnect and retry. Verify both partner cards and device
   parity. An unequal/partially arriving pair must remain pending and block finish.
7. Reassign both teams in a foursome together through the existing assignment
   controls. Writes must pause during invalid assignments; previous-device stale
   writes must not replace the new scorer's authoritative scores.
8. End the round after all scores and parity are complete. Inspect team scorecards,
   frozen format marker and exported report. No individual stats, accolades or
   handicap posting interpretation should appear. Preserve an old individual round.

## Implementation review

The Play controller validates both partners before writing, then queues ordinary
per-player operations. Tests cover correction, clear, retry, saved reload, partial
pairs, independent team completion, frozen metadata, offline queue recovery and
stale writes after reassignment. Browser checks exercise host and joined-device
authority, setup draft recovery, narrow screens and larger text. Existing scoring
and frozen-record behavior remain covered by the regression suite.

Changed areas: app/setup/Shared Match/report behavior, release metadata and icons,
focused engine/browser fixtures, project context and priority documents. Generated
reference reports and simulation output are excluded from the release changes.

## Git

Branch codex/v31.0.61-two-man-scramble from origin/main e9126e1, after .60 merged
in PR #157. Changes are uncommitted for review. .62 and all later roadmap work
remain outside this release.
