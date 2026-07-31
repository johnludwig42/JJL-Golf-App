# The Dye Ledger v30.3.79 - Shared Match Summary & Round Analytics

## Implemented scope

- Match Summary presents the AI Round Recap immediately after the deterministic Round Story.
- Accepted and draft recaps are labeled distinctly. If no recap exists, an honest empty state appears without hiding scores, settlement, memories, or audit detail.
- Stored Memories missing from a recap are appended to its Round Memories section; memories alone are not misrepresented as an AI-generated recap.
- A concise Round Analytics layer highlights scoring average, birdie-or-better, bogey avoidance, and recorded-GIR birdie conversion leaders. Detailed Player Insights remain in the supporting ledger.
- Game Drivers follow the narrative and analytics layers; settlement, scorecard, game facts, and audit detail remain deterministic.
- New RoundRecords may carry an additive AI recap artifact and status when one exists at freeze time.
- A recap accepted after a RoundRecord was frozen is presented from the local round without modifying that immutable snapshot. Permanent post-completion publication remains governed by future Amendment Sessions.
- v30.3.79 has a new PWA cache and immutable release-specific icon assets using the approved artwork.

## Compatibility and persistence

This release changes presentation and adds optional fields only. It does not delete, bulk migrate, upload, claim, merge, deduplicate, or rewrite any existing local round. Existing players, scores, games, memories, preferences, templates, snapshots, Shared Match facts, and unknown future fields remain preserved. No localStorage key or schema version is destructively changed.

## Security and deployment

No Supabase migration is included. No RLS, Auth, secrets, production data, production configuration, deployment, or remote branch was changed.

## Automated acceptance

- Release identity and immutable PWA asset checks.
- Accepted, draft, memory-complete, and absent AI recap presentation.
- Match Summary hierarchy and analytics presentation.
- Frozen RoundRecord immutability after a late recap.
- Legacy local round, scores, memories, and unknown-field preservation.
- Existing v30.3.78 analytics and usability regressions retained in the focused suite.

## Manual acceptance

- [ ] Open a completed local round with an accepted recap and confirm Match Summary/PDF shows Round Story, AI Round Recap, Round Analytics, settlement, Game Drivers, then ledger detail.
- [ ] Generate but do not accept a recap and confirm it is labeled Draft recap.
- [ ] Open a round without a recap and confirm the honest empty state does not hide any other summary section.
- [ ] Confirm every saved Memory appears in the recap or its Round Memories continuation.
- [ ] Confirm Match Summary analytics agree with Scores Player Insights for the same completed holes.
- [ ] Confirm the Classic Scorecard-only print view does not add Match Summary narrative sections.
- [ ] Upgrade an installed iPhone PWA containing saved local rounds and confirm rounds, players, scores, memories, templates, and preferences remain present.
- [ ] Complete a two-device Shared Match and compare scoring, settlement, and Match Summary facts on both devices.

## Deferred

- Amendment Session publication of post-freeze recap changes.
- Cloud-authoritative recap synchronization and historical cloud migration.
- Career and multi-round analytics, coaching recommendations, AI event/season recaps, and privacy UI.
- Match Setup navigation redesign (v30.3.80).
