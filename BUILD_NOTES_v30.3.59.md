# Build Notes v30.3.59 — Featured Match Status Consistency and Play/Scores UX Scrub

## Release theme

Make the Play featured status answer where the competition stands now, while keeping displayed-hole history and honors clearly contextual.

## Shipped

- Featured statuses use saved match data by default and an explicit live basis only when unsaved score inputs materially change the result.
- SSP header status uses the latest cumulative `finalLeader`, so reviewing an earlier or unscored hole no longer rewinds the header.
- `Live SSP` and `Live Nassau` mean draft DOM scores are included; saved-only status uses `SSP Match` and `Nassau`.
- Nassau draft behavior now uses the same path regardless of whether SSP is active.
- The SSP hole card retains displayed-hole history as `SSP After Hole N` or `Live SSP After Hole N`.
- Honors remains displayed-hole tee-order context and is labeled `Honors for Hole N`.
- Scoring, settlement, sequence, Momentum, Quick Scoreboard trend, and Shared Match reconciliation rules are unchanged.

## Add-on — SSP Settlement and Header Polish

- SSP money now settles per player: final point differential × dollars per point is paid by every losing-team player and received by every winning-team player.
- SSP player amounts are included once in Quick Scoreboard Money and combined Final Net Settlement, while the dedicated SSP section remains as the audit explanation.
- Dedicated reporting shows per-player value, both team obligations, and total transferred. Unequal legacy teams fail safely without contributing corrupt balances.
- Match Setup now says `SSP Hole Sequence`, with `Standard hole order` and `Out-of-sequence / shotgun order`; stored `routing`/`entry` values and ledger behavior are unchanged.
- Featured status and `Honors for Hole N` share a responsive wrapping row when space permits and separate cleanly on narrow screens.
- Starting Hole / Play Routing / Gambling Segment Basis is documented as a dedicated future model rather than implemented here.

## Validation

Passed app/service-worker syntax, both release sanity commands, `git diff --check`, all focused SSP and Shared Match suites, simulation/live-engine suites, `npm test`, and `npm run test:run` (50/50). All four requested simulation modes completed with zero failures and exact live-vs-mirror parity (60/60 and 110/110). The generated latest simulation summary was inspected and reverted.

## Known limitations

- Some featured games expose only compact status helpers; unsupported helpers fall back safely.
- Live status currently reacts to unsaved score inputs. SSP action controls continue using their existing immediate persistence behavior.
- The full Starting Hole / Play Routing / Gambling Segment Basis model is deferred; Classic Scorecard and current game segment behavior remain unchanged.
- Field-level SSP conflict UI, randomized two-device SSP simulation, broader tab UX, Courses audit, Skins/Net Skins cleanup, Press Engine design, and Player Preferences remain deferred.
