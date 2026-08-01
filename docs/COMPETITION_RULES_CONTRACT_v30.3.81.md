# v30.3.81 Competition Rules Contract

## Purpose

Every configured game must state its scoring basis, scoring method, effective handicap treatment, tie/carryover behavior, stake meaning, escalation behavior, and finality. New game configurations are stamped with Competition Rules Catalog version 1. Existing configurations without a stamp remain legacy records and are not silently rewritten.

## Compatibility boundary

- New rounds save `competitionRulesCatalogVersion: 1` and each selected game saves `rulesCatalogVersion: 1`.
- Existing local rounds, completed records, RoundRecord snapshots, Shared Match payloads, scores, Presses, SSP facts, and settlements are preserved.
- Loading or signing in never upgrades, recalculates, or republishes a historical result.
- The catalog describes the calculation contract; the authoritative saved round facts continue to determine results.

## WHS calculation

Course Handicap is retained at full calculated precision while applying a handicap allowance. The Playing Handicap is rounded only after the allowance is applied. The rounded Course Handicap remains available for display and handicap-posting adjustments. This avoids double rounding under WHS Rules 6.1 and 6.2.

## Skins

New Gross and Net Skins configurations explicitly choose whether tied skins carry forward. The v30.3.81 default is `carry`, and an unresolved carry after the final hole expires without a winner. A carried winner receives the current skin plus every accumulated tied skin. Settlement multiplies the per-skin stake by that saved skin value exactly once.

Legacy Skins configurations that do not contain `carryoverMode` retain the pre-v30.3.81 no-carry settlement behavior. This prevents historical rounds from being reinterpreted.

## Rules catalog fields

For every supported game the catalog provides:

- basis;
- scoring method;
- handicap allowance treatment;
- tie treatment;
- stake meaning;
- Press, carryover, Bridge, or other escalation treatment;
- finality.

The Match Setup Games destination exposes these terms under **Rules used for this round**. The disclosure is explanatory and does not mutate calculations.

