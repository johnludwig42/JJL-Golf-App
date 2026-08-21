# Constitutional Review — v31.0.05 Course Library Stabilization

## Scope

This release stabilizes the transitional Course Library cloud workflow. It protects approved catalog records, limits browser writes to authorized drafts, batches a tee's hole writes, bounds and retries cloud operations, refreshes only affected courses after publication, exposes clear Local Changes / Draft Uploaded / Approved / Needs Attention states, and provides maintainers a protected approval action.

## Constitutional alignment

- **Principles 1 and 4 — ownership:** locally authored course drafts remain available on the device when cloud work fails. Authorization is checked before publication, and another Account's draft cannot be updated.
- **Principles 6, 7, and 13 — historical integrity:** Course Library synchronization does not mutate Round Course Snapshots or completed RoundRecords. Existing rounds remain insulated from later Library changes.
- **Principles 8 and 10 — information class and version safety:** approved catalog data is treated as protected reference data. Ordinary browser editing, deletion, and synchronization cannot rewrite approved rows.
- **Principles 11 and 12 — governed change:** promotion from draft to approved uses the existing protected maintainer RPC. The browser does not manufacture approval authority.
- **Principle 19 — independent lifecycles:** local course state, cloud draft publication, catalog approval, and Round history remain separate lifecycles.

## Risk controls

- Only explicit local write candidates enter publication.
- Approved, archived, rejected, legacy, and maintainer-owned catalog rows are blocked before any browser write.
- Hole writes use the existing `(tee_id, hole_number)` uniqueness contract.
- Timed-out idempotent operations retry once and leave the local course marked for attention if recovery fails. New course and tee inserts are not blindly replayed after an ambiguous timeout.
- Successful publication refreshes only affected course IDs; explicit Download Cloud Courses remains the full-catalog refresh action.
- No migration, destructive catalog cleanup, automatic duplicate deletion, or production data rewrite is included.

## Deferred operational verification

Production acceptance still requires the documented two-device workflow and a read-only audit of the 19 courses previously reported as updated. This release prevents recurrence but does not infer or rewrite historical production records.
