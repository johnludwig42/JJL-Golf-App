# The Dye Ledger v30.1 – Navigation Foundation & Course Lifecycle Management

Release theme: **Prepare. Play. Compete. Remember. Learn.**

## What changed

- Reorganized top-level navigation into the lifecycle model:
  - 🏌️ Match
  - ⛳ Play
  - 🏆 Scores
  - 📚 Library
  - 📈 Insights
  - ⚙️ More
- Moved player setup and match setup together under Match.
- Made Library the home for course management, scorecard import, saved matches, sessions, and future memories / AI recaps.
- Added an Insights placeholder for future historical learning and analytics.
- Added course lifecycle delete actions:
  - Delete Local
  - Delete Cloud
  - Delete Local + Cloud
- Added cloud delete progress/status messages.
- Added Supabase course delete RLS policy definitions to `supabase-schema.sql`.

## Course deletion behavior

- **Delete Local** removes the course from this device only.
- **Delete Cloud** removes the Supabase course, tees, and holes while preserving the local copy.
- **Delete Local + Cloud** deletes the cloud copy first and only removes the local copy after the cloud delete succeeds.

## Technical notes

- Existing course tables already define cascading foreign keys.
- The client still deletes cloud rows explicitly in the order holes → tees → course to provide clear progress messages and avoid orphan records.
- The updated schema file includes delete policies required for cloud deletion in the login-free PWA model.

## Guardrails preserved

- No scoring engine changes.
- No handicap calculation changes.
- No Nassau or settlement calculation changes.
- No shared-match score synchronization changes.
- No session or Play Another Round behavior changes.
- No localStorage key/schema changes.
