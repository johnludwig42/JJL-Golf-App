# Obtain the application schema without copying round data

This exports structure from production; it installs nothing anywhere.

1. In Supabase, open **production**, reference `ueallqqmdyzwdlmoyxfo`.
2. Open **Connect** and choose the **Session pooler** connection. Note its host
   and user; the user should identify that project. Use port 5432. Do not use the
   transaction pooler on port 6543. Keep the database password private.
3. Open PowerShell on this computer and copy the following block. It uses the
   already-installed PostgreSQL tool, not Docker. Enter the host and user when
   asked, then enter the password only at the tool's password prompt.

```powershell
$schemaHost = Read-Host 'Production Session pooler host'
$schemaUser = Read-Host 'Production Session pooler user'
if ($schemaUser -ne 'postgres.ueallqqmdyzwdlmoyxfo') {
  throw 'Unexpected source project/user. Stop and check the production Connect panel.'
}
& 'C:\Program Files\PostgreSQL\18\bin\pg_dump.exe' --host $schemaHost --port 5432 --username $schemaUser --dbname postgres --password --schema-only --schema public --no-owner --file 'C:\Projects\JJL-Golf-App\tmp\report-qa\shared-staging\production-public-schema.sql'
if ($LASTEXITCODE -ne 0) { throw 'Export failed. Do not use the partial SQL file.' }
```

4. Attach the resulting `production-public-schema.sql` for review. Do not run its
   contents in either SQL Editor. It contains application DDL and grants, not
   table rows. If the command fails, share the error with passwords/connection
   strings removed; do not reset the database or change permissions to make it run.

The export intentionally omits provider schemas and the application trigger on
auth.users. We already captured that trigger's definition in the catalog audit and
will include it separately in the reviewed staging baseline. A fresh catalog
comparison is still required before baseline execution.

Connection reference: [Supabase's documented session-pooler format for pg_dump](https://supabase.com/docs/guides/platform/migrating-to-supabase/postgres).
