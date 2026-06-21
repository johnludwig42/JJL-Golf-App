# The Dye Ledger — Build Notes v30.3.13

Release Theme: Always know you are running the latest code.

## Changes
- Updated app version to v30.3.13 and added build label/timestamp for the PWA update reliability release.
- Versioned cache-sensitive assets in `index.html` using v30.3.13 query strings for `style.css`, `app.js`, `supabase-config.js`, and `manifest.json`.
- Updated the service worker cache name to `the-dye-ledger-v30.3.13` and versioned cached asset URLs.
- Added startup service-worker update checks through `registration.update()`.
- Added waiting-service-worker detection and a refresh banner for newly available builds.
- Added `controllerchange` handling with a one-time reload guard.
- Enhanced `window.getDyeLedgerBuildInfo()` to include update availability, active cache name, and service-worker state.
- Added `window.forceDyeLedgerUpdateCheck()` for manual update checks from the browser console.
- Expanded About diagnostics to show service-worker status, cache name, and update-available status.

## Files Modified
- `app.js`
- `index.html`
- `service-worker.js`
- `manifest.json`
- `README.md`

## Validation Checklist
- [ ] Footer/About shows v30.3.13.
- [ ] Build timestamp is visible.
- [ ] Console logs `[BuildInfo]` on startup.
- [ ] `window.getDyeLedgerBuildInfo()` returns version/cache/service-worker details.
- [ ] `window.forceDyeLedgerUpdateCheck()` runs without mutating match data.
- [ ] Service worker cache name includes v30.3.13.
- [ ] Asset URLs include v30.3.13 query strings.
- [ ] Update banner appears when a waiting service worker exists.
- [ ] Refresh Now reloads the app.
- [ ] Local-only matches still work.
- [ ] Shared Match and participant assignments still work.
- [ ] Score/stat entry still works.
- [ ] Existing saved matches load.
- [ ] Match Summary renders.
