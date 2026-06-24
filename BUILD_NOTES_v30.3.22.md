# The Dye Ledger v30.3.22 Build Notes

## Release Theme
PWA updates should never interrupt starting or playing a match.

## Changes
- Updated app version, cache name, asset version references, and visible build metadata to v30.3.22.
- Changed service-worker controller-change handling so the app no longer reloads automatically during normal use.
- Added user-requested reload state so controller-change reloads only occur after explicit Refresh Now or Reset App Cache actions.
- Added conservative unsafe-reload detection for match setup, join flows, active scoring, open modals, scorecard import, and course sync.
- Added deferred update messaging when a refresh would interrupt match setup or scoring.
- Preserved Check for Updates, Refresh Now, Reset App Cache, service-worker diagnostics, cache cleanup, and version consistency diagnostics.
- Updated More tab app notes to describe the v30.3.22 reload-safety behavior.

## Guardrails
- No scoring, handicap, settlement, Course Library, Supabase, Shared Match, saved-match, or localStorage schema changes.
- Reset App Cache continues to preserve saved matches, local courses, players, scores, and memories.
