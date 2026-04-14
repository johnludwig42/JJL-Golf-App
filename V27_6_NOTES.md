The Dye Ledger v27.6 — shared scoring persistence fix

What changed
- Shared-match syncing now reads the live current-hole DOM state into the active match model during play instead of relying only on explicit hole saves.
- Score input changes now schedule shared sync from the real on-screen score fields.
- Stat changes, including putts, now schedule shared sync from the real on-screen stat fields.
- Greenies winner changes now schedule shared sync and are persisted through the shared match payload.
- Cloud payload now includes greenies winners inside the greenies selected-games config so shared hydration can reconstruct them.
- Shared hydration now restores greenies winners from the cloud payload.

Exact mutation path used for shared sync
- Live score/stat/greenies inputs on the Score tab update the current active match via applyCurrentHoleDomToMatch(...).
- Shared sync is then scheduled through scheduleSharedActiveMatchSyncFromDom(...), which persists locally and debounces uploadSharedMatch(...).
- Explicit saveCurrentHole(...) still uses the same DOM-to-match path before persisting and scheduling cloud sync.

What state is now persisted during play
- player hole gross scores
- player hole stats (fairway, green, putts, up-and-down, sandy)
- greenies winners for the current hole
- progress fields: lastTouchedHole and lastFullyCompletedHole

Version
- App version advanced to v27.6.
