# Production Readiness Architecture

This document describes the v30.3.70 durability model for The Dye Ledger. The guiding rule is simple: the UI may only claim a critical transition after the authoritative local state has been written successfully.

## Durable records

The app uses four localStorage records around the core round lifecycle:

| Record | Purpose | Recovery rule |
| --- | --- | --- |
| `the-dye-ledger-v20` | Authoritative players, courses, matches, active pointer, and Shared references | Prefer when valid; sanitize usable rows and normalize later |
| `the-dye-ledger-v20:last-known-good` | Most recent successful full-state copy | Use when primary JSON is missing or malformed |
| `the-dye-ledger-v20:setup-draft` | In-progress new-round setup | Restore only setup-safe fields; remove scores and historical state |
| `the-dye-ledger-v20:finish-recovery` | Prepared Finish intent | Confirm a durable completed match or retain the durable active match |

Player Preferences and Match Templates retain their existing versioned records. They are independent of the authoritative match transaction and cannot mark a round complete.

## Load and normalization boundary

Startup reads primary, backup, then legacy records. A syntactically valid object is sanitized before normal match normalization:

- malformed collection members are removed individually;
- duplicate match IDs resolve deterministically to the last stored occurrence;
- duplicate Shared references collapse;
- an active pointer to a missing match is cleared;
- unknown top-level fields are retained for forward compatibility;
- missing additive fields are supplied by the existing normalizers.

This is intentionally not a destructive migration. A partially damaged record should expose every usable round rather than discard the whole ledger.

## Setup lifecycle

While the new-match form is active, relevant input/change events debounce a setup-draft write. The restored draft includes group, course/tee choices, scoring access, selected games, Press configuration, and preferences-derived controls. It always forces:

- `status = active`;
- `completedAt = null`;
- no Press records;
- no frozen RoundRecord or snapshot history;
- no historical scores or stats.

The draft is removed only after a newly created match is durably saved. Cancel explicitly removes it. A draft-write failure is recorded in diagnostics and surfaced as a non-destructive save warning.

## Active round lifecycle

Save Hole applies the visible inputs, records the actual play order and first-completed timestamp, updates the intended current hole, and persists the whole authoritative state before announcing success or starting Shared sync. If the write fails, no success toast is shown and Shared upload is not scheduled.

The stored match owns the current-hole position. Startup clamps it to the playable hole range so an interrupted or out-of-sequence round resumes at a valid location.

Memories, notes, SSP facts, Presses, stats, and scores live within the same match object and therefore cross the same full-state persistence boundary.

## Atomic Finish protocol

Confirm Finish is a prepare/commit transition:

1. Capture visible score inputs into the active in-memory match.
2. Persist the still-active state. Failure stops immediately.
3. Clone and normalize the active round.
4. On the clone, set completion metadata, stop timing, compute completion state, and freeze the eligible RoundRecord.
5. Write a small Finish recovery marker naming the round and whether a frozen snapshot is required.
6. Clone the root state, replace only the matching round with the completed candidate, and write that full state to primary storage.
7. Only after successful primary storage, publish the candidate to live memory, remove the marker, schedule Shared sync, render completed UI, and show success.

The operation is idempotent at the lifecycle boundary: a round that is already durably complete returns complete without rebuilding or duplicating history. Derived settlement transaction IDs use the existing stable round-based scheme.

### Interrupted Finish recovery

If startup finds a marker:

- a matching completed round with completion time and any required frozen snapshot is accepted as durably complete;
- otherwise the stored active round remains active and editable;
- the marker is then removed.

There is no ambiguous hybrid UI state and no completion claim based only on an in-memory mutation.

## Reopen and historical integrity

> **Legacy implementation pending constitutional migration:** Constitution v1.0, Principles 10–12, supersedes reopening as the approved correction model for completed Rounds. Future corrections must use authorized Amendment Sessions and publish a new RoundRecord version while preserving every prior version. The following text remains an accurate description of current behavior, not approval to extend it.

Reopen is explicit. Before the completed round becomes active, its frozen RoundRecord is deep-copied to `roundRecordSnapshotHistory` with a superseded timestamp and reason. The current frozen pointer is cleared, completion time is retained as `previousCompletedAt`, and edits resume.

The reopened state must itself persist successfully before the UI leaves Library. If that save fails, the completed in-memory record is restored. A later Finish creates a new authoritative frozen record while preserving superseded history.

## Next-round derivation

“Play Another Round with This Group” creates a new round ID and session sequence entry. It carries stable player IDs, team membership/names, access preferences, and group-level defaults. It clears course/tee selection, scores, stats, selected games, Presses, notes/recaps, timing, completion metadata, frozen records, and prior Shared credentials. When Shared mode is retained, normal initialization creates a fresh host device and fresh code rather than reusing the previous transport identity.

## Shared Match convergence

The local copy is the working authority for interaction and offline continuity. New Shared rounds are saved locally before cloud creation. Upload or refresh failure therefore changes sync state, not round availability.

Existing reconciliation contracts remain in force:

- scores merge by stable player ID and hole;
- exact replays are idempotent;
- distinct same-player/same-hole values become explicit conflicts;
- SSP facts reconcile as a field envelope;
- Press IDs are stable, deduplicated, and ordered deterministically;
- joined devices cannot create or replace frozen historical snapshots;
- only accepted state is persisted and rendered.

Reconnect schedules an authoritative refresh/push through the existing Shared sync path. Status text distinguishes local-only/local-cache, syncing, synced, and error states.

## Settlement and transaction invariants

Production readiness preserves the existing money engine rather than replacing it. Automated fixtures verify:

- deterministic recomputation from the same round facts;
- stable transaction IDs;
- unique final payment rows;
- zero settlement cross-foot;
- Press-inclusive amounts counted once;
- frozen history preferred over later changes to derivation inputs;
- incomplete/provisional results never presented as settled final history.

## Service-worker lifecycle

The v30.3.70 worker precaches a versioned shell but does not call `skipWaiting()` during install. A new worker waits until the page explicitly sends `SKIP_WAITING`.

The page blocks ordinary refresh while setup, scoring, unsaved score inputs, blocking dialogs, imports, or other unsafe workflows are active. The update banner remains available and changes to “Refresh When Safe”; it does not expose a routine force-through path. Cache reset remains an explicit confirmed support operation.

Navigation requests are network-first with cached `index.html`/root fallback. Static same-origin assets are cache-first and successful fetches are added to the current cache. Activation removes only older Dye Ledger caches and then claims clients.

## Failure communication and diagnostics

Storage failure produces a short golfer-facing warning explaining that the latest change may not survive closing the app. The app does not claim a saved hole, started Shared round, reopened round, or completed round when its critical local write fails.

More → App Updates → Technical diagnostics exposes:

- storage availability and selected load source;
- Finish recovery result;
- last successful and failed local saves;
- active round identity and state;
- scored-hole count;
- Shared role and pull/push/sync state;
- Player Preference schema;
- frozen RoundRecord presence.

Routine match-finalization console output is disabled unless `window.dyeLedgerDebugDiagnostics === true`. Error paths continue to log developer detail and user-facing flows remain concise.

## Verification boundary

Node tests and simulations cover deterministic state, failure injection, reconciliation, money invariants, and source-level worker contracts. Installed iPhone PWA suspension, quota behavior on real devices, and two-device network transitions remain physical QA responsibilities and are listed in `BUILD_NOTES_v30.3.70.md`.

