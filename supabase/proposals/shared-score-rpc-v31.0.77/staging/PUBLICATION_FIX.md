# Staging publication compatibility correction — October 25, 2026

Owner approved this correction after the live 23502 finding. Committing the audit
notes first is not a technical prerequisite; retain them with this correction.
Application remains v31.0.81. No production execution is authorized.

## Exact change

The existing owner-publication RPC builds a whole `matches` row from client JSON.
New required server fields were explicitly null, so defaults were bypassed. The
reviewed correction adds only these initializations before the existing INSERT:

```sql
v_match.shared_revision := 0;
v_match.shared_scores_closed := false;
```

Existing rows still use ON CONFLICT DO NOTHING. Their revisions and closure state
are never reset. The existing BEFORE trigger still closes a new row whose status
or frozen metadata says completed. Account checks, authority, signature, ownership,
grants and all five delivery functions remain unchanged. The transaction replaces
only this function; it performs no match/score/receipt update or deletion.

`publication-fix-review.sql` refuses missing operator authorization, a non-staging
marker, a missing installed foundation, and any publication body different from
the audited original. This includes refusing repeat application rather than
overwriting an unknown state. A post-replacement body check must pass before COMMIT.
The runner pins the staging project and reviewed SQL hash; the new SQL file uses
an explicit LF checkout attribute so Git cannot invalidate that byte fingerprint.

## Run the approved staging correction

Run in PowerShell; enter only the **staging database password** at psql's prompt:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Projects\JJL-Golf-App\supabase\proposals\shared-score-rpc-v31.0.77\staging\run-rpc-review.ps1" -Action PublicationFix -SessionPoolerHost aws-1-us-east-2.pooler.supabase.com -ProjectRef darbakmabpbkikisadop
```

Do not rerun Install or the original migration. The correction emits metadata-only
before/after CSVs in a new `rpc-publication-fix-*` evidence folder. Stop and share
the four CSV files and terminal result. A reported failure may occur after COMMIT;
retain outputs and audit before retrying. Keep passwords and tokens private.

After catalog verification, retry the existing local Staging RPC Rehearsal match;
its setup need not be entered again. Then resume real RPC delivery, receipts,
Realtime, closure, rollback/restore and two-phone verification. This correction
does not itself satisfy any of those service gates.

## Local verification and limits

- **90 SQL assertions passed**: existing delivery/closure/rollback assertions plus
  publication regressions in a fresh disposable PostgreSQL 18.4 cluster.
- Reproduced the original error and checked its failing column was shared_revision.
  Verified fresh publication, active membership, ignoring client-supplied initial
  revision/closure, unchanged active revision 17, unchanged completed revision 23
  and frozen metadata, new completed-row closure, account/guest/device/code checks,
  and publication after RPC rollback/restore.
- Correction preserved nonempty receipt history, every score/match row, function
  ACL and all five delivery definitions. Three separate SQL refusal checks passed:
  missing authorization, wrong target marker, already-corrected source body.
- Runner/preflight: **22/22 passed**, zero skips/failures. Lint has zero errors and
  88 existing warnings; release validation passes. No application-runtime change;
  full app/layout/stress suites not repeated (last .81 suite: 1,536/1,536).
- Local auth and Realtime are test substitutes; these are SQL compatibility tests,
  not a claim of real Supabase service behavior. The disposable server is stopped.
  Staging application of this correction remains pending the operator's password.

The original Install/Rollback/Restore SQL files and their fingerprints are unchanged.
Future server schema changes must repeat publication compatibility tests: the old
whole-composite insert pattern remains sensitive to new required fields. A broader
refactor is outside this approved narrow correction. Any eventual production
package must include the publication correction and receive separate approval.
