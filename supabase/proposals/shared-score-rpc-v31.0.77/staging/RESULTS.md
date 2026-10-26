# Staging preparation results — October 24, 2026

October 26 staging publication correction applied and audited; DYE-119214 completed
18/18 through host/remote UI with operation receipts, zero pending and confirmed
parity. Remote exited on host completion; seven-page Ledger accepted after saving
verified facts-only Story. Settlement matches earlier direct-upload baseline.
See docs/audits/v31.0.81-staging-rpc-live-rehearsal.md for evidence and remaining
gates. AI Story unavailable; private Realtime, failure/authority/batch/closure
matrices and hosted rollback/restore remain unverified. Production unchanged.
This supersedes the earlier publication-blocked/pending-application notes below.

October 25 owner approved the publication correction; prior audit notes need not
be committed before proceeding. Prepared staging-only publication-fix-review.sql
and runner PublicationFix action. Fresh local PostgreSQL 18.4 reproduction confirms
23502 names shared_revision; corrected real publication body passes 90 combined
SQL assertions, including nonempty receipt/score preservation, active/completed
republish and all existing delivery/closure/rollback cases. Three SQL refusal
checks pass; local server stopped. Runner/preflight 22/22 pass; lint zero errors,
88 existing warnings; validate passes. No runtime app change or full-suite repeat.
See PUBLICATION_FIX.md. The correction has NOT yet run on staging; operator local
database password is the next step. Production untouched and unapproved.

October 25 operator installation confirmed by four supplied before/after CSVs:
all five function bodies match reviewed SQL; receipt RLS/grants, both new match
columns, three enabled triggers and private-topic policy are present. Existing
audited definitions/privileges unchanged. Anonymous API returned 401/42501 rather
than PGRST202. These are structural/visibility checks only.

LIVE BLOCKER: fresh synthetic Staging RPC Rehearsal (DYE-119214) cannot publish;
23502 on initial publication and three coordinated retries. Existing owner RPC
populates null::matches then inserts the whole composite; newly added NOT NULL
shared_revision is absent from client JSON and explicitly null, bypassing default.
Prior local fixtures did not exercise this compatibility path. No score receipts
or authenticated delivery result. Proposed narrow publication correction awaits
review; no SQL fix applied. RPC rollback alone retains the incompatible columns.
See docs/audits/v31.0.81-staging-rpc-install-review.md and comparison JSON.
Baseline accepted round intact; new round retained locally with no scores entered.
Production untouched; no production rollout ready.

October 25 staging RPC rehearsal authorized. Prepared run-rpc-review.ps1 and
RPC_REHEARSAL.md: fixed staging project/username, TLS, unchanged reviewed SQL
fingerprints, one explicit Install/Rollback/Restore phase, structural checks and
metadata-only before/after CSV evidence. Tested preparation of all three phases,
production/invalid-host/invalid-action refusal and altered-SQL refusal. New runner
tests 7/7 plus existing preflight tests 14/14 = 21/21 passed, no skips. Windows
PowerShell parser passed. Preparation made no database connection. Real install
and service verification still await the operator's local password entry; no
staging or production SQL executed by this step. App remains committed v31.0.81;
no full application suite repeated for this tooling-only addition (last 1,536/1,536).

October 25 approved acceptance correction, v31.0.81: buildLedgerEntryReportModel
now carries the authoritative effective RoundRecord meta.status. Three new tests
verify final/provisional behavior, unchanged source evidence, and actual report
acceptance. Existing staging host round reopened from Library with its saved
Story; Accept & Finalize succeeded. UI displayed Accepted and frozen, and host
still displayed Ledger finalized / Accepted and ready after reload. Printed #doc
text matched the old report exactly; seven pages, unchanged scores and settlement.
No scores or Story re-entered. Prior acceptance blocker is resolved locally.
Final .81 suite: 1,536/1,536 passed (633.8 seconds, no skips/failures), lint
zero errors/88 existing warnings, validate and seven layout references passed,
legacy Flamtana stress 50/50, simulation comparison 77/77 exact, simulation
tests 4/4. Full gate caveats and unchanged-reference policy are in .81 build notes.

Additional observation during Library review: two completed entries have the same
test name and shared code; only the host copy contains the saved Story. This was
visible before acceptance and has not been diagnosed or changed. Keep it separate
from this one-line adapter fix. Remaining delivery/RPC/two-phone gates below stand.

October 25 full-round direct-upload UI rehearsal (supersedes one-hole limit below):
host scored T1/T2 and remote scored T3/T4 through all 18 holes. Synthetic gross
scores were 4/5/6/7 every hole: totals 72/90/108/126, off-low game nets
72/84/96/108. Both origins reloaded after nine holes; the saved round, assignments,
acknowledgement/parity indicators and zero pending counts recovered. This is reload
recovery, not a controlled offline/lost-ack test. Full-card sync reached 18/18 and
host completion succeeded. Remote automatically returned to Create/Join Match.

