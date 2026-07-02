# The Dye Ledger v30.3.36 — iPhone Modal & Save Round Layout Hotfix

## Summary
Focused iPhone rendering hotfix release that polishes the Save / End Round area and repairs the End Round Early modal layout without changing scoring, payout, handicap, AI Recap, Round Snapshot, Featured Competition, Match Templates, Round Readiness, or Supabase behavior.

## Root Cause Analysis
- The End Round Early modal reason choices inherited the app-wide `input { width: 100%; }` rule, which caused radio controls to expand across their cards on iPhone. The global `label span` rule also made reason labels render like small muted field labels rather than option text.
- The Save / End Round area lived inside the Share / Save PDF export card with multiple nested rounded containers and prior `overflow: visible` rules. On iPhone Safari, child card fragments could paint outside the parent card boundary, creating a phantom rounded white tab along the left side.

## Layout Changes
- Added scoped containment for the scoreboard export card, Save / End Round action container, missing-score warning, and post-round inline containers.
- Ensured nested action containers and children remain inside their card boundaries using `box-sizing`, `max-width`, `overflow`, `isolation`, and `contain` where appropriate.
- Reworked End Round Early reason choices into a mobile-first single-column touch-card layout with a safe two-column layout on wider screens.
- Scoped radio button resets to the round-end modal so the reason cards no longer inherit full-width text-input styling.
- Added reason-label overrides so labels wrap naturally, remain visible, and support longer labels.
- Improved iPhone modal sizing, scrolling, and button stacking for safe-area-friendly rendering.

## Shared Component Review
Reviewed shared card, modal, expandable section, and scoreboard/export container styling for the same defect pattern. The fix is scoped to the affected shared patterns rather than hard-coded to the screenshot dimensions.

## Verification
- `npm run test:money` passed.
- `npm test` passed.
- `npm run validate` passed.
- Confirmed v30.3.36 version references in app metadata, service worker, manifest, package metadata, footer, and current-version display.
- Confirmed only `BUILD_NOTES_v30.3.36.md` is present in the release ZIP.

## Files Changed
- `app.js`
- `service-worker.js`
- `index.html`
- `style.css`
- `manifest.json`
- `package.json`
- `package-lock.json`
- `BUILD_NOTES_v30.3.36.md`
