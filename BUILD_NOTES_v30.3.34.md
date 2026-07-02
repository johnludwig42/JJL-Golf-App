# Build Notes v30.3.34 — Featured Competition & AI Recap Upgrade

## Summary

v30.3.34 adds a formal Featured Competition setup field and uses it as the storytelling anchor for Round Snapshot and AI Round Recap presentation. This release preserves scoring logic, payout math, handicap logic, Supabase schemas, saved-match compatibility, money math tests, and the v30.3.33 print/page-break polish.

## Featured Competition

- Added a Match Setup control named Featured Competition.
- Defaults new and older matches to Auto.
- Available choices include Auto, None / Social Round, Stroke Play — Low Net, Stroke Play — Low Gross, and selected games such as Nassau, Singles Match Play, Skins, Net Skins, Greenies, 9-Point, Team Match Play, Team Stroke Play, and Head-to-Head Side Match when present.
- Stored as match metadata using `featuredCompetition`.
- Older saved matches without this field continue to load and behave as Auto.

## Round Snapshot Changes

- Round Snapshot now leads with Featured Competition rather than blindly inferring a generic match winner.
- The snapshot distinguishes Featured Competition, Final Settlement / Money Winner, Low Gross, Low Net, game highlights, and Round Awards.
- Explicit Social Round and unavailable-result states are shown cleanly when applicable.
- Incomplete and clinched-early language from prior builds remains preserved.

## AI Round Recap Upgrade

- AI Round Recap now appears directly after Round Snapshot in the Match Summary export flow.
- Recap inputs now include Featured Competition selection, resolved competition, label, and result.
- Recap instructions were upgraded to request a structured, private-club-style story with Round Story, Featured Competition, Turning Points, Player Highlights, Game Story, Statistical Notes, Memorable Moments, and Closing Note / Fun Awards where supported.
- Round Notes were renamed to Round Notes for AI Recap with richer helper and placeholder copy.
- The recap transparency panel now shows the featured competition and clarifies when no notes were entered.

## Verification

- `npm run test:money`
- `npm test`
- `npm run validate`

## Files Changed

- `index.html`
- `app.js`
- `manifest.json`
- `service-worker.js`
- `package.json`
- `package-lock.json`
- `BUILD_NOTES_v30.3.34.md`