Story service was unavailable; the documented facts-only fallback generated and
saved. Save Story & Preview Ledger opened a seven-page report. Big Game pool
$160 paid $112/$48; Calcutta pool $160 went to T1's two backers. Per-player net
settlement was +136/+136/-16/-16/-40/-40/-80/-80, summing to zero; seven payments
totaled $272. These independently match the synthetic fixture's five components.
This is not a byte comparison against the historical v31.0.62 stress baseline.

BLOCKER FOUND, NOT FIXED: report acceptance is disabled with "Complete round to
accept" despite successful round completion and saved Story. buildLedgerEntryReportModel
constructs report.meta without status; the preview path adds Story fields but not
status. ledger-report/report.js requires meta.status === 'final' to enable
Accept & Finalize. The report renders final Flamtana results but cannot be accepted.
Recommend carrying the authoritative RoundRecord status into report metadata,
with behavioral coverage for completed and provisional rounds, then repeating this
acceptance step. No runtime fix authorized/applied during this verification.

Remaining gates: controlled interrupted delivery/lost acknowledgements, auth failure
recovery, outsider/guest authority, RPC installation/Realtime/cache lag/closure races,
rollback/restore and physical two-phone acceptance. Staging-only test data changed;
production untouched. The baseline is not ready to declare fully verified.

October 25 signed-in direct-upload baseline: second loopback instance signed in
to the same staging account, joined the synthetic round, and downloaded course,
all eight golfers and four team names. Host assignment of G5–G8 propagated to the
remote instance; G1–G4 remained assigned to host. Balanced Calcutta picks were
saved and Start Scoring succeeded. Host entered teams 1/2 and remote entered
teams 3/4. After synchronization, both Quick Scoreboards showed one common hole:
team net totals 4/4/5/6 (gross 4/5/6/7), group 1 tied, group 2 led by team 3,
and foursome totals 4/5. Direct-upload disclosure remained visible. This proves
one-hole bidirectional UI delivery on the deployed staging baseline; it does not
prove operation receipts, failure recovery, 18-hole completion, RPC or rollback.
No production changes. Two separate local origins are not two physical phones.
Earlier pending sign-in/join/assignment/pick notes below are superseded.

October 25 live staging UI progress: user confirmed durable sign-in and completed
the Staging Host identity. Created a local synthetic 18-hole Staging Test Course /
Test White tee (72.0/113, 7,200 yards), eight Test Golfer records with indexes
4/8/10/14/16/20/22/26, and four paired teams with assigned indexes 6/12/18/24.
Course, Players and Games all showed Ready. Owner publication of Staging Sync Test
then succeeded in the actual staging app: Shared Match host panel showed Direct
upload and confirmed parity on the initially empty card. This is an initial
publication/refresh result, not a score-delivery or finalization result.

A second loopback preview on port 5088 provides separate origin storage/device
identity for same-account remote-scorer testing. User sign-in there is pending.
Calcutta picks, remote join, foursome assignments, scores, retries, settlement and
RPC/rollback remain pending. This is two local browser instances, not physical
two-phone acceptance. No production data/round was imported or changed.

Preview handoff correction: after the user reported successful helper login, the
main Account UI still showed Signed out. The helper used the SDK default session
key instead of the app's custom key. It now derives ACCOUNT_AUTH_STORAGE_KEY from
the unchanged identity module. An isolated, mocked browser test verifies login
handoff into main Account UI and persistence across reload, zero production calls.
Real-user re-login/confirmation remains required before any signed-in scoring test.

October 25 local preview: separate loopback staging copy and password sign-in
page prepared, with production-target refusal, 41/41 asset checks, five private-path
404 checks and temporary-browser rendering/mocked-auth checks passing. Production
runtime files unchanged; no real Auth write made. User sign-in is now the next
step. See LOCAL_PREVIEW.md for URL, restart command and verification boundaries.

October 25 live anonymous API preflight: staging Auth health returned 200;
zero-row matches access without a user session returned 401/42501 (expected
anonymous denial); empty RPC validation returned 404/PGRST202 (RPC still absent).
Auth public settings show email enabled, confirmation required, guest sign-in
disabled. Sanitized evidence: docs/audits/v31.0.80-staging-api-preflight.json.
No scores, users or emails were created/sent. This verifies API reachability and
anonymous denial only, not signed-in delivery, authority, retries or parity.
User supplied staging Users screenshot; listed example.test accounts cannot
receive email sign-in codes. A reachable email account for normal app sign-in
is the next setup dependency; no private password/session token is requested.

