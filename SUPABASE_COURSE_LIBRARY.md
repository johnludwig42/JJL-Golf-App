# The Dye Ledger Supabase Course Library (v27.38)

This build adds Supabase-backed course reference data only. It does not migrate matches, scores, payouts, saved rounds, or PDF export logic.

## Tables

The required tables are included in `supabase-schema.sql`:

- `courses` — course-level information such as name, city, state, and country.
- `course_tees` — tee-level information such as tee name, rating, slope, total yards, and total par.
- `course_holes` — hole-level information by tee, including hole number, par, handicap index, and yardage.

## App behavior

- If `supabase-config.js` is blank, the app continues to work locally with manual course entry.
- If Supabase is configured, the Courses tab includes a `Refresh Cloud Courses` button and the app also attempts a quiet refresh on startup.
- Loaded cloud courses are cached into local browser storage so the app remains usable offline.
- Manual course entry remains available.
- Selecting a loaded course in Game Setup uses the existing course/tee flow to prefill hole count, par, tees, and handicap stroke data where available.

## Setup

1. Run the contents of `supabase-schema.sql` in the Supabase SQL Editor.
2. Add your project URL and anon public key to `supabase-config.js`.
3. Insert course, tee, and hole rows into `courses`, `course_tees`, and `course_holes`.
4. Open the app and use Courses → Refresh Cloud Courses.

The Phase 1 course tables are public read-only for the anon key. Writes should be handled directly in Supabase for now.
