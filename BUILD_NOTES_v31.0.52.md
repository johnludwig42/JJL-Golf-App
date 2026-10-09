# The Dye Ledger v31.0.52 — Design Token Foundation

## Scope

Semantic color tokens replace literal colors throughout `style.css`, preserving the original light values, declarations, cascade and importance. Role-scoped shade variants retain existing rendering. Legacy custom-property names remain aliases. Print colors are separate fixed-light families.

A PostCSS-based guardrail rejects raw colors outside token declarations and new px typography outside exact documented migration exceptions. Color exceptions are empty. The exception inventory must shrink as the approved type/component releases migrate styles. PostCSS is development-only; the app remains dependency-free at runtime.

No dark mode, font/spacing redesign, icon migration, component redesign or bottom navigation is included. `-webkit-text-size-adjust` and the existing cascade are unchanged. No scoring, RoundRecord, persistence, Supabase or shared-match change is included; application JavaScript changes only release identity metadata.

## Verification

- `npm test`: all 1,127 tests passed. Browser jobs run serially to avoid resource-dependent timeouts; automatic discovery still includes every test file.
- Computed-style and exact PNG comparisons passed 22 paired cases: 10 app surfaces at 375px/1280px, system-dark preference with the unchanged light palette, and print media. Includes both score-entry modes and dialog pseudo-elements.
- Guardrail mutation tests passed for raw hex/functions/names, fallback colors, new/duplicate px typography and stale exceptions. The frozen baseline has a portable checksum; the token registry must match the root declarations.
- `npm run lint`: zero errors, 88 existing warnings. `npm run validate` and whitespace checks passed.
- `npm run check:layout`: all six HTML/PDF/iOS fixture checks passed. Generated outputs were restored afterward so the original reference files remain unchanged in this release.
- `npm run release:sanity`: zero failures; expected warnings for uncommitted work and the default command's absent target-version argument.
- `npm run simulate:compare`: 77 scenarios, zero failures and zero live/mirror differences; 63 informational warnings and one settlement-size review flag. `npm run test:simulations`: all four tests passed.
- Full gates exposed pre-existing stale checks for earlier report labels, incomplete-round finality, omitted payout fixture players, and a transient report URL. Tests/tooling were updated to verify the already-shipped behavior; no production/domain fix was included. Legacy CSS-shape assertions resolve the new tokens and are backed by the computed/pixel browser checks.

## Acceptance

Branch: `codex/v31.0.52-design-token-foundation`. No commit, push, merge, deployment or migration performed by Codex. Real iPhone acceptance remains required before approval: dark/light system appearance, Larger Text enabled, and keyboard open during live scoring. The dark-mode release is intentionally held for foundation review.
