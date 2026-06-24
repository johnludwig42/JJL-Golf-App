# The Dye Ledger v30.3.23 Build Notes

Focused regression-fix release for Match Setup finalization.

## Changes

- Added structured Match Finalization diagnostics around the Start Scoring / Match setup save flow.
- Replaced the generic "Could not finalize match setup" failure with actionable missing-requirement messaging.
- Added a read-only, collapsed Match Setup Diagnostics section in the More tab.
- Added validation state details for course selection, tee selection, player count, selected holes, shared-match status, assignment status, and match finalization readiness.
- Hardened match setup validation so local matches do not require Shared Match assignments and active-round checks do not block round creation.
- Added console diagnostics for future match setup failures.
- Added a narrow safety fix for existing-match player lookup during finalization.
- Updated version, cache, service-worker, asset references, and visible build metadata to v30.3.23.

## Guardrails

- No scoring logic changes.
- No settlement logic changes.
- No handicap calculation changes.
- No Supabase schema changes.
- No Course Library changes.
- No Shared Match architecture changes.
- No saved-match/localStorage compatibility changes.
