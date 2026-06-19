# The Dye Ledger v30.1.1 – Library Simplification & Memory Capture Foundation

## Release Theme
Less browsing. More remembering.

## Implemented
- Library Courses now shows only up to three recently used courses by default.
- Removed the default long all-courses list; older courses are available through search.
- Course search filters the full local/downloaded course library case-insensitively.
- Added lightweight `lastPlayedAt` recency metadata when a round starts with a course.
- Added 📝 Add Memory quick capture at the bottom of Play / Scoring Input.
- Memories save locally with the active round using append-only entries containing text, category, hole, timestamp, and source.

## Guardrails
- Memories are local-only in this release.
- No shared memory sync, collaborative note editing, AI recap generation change, or Supabase schema change was added.
- Scoring, synchronization, calculations, sessions, and localStorage key compatibility were not changed.
