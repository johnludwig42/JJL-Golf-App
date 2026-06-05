# The Dye Ledger v27.0 - Supabase Pass 1 Setup

## What to configure
Add your Supabase project values to `supabase-config.js`:

- `url`: your Supabase project URL
- `anonKey`: your Supabase anon/public key

The Supabase JavaScript client can be loaded in the browser from a CDN, and Supabase documents the `@supabase/supabase-js@2` CDN pattern as well as browser client initialization with a project URL and key. The anon key is safe to use in the browser when Row Level Security is enabled. citeturn445962search1turn445962search0turn445962search7turn445962search9

## Files added in this pass
- `supabase-config.js`
- `supabase-schema.sql`
- `SUPABASE_SETUP.md`

## Supabase dashboard steps
1. Create a Supabase project.
2. In Authentication, enable **Anonymous Sign-Ins** for this project. Supabase supports anonymous users and notes that anonymous users authenticate with JWTs and take the `authenticated` role for RLS purposes. citeturn412416search0turn445962search9
3. Open the SQL Editor and run the contents of `supabase-schema.sql`.
4. Open `supabase-config.js` and paste in your project URL and anon key.
5. Reload the app.

## How Pass 1 works
- If `supabase-config.js` is blank, the app stays local-only.
- If Supabase is configured, Game Setup can create a **shared match**.
- The organizer-created shared match foundation is written to normalized Supabase tables.
- The app can reload a shared match by ID from Supabase and hydrate it back into the app’s current in-memory match shape.
- Shared matches are also cached locally as a fallback.

## What changed in v27.0
- Added Supabase anonymous-auth bootstrap foundation.
- Added shared/local match storage toggle in Game Setup.
- Added shared-match load / refresh controls in More.
- Added normalized cloud payload builder and hydration layer.
- Added course/player snapshot hydration support so shared matches can load on devices that do not already have the same local course/player records.
- Added initial SQL schema and broad authenticated RLS policies for Pass 1.
- Added structural fields for `lastTouchedHole` and `lastFullyCompletedHole`.

## Still deferred to Pass 2 / Pass 3
- Team code redemption / join flow
- Team-scoped edit permissions
- Realtime score-entry sync
- Full audit logging behavior and triggers
- Round locking / override flows
- Offline mutation queue


## v27.35 Course Library

This build adds course-library tables to `supabase-schema.sql`:

- `courses`
- `course_tees`
- `course_holes`

The app can read these as public reference data using the anon key. Manual course entry and localStorage fallback remain in place. See `SUPABASE_COURSE_LIBRARY.md` for the course data structure and setup notes.
