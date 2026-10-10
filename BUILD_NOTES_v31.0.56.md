# The Dye Ledger v31.0.56 — Token Consolidation

## Scope

Presentation only. Filled actions retain dark green in both appearances; accent
text, icons and status ink have a separate theme role. The default button now
has white ink on #17603e in dark mode, including components without special rules.
Typography, app-print.css, domain logic, records, storage and Supabase are unchanged.
app.js changes release identity only. No migration is required.

There are 38 documented shared roles, 266 surface-specific exact-paint roles and
18 fixed paper roles: 322 total, down from 346. All 295 numbered names are gone.
This does **not** achieve the proposed 30–40 total: the accepted exact-pixel
constraint preserves the many distinct historical values. Matching light/dark
pairs merge; differences receive names describing their surface/state. Retained
roles and every usage are explicit in the color-token catalog. Translucency
calculations were rejected after pixel comparisons exposed small differences.

Eight dark override rules (12 selector targets) are removed. Ten rules remain
(16 selector targets), documented individually in docs/COLOR_ROLES.md.
`!important` stays at 640: removed action patches had no important declarations;
remaining export-capsule overrides need to beat fixed light/inline paper styles.
The baseline count was 640, not 642. No declarations were removed to game the count.

The token guard rejects numbered names and undefined color references. The frozen
light color/cascade contract still passes after resolving aliases and normalizing
equivalent white/hex/decimal notation. Browser coverage separately checks exact
v31.0.55 pixels, computed styles, paper and unpatched default-action contrast.
The existing dim light build-date footer measures around 2.91:1 in a broader scan.
It is unchanged under the approved exact-light invariant and is a follow-up for
the component/accessibility work, not a new default-action defect.

## Verification

All seven release gates pass: npm test (1,256/1,256); lint (zero errors, 88
pre-existing warnings); validate; all six check:layout fixtures; standard
release:sanity (6 PASS, 3 expected development warnings, zero failures);
simulate:compare (77 exact matches, zero scoring differences/failures); and
test:simulations (4/4). The new browser suite passes 29 checks covering exact
light pixels/computed styles, default-action contrast in both themes and fixed
paper under light/dark system preferences. Existing full dark and enlarged-text
suites also pass. A transient setup timeout passed its focused rerun and the final
full run; no setup logic was changed.

Real iPhone acceptance remains pending: light/dark, Larger Text and keyboard-open
live score entry. Emulation is not device acceptance. Promotion-specific sanity
expects a release branch; the standard development check was used on `codex/`.

## Roadmap and Git

Components shift to v31.0.57; Play/Insights consistency and icon migration shift to
v31.0.58. Bottom navigation remains deferred. Branch:
`codex/v31.0.56-token-consolidation`. No commit, push or deployment performed.
