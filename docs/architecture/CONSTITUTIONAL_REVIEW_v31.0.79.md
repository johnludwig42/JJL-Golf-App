# Constitutional Review — v31.0.79

Owner: John Ludwig. Date: October 21, 2026. Scope explicitly narrowed and approved:
device-local preserved-score review, Already reflected/Discard, durable audit,
cleanup recovery, separate frozen-record verification and visible storage pressure.

Affected principles: 2/5 (authority accurately described), 6/8/10 (historical facts
remain immutable), 11/12/22 (no unauthorized amendment or settlement restatement),
18/19 (device attribution is not human identity), 23 (retention and audited resolution).

Neither action changes a frozen RoundRecord or accepted Ledger Entry. The normal
live-score upload path is not used to resolve differences. No new version, financial
decision, SQL, cloud review queue or ownership contract is introduced.

Review occurs on the holding device with a manual host-review attestation. The UI
and receipt explicitly do not claim authenticated host approval; physical presence
and shared credentials cannot identify a human approver. Reasons, source values,
final known values, device/participant attribution and times are retained locally.

IndexedDB audit commits before hot payload cleanup. Crash recovery and exact operation
fingerprints prevent silent loss, double resolution or deletion of changed evidence.
History is compacted, not silently pruned. Audit export is separate from existing
round backups; the UI states this limitation. No general archive or round migration.

Hash comparisons identify content, not mathematical correctness or authorization.
Frozen-record parity needs matching fetched and local records plus locally available
resolution evidence; clearing an exception does not itself establish parity. Active
score-ledger parity remains separate and unchanged.

No constitutional conflict identified at this narrowed scope. Amendment, financial
restatement and sticky-waiver design remain parked, not rejected or authorized for
implementation. The production-schema findings remain a separate operational gate.
