# Design token foundation

## Approved release sequence

1. v31.0.52: semantic colors, literal conversion, and drift guardrail; preserve light appearance.
2. v31.0.53: system dark-mode palette and AA body-text contrast.
3. v31.0.54: focused stroke-play Ledger Entry report interlude.
4. v31.0.55: rem typography and spacing scales, minimum readable text, real iOS Larger Text acceptance.
5. v31.0.56: semantic color-token consolidation and separate action/accent roles.
6. v31.0.57: common controls, cards and overlays; footer and Memory dismissal fixes.
7. v31.0.58: Play consistency, narrow score-label readability, navigation SVG icons, compact top navigation and Insights presentation.

The [Visual and Usability Development Roadmap](VISUAL_DEVELOPMENT_ROADMAP.md)
records the October 10, 2026 review and remaining sequence: Preferences/setup
density, Results/overlay clarity, separately scoped useful Insights, and later
navigation evaluation. Subsequent release numbers are unassigned.

Bottom navigation is deferred. Any later prototype must account for score-entry controls, the keyboard and safe areas. Diagnostics remain quickly reachable. Domain logic, Round/record contracts, persistence and shared scoring are outside this program.

## Color contract

`style.css` begins with the `:root` semantic color declarations. Families identify surface, content, action, border, focus, shadow, graphics and print roles. Existing `--bg`, `--card`, `--text`, `--muted`, `--accent`, `--accent-2`, `--border`, `--danger` and shadow usages remain compatible through aliases.

Numbered shade variants retain exact legacy values and notation to meet the pixel-equivalent light-mode requirement. They are role-scoped, not a single global palette keyed only by hex: white foreground and white surfaces, for example, have different roles. The later palette/component releases can consolidate variants deliberately; this release does not silently merge near-matching shades or change the cascade.

The checked-in `tests/fixtures/design/color-token-catalog.json` documents every initial token, its family, fixed light value and sample selectors. Review a new token's semantic purpose before adding one. Changing a palette value is a visual change and requires computed-style/visual coverage.

## Guardrail and exception policy

`tests/style-token-contract.test.js` uses the development-only PostCSS parser through `scripts/css-token-contract.js`. It rejects:

- Hex, named and functional literal colors outside `:root` declarations named `--color-*`, including literal variable fallbacks and unreviewed embedded SVG colors.
- New px `font-size` values, including sizes inside `clamp`, and px font shorthand.
- Extra copies of grandfathered px declarations, missing exception reasons, and stale exception counts.

`tests/fixtures/design/style-exceptions.json` is an exact inventory of pre-existing px typography, keyed by media context, selector, value and importance. It has no color exceptions. Exceptions have documented reasons, exact occurrence counts and a migration target; there are no wildcard selectors or blanket px-value allowances. Remove entries as declarations migrate. Do not enlarge the inventory to accommodate new styles. The type-scale release must retire this typography debt; intervening releases should shrink the list when retiring declarations, without bundling an unrelated typography redesign.

`inherit`, `currentColor`, and references to semantic variables are behavior, not new literal colors. Comments and quoted textual content are not interpreted as colors. Tokens introduced for a later dark palette must remain in explicit token declaration blocks.

## Light and print acceptance

`tests/fixtures/design/light-style-baseline.css` is the frozen stylesheet from the preceding release. The guard test verifies that expanding the new color variables reproduces every original declaration's value, selector, media context, ordering and importance. This supports cascade preservation; it is not a substitute for browser coverage.

The browser test compares computed styles and screenshots against that baseline with the same application code, synthetic data, viewport and interaction state. It covers the main surfaces, score-entry modes, inputs and overlays. No dark palette or text-size adjustment change ships in the foundation release.

From v31.0.55, screen typography and spacing intentionally change. The frozen
baseline continues to protect color declarations and computed paints; exact
paper metrics and screenshot equality are retained through `app-print.css`.
The separate type-scale tests check minimum text size and enlarged-text reflow.

In v31.0.56 the color registry is consolidated and its numbered extraction names
are replaced by shared or surface/state-specific roles. The original baseline
remains frozen; source checks resolve compatibility aliases and normalize only
equivalent white/hex/decimal notation. A separate frozen v31.0.55 baseline checks
exact computed styles and pixels. See [Color roles](COLOR_ROLES.md) for the shared
palette, retained exact-paint roles and remaining dark exceptions.

Print families are intentionally fixed to their light values. Later dark-mode overrides should be screen-scoped, and must not override the `--color-print-*` families. Ledger Entry has its own stylesheet and remains light. Both print-media checks and the complete `npm run check:layout` HTML/PDF/iOS reference gate remain mandatory.

## Approval

All requested automated gates must be run for each release. Real iPhone acceptance—including system appearance, Larger Text and a visible score-entry keyboard—is a separate gate. Browser emulation does not satisfy it. Do not proceed to the dark-mode release until the foundation is reviewed.
