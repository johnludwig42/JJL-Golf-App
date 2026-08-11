# Shared Match Reliability v31.0.01

## Contract

1. Saving a score writes the local Round first.
2. The changed player/hole is placed in a durable versioned outbox.
3. Retry may duplicate or reorder delivery without duplicating the accepted operation.
4. The server derives Account attribution, validates active Device membership and scoring assignment, commits the score, advances the Match revision, and returns a receipt atomically.
5. The client removes only acknowledged operation IDs.
6. Realtime wakes connected clients; authoritative rows are always pulled from the database.
7. Ten-second visible polling, focus, visibility, and reconnect events provide fallback convergence.
8. Presence is refreshed independently and never proves score parity.

## Security boundaries

- Browser-supplied `updated_by`, server timestamps, and Match revisions are not authoritative.
- A joined Device may write only an assigned player unless the membership is the organizer.
- Realtime topics are private and membership-scoped.
- Diagnostics exclude emails, names, scores, Auth tokens, project credentials, URLs with credentials, and private payloads.

## Activation and rollback

1. Back up schema and data.
2. Inventory `matches`, `match_memberships`, `match_players`, `score_entries`, policies, grants, functions, triggers, and Realtime configuration.
3. Apply `202608100001_v31_0_01_shared_match_reliability.sql` twice to an explicitly approved disposable test environment.
4. Run policy allow/deny, duplicate delivery, assignment denial, retry, offline/reconnect, and two-device convergence tests.
5. Do not apply to production without separate approval.

Rollback removes the new trigger, function, and receipt table but intentionally retains the additive `matches.shared_revision` column and all existing scores. Clients then use the compatibility pathway.

## Acceptance targets

- Local save acknowledgement is immediate.
- Typical online server confirmation is under one second; p95 target is under two seconds.
- Normal reconnect convergence target is under five seconds.
- Zero silent score loss or overwrite.
- Every deterministic failure simulation converges.