October 25 query (18): the supplied post-alignment provider_settings export now
matches production across schema owner/permissions, all six default ACL entries,
automatic-RLS helper definition/owner/grants and enabled ensure_rls trigger.
Only Windows line endings and ACL ordering are normalized. Evidence:
docs/audits/v31.0.80-staging-aligned-settings.json and the postAlignment section in
docs/audits/v31.0.80-settings-comparison.json. No further baseline/settings installer
run is needed. Next is real staging API/Auth/direct-upload baseline verification;
the staging publishable key is not configured yet. RPC and production remain
unchanged; service delivery/Realtime/rollback/two-phone gates are not verified.

October 25 settings comparison: schema owner/permissions and all six default ACLs
match. Production alone has rls_auto_enable()/ensure_rls. A staging-only alignment
package is prepared and locally tested (three DDL paths, refusal guards, exact
helper/trigger metadata). See AUTO_RLS_REVIEW.md and
docs/audits/v31.0.80-settings-comparison.json. Actual staging alignment is pending.

October 25 post-install verification: John supplied query (16), captured
2026-10-25 11:53:43 UTC. The staging application catalog matches the captured
production baseline with zero differences across 17 tables/ACLs/RLS settings,
169 columns, 58 application constraints, 31 indexes, 28 policies, 12 functions
(bodies/security/signatures/grants) and both application triggers. Evidence:
docs/audits/v31.0.80-staging-installed-schema.json and
docs/audits/v31.0.80-staging-installed-comparison.json. Baseline installation is
confirmed by this supplied catalog. RPC remains absent as intended. Provider
settings comparison, real service delivery and all later RPC gates remain pending.
This supersedes the pending-baseline statements in historical preparation notes.

October 25: production schema export reviewed; staging baseline installer prepared
and rehearsed locally. See BASELINE_PACKAGE.md and
docs/audits/v31.0.80-baseline-export-review.json for exact comparison counts.
The user's first staging installation attempt failed before COMMIT on residual
provider-function GRANT statements. These are corrected and locally tested with
the helper absent/present, including rollback and ACL preservation. No successful
Supabase installation or real-service verification has been confirmed.

Client baseline: v31.0.80 / `2519e0e`.
Branch: `codex/shared-match-staging-verification`.
Owner-confirmed staging: `darbakmabpbkikisadop`.

## Local checks completed

| Check | Actual result |
| --- | --- |
| New preflight behavioral tests | 14/14 passed |
| Full test suite | 1,533/1,533 passed; 0 failed, skipped or cancelled; 630.216 seconds |
| Lint | 0 errors; 88 existing warnings |
| Release validation | PASS for unchanged v31.0.80 metadata, assets, syntax, worker lifecycle and required documentation |
| Release sanity | 6 PASS, 3 WARN, 0 FAIL; warnings are uncommitted work and omitted release-target argument checks |
| Guarded offline plan | PASS; confirmed staging target, 13 migration fingerprints, all nine service gates NOT_RUN |
| Read-only prerequisite SQL | Executed successfully in the existing isolated PostgreSQL 18.4 rehearsal database; transaction committed without writes and server stopped afterward |
| App and reviewed server SQL diff | No changes to app.js, identity-security.js or reviewed install/rollback/restore SQL |

The first full-suite attempt was interrupted because the sandbox denied localhost
connections used by browser tests. The final complete run above had localhost
access. The new preflight tests were also rerun separately after its fingerprint
inventory was finalized.

Local ignored evidence: `tmp/report-qa/shared-staging/plan.json`,
`preflight-tests.log`, `full-tests.log`, `local-sql-preflight.log`. The local target
configuration is ignored too. No credentials are stored in the package or reports.

## Not yet verified

No Supabase service probe, staging installation, real Auth/RLS/Realtime delivery,
completion race, rollback/restore or physical two-phone rehearsal has run.
The supplied staging catalog has now been compared: all 13 migrations' audited
application effects are absent; there are no public application tables. See
BASELINE_REVIEW.md and docs/audits/v31.0.80-staging-comparison.json. A reviewed
schema-only application baseline is required before installation. Fresh production
catalog evidence also remains required for the eventual rollout comparison.

Layout references, stress50 and simulation gates were not rerun for this tooling
and documentation package; no runtime scoring/rendering or release identity changed.
Their earlier v31.0.80 results are historical evidence, not new staging evidence.

**Production readiness: NOT ESTABLISHED.** Nothing was committed, deployed or run
against production. No staging SQL was applied. Production execution still requires
separate approval after the service verification matrix in README.md is complete.
