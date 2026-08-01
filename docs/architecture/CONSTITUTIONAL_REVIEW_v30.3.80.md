# v30.3.80 Constitutional Review

## Affected principles

- **Principles 1 and 4:** setup preferences and saved-course choices remain local to the user's library; navigation does not change ownership.
- **Principles 2, 5, and 18:** Round roles, participation, and scoring assignment remain separate despite being configured through different setup destinations.
- **Principles 6, 7, 8, and 10:** existing RoundRecords and historical facts are untouched; setup state remains a mutable working draft before a Round begins.
- **Principles 13 and 15:** games remain owned by the Round context that contains them, and their scoring contracts are unchanged.
- **Principle 23:** optional location use is transient and does not create a stored location record or alter preservation/deletion behavior.

## Compliance

The five destinations are views into one additive setup draft. They do not create competing Round identities, silently change roles, infer Golfer Identity from mutable attributes, or equate a Device with an Account. The existing Player, team, scoring-assignment, Shared Match, and game configuration data remain authoritative.

Nearby course discovery is explicit, optional, and degradable. It operates only after user action, does not automatically select a course, does not store coordinates, and leaves normal saved-course search available when offline, denied, unavailable, or missing course coordinates.

Weather capture is a living personal preference inherited only by new round drafts and may be overridden for one round. Existing rounds retain their stored or legacy behavior, and disabling capture changes neither scoring nor historical facts. Reference Tee remains a mutable pre-round calculation choice rather than an identity key or historical rewrite.

No completed RoundRecord is reopened or overwritten. No local history is uploaded, claimed, merged, deduplicated, rewritten, or deleted. No Supabase schema, policy, Auth configuration, production data, or deployment is changed.

## Deferred constitutional work

Cloud-authoritative setup synchronization, privacy controls for any future stored location information, historical claiming, and completed-Round Amendment Sessions remain separate future work.
