# Constitutional Review — v30.3.90 Shared Match Code Compatibility

## Principles affected

- **Principles 1, 2, 5 and 18:** The change preserves the existing Round, Owner, Participant, Device, and scoring-assignment relationships. A join code is only a locator and never an identity or ownership key.
- **Principles 6, 7 and 10:** Existing Shared Match scores and RoundRecord history are preserved; no active or completed record is renamed or rewritten.
- **Principles 16 and 23:** No mutable golfer attribute is used for matching, and no local or cloud historical data is deleted.

## Compliance

New matches retain the approved canonical `DYE-######` format. The additive legacy path accepts only the exact historical 12-character identifier already attached to an existing match. It does not generate legacy codes, silently migrate identifiers, claim identities, alter access roles, or change scoring authority.

## Security boundary

The compatibility parser accepts either a canonical `DYE-######` code or an uppercase-normalized 12-character alphanumeric legacy identifier. All other forms fail closed. Existing cloud authorization and Shared Match access policies remain authoritative.

No constitutional conflict was identified.
