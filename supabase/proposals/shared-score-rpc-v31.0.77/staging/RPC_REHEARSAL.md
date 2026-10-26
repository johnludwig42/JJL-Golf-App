# Staging RPC rehearsal — October 25, 2026

**Current: installation completed; do not rerun Install.** Supplied audits match
the reviewed SQL, but actual owner publication fails 23502 after the schema
extension. Owner approved the narrow correction, now locally tested. Follow
[PUBLICATION_FIX.md](PUBLICATION_FIX.md) with `-Action PublicationFix`; staging
application is still pending. Do not attempt rollback as a substitute.

Owner authorized proceeding with the staging rehearsal after committing v31.0.81.
Production remains unapproved. Existing baseline and provider settings are installed;
do not reinstall them or run the historical August migration.

The direct-upload round and saved Ledger acceptance passed. Controlled network
interruptions, outsider/guest authority, duplicate Library entries, private Realtime,
closure races and physical-phone gates remain open. Staging installation lets us
test the proposed contract; it does not waive these production readiness gates.

## Run one phase at a time

Use PowerShell on this computer. The current approved next step is:

```powershell
& 'C:\Projects\JJL-Golf-App\supabase\proposals\shared-score-rpc-v31.0.77\staging\run-rpc-review.ps1' -Action PublicationFix
```

Enter the **staging** Session pooler hostname from its Connect panel, confirm
`darbakmabpbkikisadop`, then type the staging database password locally. Password
characters are invisible. It is not the app sign-in password. Do not send it here.
If local script execution is restricted, use the same command through a fresh
`powershell -NoProfile -ExecutionPolicy Bypass -File` invocation for this reviewed
local script only; no persistent execution-policy change is needed.

The runner pins the project/username, uses TLS, fingerprints the unchanged reviewed
SQL, and captures metadata-only before/after CSV audits in an ignored unique folder
under `tmp/report-qa/shared-staging/rpc-install-*`. It does not read golfer/score
rows into those exports, store the password or configure production.

Install adds the operation ledger, RPC, revision field, monotonic closure protection
and private notification policy/trigger. Existing completed staging matches become
closed to changed scores; identical retries are no-ops. Rollback retains that
protection and all delivery history. No existing test round needs reopening.

After success, stop and share the four CSV files plus terminal outcome. A failure
can occur after the installation COMMIT: do not assume everything rolled back and
do not blindly retry. Retain evidence and re-audit.

## Verify before rollback

Review the post-install catalog; check actual API visibility and private Realtime.
Use a **new synthetic round**, keeping the accepted baseline round intact. Verify
bidirectional RPC delivery, immutable retry receipts, pair-aware 64-operation
batches, authority, closure on both RPC and direct paths, and recovery/preservation.
Use the complete matrix in README.md; record unsupported/unrun cases honestly.

Only after installed-path evidence has been captured, run the same runner with
`-Action Rollback`, review its audit and direct-fallback behavior, then
`-Action Restore` and verify receipts/notifications resume. The runner never
automatically chains phases. Each action uses the corresponding existing reviewed
SQL; it does not substitute old migrations or destructive rollback scripts.

## Local-only preparation

`-PrepareOnly -SessionPoolerHost <staging-pooler-host> -ProjectRef darbakmabpbkikisadop`
generates the driver/audit paths without connecting. This is not evidence of a
successful installation. Actual database execution and service behavior must be
recorded separately. No production rollout is ready merely because SQL commits.
