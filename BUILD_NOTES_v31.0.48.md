# The Dye Ledger v31.0.48 — Game Setup & Score Entry Polish

## Behavior

- Every game has a short description and participant guidance in the game picker. Existing availability restrictions are visible beside the affected choice.
- Lighter selection rows, clearer checkboxes, and a single-column phone layout reduce nested visual framing.
- Nassau, Sixes, and Wolf handicap options are expandable. The current allowance remains visible when closed, and expanded sections stay open through setup refreshes. Existing inputs and saved settings are preserved.
- Player Mode shows net score and match strokes without repeating the tee line. Custom gross scores have an accessible label and white selected text; keyboard focus remains visible.
- Navigation, game rules, scoring calculations, Shared Match authority, and payment handling are unchanged. No database migration is needed.

## Verification

- Browser coverage exercises a custom Nassau allowance, setup refresh, collapsed-option submission, saved stakes, Player Mode custom scoring, selected-score contrast, and 375px overflow.
- All 40 focused checks passed, including existing setup, Wolf, specialty-game headers, score/stat entry, and Player Mode regression checks.
- Scoring comparison: 127 scenarios (100 random plus 27 fixtures), zero failures and zero live/mirror differences. The simulation also reported 92 informational warnings and one review flag for the intentional blowout fixture's settlement over $100; these are not calculation mismatches.
- Lint: zero errors; 88 existing warnings.
- Release validation passed. Phone (375px) and desktop (1280px) visual review confirmed readable selected scores and expanded options. Actual iPhone PWA lifecycle and real multi-device cloud behavior remain manual acceptance checks.

## Promotion

Development branch: `codex/v31.0.48-game-setup-polish`. Changes are local and have not been committed, pushed, merged, or deployed by Codex.

Manual acceptance: choose games on phone and desktop; open handicap options, edit an allowance, and start a round; enter a custom score in Player Mode; verify an existing round and Shared Match setup retain their behavior.
