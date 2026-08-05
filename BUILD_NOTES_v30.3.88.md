# The Dye Ledger v30.3.88 Build Notes

## Release purpose

v30.3.88 is a focused Course Library Reliability release. It prevents repeated identical scorecard imports from adding duplicate local course records and treats common United States country labels as the same course identity for matching and rendered course choices.

## What changed

- `USA`, `US`, `U.S.A.`, `United States`, and `United States of America` now share one internal course-country identity.
- Identical scorecard content resolves to the already saved course and reports that no duplicate was created.
- Existing stored courses are not merged, rewritten, or deleted.
- Historical rounds continue to use their preserved course snapshots.
- Focused deterministic tests cover alias matching, rendered-option deduplication, storage preservation, and repeated imports.
- Verified match-start weather is now guaranteed in the displayed AI Recap: it remains integrated in the narrative when present there, or is appended in a final Weather section after any Round Memories section.
- The deterministic weather fallback includes available conditions, temperature, humidity, and wind without exposing location coordinates or inventing unavailable readings.
- Cloud `course_holes` reads are now deterministically paginated beyond Supabase's 1,000-row response boundary.
- A partial cloud tee response can no longer replace a complete local 18-hole tee.
- Read-only cloud verification confirmed Purgatory Golf Club and Chatham Hills each retain six complete 18-hole, par-72 tee records; no repair write or re-import was required.

## Recovery finding

The user-provided August 5 export contains 30 local course records and 18 matches, but no course or round snapshot named Purgatory Golf Club. Recovery therefore requires an older export, another browser/profile that still holds the record, or separately authorized inspection of the inactive staging project.

## Boundaries

- No Supabase migrations or data changes.
- No production or staging deployment.
- No local-storage schema or key changes.
- No automatic cleanup of the existing duplicate records.
- No scoring, settlement, Shared Match, or RoundRecord changes.

## Manual acceptance

1. Upgrade an existing browser profile and confirm saved courses and rounds remain present.
2. Confirm equivalent Chatham Hills records using `USA` and `United States of America` render as one course choice.
3. Import and save a complete scorecard once.
4. Repeat the identical import and confirm the app says it is already saved and does not increase the local course count.
5. Import materially different course data with a matching name/location and confirm the existing duplicate warning remains available.
6. Refresh a cloud catalog containing more than 1,000 hole rows and confirm every tee still exposes holes 1–18 with correct par and yardage totals.
