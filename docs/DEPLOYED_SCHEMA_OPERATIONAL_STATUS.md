# Deployed schema: operational finding requiring separate rollout review

**The last supplied production catalog showed 10 migrations applied cumulatively,
1 partially applied and 2 absent. The missing score RPC was not an isolated omission.**

Evidence date: October 20, 2026, 8:21 PM Eastern. This is the retained supplied
catalog, not a fresh live database inspection. v31.0.79 changes no database objects.

| Finding | Operational consequence |
|---|---|
| August shared-score reliability migration absent | No score-operation RPC/receipt ledger, shared revision or corresponding broadcast foundation. Production uses direct uploads and polling. |
| July authoritative RoundRecord/version/amendment foundation absent | A locally frozen record does not establish that the proposed cloud immutable-version architecture is deployed. A future amendment system cannot assume these tables or controls exist. |
| Course security migration partially applied | Historical constraints/index effects are incomplete despite later course functions being present. |
| Broad member policies and extra identity-table grants | Direct score authority is weaker than the proposed RPC device contract; owner-only amendment authority cannot be inferred from the current client UI. |
| Incomplete migration ledger | Do not replay migrations merely because their ledger entries are missing. Classify actual deployed objects and cumulative effects. |

The detailed [all-13 audit](DEPLOYED_SCHEMA_AUDIT_v31.0.77.md) lists each migration,
function, policy and rollback concern. Retained evidence:

- [Supplied catalog](audits/v31.0.77-deployed-schema.json)
- [Comparison and original export hash](audits/v31.0.77-schema-comparison.json)
- [Review-only corrected delivery proposal](../supabase/proposals/shared-score-rpc-v31.0.77/README.md)

Do not apply the old RPC migration unchanged. The corrected proposal addresses the
installed digest/broadcast signatures and completed-match protection; it still needs
real Supabase auth/cache/Realtime and rollback rehearsal, fresh preflight and separate
production approval. Preserve the permanent direct-upload suite during cache-lag
fallback windows. Repository-contract tests alone are not production verification.

The narrowed v31.0.79 review/resolution feature is device-local and requires none of
these migrations. It does not repair or conceal this operational gap. The broader
[amendment proposal is parked](PARKED_ROUND_AMENDMENTS_PROPOSAL.md).
