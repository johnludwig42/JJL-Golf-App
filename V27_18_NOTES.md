# The Dye Ledger v27.18 Build Notes

## Scope
Surgical fix for the Create New Match confirmation workflow only.

## Changes
- Updated the active-match confirmation path so confirming **Create New Match** directly starts a clean new-match setup draft.
- Added/strengthened `startCleanNewMatchSetup()` as the single clean-slate reset path.
- Preserved a compatibility wrapper for older reset calls while routing them through the same helper.
- Prevented the confirmed Create New Match action from re-entering the new-match decision tree or branching on match completion status after the user has already confirmed.

## QA Summary
- Verified JavaScript syntax with `node --check app.js`.
- Verified version markers updated to v27.18.
- Verified prior v27.17 build notes were removed from the package.
