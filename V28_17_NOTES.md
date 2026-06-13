# v28.17 Build Notes

- Investigated the hole-specific combo tee indicator data path from tee creation/storage through active scoring display.
- Fixed the scoring display helper so true combo tees use their explicit per-hole `comboSources` mapping when available.
- Added a guarded fallback for legacy/cloud-flattened combo tees: if a non-combo tee appears to be a composite of multiple named source tees and each hole can be matched with high confidence by yardage/par/stroke index, the scoring screen displays the inferred source tee for the active hole.
- Confirmed the current Supabase course table sync does not preserve explicit combo metadata; larger cloud schema support for `isCombo`/`comboSources` remains a future enhancement.
- No scoring, handicap, settlement, Match Summary, Classic Scorecard, AI Scorecard Import, or Round Recap calculations were changed.
