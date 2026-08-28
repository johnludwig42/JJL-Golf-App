# v31.0.12 — Ledger Entry Correctness and Readability

## Outcome

Ledger Entry now states competition results and tracked statistics more accurately, rejects unsupported Story claims more reliably, and gives dense Grind-mode analysis room to breathe across two statistics pages.

## Correctness

- Selects a meaningful late lead change for margin-game Turning Points instead of favoring an early deficit reduction.
- Defines the Turning Point as the first lead the eventual winner never relinquishes, with a truthful tied-match fallback.
- Describes the actual hole winner, score basis, and post-hole match status without implying that a temporary lead held when it did not.
- De-duplicates repeated featured-competition labels.
- Discloses an unclaimed final carry without fabricating a settlement recipient.
- Validates par-specific and overall GIR claims against recorded opportunities, including surname and pronoun follow-on sentences.
- Removes the transient report transfer key from the printable URL and shows a safe regeneration message if a consumed report is reloaded without its data.

## Readability

- Splits tracked analysis into `Player statistics` and `Player statistics · Shot patterns` pages.
- Adds spacing and visual grouping between statistical categories.
- Adds Fairway as a first-class recovery lie in Classic Mode, Player Mode, and recovery analysis.
- Separately discloses recorded and unknown approach locations and unknown recovery lies.
- Orients margin charts from the Winning Side perspective, falling back to Side #1 for ties.
- Titles the output `Ledger Entry` and prompts desktop users to disable browser-generated print headers and footers while retaining the designed report footer.
- Clarifies 9-hole Course Handicap presentation by showing the 18-hole basis and the strokes allocated to the selected nine.
- Keeps missing or partial stat inputs out of denominators and omits unsupported sections rather than failing report generation.

## Compatibility

- No scoring-entry, settlement arithmetic, local-storage schema, Course Library, Shared Match, or database changes.
- Classic Mode and Player Mode remain unchanged.
- Existing rounds and all four stat-tracking modes remain compatible.
