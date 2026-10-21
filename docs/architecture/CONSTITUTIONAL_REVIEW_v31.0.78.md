# Constitutional Review — v31.0.78

Owner authorization: prepare the reviewed closed-round client patch as v31.0.78.
Baseline: clean 3e5a7a0, including committed client v31.0.77 and the review package.

Affected principles: 2/5 authority, 6/8/10 historical preservation, 15/22 finality,
18/19 device identity, and 23 preservation of unacknowledged score evidence.

The client handles P7701 identically for RPC and direct uploads. It atomically moves
pending operations into durable local host-review evidence before draining them,
then displays complete-with-exceptions rather than abandoning or retrying them.
Storage failure retains pending operations. Earlier acknowledged batches retain
their acknowledgements. Preserved scores do not amend the frozen result.

Reload derives closure and exception counts from durable evidence, even if the
working match marker was not saved. A stale primary parity flag cannot imply
verified delivery. Unsaved visible fields and local/frozen conflicts remain guarded.
Only counts travel in device telemetry; complete evidence stays on its device.

This implements the previously reviewed client proposal. No new conflict with the
Constitution is identified. Scoring, settlement, stored RoundRecords, authority
rules, database migrations and the separate versioned-history architecture do not
change. Production still uses its existing delivery contract until separately
approved server work is deployed.

Mandatory rollout order: v31.0.77 device indicators, then v31.0.78 on all participating
devices, then Supabase staging/audit acceptance and separate production approval.
This client release alone does not establish the server-side completion barrier.
