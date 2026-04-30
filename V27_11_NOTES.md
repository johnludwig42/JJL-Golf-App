# The Dye Ledger v27.11 Notes

This build applies the requested bug-first / UX-second pass on top of the current Supabase-enabled baseline.

## Bug fixes

### Confirm Finish / New Match recovery
- Updated the new-match guard so a completed active match no longer blocks creating a new match.
- Confirm Finish continues to mark the active match complete, set `completedAt`, persist locally, and schedule immediate Supabase sync for shared matches.
- Updated the finish render refresh path to use the existing match list renderer.

### Score save trigger audit / enforcement
- Previous-hole navigation now saves the current hole before moving backward.
- Next-hole navigation and Save Hole Scores continue to use `saveCurrentHole()`.
- Hole dropdown navigation uses the same `saveCurrentHole()` path.
- Finish Round copies the current on-screen hole state into the active match before completing.
- Shared matches continue to schedule immediate Supabase sync from the same current-hole save/mutation paths.

### 9-hole PDF scorecard notation
- Strengthened print/export styles for birdie/eagle/bogey/double-bogey notation so circles and squares are rendered as CSS borders/boxes rather than relying on special glyph rendering.
- Applied both stylesheet and embedded print CSS support.

## UX improvements

### Hole dropdown navigation
- Replaced the visible static Jump to Hole section with a dropdown in the scoring header between Prev and Next.
- Selecting a hole saves the current hole first, then navigates to the selected hole.

### Classic scorecard click-to-edit
- Classic scorecard score cells are now clickable/tappable.
- Clicking a scorecard cell switches to Scoring Input, opens the corresponding hole, and focuses the corresponding player's score input where possible.

### Blank team-name defaults
- Team-name fields now render blank by default with placeholder text like Team 1 / Team 2.
- Blank names fall back to Team # for display without forcing that fallback into the input field.

## Upload note

Preserve the existing `supabase-config.js` values when uploading this build.
