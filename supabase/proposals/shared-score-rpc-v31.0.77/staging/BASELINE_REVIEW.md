# Staging baseline review — October 24, 2026

October 25 update: the schema export has been supplied and reviewed. The
[prepared baseline package](BASELINE_PACKAGE.md) and locally rehearsed installer
replace the pending-export next step below. No Supabase installation has occurred.

## Finding

John supplied `Supabase Snippet Untitled query (13).csv`, captured October 24,
2026 at 6:11:46 PM ET. It contains one complete catalog JSON result. We attribute
it to the staging project John identified, `darbakmabpbkikisadop`, from the request
context; this catalog query does not itself embed or independently prove project ID.

| Audited object group | Staging | Production October 20 baseline |
| --- | ---: | ---: |
| Public application tables | 0 | 17 |
| Public columns | 0 | 169 |
| Public indexes | 0 | 31 |
| Public/Realtime application policies | 0 | 28 |
| Audited application triggers | 0 | 2 |
| Audited public application functions | 0 | 12 |
| Provider/extension functions included by query | 3 | 3 |

Staging includes only the two provider tables selected by this query, auth.users
and realtime.messages. It has no migration ledger table. This is an empty
application baseline, not a broken installation of the proposed RPC.

All 13 migrations' audited application effects are absent. This classifies the
observed schema, not historical script execution. The existing production baseline
is 10 cumulatively applied, one partial and two absent; it is not equivalent.

Prerequisites agree: pgcrypto 1.3 in extensions, digest(text,text), and the real
eight-argument RECORD realtime.broadcast_changes signature. No real service call,
authorization test, score upload or notification has been verified by this export.

## Next work: reproduce the deployed application structure

1. Obtain a fresh **schema-only public-schema export from production**, using a
   read-only schema dump. Include table structure, constraints, indexes, functions,
   RLS policies and grants. Do not export rows, passwords, roles or provider-managed
   auth/Realtime/storage schemas. Do not run migration push or schema reset.
2. Compare the dump to a fresh catalog audit before preparing a staging installer.
   Keep the production project as an export source only. A dump is more complete
   DDL evidence than attempting to reconstruct tables from this selected catalog.
3. Separately include the existing application auth-user provisioning trigger in
   the reviewed staging baseline. A public-only dump omits this trigger because it
   belongs to auth.users; its public function is in the application export. Do not
   copy or replace the auth schema or its provider triggers.
4. Prepare a staging-only installer with explicit target checks, bounded execution
   and no destructive cleanup. Review that concrete installer before execution.
   Preserve the currently absent RPC and RoundRecord foundation; do not install the
   historical RPC migration or replay all 13 migrations. Do not quietly repair the
   production baseline's known broad direct-write policies or identity grants while
   claiming baseline equivalence. Those remain separately reported findings.
5. Apply the reviewed baseline only to confirmed staging, rerun the catalog audit,
   and compare definitions, constraints, grants and policies. Provider-owned ACL
   differences must be identified separately from application differences.
6. Use new synthetic Auth accounts, devices and course/match fixtures to exercise
   baseline direct delivery. No production golfers, scores or settlements are
   needed. Then proceed through install, RPC, rollback, direct delivery and restore
   in the existing staging checklist.

The workspace currently has no authenticated database connection. Supply no
passwords or private connection strings in chat. The next required artifact is the
schema-only application SQL export; no installation SQL should run yet.
See [export instructions](EXPORT_SCHEMA.md) for the read-only capture steps.

## Retained evidence and limits

- `docs/audits/v31.0.80-staging-schema.json`: supplied catalog snapshot.
- `docs/audits/v31.0.80-staging-comparison.json`: source CSV SHA-256, object counts,
  all 13 migration classifications and attribution caveat.
- Production comparison is against the October 20 export, not a new live read.
- No app, reviewed server SQL, database, grants or user records changed.
- Prior local package result remains 1,533/1,533 tests; this follow-up changes
  evidence/documentation only. It does not establish staging/production readiness.

Supabase documents separate schema and data exports in its
[CLI reference](https://supabase.com/docs/reference/cli/supabase-db-dump).
This baseline review authorizes no production installation.
