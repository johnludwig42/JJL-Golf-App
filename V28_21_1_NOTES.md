# The Dye Ledger v28.21.1 Build Notes

Focused iPhone viewport stability release.

## Changes
- Added viewport stability guards to prevent page-level horizontal drift during Scoring Input interactions.
- Tightened Scoring Input/stat matrix overflow containment so only the stat matrix columns can scroll horizontally when necessary.
- Reduced narrow-screen stat matrix widths slightly while preserving the pinned Player column and existing matrix controls.
- Added iPhone-focused focus/input reset handling to keep the page anchored at the left edge when gross score inputs receive focus.
- Updated app version references to v28.21.1, including visible version labels and service worker cache version.

## Preserved
- Existing scoring workflow and calculations.
- Existing stat matrix behavior and calculations.
- Match Summary, settlements, Nassau, Skins, Greenies, 9-Point, Round Notes, AI Recap, Supabase, AI Scorecard Import, localStorage, and saved match compatibility.
