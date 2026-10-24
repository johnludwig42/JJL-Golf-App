# v31.0.80 — Team Names and Keyboard Persistence

Baseline: bab4802 (v31.0.79), clean working tree. Branch:
`codex/v31.0.80-team-names-and-keyboard`. Owner approved this focused scope on
October 24, 2026 after two-phone acceptance of .79 identified these exceptions.

## Changes and causes

- Host publication carries an additive `teamNames` array in the existing shared
  match metadata. Initial hydration and routine remote refresh consume it, including
  empty entries that select the first-name fallback. Old metadata without the field
  leaves known labels alone. Host edits, completed rounds, frozen records and pending
  remote-completion snapshots are not label-merge targets. No extra polling query,
  identity rule, SQL or score-upload contract is introduced. Both phones need .80.
- Play already used the custom-name/first-name helper, but routine metadata polling
  did not refresh names. Featured scoreboard tiles now use that same compact label
  without appended full golfer names. Ordinary report/calculation formatters retain
  their prior default output. Duplicate first names retain disambiguation.
- Team-name controls update in place when the team structure is unchanged, preserving
  the focused native input. This complements the existing per-keystroke safeguard.
- Full redraws defer while a text/number/search field, textarea or editable content
  is focused, during IME composition, or while a background redraw would replace an unsaved Play score.
  Shared data fetch/merge, delivery and local persistence continue normally.
- A deferred refresh runs after editing and the triggering pointer action finish.
  Unsaved non-score text drafts are carried across replacement controls using stable
  identifiers. Passwords are excluded from draft copying. The same focused element
  remains during typing, so no asynchronous refocus is used to reopen a keyboard.
- Account & Security reuses the existing form on unchanged visible account state,
  including same-account token refreshes. Session tokens are not part of its view
  signature; actual account, OTP and profile transitions still render immediately.
  Authentication, refresh, sign-out and identity authority are unchanged.
- Direct Story and Memory panel refreshes also protect a focused editor. Automatic
  remote completion waits for active non-score text entry to finish. Explicit Save,
  Cancel, navigation and existing smart-score advance retain their own behavior.

No scoring, handicap, wager, settlement or frozen-record change. No production SQL,
commit, push or deployment performed.

## Verification

- New targeted checks: 10/10 (three domain and seven browser tests).
- Balance-preview and keyboard interaction regressions: 10/10. This includes
  intentional Save/Next while the score field is focused, in Classic and Player.
- Account/keyboard plus existing identity-contract tests: 25/25.
- Final isolated full suite: **1,519/1,519 passed**, zero failed/skipped/cancelled;
  611.3 seconds. Both permanent RPC/direct transport suites, preserved-score recovery
  and all new name/keyboard scenarios are included.
- Lint: zero errors, 88 existing warnings. The changed identity module also passes
  a targeted browser-config lint with its existing `location` global declared, and
  its independent syntax check. Validate passes .80 metadata, assets,
  syntax, worker lifecycle and documentation.
- Release sanity: 6 PASS, 3 WARN, 0 FAIL (working tree plus omitted target argument's
  note/app-shell checks; validate checks the actual .80 files).
- Simulation comparison: 77/77 exact, zero differences/failures; 54 warnings and
  one suspicious outcome. Simulation tests: 4/4. The mirror still excludes Flamtana.
- Flamtana stress: 50/50 against retained .79 output. Settlement money per component,
  combined payments and complete saved evidence remain byte-identical. All page
  counts also match: split 7–8 (13 rounds), back9 7–8 (12), last6 8–10 (12),
  hole18 8–10 (13).
- Layout: seven references pass at 8/5/5/5/5/11/7 pages. Extracted PDF text and page
  counts match all committed references; generated PDF metadata churn was removed.

Initial verification caught a redraw guard blocking intentional hole navigation,
which broke the existing unsaved Quick Scoreboard preview test. Background redraw
protection is now separate from explicit Save/Next rendering; that unchanged
regression and the new focused Save/Next assertions pass. The legacy navigation
source assertion was updated to the new persistence/redraw call sequence without
relaxing the save-before-scroll requirement; the new browser test also injects
failed persistence and verifies no redraw or scroll occurs.

An intermediate full run had a non-clickable Start button in the older game-setup
polish test; its unchanged isolated rerun passed. Another intermediate run caught
an invalid test-only account project identifier, corrected to pass the existing
configuration gate. Neither existing test nor its timeout was weakened. Final
verification ran on frozen code without concurrent browser suites and passed all
1,519 tests. No reproducible automated failure remains; physical iPhone keyboard
acceptance and real production two-device service behavior remain manual checks.
New tests: three engine/domain checks and seven native Chrome browser scenarios.
The latter use isolated device contexts and real metadata parsing, not production
Supabase or a physical iPhone keyboard. Test setup was corrected to open the actual
Players/Story destinations before attempting focus; no product assertions were removed.

## Physical iPhone acceptance

1. Install .80 on host and remote. Resume an unfinished shared round; retain its
   scores. Rename a team on the host and tap Update Match. After normal sync, inspect
   Classic, Player and featured Scoreboard labels on the remote. Repeat with a rename
   and with an empty name; the latter must show first names, not Team 1 plus full names.
2. Type a long team name through at least two refresh intervals. Move the cursor,
   select text and keep typing. Test both appearances and larger text. The keyboard
   should stay open and the cursor/selection should remain in the same field.
3. Repeat while editing a Story, adding a Memory, editing a course/golfer and entering
   setup text. If signing in, session refresh should retain the email/code field;
   actual sign-out must still work. Save, Cancel and switching fields must remain intentional and reliable.
4. Score in Classic and Player modes with a remote score arriving during entry.
   Verify the draft survives, Save works, and existing smart-score advance behaves as
   selected. Lock/unlock and reconnect; check delivery and parity independently.
5. Confirm a completed frozen scorecard, accepted Story/report and settlement remain
   unchanged. A browser automation pass does not prove iOS software-keyboard behavior.
