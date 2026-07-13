# v30.3.66 – Press Engine Implementation

This release turns the v30.3.65 dormant design into a production child-game model. It supersedes Nassau-only eligibility and direct-child-only architecture with escalation capabilities and bounded parent/child press trees.

Implemented: progressive setup controls on eligible match-play games; manual and prompt-at-threshold configuration; declaration-side, availability, declaration-window, stake, count, depth, and Nassau-component rules; deliberate host confirmation; deterministic one-hole support; stable press records and lifecycle; independent scoring over the press range; independent payout contribution; sync dedupe; host void/supersede helpers; nested Quick Scoreboard rows; RoundRecord game nodes, events, and component transactions.

Presses default off for legacy games. Supported escalation capabilities are Press for Nassau/Team Match/Singles Match, Carryover for Skins, Bridge for SSP, and None elsewhere. No handicap, base-game, SSP, Skins, or settlement algorithm was replaced.

Known limitations/deferred: no joined-device request/approval, no automatic creation, no custom/double stakes, no Hammer, no unlimited depth, and no Trip Ledger UI. Threshold configuration is persisted; automatic financial creation is prohibited.

Manual QA: enable each Nassau lane; verify manual confirmation before and after hole data; verify Hole 9/18 one-hole copy; verify duplicate/count/depth blocks; verify host/join authority; verify standalone Singles and Team Match setup; verify no controls for Skins/SSP; exercise win/tie/incomplete/void; reconcile parent plus multiple presses; inspect Quick Scoreboard, Scores/Match Summary, print, frozen RoundRecord, reopen history, offline save, and repeated Shared Match sync on the smallest supported iPhone.

Validation results are recorded in the final Codex report. Codex did not commit or push.

## Completion pass

Release blockers completed: confirmation-time `LOSING_SIDE_ONLY` revalidation preserves the originally confirmed stable side and rejects ties, reversals, changed starting holes, unavailable parents, duplicates, limits, and joined-device creation. Threshold opportunities now have deterministic identities with locally persisted dismissed/confirmed/stale state and newly relevant opportunity behavior. Shared Match metadata fetch and merge preserve host-created press records through stale/repeated ingestion with lifecycle precedence and deterministic dedupe. Scores and Match Summary now include an explicit hierarchical Presses audit, using frozen RoundRecord nodes and component transactions for settled history.

Focused coverage now includes same-name singles identity, team declaration-side rules, stale confirmation, prompt identity/persistence/new opportunities, Shared Match replay and lifecycle preservation, explicit audit rendering, empty-section suppression, and frozen-report immutability. Current limitations remain the deliberately deferred live press-of-press declaration UI, broad void/supersede UI, joined-device request/approval, automatic creation, custom/double stakes, Hammer, and unlimited depth.

Final automated validation: JavaScript syntax checks passed; `npm test` and `npm run test:run` passed 108/108 tests; focused presentation/Press/Report/Mobile suites passed 33/33; 60-round compare, 60-round live, 60-round compare rerun, and 110-round stress simulations each completed with zero failures and zero live/mirror differences. The single pre-existing suspicious simulation outcome and expected warnings remain unchanged. `git diff --check` passed, and the generated latest simulation summary was reverted.

## Quick Scoreboard presentation polish

The Quick Scoreboard now leads with compact “pays” settlement copy and correct payment grammar, followed by explicit base Nassau Front, Back, and Overall/18 results. Presses are nested beneath their recorded component with declarer, range, stake, result, lifecycle, and ledger contribution. The trusted Classic Scorecard is read-only and collapsed by default before collapsible Momentum Charts. Nassau points show visible `+`, `-`, and `E` states with the positive reference side named. Round Highlight follows factual scorecard and momentum evidence, and Course HCP context is grouped into a compact Players section.

Desktop presentation is centered within a 1120px content shell with bounded cards instead of edge-to-edge green fields. Small-iPhone rules collapse result rows to one column, reduce press indentation, retain tap-sized disclosures, and confine wide scorecards/charts to internal horizontal scrolling. Focused coverage verifies component visibility and ordering, parent/child nesting, settlement singular/plural copy and cents, scorecard-before-momentum order, read-only scorecard markup, signed Nassau values, even-state `E`, explicit orientation, and frozen snapshot non-mutation.

## Final Game Summary and contextual action

The compact Player Score Summary is restored immediately before Classic Scorecard with stable player IDs and protected Gross, Net, and Net +/- columns. “Base Game Results” is renamed “Game Summary”; it preserves Nassau component/press hierarchy and adds every other selected game using its existing native status and trusted game contribution.

Permanent press-creation content was removed from the report surface. Play now places a single contextual `Press` button beside `Scoreboard`; it is removed from interaction unless the host is viewing the authoritative active scoring hole and at least one fully revalidated opportunity exists. The `Create a Press` card lists multiple opportunities deterministically, and selection still requires `Confirm Press`. Untouched active holes are included, partial holes remain eligible only under `BEFORE_HOLE_COMPLETED` with an explicit warning, and touched holes under `BEFORE_HOLE_STARTED` never move silently to the next hole. Completed, historical, joined-device, backward-browsing, and premature-forward contexts show no action.
