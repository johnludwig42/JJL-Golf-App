# v31.0.10 — Complete Grind Statistics Reporting

## Outcome

Ledger Entry now turns the detailed facts captured in Enhanced and Grind modes into useful, auditable round analysis while remaining safe for None, Casual, partial, and legacy rounds.

## Expanded statistics

- Adds penalty-free tracked-hole rate and preserves sample sizes in rate displays.
- Adds scrambling and sand-save rates with explicit opportunity denominators.
- Adds recovery performance by rough, bunker, fringe, and other lie.
- Adds tee-shot dispersion plus score-to-par and penalty-free consequences by hit, left, and right outcomes.
- Adds the complete 3×3 approach-dispersion map and scrambling results by short, left, right, and long miss axes.
- Adds one-putt rate, three-putt rate, putts per GIR, putts per missed GIR, and performance by par type.
- Adds a tracking-completeness table that discloses unknown GIR and recovery-lie facts.

## Data integrity and compatibility

- Missing values remain unknown and are excluded from denominators rather than converted to misses or zeroes.
- Advanced sections render only when the underlying facts and opportunities exist.
- Defensive report access supports older and partially populated tracked-stat records.
- Classic and Player Mode continue to share the same round facts and calculation path.
- No scoring, settlement, Shared Match, Course Library, localStorage, or database schema changes are required.
