# Automatic-RLS staging alignment — October 25, 2026

Post-install result: owner-supplied query (18) confirms all four settings groups
now match production (function line endings and ACL ordering normalized). Do not
rerun the installer. Settings alignment is complete; actual API/Auth/direct-delivery
baseline tests are next, before RPC installation. This supersedes execution-pending
language in the original preparation record below.

## Supplied settings comparison

Production and staging exports agree exactly on public schema owner/permissions
and all six default-ACL entries (postgres and supabase_admin; tables, functions,
sequences). The only difference in the supplied settings is production's
`public.rls_auto_enable()` plus enabled `ensure_rls` event trigger. Staging has
neither. This is existing production DDL behavior, not an application RPC.

The RPC proposal explicitly enables RLS on its one new ledger table. Nevertheless,
matching the production event trigger allows its CREATE TABLE/ALTER RLS sequence
to be rehearsed under the same observed automatic-RLS behavior. This alignment
does not change production or reinterpret the application baseline parity result.

Evidence: docs/audits/v31.0.80-production-settings.json,
v31.0.80-staging-settings.json and v31.0.80-settings-comparison.json. Attribution is
from the owner's labeled exports; these catalog results do not embed project ID.

## Prepared change (staging only)

`install-auto-rls-review.sql` reproduces the exact supplied function definition,
owner/grants and enabled event trigger. CREATE OR REPLACE is changed to CREATE
only, so existing definitions cannot be overwritten. It does not apply a newer
documentation example or strengthen/alter the captured function's exception handling.
It creates no application tables, changes no default privileges, touches no rows
and installs no score RPC. Existing table RLS and frozen records remain untouched.

One transaction uses five-second lock and 60-second statement timeouts. Guards
require the verified 17-table pre-RPC baseline and absent helper/event-trigger.
The session marker is operator confirmation, not independent project detection.
The PowerShell wrapper selects staging through its pinned pooler username
`postgres.darbakmabpbkikisadop`, asks for matching reference confirmation, uses TLS
and prompts for the staging password without saving it. Do not paste SQL into
production or run the baseline installer again.

```powershell
& 'C:\Projects\JJL-Golf-App\supabase\proposals\shared-score-rpc-v31.0.77\staging\run-auto-rls-review.ps1'
```

After success, rerun `provider-settings-read-only.sql` in staging and provide its
CSV. The production settings export need not be repeated unless production has
changed. Stop on any error; keep the error rather than dropping existing objects.
After a committed alignment, any reversal must be separately reviewed; no automatic
cleanup is provided that could remove a provider object created by another process.

## Verification and limits

Local PostgreSQL 18.4 rehearsal on the existing isolated 17-table baseline passed:

- Missing authorization refused before changes.
- Installed function definition matched after normalizing Windows line endings;
  owner/grants and trigger exactly matched the supplied production metadata.
- CREATE TABLE, CREATE TABLE AS and SELECT INTO each enabled RLS automatically.
- Probe tables rolled back; all 17 application tables remained.
- Re-execution refused existing objects.
- Wrapper syntax passed; local server stopped afterward.

Supabase allows its postgres user to manage event triggers through Supautils,
as described in its [event-trigger documentation](https://supabase.com/docs/guides/database/postgres/event-triggers).
The local test is not a Supautils permission test; actual staging execution and
post-change export remain pending. No Supabase SQL was executed by the assistant.
Real Auth/RLS/Realtime/client delivery, RPC and rollback gates remain unverified.

Constitutional review: reproduce existing DDL security behavior in an isolated
test project; no production authority, scoring, money or historical-fact change.
This provides no production execution approval.
