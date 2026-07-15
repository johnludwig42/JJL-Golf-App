# The Dye Ledger v30.3.72 - Final Product Acceptance & Shared Match Remediation

Release theme: **Confidence Across Devices**

## Summary

This final acceptance pass preserves the v30.3.72 Shared Match hardening and resolves the eight accepted product findings plus the approved host-only stand-alone Greenies policy. It does not change scoring, handicap, settlement, Press, SSP, RoundRecord, navigation, authentication, dependencies, or release version.

## Product acceptance remediation

- **Shared Match details:** the native Play `<details>` panel now has a sticky, iPhone-safe Done control. Done and Escape close the same disclosure, preserve the current Play/hole state, and return focus to the synchronization indicator.
- **Player selection and tee order:** the clear action now resolves on `pointerdown`, before blur or rerender can race a touch event. It clears only the intended player, preserves that slot's valid tee and all other slots, retains keyboard click fallback, and permits immediate reassignment. The existing single searchable combobox and authoritative setup-readiness contract remain intact.
- **Nassau:** a newly selected Nassau defaults to Net. Explicit existing, source, template, duplicate, and user-selected Gross values remain authoritative; no game math changed.
- **Handicap Preview:** the header and every player row share one five-column CSS grid. Player/Tee remains descriptive and left aligned; Index, Course HCP, Playing, and Gets are centered on identical tracks at mobile and desktop sizes.
- **Preferences:** schema v3 adds the missing Smart Score Advance On/Off preference. New-draft construction reads the latest persisted preference object at creation time, so an immediately created round sees the saved value without reload. Existing drafts remain snapshots, explicit template/source values win, round-only changes do not write back, and Quick Scoreboard preferences remain personal.
- **Match Codes and join:** new codes are canonical `DYE-[1-9]{6}`, collision-checked before finalization, and stable thereafter. Join accepts lowercase plus surrounding whitespace, rejects zero, ambiguous O, missing prefix/hyphen, and invalid lengths, retries delayed publication, requires participant registration before local insertion, publishes device metadata, and leaves Retry Join available with golfer-facing errors. Legacy active codes still use the compatibility normalization path and are not rewritten.
- **Finish routing:** Finish Round now asks the authoritative round-completion derivation whether the configured 9 or 18 holes contain every required score. A stale current-hole pointer, optional stats, or Shared status cannot route a complete round to End Round Early.
- **Scores momentum:** Scores reuses the established momentum renderer at full card width. Eighteen-hole rounds offer Front 9, Back 9, and Full 18; nine-hole rounds expose only the applicable view. Orientation, team labels, numeric ticks, symmetric bounds, baseline, and grid remain shared with Quick Scoreboard.
- **Stand-alone Greenies:** the Shared Match host is the sole author of the official per-hole group result. Joined devices receive validated authoritative replacements and cannot author suggestions or overwrite the fact. Corrections replace the prior value; refresh/replay is idempotent; SSP Prox remains a separate fact envelope.

## Root causes

The details disclosure was styled as a fixed mobile panel but relied on its summary as the only toggle, leaving no visible exit inside the full-height view. Player clear was click-only, allowing input blur and a rerender to win the touch event race. Handicap Preview repeated label/value blocks without one shared header track. Smart Score Advance timing existed, but its On/Off state was absent from the preference schema. Match Code generation allowed zero and did not verify collision, while join validation reused permissive legacy normalization and did not make registration failure fatal. Finish routing used a selected-round shortcut instead of the authoritative completion contract. Scores placed a single chart in the legacy six-column layout. Joined Greenies suggestions contradicted the approved group-result authority.

## Test coverage

`tests/final-product-acceptance-shared-remediation.test.js` adds nine focused acceptance tests. It covers dismissal/focus/mobile source bounds, clear/reassign ordering, Nassau precedence, the shared preview grid, immediate preference inheritance, 1,000 generated Match Codes, collision and delayed-publication retries, the production registration/publish/merge join sequence, complete/incomplete 9- and 18-hole finish routing, momentum ranges, and Greenies authority/replay/SSP separation.

`tests/player-tee-order-independence.test.js` now runs 240 varied setup sequences. Together with the existing 120-cycle player-selection suite, 360 deterministic interaction cycles protect slot isolation, tee ownership, duplicate handling, resizing, reload, readiness, and handicap invariants.

## Validation

- `node --check app.js`: pass.
- `node --check service-worker.js`: pass.
- `npm test`: 200 passed, 0 failed, 0 skipped.
- `npm run test:run`: 200 passed, 0 failed, 0 skipped.
- Focused final acceptance suite: 9 passed, 0 failed.
- Focused cross-feature acceptance/regression run: 56 passed, 0 failed.
- `npm run simulate`, `npm run simulate:live`, and `npm run simulate:compare`: 75 rounds each, 0 failures, 75/75 exact live-to-mirror matches.
- `npm run simulate:100`: 125 rounds, 0 failures, 125/125 exact live-to-mirror matches. The single suspicious result remains the intentional high-value blowout fixture.
- `npm run validate`: pass.
- `npm run release:sanity -- v30.3.72`: 8 pass, 1 expected dirty-tree warning, 0 fail.
- `git diff --check`: pass; Git emitted informational LF-to-CRLF working-copy warnings only.
- Rendered browser QA: v30.3.72 loaded at 1280 x 720 with no horizontal overflow or console errors; Smart Score Advance controls and canonical branding rendered correctly.
- `npm run lint`: unavailable because the declared local ESLint executable is not installed. No dependency was installed.

## Manual QA and known limitations

Physical two-device QA remains required for the live Supabase/RLS environment: host creation, copied code, second-device join, lowercase/spaces, participant registration, disconnect/reconnect, joined Greenies receipt, and final settlement/frozen history. The automated join test executes the production registration helper with deterministic Supabase-equivalent collaborators, but does not replace a real deployed Supabase/RLS smoke test. The available in-app browser rendered desktop layout but could not emulate an iPhone viewport; responsive mobile contracts are automated and physical iPhone layout remains on the checklist.

## Scope and Git confirmation

The application remains v30.3.72. No commit, push, merge, or pull request is performed by Codex.
