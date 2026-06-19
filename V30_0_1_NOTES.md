# The Dye Ledger v30.1 – Shared Match Assignment Reliability Fix

Focused reliability release for shared-match player assignments.

## Fixed

- Joined devices now register with a stable shared device identifier in existing Supabase membership metadata.
- Host devices now merge participant/device records from both shared-match metadata and match membership rows.
- The host Player Assignments panel can surface joined devices as assignment targets after they join.
- Shared Match panel now displays participant count and a clearer waiting message when only the host device is present.
- Sync Now also refreshes participant/device information after syncing.
- Host devices periodically refresh participant information while the app is visible, so joined devices can become assignable without an app refresh.

## Root Cause

In v30.0, assignment targets were rendered from local `sharedDevices` metadata. A joined device could load the match successfully, but the host did not reliably refresh and merge the joined device record back into its local active match. As a result, the host assignment UI often continued to show only Host Device.

## Supabase

No schema changes were made. v30.1 reuses existing tables and stores device identity metadata in the existing `match_memberships.device_label` text field.

## Guardrails

No changes were made to scoring, handicap calculations, Nassau logic, Match Summary calculations, Final Net Settlement calculations, stat calculations, Course Library schema, or localStorage key structure.
