# The Dye Ledger v30.3.21 Build Notes

## Release Theme
Stop debugging stale builds.

## What Changed
- Centralized app version, cache name, and build date metadata around a canonical `BUILD_INFO` object.
- Updated app version and cache references to v30.3.21.
- Improved service-worker activation by calling `skipWaiting()` during install and `clients.claim()` during activation.
- Limited old-cache cleanup to The Dye Ledger app caches.
- Added stale URL version cleanup so old `?v=` parameters do not linger as misleading diagnostics.
- Added version consistency diagnostics for URL version, app version, cache version, and page-control state.
- Hardened More tab App Updates diagnostics so stale build/cache states are clearer and actionable.

## Guardrails
- No scoring, game, settlement, handicap, Course Library, Supabase, Shared Match, or saved-match data model changes.
- Reset App Cache remains limited to app shell/cache assets and service-worker registrations; it does not clear localStorage user data.
