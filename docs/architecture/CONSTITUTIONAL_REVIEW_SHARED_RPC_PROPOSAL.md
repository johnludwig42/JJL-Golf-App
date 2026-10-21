# Constitutional Review — Shared score delivery proposal

Baseline: committed v31.0.77 (91eac02). Owner approved extending the review-only
proposal to completion protection on both transports, with drainable client
preservation. Production execution remains separately unapproved.

Affected principles: 2/5 authority; 6/8/10 historical preservation; 15/22 finality;
18/19 device identity separate from enduring participation; 23 preservation.

The common completion trigger rejects changed scores with P7701 on RPC and direct
paths. Identical retries do not rewrite facts. Receipt replay acknowledges earlier
commits without overwriting later valid corrections. A monotonic score-closure latch
prevents stale metadata from reopening delivery; completion serializes with score
writes on the parent match. No settlement calculation or saved evidence changes.

The tested client patch preserves rejected operations durably for host review before
removing them from pending delivery. Failed storage retains the queue. The outcome
is complete-with-exceptions under remoteCompletionPending, never perpetual backoff.
Unsaved visible inputs and score conflicts remain protected. Preserved values stay
on their originating device; counts alone travel in contact telemetry.

Rollback retains receipts, facts, memberships, revisions and completion protection.
It disables RPC/broadcast without reopening direct writes. No per-cell conflict
protocol or full-card repair is introduced. All 13 catalog migrations were audited;
missing versioned-history tables, broad direct authority, metadata immutability and
identity over-grants remain explicit separate findings, not claimed fixed here.

Mandatory dependency: v31.0.77 indicators first, separately versioned closure-aware
client second, staging/audit/approval third, server rollout last. This avoids closing
a round while unknown remote scores are pending or stranding an old client's queue.

Review artifacts only: SQL outside migrations and a tested unapplied client patch.
Actual cloud auth, schema-cache, Realtime and physical-device behavior remain staging
gates. No production migration, deployment, push or commit has been performed.
