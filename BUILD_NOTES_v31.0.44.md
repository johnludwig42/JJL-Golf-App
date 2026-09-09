# The Dye Ledger v31.0.44

## Wolf Declaration Experience

- Replaces Wolf's two-select declaration flow with one-tap partner, Lone Wolf, and optional Blind Wolf choices.
- Orders the three partners first by playing order, followed by Lone Wolf and Blind Wolf.
- Shows a separate Clear declaration action only after a declaration exists.
- Preserves the hidden declaration state and existing present-only Play save guard.
- Keeps optional notes and saved partner values safe when individual controls are absent.
- Lets golfers deliberately collapse an undeclared Wolf panel during the current-hole session without it reopening after every score change.
- Explains pending low-points assignments and shows playing-order context only when it differs from the hole number.
- Preserves Wolf scoring, points, handicaps, settlement, reporting, persistence, and local-only Shared Match behavior.

## Release gate

- Focused interaction tests cover declaration state, handler isolation, collapse behavior, pending wording, responsive option order, and existing undeclared-hole disclosure.
- Full tests, simulation comparison, release sanity, validation, lint, layout checks, and 320/375/430px visual reviews remain required before release.
