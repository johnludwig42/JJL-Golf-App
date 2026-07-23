# v30.3.75 Constitutional Review — Identity & Security Foundation

Authority: The Dye Ledger Constitution Version 1.0. Status: foundation implemented; staged database and physical-device acceptance remain required. Temporary compatibility exceptions are explicitly bounded by A1–A7.

| Principles | Release effect | Compliance |
|---|---|---|
| 1–5, 16, 18 | Adds Account, permanent claimed/unclaimed Golfer Identity, owner-scoped Personal Golfer Library, explicit Round roles, permanent Round Participation, and separate Device/scoring assignment. | Implements. No attribute is a canonical key; a library relationship never claims another golfer. |
| 6–12 | Adds cloud-authoritative Round ID, immutable same-Round version chain, atomic current pointer, amendment proposal, Owner publication, reason/impact/attribution, and append-only audit foundations. | Foundation implemented. Full Amendment Session UI remains deferred. Legacy local Reopen for Correction remains isolated under A4. |
| 13–15, 17, 19–22 | Round and competition facts remain unchanged; no scoring or settlement engine change. | Preserved. |
| 23 | Separates ownership/access concepts and preserves records. | Partial foundation; privacy and claim workflows remain deferred. |

Legacy anonymous auth, broad Shared Match policies, anonymous Course Catalog mutation, and local completed-round reopen were reviewed. Account authentication is isolated from the legacy anonymous Shared Match session and disabled unless an exact project/environment gate is configured. Target migrations remove anonymous catalog mutation, deny anonymous access to new identity/RoundRecord tables, enforce one authoritative Owner, constrain version relationships to the same Round, and use atomic version publication with append-only audit attribution. Guest Shared Match remains transitional, and no production policy is changed. Public catalog reads remain temporarily for installed-PWA compatibility pending staged acceptance.

Remaining staged obligations are actor-based RLS execution in an explicitly identified disposable database, installed-iPhone PWA retention testing, two-device Shared Match convergence, and configured email delivery and abuse-control acceptance. Complete Amendment Session UI, historical claiming, provider linking, privacy UI, and cloud migration remain deferred rather than represented as complete.

Authentication never uploads, claims, merges, rewrites, deduplicates, or deletes local records.
