# The Dye Ledger v28.21.4

Focused Stat Matrix Persistence Fix release.

## Changes

- Fixed Stat Tracking Matrix state application so only stat input controls are read when saving the active hole.
- Corrected an event-handler issue in the stat change path that could prevent checkbox-driven smart putt updates from persisting.
- Preserved the existing Stat Tracking Matrix layout and golf-aware column order.
- Preserved scoring logic, settlement logic, Match Summary, AI Recap, Supabase Course Library, and saved-match compatibility.
- Updated app version references to v28.21.4.

## Root Cause

The stat save routine was reading every element with stat data attributes, including stepper buttons, not just the actual input controls. That allowed button elements with blank values to overwrite Putts/Penalty values during save. The checkbox change handler also referenced an unavailable match variable, which could interrupt persistence after U&D/Sandy changes.
