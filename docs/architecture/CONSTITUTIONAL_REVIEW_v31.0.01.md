# v31.0.01 Constitutional Review

v31.0.01 implements Principles 1, 2, 5, 6, 7, 8, 10, 13, 16, 18, and 19 by preserving Device-local working copies while making acknowledged cloud score facts attributable, durable, and convergent. Account, Golfer Identity, Device, Participant, Owner, and scoring assignment remain distinct.

The score outbox contains working-copy facts only. The cloud acknowledgement and Match revision establish authority without treating the Device as the Account, golfer, Owner, or Participant. Duplicate delivery is idempotent. Contradictory facts are never intentionally discarded by the queue.

No completed RoundRecord is reopened or overwritten. No existing local or cloud record is bulk-uploaded, claimed, merged, deduplicated, rewritten, or deleted. The additive migration preserves existing scores and Match IDs. This release does not implement Amendment Sessions, historical claiming, or cloud migration.

No constitutional conflict was identified. Production database activation remains a separate approval gate.
