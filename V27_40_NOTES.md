# The Dye Ledger v27.40 Build Notes

- Added AI-assisted scorecard import for PDF and image files under More → Course Library.
- Added support for importing all available tee boxes, pars, yardages, handicap indexes, rating, and slope when returned by the scorecard-import service.
- Added editable Review Imported Course workflow with confidence/uncertain-field messaging.
- Imported courses save locally first and integrate with Sync Course Library.
- Preserved offline-first behavior and all existing scoring, payout, saved-match, and PDF functionality.

Note: AI extraction requires a configured `scorecard-import` service. The PWA gracefully falls back to manual course entry if the service is unavailable.
