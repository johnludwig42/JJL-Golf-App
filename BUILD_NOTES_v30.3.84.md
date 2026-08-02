# The Dye Ledger v30.3.84 Build Notes

## Summary

v30.3.84 establishes one versioned AI Recap content authority, adds deterministic contradiction gates, and places a reviewable Edge Function deployment candidate in source control. It does not inspect or change the live function, production Supabase, secrets, rounds, or historical RoundRecords.

## Content governance

- Adds machine-readable content specification v1.0.0 and a human-readable product contract.
- Makes deterministic scores, completed holes, games, settlement, Featured Competition, and tracked statistics authoritative.
- Requires all saved Memories to remain represented.
- Defines concise tone, optional sections, weather restraint, sensitive-content treatment, privacy exclusions, and unsupported-inference rules.
- Expands fact-rich recaps to a 650–850 word target, capped at 900 words, while keeping fact-light rounds shorter.
- Adds evidence-based player improvement opportunities when Stat Tracking has at least three completed holes, including fairway-conditioned GIR context where available.
- Requires sample-size disclosure and tentative language; forbids inferred swing mechanics or unsupported coaching.
- Generated output remains a draft requiring explicit user acceptance.

## Reliability

- Payloads identify the expected content-specification version.
- Generation rejects drafts that contradict round completion or provisional settlement.
- Acceptance applies the same deterministic checks and explains why a recap needs review.
- Existing local recaps remain readable and are not silently regenerated or rewritten.
- Add Memory now uses the same safe-area-aware floating mobile-window treatment as Quick Scoreboard, without changing Memory persistence or scoring state.
- More now renders exactly the five most recent release notes from structured data, and release validation fails when the list is stale, duplicated, misordered, or does not begin with the current version.
- Verified recap weather now requires a brief recorded-conditions summary with available temperature and humidity readings while excluding coordinates and unsupported causal claims.
- Advances the v30.3.84 asset revision so installed PWAs receive the Add Memory floating-window CSS, with validation requiring index/service-worker revision consistency.
- Makes End Round Early discoverable below Play's Round Details and routes it through the same authoritative completion, reason, provisional-warning, persistence, and summary workflow used by Scores.

## Edge Function and deployment boundary

- Adds a repository-controlled `round-recap` candidate using environment-held provider configuration and structured output.
- The live function source remains unknown because no production inventory was authorized or performed.
- Test deployment requires an explicitly configured non-production project.
- Production deployment requires separate Product Owner approval.

## Deferred

- Production function inventory or deployment
- Post-freeze authoritative recap publication through Amendment Sessions
- Contributor privacy/withdrawal UI
- Event, trip, season, and coaching recaps
