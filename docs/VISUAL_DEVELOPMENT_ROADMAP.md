# Visual and Usability Development Roadmap

Updated October 10, 2026 following the local v31.0.57 product review. This is the
current sequence for the visual program; it supersedes earlier release numbering
in the original design-token plan. Roadmap inclusion does not implement features
or authorize deployment, database changes, or historical-record changes.

## Review baseline

Current subjective assessment: B+ / 8 out of 10 overall. Visual consistency 8,
everyday usability 7.5, competition transparency 8.5, accessibility 8, and
Apple-like polish 7.5. These are design judgments, not measured acceptance scores.
The earlier numeric grade was not recovered; comparison is against its findings.

The local phone/desktop review found improved colors, typography, control states,
dark appearance, footer behavior, Memory dismissal, reusable setups, and balance
explanations. Remaining issues: narrow Player Mode scoring labels break into
several lines; mobile header/tabs consume substantial scoring space; Preferences
is a long nested form; Results repeats progress/status and missing-score warnings;
Insights opens to Coming Soon; setup repeats assignment labels and nested borders.
Local inspection does not establish deployed status or physical-device acceptance.

## Development delivered

| Release | Delivery |
| --- | --- |
| v31.0.52 | Semantic color foundation and CSS drift safeguards |
| v31.0.53 | System dark mode and contrast checks |
| v31.0.54 | Stroke-play Ledger Entry graphic and cover simplification |
| v31.0.55 | Typography and spacing scales; enlarged-text browser coverage |
| v31.0.56 | Color-token consolidation and separate action/accent roles |
| v31.0.57 | Consistent controls/cards/overlays, readable footer in document flow, reachable Memory Cancel |
| v31.0.58 | Intact score labels, shared Play surfaces, compact SVG navigation, links to existing statistics/history from Insights |

Development delivery is distinct from live promotion and real iPhone acceptance.

## Remaining sequence

### 1. v31.0.58 — Play consistency and navigation icons — development delivered

The compact top row recovers 56px on the tested 375px phone at normal text size.
Normal text fits all six tabs at 320/375/430px; enlarged text scrolls within the
navigation row. Real-device acceptance remains pending. The scope below records
the delivery and its acceptance contract.

- First fix Eagle/Birdie and other score-choice labels at narrow phone widths.
  Keep score numbers prominent; avoid breaking short words into stacked fragments.
- Apply the shared visual system to Play while preserving its job as the current-
  hole scoring instrument and the common Classic/Player controller.
- Connect the existing SVG navigation assets and replace emoji tab icons. Verify
  the available assets match current destinations; select suitable existing vector
  artwork or prepare a matching vector where a destination has no suitable asset.
- Evaluate a compact single-row top navigation treatment to recover scoring space.
  Prototype and compare readability, reachability, long text, and keyboard behavior
  before choosing the final treatment. Bottom navigation remains deferred.
- Bring Insights presentation into the shared system and provide a clear route to
  existing statistics where useful. This does not deliver new analytical engines.
- Update the product-experience documentation to cover all six tabs, preserving
  the distinction between focused Play and overview/drill-in destinations.
- Acceptance: inspect 320/375/430px widths, both modes/appearances, long names,
  enlarged text and keyboard-open scoring. Score choices remain legible; active tab,
  navigation, save/advance and game facts remain accessible without page overflow.

### 2. Preferences and setup density — NEXT focused release

- Group Preferences into concise rows; use accessible trailing switches for binary
  choices and segmented controls for genuine alternatives such as Classic/Player.
- Disclose advanced Press settings while keeping selected non-default rules clear.
- Remove repeated player-slot labels and unnecessary nested card borders in setup.
- Retain context needed to distinguish teams, slots, tees and handicap settings.
- Acceptance: fewer repeated labels and unnecessary containers; essential settings
  are easy to locate, saved values survive disclosure/mode changes, and enlarged
  text remains readable. Compare representative tasks and scrolling before/after.

### 3. Results clarity and overlay consistency — subsequent focused release

- Consolidate Round Status, Round status and Match status into one clear progress
  summary with focused competition detail.
- Show ordinary in-progress rounds calmly. Reserve stronger missing-score warnings
  for attempted completion or a specific action requiring those facts. Preserve
  provisional labels, unresolved-game facts and authoritative completion safeguards.
- Use predictable sheets for Memories, balances, Presses and round completion.
  Review balance detail within Quick Scoreboard to avoid stacking overlays; preserve
  an obvious return to the scoreboard and then the current hole.
- Acceptance: one progress summary, clear provisional/final results, balance details
  reachable within two taps, reliable back/close/focus behavior, and reachable
  controls with the scoring keyboard open. Diagnostics stay quick to reach.

### 4. Useful Insights and actionable empty states — separately scoped feature

- Replace the Coming Soon destination with a small useful first experience.
- Audit existing authoritative statistics and coverage first. Prefer question-led
  views of scoring trends, course/hole performance and round comparisons that can
  reuse existing facts; choose the initial subset during release planning.
- Give empty states a real next action, such as opening recorded round statistics
  or starting a round. Explain missing/insufficient data honestly.
- Keep analytics deterministic and offline-capable. Unknown inputs remain outside
  denominators; do not invent facts or add AI coaching to fill empty screens.
- This is functional product work, separate from the presentation-only program.
  Define eligibility, sample-size/coverage disclosure, architecture and tests before
  implementation; preserve existing Insights Foundation commitments.

### 5. Navigation prototype and final acceptance — after the preceding work

- Reassess whether compact top navigation solves the space problem before deciding
  whether to prototype bottom navigation.
- Any bottom prototype must handle Player Mode bottom actions, Safari/PWA keyboard,
  safe areas, orientation changes and focus without obstructing scoring.
- Complete real iPhone light/dark, Larger Text and keyboard acceptance, plus four
  actual devices exercising Shared Match offline/reconnect, corrections, pending
  saves and completion parity. Automated simulations do not replace these checks.

Versions after v31.0.58 are unassigned until each release is scoped. Physical-device
acceptance should accompany every applicable release, not wait for the final stage.

## Guardrails and broader roadmap

Presentation releases preserve scoring, handicap rules, game facts, saved records,
localStorage compatibility, Shared Match authority, offline saves and fixed light
printed/PDF reports. Continue CSS token safeguards and applicable full release
gates, including rendered browser coverage; passing tests do not prove usability.

After this usability sequence, resume the [Games Development Roadmap](GAMES_DEVELOPMENT_ROADMAP.md):
Dots/Trash, Skins/Press options, three-/five-player Wolf, independent game instances,
Trip/Event work and selected new formats. Existing identity/security, course,
Amendment Session and Memory commitments remain tracked separately. Payment
tracking remains excluded. Four-device acceptance stays an immediate parallel
priority rather than being postponed until game expansion.
