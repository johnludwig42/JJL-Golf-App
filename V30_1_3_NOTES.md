# The Dye Ledger v30.1.4

Focused scoring UX, Memories, and shared-match rules polish.

## Changes

- Reduced vertical whitespace above the scoring hole information.
- Redesigned Play hole info as centered, bold `Par • SI • Yards • Tee` with the live match status centered below it.
- Added a Memories section near Round Notes and AI Recap on the Scores tab.
- Included saved Memories in the AI Round Recap payload alongside the host Round Notes.
- Simplified Round Notes into a single free-form host journal text box.
- Moved Round Notes, Memories, and AI Recap to the bottom of the Scores tab while keeping Finish / End Round near the top.
- Added host-authoritative score override tracking for assigned-player shared matches.
- Added Greenie suggestion behavior for joined devices, with host selection remaining official for settlement.
- Restored horizontal scrolling for hole-by-hole stat summary tables.

## Guardrails

- No scoring calculation changes.
- No settlement calculation changes.
- No Supabase schema changes.
- No localStorage key changes.
- No session architecture changes.
- No AI scorecard import changes.
