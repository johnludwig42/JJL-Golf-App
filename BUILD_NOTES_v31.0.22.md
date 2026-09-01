# The Dye Ledger v31.0.22

## Scope

Focused Shared Match synchronization diagnostic and persisted-state reliability release. No schema, scoring, settlement, reporting, or normal trust-indicator behavior changes.

## Changes

- Adds one correlation ID and elapsed time per coordinated synchronization attempt, with results for metadata pull, upload, score pull, and final metadata pull.
- Records bounded exceptional evidence for partial and failed attempts: phase status/timing, safe error codes, outbox counts, acknowledgement IDs, and parity status.
- Keeps routine success detail aggregate-only while retaining whole-round attempt, outcome, timing, and phase counters.
- Caps persisted synchronization diagnostics at 6,144 characters per Shared Match and retains the first three and most recent three exceptional records where bounded record size permits, evicting middle/routine evidence first.
- Adds a sanitized **Copy Sync Diagnostics** action inside existing Shared Match technical troubleshooting details. It does not use `mailto:`.
- Includes the sanitized Shared Match diagnostic block near the beginning of general app diagnostics so it survives the existing 12,000-character plain-text truncation whenever the bounded block fits.
- Re-resolves the current persisted match after synchronization network waits before applying server revision, acknowledgement, pull, and final synchronization-state writes.
- Makes a failed score pull explicit to the coordinator so a partial attempt cannot be reported as a clean success.

## Evidence export review

- Before this release, `getAppDiagnosticsText()` did **not** include `match.sharedSyncDiagnostics`.
- A deliberately saturated representative export measured 9,137 plain-text characters and 16,723 URL-encoded characters. The complete general diagnostic text measured 9,686 plain-text characters in the same fixture. It fits the existing 12,000-character plain-text truncation, but the encoded size confirms that `mailto:` is not a dependable iOS retrieval path.
- The dedicated clipboard action copies the complete sanitized synchronization export directly from the existing troubleshooting disclosure. Automated coverage verifies the action exists, the export is included in broad diagnostics, and match codes, email, raw coordinates, player identifiers, and raw participant/source fields are excluded.
- Device and current participant identifiers remain only in the technical export to support two-device correlation.

## Retention and persistence

- Head-and-tail exceptional retention is covered with a cascading-failure fixture; middle failures are discarded first.
- Aggregate totals remain accurate for all attempts even when individual records are evicted.
- Routine successes do not grow the event list.
- Quota-failure coverage confirms the prior local round remains intact and the diagnostic payload remains within budget.

## Deferred to v31.0.23

- Completion reconciliation, participant/device refresh, presence heartbeat, and shared-memory publication remain lower-risk stale-reference audit candidates.
- Dirty follow-up scheduling and pending-work retry policy remain unchanged until the physical two-device evidence run is reviewed.
- The previously approved pending-work trigger and S2/S3/S6 reliability corrections remain in the v31.0.23 boundary; S1/S5 tuning remains evidence-dependent.

## Verification

- `npm run test:v31.0.22` — 23 passed.
- `npm test` — 615 passed.
- `npm run lint` — 0 errors; 178 pre-existing warnings.
- `npm run validate` — passed release identity, assets, syntax, worker lifecycle, and documentation checks.
- `npm run simulate:compare` — 75/75 exact live-vs-mirror matches; 0 failures.
- `npm run check:layout` — passed the eight-page Ledger Entry acceptance check; generated artifacts restored afterward.
- 375 × 812 local browser screening — v31.0.22 loaded with the existing responsive shell and no browser console warnings/errors. The technical control’s rendered markup and event wiring are covered by the focused adapter suite; physical iOS clipboard operation remains part of deployment QA.

Physical iPhone two-device suspend/reconnect reproduction remains the required Phase 1 deployment validation. This build is not deployed or committed by Codex.
