# The Dye Ledger v27.15 Build Notes

## Scope
UX + lifecycle clarification release for the Game Setup tab. No scoring, payout, PDF/export, or Classic Scorecard rendering logic was intentionally changed.

## Changes
- Renamed the top Game Setup actions to: Create New Match, Edit Match, and Finalize Match Setup.
- Renamed the bottom duplicate setup submit action to Finalize Match Setup.
- Kept Create New Match as a setup reset/start action only; Finalize Match Setup remains the create/update action that proceeds to Scoring Input.
- Updated Game Setup action button states so Edit Match is disabled when no active match is loaded and shows an active/editing state while editing.
- Forced the three primary Game Setup buttons into a single equal-width row with consistent sizing, font treatment, spacing, wrapping, and mobile-safe behavior.
- Updated setup feedback and error wording to match the clarified lifecycle.
- Incremented the app version and service worker cache to v27.15.

## QA Summary
- Static syntax check completed with `node --check app.js`.
- Verified v27.15 version markers in app.js, index.html, and service-worker.js.
- Verified Game Setup button labels are updated in index.html and runtime label synchronization in app.js.
- Verified CSS includes the v27.15 equal-width three-button row overrides for desktop and iPhone-sized screens.
