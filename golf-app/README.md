# Golf Matchbook PWA

This is an upgraded progressive web app for shared golf groups.

## What is included
- Shared backend support via Supabase or local-only fallback
- Up to 6 players in a match
- Team assignments for singles, doubles, or threesomes
- Manual handicap entry
- Course + tee storage
- Hole-by-hole score entry
- Live status for:
  - individual match play
  - team match play
  - individual skins
  - team skins
  - low net hole winners
- Historical matches
- Two-step completion confirmation before a round is locked

## Quick deploy
1. Unzip these files into a folder in your GitHub repo such as `golf-app/`.
2. If you want shared data, create a Supabase project and run `schema.sql` in the SQL editor.
3. Put your project URL and anon key into `config.js`.
4. Publish with GitHub Pages, Netlify, or Vercel.
5. Open on iPhone in Safari and choose **Add to Home Screen**.

## Notes
- With the provided schema and policies, anyone who knows the hosted URL can read/write the data. That is acceptable for a private family utility but not enough for a commercial app.
- If you want user logins later, add Supabase Auth and tighten row-level security.
- The app stores scores as JSON for speed and simplicity.
