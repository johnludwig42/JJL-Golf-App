# v31.0.09 — Release Assurance and Offline Ledger Reliability

## Outcome

The default release gate now includes every repository test file, and Ledger Entry always receives a truthful Story of the Round even when online generation is unavailable or invalid.

## Release assurance

- `npm test` uses automatic test discovery instead of a manually curated file list.
- Previously excluded Shared Match, Ledger Entry, Course Library, completion, settlement, and reporting tests are release-gating again.
- Stale current-release assertions were repaired without weakening their behavioral checks.
- v31.0.08 accordion coverage now follows the correct release-file convention.
- v31.0.09 adds dedicated release-gate, fallback-policy, and Player Mode persistence-invariant coverage.

## Ledger Story reliability

- Online generation remains the preferred Story path.
- Generated prose still must pass deterministic fact validation; one repair request remains available.
- Offline, missing configuration, timeout, service failure, excessive length, or failed verification now discards the generated response and uses a deterministic Story built from authoritative Round facts.
- Story fallback provenance and reason are retained in the report model for diagnostics.
- Ledger Entry is no longer blocked solely because the Story service is unavailable.

## Compatibility

- No scoring, handicap, competition, settlement, Course Library, or Shared Match calculation changed.
- Classic and Player Mode remain on the same controller and Round contract.
- No localStorage schema or database migration is required.
