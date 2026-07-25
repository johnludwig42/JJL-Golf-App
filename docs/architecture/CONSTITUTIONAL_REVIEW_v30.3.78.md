# v30.3.78 Constitutional Review

## Affected principles

- **Principles 1, 6, 7, and 8:** scoring devices remain working copies, Round facts remain authoritative, and Player Insights are derived analytics rather than duplicated historical facts.
- **Principles 9 and 13:** memories and recap controls remain part of the Round Story while being visually collapsed by default on Scores.
- **Principle 10:** presentation changes do not overwrite completed RoundRecords; frozen historical inputs remain preserved.
- **Principles 13, 15, and 22:** competition summaries and settlements continue to derive from the authoritative record that owns each competition.

## Compliance

The next-hole viewport behavior runs only after a successful local persistence step and changes no Round fact. Closed-by-default disclosures alter presentation only. Printing and PDF generation remain independent of disclosure state.

Player Insights in this release must be deterministic derivations from scored holes and optional stat facts. Missing information is excluded rather than estimated, and incomplete-round output must be labeled provisional. No mutable golfer attribute becomes an identity key.

Yardage separators, adaptive score-distribution columns, and SSP money annotations are presentation-only derivations. SSP chart geometry remains based on authoritative cumulative point facts; money labels are derived from those facts and the configured point stake. No competition, settlement, score, handicap, or historical record is rewritten.

Shared Match host authority, Participant history, Device attribution, scoring assignment, SSP facts, Press facts, offline behavior, and exactly-once settlement remain unchanged.

## Deferred

The broader Shared Match Summary hierarchy and iPhone-readability redesign, additional round analytics, expanded active/completed/frozen/Shared Match presentation coverage, and the associated full manual device/PDF acceptance matrix move to v30.3.79.

Career analytics, coaching recommendations, historical cloud aggregation, Account activation, cloud ownership activation, Amendment Sessions, historical claiming, and privacy workflows also remain outside this release.
