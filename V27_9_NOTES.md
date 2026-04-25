The Dye Ledger v27.9 — smart putts defaults

Scope
- Narrow stats-tracking update only, based on v27.8.
- No intentional changes to scoring rules, Supabase shared sync, print/export, payout layout, or auto-advance behavior.

What changed
- New stat rows default putts to 2 instead of 0.
- Stat entries now carry a lightweight puttsSource marker in local/app state: default, auto, or user.
- Checking Up & Down or Sandy auto-sets putts to 1 only when the putts value is still default/auto-managed.
- If the user manually edits the putts field, it is marked as user-controlled and checkbox toggles no longer overwrite it.
- If Up & Down/Sandy are unchecked and the putts value had been auto-set, it reverts to the default of 2.
- Putts field still auto-selects on focus so the visible value can be overwritten easily.

Validation notes
- Create a stat-enabled match and open Scoring Input.
- Putts should show 2 by default on new holes.
- Checking Up & Down or Sandy should set putts to 1.
- Manually changing putts after that should be allowed and should not be immediately overwritten.

Version
- App version advanced to v27.9.
