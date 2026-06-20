# The Dye Ledger — Build Notes v30.3.12

Release Theme: Know exactly what version is running, and make desktop scrolling work normally.

Build timestamp: 2026-06-20 23:52 UTC

## Changes

- Added build metadata constants for `APP_VERSION`, `BUILD_TIMESTAMP`, and `BUILD_LABEL`.
- Added visible build/cache details in the App notes / More area and footer.
- Added startup console logging under `[BuildInfo]`.
- Added `window.getDyeLedgerBuildInfo()` for runtime version, URL, service worker, and cache inspection.
- Added `window.getDyeLedgerScrollInfo()` for manual scroll/layout diagnostics.
- Restored normal document scrolling for desktop mouse wheel and trackpad use.
- Preserved sticky app chrome/header behavior without reintroducing a fixed main scroll container.
- Updated service worker cache name and manifest version references to v30.3.12.

## Files Modified

- `app.js`
- `index.html`
- `style.css`
- `service-worker.js`
- `manifest.json`
- `README.md`

## Validation Checklist

- [ ] Footer/About shows v30.3.12.
- [ ] Build timestamp is visible.
- [ ] Console logs `[BuildInfo]` on startup.
- [ ] `window.getDyeLedgerBuildInfo()` returns build/cache/service worker details.
- [ ] `window.getDyeLedgerScrollInfo()` returns scroll/container diagnostics.
- [ ] Desktop mouse wheel and trackpad scrolling work.
- [ ] Scrollbar still works.
- [ ] Header/tabs remain visible.
- [ ] iPhone score inputs still focus.
- [ ] Shared Match participant-based assignment from v30.3.11 still works.
