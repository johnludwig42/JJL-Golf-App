# Constitutional Review

## Proposal

Name: Foundational Games — Sixes (6-6-6)  
Version: v31.0.40  
Owner: Product Owner  
Date: 2026-09-07

## Affected Principles

- **Principle 6 — RoundRecord (direct):** Sixes configuration, derived segment results, and settlement belong to the authoritative RoundRecord and use the existing competition persistence path.
- **Principle 7 — Historical Facts (direct):** Saved gross scores and the saved four-player order are historical facts; pairings, segment results, and settlement are derived from them.
- **Principle 8 — Information Classes (direct):** The ordered player selection and game configuration are immutable Round facts after scoring begins. Results and settlement are derived analytics.
- **Principle 13 — The Round (direct):** Sixes is contained entirely within one 18-hole Round and does not expand the Round into a trip or event.
- **Principle 15 — Competition Ownership (direct):** All three Sixes segments are single-Round competitions owned by that Round.
- **Principle 22 — Competition Finality (direct):** Each segment becomes final only when complete or mathematically decided. The round cannot report all games final until all three segments are decided.

## Historical Integrity Review

- The proposal does not alter completed RoundRecords.
- It does not silently overwrite historical facts.
- It does not change authoritative ownership.
- It does not require an Amendment Session or migration.
- It does not affect Event Record finality.

Existing rounds without a `sixes` selected-game configuration remain unchanged. Once scoring begins, the ordered Sixes player list is read-only so prior holes cannot be reassigned to different partnerships.

## Identity and Ownership Review

The proposal does not change user identity, Golfer Identity, Device identity, Round roles, administrative ownership, participation, membership, or attendance. Existing Shared Match host authority and score synchronization rules remain in force.

## Privacy and Preservation Review

The proposal does not remove access, hide information, withdraw content, anonymize identity, archive records, or delete information. Existing retention and RoundRecord preservation rules apply.

## Conflict Assessment

- No constitutional conflict identified.

Sixes is an additive single-Round competition whose saved configuration and derived results follow existing Round ownership, historical-integrity, and finality boundaries.

## Approval

Product Owner approval: Approved in release instruction  
Date: 2026-09-07  
Implementation authorization: Approved for v31.0.40
