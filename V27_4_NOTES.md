# The Dye Ledger v27.4

- Corrected score auto-advance wiring on the live score inputs used during play
- Auto-advance timer is attached directly to the real `[data-score-player]` input handler
- Each keystroke resets the 300ms timer
- Timer completion commits the live field, saves the hole, triggers shared sync through the existing save path, and advances focus
- Generation tracking prevents stale timers and duplicate advances
- Enter and blur remain as backup commit paths
