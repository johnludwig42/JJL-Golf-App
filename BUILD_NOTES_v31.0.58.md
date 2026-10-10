# The Dye Ledger v31.0.58 — Play & Navigation

## Scope

Screen-only Play refinements and a compact scrolling row of labeled SVG tab icons.
Score-choice labels remain intact and choices reflow as text grows. Common Play
surfaces reuse component radii and the player selector retains a flat row header.
Four previously unused navigation SVG files receive a matching monochrome style;
new Library and Insights assets match their actual destinations. Icons inherit
the theme's navigation ink and are decorative; visible labels name each button.
Navigation asset URLs carry the release version and are precached. Main navigation
exposes the current page; selecting a tab keeps it in the independently scrolling row.

Insights provides links to the existing Scores statistics and Library rounds
destinations, with clear disclosure that cross-round analytics remain future work.
No analytics engine is introduced. Existing destination selection stays ephemeral.
The visual roadmap and product-experience documentation cover all six tab jobs.

Scoring, handicaps, game calculations, Round/record contracts, localStorage shape,
Supabase and Shared Match authority are unchanged. No migration. Fixed paper
styles and Ledger report logic are unchanged; report asset queries follow the
release identity. Roadmap updates from the previous review are retained.

## Verification

All seven automated release gates pass: npm test (1,302/1,302, zero failures/skips),
lint (zero errors, 88 existing warnings), validate, six check:layout fixtures,
standard release:sanity (6 PASS, 3 development warnings, zero failures),
simulate:compare (77 exact live/mirror matches, zero failures/differences), and
test:simulations (4/4). New browser checks
cover 320/375/430px widths, both appearances, normal/enlarged text, SVG rendering,
tab reachability, read-only Insights routes and saving with a reduced viewport.
The compact chrome recovers 56px at 375px normal text (170px to 114px). Long golfer
names and desktop width are checked. No new important declarations are introduced;
the foundation/component total remains 617. Fixed paper styles are untouched.
The focused type/navigation browser run passes 73/73 checks. A real local worker
install and offline reload retain all six rendered SVG icons and Insights routing.
QA found that a detail-click could hit the sticky Save action without first
revealing the control, and that the enlarged hole header could cover Save in a
short viewport. Tests now reveal the detail control before a real click; short
viewports let the hole header scroll normally, and the action bar stays above it.
The release-identity guard also caught a current-version literal in a test comment;
the comment is now version-neutral and the 14 identity/entry checks pass.
The final complete suite includes these corrections. Generated report references
are restored after verification; no commit, push, deployment or migration is made.

Physical iPhone/PWA light/dark, Larger Text, keyboard and orientation acceptance
remains pending. Four-device live Shared Match acceptance remains separate.

## Git and roadmap

Branch: `codex/v31.0.58-play-navigation`. Uncommitted and undeployed.
Next: Preferences/setup density; Results/overlay clarity; separately scoped useful
Insights. Subsequent version numbers are unassigned. Bottom navigation is deferred.
