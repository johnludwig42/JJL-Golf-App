# The Dye Ledger v30.3.80 - Guided Match Setup

## Implemented scope

- Replaces the long Match Setup page with a clean five-destination hub: Course & Round, Players, Games & Stat Tracking, Scoring Control, and Advanced Options.
- Every destination edits the same in-progress setup. Users may visit them in any order, return to the overview, and open the relevant destination directly from a readiness warning.
- Existing setup-draft autosave remains active. The redesign does not create a second setup record or alter scoring rules.
- The persistent Match header now owns the overview title, destination title, readiness status, and return navigation, removing duplicate Round Setup headings.
- Readiness is reduced to actionable exceptions; completed checklist rows and routine Course Library status are no longer repeated in Match Setup.
- Handicap allowance lives with Players. Match Templates, Preferences for This Round, and Smart Score Advance are quiet, closed-by-default Advanced disclosures.
- Smart Score Advance remains a saved preference with a round-only override. Weather context is now an additive saved preference with a round-only override and safe legacy default.
- Advanced Options summarizes every preference category relevant before play and links to its single editing home. Round facts are not duplicated: Stat Tracking remains in Games, Shared Match remains in Scoring Control, Press defaults remain with supported games, and personal display/feedback settings link back to More.
- Destination headers are left-aligned with secondary return navigation at the upper right; Match Templates now matches the other Advanced disclosures and appears last.
- Preferences for This Round is intentionally limited to Weather, saved Press defaults, and personal Quick Scoreboard access. Smart Advance, Stat Tracking, Shared Match, and scoring feedback are not duplicated. Press Preferences opens the exact More section, while an explicit Apply to This Round action prevents saved-default changes from silently rewriting an existing draft.
- App-shell asset revision 2 ensures devices that tested an earlier v30.3.80 work-in-progress receive the finalized layout and behavior.
- Manual Reference Tee selection remains authoritative across setup rerenders instead of being replaced by the automatic recommendation.
- Adds an optional, user-initiated Nearby Saved Courses action. Location is requested only after a tap, used in memory to rank saved courses with verified coordinates, and is not persisted.
- Improves Recent App Errors labels and adds an Email Support action for `support@dyeledger.com`, while retaining Copy Diagnostics and Clear Errors.
- v30.3.80 uses a new PWA cache and immutable release-specific icon assets.

## Compatibility and persistence

This release changes navigation and presentation only. It preserves existing local rounds, RoundRecords, players, courses, templates, preferences, memories, snapshots, Shared Match state, scoring, settlement, and unknown future fields. It does not upload, claim, merge, deduplicate, rewrite, or delete local data. A location lookup does not change the selected course automatically.

## Security and deployment

No Supabase migration is included. No Auth, RLS, schema, secrets, production data, production configuration, deployment, or remote branch was changed. Diagnostics email uses the user's email client and contains only the same sanitized, size-limited diagnostic report available through Copy Diagnostics.

## Automated acceptance

- Release identity, cache, and immutable icon assets.
- Five-destination hub, single-form ownership, non-linear navigation, and readiness routing.
- Persistent destination header, compact exception-only readiness, reference-tee selection, and preference inheritance/override contracts.
- Existing setup-draft autosave and local-record preservation contracts.
- Explicit nearby-course permission, offline/denied/unavailable fallback, and no coordinate persistence.
- Email Support, Copy Diagnostics fallback, and sanitized diagnostic contracts.
- Full regression, validation, lint, release sanity, and simulation results are recorded in the final implementation report.

## Manual acceptance

- [ ] Open each Match Setup destination in a different order; make changes, return to the overview, and confirm the draft remains intact.
- [ ] Tap each readiness warning and confirm it opens the correct destination.
- [ ] Refresh during setup and confirm the saved draft restores without affecting existing rounds.
- [ ] Try Nearby Saved Courses while online, offline, with permission denied, and with courses that lack coordinates; normal search must remain usable.
- [ ] Confirm location is requested only after tapping Nearby Saved Courses and is not retained after reload.
- [ ] Create and score a local-only round, and confirm scoring, games, settlement, summary, memories, and reopening behave as before.
- [ ] Confirm Email Support opens a message to support@dyeledger.com and Copy Diagnostics remains available.
- [ ] Upgrade an installed iPhone PWA and confirm saved rounds, players, courses, templates, preferences, and drafts remain present.
- [ ] Run a two-device Shared Match and confirm authority, assignments, convergence, and exactly-once settlement remain unchanged.

## Deferred

- Automatic background location, persisted location history, and external course discovery.
- Broader Match Setup visual redesign inside each destination.
- Amendment Session UI, historical cloud claiming, and cloud migration.
