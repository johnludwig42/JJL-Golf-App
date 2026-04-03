# The Dye Ledger

Version: v22.6

Baseline: v22.5

This build focuses on stabilizing game setup player selection and cleaning up app assets.

Updates in v22.6:
- reworked the Game Setup player picker so tap-to-select player cards use a more reliable draft-state flow
- preserved the same on-screen player-card + search-sheet presentation while simplifying the underlying assignment logic
- cleaned the icon asset structure back to canonical filenames (`icon-192.png`, `icon-512.png`, `apple-touch-icon.png`)
- removed duplicate versioned icon files from the build
- updated the manifest, service worker cache, and in-app versioning to v22.6
- refreshed the README so each build records the current version and what changed
