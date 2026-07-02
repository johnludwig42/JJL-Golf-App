# The Dye Ledger v30.3.35 — Match Templates & Round Readiness

## Summary
Focused pre-round workflow and polish release. Adds locally stored Match Templates, a Round Readiness advisory checklist, one-tap Ready to Play / Continue Anyway confirmation, cleaner setup metadata, and fixes the Save / End Round visual artifact.

## Match Templates
- Added Match Templates under Match Setup.
- Templates are saved locally using `dyeLedger.matchTemplates.v1`.
- Templates save setup only: players, teams, course/tee, games, Featured Competition, handicap/stake settings, scoring access mode, and stat tracking preferences.
- Templates intentionally do not save scores, hole results, settlements, statistics, AI recaps, round notes, completion status, or round end reason.
- Added create, apply, rename, duplicate, and delete template actions.

## Round Readiness
- Added Round Readiness card with advisory checks for course, tee, course holes, players, teams, handicaps, games, Featured Competition, Singles Match Play setup, and 9-Point setup.
- Shows Ready to Play when setup looks complete.
- Shows Review Setup / Continue Anyway when advisory warnings exist.
- Warnings do not block casual play beyond existing app validation.

## UI Polish
- Fixed iPhone visual artifact around the Save / End Round control by clipping/isolation of the round-actions container.
- Added concise empty states for templates and readiness.
- Improved pre-round setup confidence while preserving existing scoring workflow.

## Metadata
- Updated app version to v30.3.35.
- Build metadata now comes from the shared BUILD_INFO block so footer/About diagnostics remain consistent.
- Cache name updated to `the-dye-ledger-v30.3.35`.

## Backward Compatibility
- Existing saved matches remain compatible.
- Existing matches without Featured Competition still fall back to Auto.
- No Supabase schema changes.
- No template cloud sync.

## Verification
- Run `npm run test:money`.
- Run `npm test`.
- Run `npm run validate`.
- Verify template create/apply/rename/delete.
- Verify template application does not copy scores or recaps.
- Verify Round Readiness states.
- Verify Save / End Round artifact is removed on iPhone layout.

## Files Changed
- `app.js`
- `index.html`
- `style.css`
- `service-worker.js`
- `manifest.json`
- `package.json`
- `BUILD_NOTES_v30.3.35.md`
