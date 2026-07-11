# Build Notes v30.3.60 — Courses Functionality Audit and Library Polish

## Release theme

Make saved courses clearer and safer as reusable Match Setup data while protecting each new round’s historical course truth.

## Audit findings and changes

- The Course Library is stored in the app state/localStorage and can optionally merge/publish Supabase course, tee, and hole rows. Manual entry and multi-file AI scorecard import both save locally first.
- Local rounds previously retained Library IDs but no immutable local snapshot; editing a Library tee could therefore change later calculations/display for an old local round. New and materially reconfigured rounds now capture `courseSnapshot`, and core match metrics/Play tee resolution prefer it. Shared Match upload reuses that snapshot. Legacy rounds continue using the Library compatibility fallback.
- Missing selected tee IDs now fall back to the first snapshot/Library tee without crashing, and Play exposes the fallback in round metadata.
- Duplicate identity already normalized case, whitespace, punctuation, ampersands, accents, location, and hole count for cloud matching. Dropdown de-dupe incorrectly collapsed same-name courses across locations; it now preserves distinct location/hole identities. Manual and imported likely duplicates prompt before saving as new.
- New tee saves validate 18 ordered holes, par 3–6, non-negative numeric yardage when supplied, and a unique 1–18 stroke-index set. Legacy data remains loadable through tolerant normalization.
- Combo tee source mapping and hole-specific source-tee display remain intact. Match snapshots retain each selected player tee and combo hole metadata.
- Course cards now identify reusable Saved Courses with hole/tee counts. UI copy explains that later Library edits do not change new round snapshots. Import progress, review, error, and local-first success states were already explicit and were retained.

## Validation

Passed app/service-worker syntax, both release sanity commands, `git diff --check`, the 11-test course/import, DOM-safety, and completed-summary guard suite, all SSP/Shared Match suites, simulation/live-engine suites, `npm test`, and `npm run test:run` (61/61). All simulation modes had zero invariant failures. The v30.3.60 seed exposed one existing live-vs-mirror final-total difference (`random_035`), outside the course scope; 59/60 and 109/110 comparisons were exact. The generated summary was inspected and reverted.

## Known limitations

- Duplicate detection remains heuristic rather than canonical.
- The v30.3.60 simulation seed has one live-vs-mirror final-total difference (`random_035`) with zero invariant failures; payout mirror alignment remains separate work.
- Legacy rounds without snapshots still depend on current Library data.
- Some scorecard images require manual review; AI import depends on the configured service.
- The app supports 9-hole round selection from 18-hole tee data, but saved tee authoring remains an 18-hole workflow.
- Central catalog, cloud user identity/favorites/defaults, snapshot migration/hardening, and Starting Hole / routing / gambling-basis architecture remain future work.
- Client-side image resizing/compression remains deferred. Preserving source quality across JPG/PNG/HEIC/PDF is safer for extraction in this release; the existing 24 MB combined limit remains in force.

## Add-on — Multi-photo import and architecture clarification

- Multi-photo/multi-file import was already supported end-to-end: users can accumulate front/back photos, tee panels, images, or PDFs; the client sends them together in one `files` payload; the import service returns one combined editable course draft.
- UI copy now explicitly says files are combined, the selected-file heading includes the count, and the single-file payload remains backward-compatible.
- Imported review no longer fills missing rating/slope/par fields with generic defaults before the golfer sees them. Client-side review guidance lists missing holes, par, SI, yardage, rating, and slope, and incomplete drafts require confirmation before saving.
- Documentation now states explicitly that v30.3.60 implements a **local** Course Library plus snapshots for **new** rounds—not a canonical catalog, cloud-owned personal library, or legacy snapshot migration.

## Manual QA

1. Create a match from a saved Library course and confirm its stored match data includes `courseSnapshot`.
2. Note the course name, selected tee, and Hole 1 yardage; edit those values in the Library; reopen the round and confirm it still shows the original snapshot values.
3. Select a single scorecard photo, analyze it, correct the editable review draft, and save it.
4. Select front-nine and back-nine photos together; confirm the selected count/list, analyze once, and verify one combined 18-hole draft appears.
5. Repeat with a partial/unclear image and confirm missing-data guidance appears before save.
6. Remove one selected file and clear/cancel an import; confirm no stale draft or file list remains.

## Final add-on — import hardening and UX cleanup

- A reported 16/17-hole import gap was traced to generic row-count warnings. Imports intended as 18-hole courses now render 18 editable rows, leave absent values blank, prominently name missing hole numbers, and require an explicit incomplete-save confirmation. Focused tests cover 16 holes, 17 holes, a missing middle hole, the save guard, and a complete 18-hole draft.
- Selected files were already de-duplicated before one combined request. Analyze now ignores repeat activation, disables itself while processing, and explains that multiple files are being prepared and combined. No lossy client compression was added.
- Opening a new tab now resets stale vertical scroll, preventing the Scores tab from appearing to reserve blank space above Share / Save PDF. The existing sticky navigation and export card remain intact.
- The Play header no longer auto-displays a stroke-play status bubble when no game or featured competition is active. Selected SSP, Nassau, and other featured games are unchanged.
- View Match Summary keeps a completed round loaded on Scores and now shows a compact “Round saved” banner with a clear “Done — Return to Match” action. Courses, Library, Players, and More no longer silently end the summary session; returning to Scores keeps the saved summary available. Done or opening Match uses one guarded cleanup helper to clear only the completed working reference and show Create New Match / Join Match, while the round remains in Library/history. Create, Join, and Play Another Round use the same cleanup path; in-progress rounds are unaffected.

Additional manual QA: finish a round, choose View Match Summary, confirm the summary and Round saved / Done banner remain visible and Share / Save PDF still works. Visit a non-Match reference tab and return to Scores; confirm the summary remains. Tap Done and repeat by tapping Match directly; both should show Create New Match / Join Match while the completed round remains saved. Confirm Play Another Round still copies the group and an in-progress match is never cleared by this behavior.

## Hotfix — runtime and app-shell asset versions

- Fixed a release-blocking `ReferenceError: el is not defined` caused by the import draft hole-count assignment being placed in `updateScorecardImportStatus()` instead of `renderScorecardImportReview()`. Status rendering now safely returns when its DOM is absent and no longer references unrelated review variables.
- Updated the real `index.html` manifest, CSS, Supabase config, and `app.js` query strings from v30.3.54 to v30.3.60, along with static fallback version labels. Release sanity now fails when an app-shell asset query is missing or stale.
- Manual cache QA: clear site data or use a fresh profile, restart with `npx http-server . -p 5173 -c-1`, confirm the Network/stack URL is `app.js?v=30.3.60`, and exercise Library, Match Setup/finalization, hole save, completed summary, and single/multi-file import status.
