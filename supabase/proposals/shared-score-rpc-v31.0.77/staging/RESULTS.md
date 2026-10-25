# Staging preparation results — October 24, 2026

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
