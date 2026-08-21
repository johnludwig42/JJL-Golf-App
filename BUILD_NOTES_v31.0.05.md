# The Dye Ledger v31.0.05 — Course Library Stabilization

## Scope

- Protects approved Course Library records from normal browser editing, deletion, and synchronization writes.
- Limits publication to explicit local changes and rejects attempts to update another Account's draft.
- Skips unchanged course and tee rows and writes each tee's holes in one conflict-safe batch.
- Adds bounded cloud-operation timeouts, safe automatic retries, per-course progress, and preserved retry state. New parent inserts stop for explicit reconciliation rather than risk duplication after an ambiguous timeout.
- Refreshes only affected courses after publication instead of downloading the entire catalog.
- Shows Local Changes, Draft Uploaded, Approved, and Needs Attention states.
- Adds a protected maintainer-only approval action using the existing `publish_course` RPC.
- Publishes each draft course, its tees, and its holes in one database transaction so a failed request cannot create a partial cloud draft.
- Retains an independent pre-publish local recovery copy until the cloud course is read back and every tee and hole matches.
- Keeps unfinished and problem courses visible ahead of recently played courses and offers a Restore Local Course action when recovery data exists.
- Treats zero-hole and partial cloud tees as incomplete instead of filling them with default hole data.

## Persistence and compatibility

- Existing local courses, downloaded catalog courses, Round Course Snapshots, matches, and completed RoundRecords remain compatible.
- Failed uploads remain saved locally and eligible for retry.
- Verified cloud parity is required before a local course is labeled Draft Uploaded.
- Includes an additive schema migration for the `(tee_id, hole_number)` uniqueness key required by conflict-safe hole writes.
- The migration stops without changing data if duplicate hole rows are detected; it never performs automatic duplicate deletion, catalog cleanup, or a production data rewrite.

## Automated verification

- Focused Course Library and security suite.
- Full application regression suite.
- Release metadata and immutable PWA asset validation.
- Scoring simulation comparison between the live and mirror engines.

## Manual acceptance still required

- Create and upload a new course while signed in, then verify Draft Uploaded state.
- Approve the draft with a maintainer Account and verify Approved/read-only state.
- Download the approved course on a second signed-out device.
- Confirm a publication touches only the intended course and completes materially faster than the prior 149-second run.
- Perform a read-only production audit of the 19 courses previously reported as updated; do not rewrite or delete them during the audit.
