# The Dye Ledger
Version: v30.3.9
Release Date: 2026-06-20

## Release Theme
Four reliability fixes for shared matches and on-course scoring. Each change targets a confirmed root cause rather than masking the symptom.

## Changes

### 1. Joined device is assignable almost immediately
**Symptom:** A device joins, shows "Ready for assignment," but the host can't actually select it for up to ~30s and sometimes gets "That device is no longer available."
**Root cause:** The host's assignable list (`match.sharedDevices`) only refreshed on slow cadences — a 30s timer plus a 3s fast-poll that self-terminated after 60s — and there was no on-demand refresh when the host opened the assignment dropdown. `setSharedPlayerAssignment()` then validated against the stale local list and rejected the just-joined device.
**Fix (app.js):**
- The fast-refresh poll now re-extends its own window each tick while `shouldRunSharedConnectionFastRefresh()` is true (i.e. while the host is on the setup panel), instead of dying after 60s.
- Added `focusin` / `pointerdown` handlers on the shared admin panel that pull the live device list the moment the host touches an assignment dropdown (debounced to 2s; only re-renders if the device set actually changed, so the native picker isn't collapsed mid-open).
- `setSharedPlayerAssignment()` now does an on-demand refresh and re-validates before showing "no longer available."

### 2. Score keypad opens on the first tap
**Symptom:** On the Play tab you had to tap a stat (or some other control) once before the numeric score field would accept input.
**Root cause:** A fixed app-shell layout (`html,body{overflow:hidden}`, `main{position:fixed;overflow-y:auto}`) plus a JavaScript viewport guard that repeatedly called `window.scrollTo` on score-input focus. Focusing an input inside a fixed scroll container over an `overflow:hidden` body made iOS Safari swallow the first tap that should have raised the keyboard.
**Fix (style.css + app.js):**
- Converged on a single **sticky** app shell (see Defect 3) so the page scrolls natively and inputs focus normally.
- Removed the vertical `window.scrollTo` churn from `resetHorizontalViewportPosition()`; horizontal drift is now prevented purely in CSS (`overflow-x:hidden`).

### 3. Header tabs stay pinned while scoring
**Symptom:** The six top tabs (Match/Play/Scores/Library/Insights/More) slid off-screen when the keyboard opened during scoring.
**Root cause:** `.app-chrome` was `position:fixed`, which anchors to the layout viewport; when the iOS keyboard shifts the visual viewport the fixed chrome moves out of view. Five stacked, conflicting `.app-chrome` blocks had accumulated across versions, with the fixed-shell block (v30.3.7) winning.
**Fix (style.css):** Replaced the v30.3.7 block with one canonical **sticky** shell (`.app-chrome{position:sticky;top:0}`, header/tabs static, `main` a normal in-flow block). The new block is last in the cascade and includes targeted overrides to beat the higher-specificity rules left by the older blocks (`.app-chrome + main{padding-top}` and `body.keyboard-open .app-chrome{position:fixed}`). The scoring hole-nav sticky offset was updated to `var(--app-chrome-height)` so it pins just below the tabs instead of behind them.

### 4. Joined-device memories reach the host
**Symptom:** Memories added on a joined device never showed up on the host.
**Root cause:** `buildCloudMatchPayload()` stamps `course_snapshot.sharedMatchMeta.memories` from local state only. Because the host upserts the whole match row on a 200ms debounce while scoring — far more often than it polls memories (30s) — it repeatedly overwrote the joined device's freshly published memory. (RLS was not the blocker; `created_by` is null and the owner policy permits the update.)
**Fix (app.js):** `uploadSharedMatch()` now re-reads the live `sharedMatchMeta` immediately before the matches upsert and unions memories via `mergeRoundMemoryLists()` (and unions devices, and preserves the host's assignment map on non-host uploads) before writing.

## Files Modified
- app.js
- style.css
- index.html
- manifest.json
- service-worker.js
- README.md

## Known Limitations / Follow-ups
- Defect 4's fix narrows but does not fully eliminate the write race (a concurrent write landing in the few-ms gap between read and upsert could still be lost). The durable fix is a dedicated append-only `match_memories` table with per-participant RLS, deferred to a later release.
- The older superseded `.app-chrome` CSS blocks (v30.1.5 / v30.3 / v30.3.3 / v30.3.6) were left in place and neutralized via cascade rather than deleted, to avoid disturbing the unrelated rules interleaved within them. A later cleanup pass could remove the dead layout rules.

## Validation Checklist
- [ ] Host creates a shared match; a second device joins; the host can select it in the assignment dropdown within a few seconds.
- [ ] Assigning a just-joined device does not throw "That device is no longer available."
- [ ] On the Play tab, tapping a score field raises the keyboard and accepts input on the first tap (test on a physical iPhone / iOS PWA).
- [ ] The six header tabs remain visible and tappable while a score field is focused and the keyboard is open.
- [ ] A memory added on a joined device appears on the host within one refresh cycle, and the host's own memories are not lost.
- [ ] Local-only (non-shared) matches and existing saved matches still load and score normally.
- [ ] Scoring hole-nav and the bottom action bar still stick correctly while scrolling the score grid.
