# Color roles and exact appearance

## Choosing a role

Use the 38 `shared` entries in the color-token catalog for new UI. Choose surfaces
for fills, content for ink, border for outlines, shadow for depth and graphic
roles for chart geometry. `--color-action-primary` is a filled action background;
pair it with `--color-content-on-accent`. `--color-content-accent` is accent ink
on ordinary surfaces. `--accent` remains a compatibility alias for that ink.
Selected controls use `--color-surface-selected`. Never invent numbered variants.

The registry lists scope, purpose, exact value and usage for each role. The 266
`surface-specific` roles preserve existing surfaces and states, including
intentional gradients, subtle row backgrounds, borders and translucent shadows.
Use them only for their documented surface, rather than selecting an arbitrary
success shade. Eighteen `print` roles never get dark overrides.

322 total roles remain, versus 346 previously. The 30–40 target applies to the
shared selection palette; the proposed 30–40 **total** is not achieved because
exact light appearance takes precedence. Further literal consolidation would
need separately approved visual changes. Equivalent pairs were merged; attempted
calculated alpha recipes were discarded when exact pixel checks failed.

Typography and fixed paper metrics remain untouched. The frozen v31.0.55
stylesheet protects pixels and computed styles separately from the original
pre-token source baseline. No new CSS color-function dependency was introduced.

## Remaining dark exceptions

Eight obsolete rules were removed from the original 18 (28 selector targets).
These ten remain, covering sixteen targets:

| Rule | Why it remains |
| --- | --- |
| `input::placeholder, textarea::placeholder` | Explicit placeholder opacity and secondary ink must override native control styling. |
| `#leaderboard .scoreboard-export-card` | Its base surface is fixed paper white; the on-screen export control needs a themed card. |
| `.incomplete-round-warning, .export-incomplete-warning, .export-provisional-label, .export-provisional-detail` | Shared export elements retain light document ink; screen warnings need the dark warning pairing. |
| `#scoreboardPrintViewHint` | Print hint uses fixed paper colors; its screen version needs themed hint ink. |
| `.score-number` | Screen score capsules must override inline/fixed light background and ink. |
| `.score-number.score-empty` | Empty capsules require transparent themed screen paint and secondary ink. |
| `.score-birdie, .score-eagle` | Dark score borders override fixed print under-par borders. |
| `.score-eagle` | Dark inner ring overrides the fixed paper eagle ring. |
| `.score-bogey, .score-doublebogey` | Dark score borders override fixed print over-par borders. |
| `.score-doublebogey` | Dark inner ring overrides the fixed paper double-bogey ring. |

Important declarations remain 640. The removed action patches contained none;
removing the required capsule overrides would reintroduce incorrect screen ink.
Component work in v31.0.57 can address those shared screen/export selectors with
the appropriate separate scope and acceptance tests.

The new probe measures the unpatched default action in both themes; the existing
dark suite continues to check visible app text broadly. A broader light scan found
the dim build-date footer at approximately 2.91:1. Its appearance is preserved by
this release's exact-light invariant; address it in a separately approved
accessibility/component change rather than silently restyling it here.

v31.0.57 addresses that footer with full-opacity secondary ink in the separate
screen component layer. The isolated color-refactor baseline remains frozen;
current component browser checks assert the corrected contrast.
