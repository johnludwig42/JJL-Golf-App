# System Dark Mode

The app follows `prefers-color-scheme` automatically. No preference, storage key,
or additional settings flow is introduced. The dark palette uses charcoal-green
surfaces, off-white primary ink, green positive states, amber warnings and rose
negative states. Native controls inherit `color-scheme: dark`.

## Palette and cascade

`style.css` contains a single `@media screen and (prefers-color-scheme: dark)`
block. Its overrides use the existing semantic color names. The light values and
frozen baseline remain unchanged. `dark-color-token-catalog.json` is the exact
reviewable registry for the overrides; the contract test rejects unregistered
tokens, print-token overrides and non-screen dark queries.

Legacy `--accent` is both ink and fill. Dark text uses the brighter accent, while
the few legacy button fills have explicit dark-only rules using the selected
surface color. White button ink remains white instead of following card surfaces.
Focus backgrounds and focus outlines retain their different roles.

The on-screen export controls use screen tokens in dark mode. Print families
remain fixed light, and the media block is inactive during printing. Ledger Entry
and generated report windows retain their independent light stylesheets.
Score capsules also receive screen-only ink and surface rules: their shared
renderer supplies inline light export colors, so these few overrides require
`!important`. Their score symbols and dimensions are preserved.

## Verification and limits

Browser coverage measures actual text ink against composed ancestor backgrounds
and gradient stops, accounting for alpha and element opacity. Ordinary text must
reach 4.5:1; large text must reach 3:1. Disabled controls are excluded, as are
transparent input proxies whose visible readback is measured separately. Focused
input ink is measured in an additional case. The tests exercise phone and desktop
surfaces, expanded Player Mode, menus and diagnostics, appearance switching,
geometry preservation, light pixel equivalence, and print isolation.

This is browser verification, not real iPhone acceptance. Before release approval,
check dark/light appearance, Larger Text and the keyboard during scoring on an
iPhone. `-webkit-text-size-adjust: 100%` is intentionally retained until the
typography release can validate its removal with real iOS text scaling.

No scoring, settlement, Round contract, RoundRecord, localStorage, Supabase or
Shared Match behavior changes are included. Diagnostics remain in More → App
Support → Technical diagnostics.
