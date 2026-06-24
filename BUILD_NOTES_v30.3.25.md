# The Dye Ledger v30.3.25 Build Notes

## Release Theme
Fix the exact crash preventing Start Scoring.

## Fixes
- Fixed a ReferenceError in `hasActiveRound()` caused by an undefined `getCourseById(...)` helper.
- Replaced the undefined helper with existing course/tee lookup helpers: `getTee(...)` and `getCourse(...)`.
- Ensured active-round detection safely falls back when course or tee data is unavailable instead of throwing.
- Updated app version, cache name, service-worker references, visible metadata, and asset query strings to v30.3.25 so installed PWAs receive the hotfix.

## Verification Focus
- Start Scoring should now work for valid local matches.
- Hole 1 scoring inputs should render after match setup.
- The app should no longer show the internal match-finalization error caused by `getCourseById is not defined`.

## Guardrails
- No scoring, settlement, handicap, Course Library, Supabase, Shared Match, saved-match, or localStorage behavior was intentionally changed.
- No PWA/service-worker behavior was intentionally changed beyond version/cache naming required for release.
