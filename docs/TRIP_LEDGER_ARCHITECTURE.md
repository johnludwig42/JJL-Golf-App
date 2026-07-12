# Trip Ledger Architecture Preparation

## Purpose

v30.3.63 makes a newly finalized round a durable accounting input without shipping a Trip Ledger UI, authentication, cloud ownership, invitations, or multi-round settlement.

> The Trip Ledger must aggregate frozen settlement transactions from finalized RoundRecords. It must not recompute historical financial results from raw scores using current game logic.

## Frozen RoundRecord and authority

`match.roundRecordSnapshot` stores RoundRecord schema v1. Confirm Finish is the freeze boundary because it is where the production settlement result becomes authoritative. A snapshot includes the round ID, player IDs and presentation names, round/course/tee metadata, games and events, net positions, deterministic payer/payee transactions, `tripId`, `eventId`, nullable ownership/device fields, `isFrozen`, `frozenAt`, `settledAt`, and source-version metadata.

The snapshot reuses `getPayoutReportContext()` and `optimalSettlementRows()`; it does not implement game or settlement math. Reports call `getEffectiveRoundRecord()`: a valid frozen snapshot is cloned and returned unchanged, while a legacy or unsettled round is safely derived on demand. Normalization and ordinary saves preserve frozen snapshots.

Only a fully completed round, or an early-ended round whose selected games are all mathematically final, is eligible. Provisional early-ended rounds remain usable and reportable but are not frozen. A Shared Match snapshot may be created and published only by the host device. Joined devices may consume a host snapshot but cannot generate or replace it.

## Transactions and reconciliation

Transactions retain the v30.3.62 payer/payee convention: positive `amount` moves from `payerId` to `payeeId`. IDs and ordering are deterministic within a round. Amounts must be finite and greater than zero; payer and payee must be different stable players. `settlement.netPositions`, `settlement.payments`, and `settlement.crossFoot` remain the audit sources. Currency is currently assumed to be USD presentation, although the v1 transaction shape does not yet persist a currency code. Existing cent-level production rounding remains authoritative.

For a `$10` A-to-B transaction, A contributes `-$10` and B `+$10`. Player balances for a reconciled set sum to zero unless a future schema explicitly introduces an external pot, house, fee, or non-player entity.

## Stable player identity and local registry

The existing local player `id` remains canonical. Match participants and frozen transactions reference it as `playerId`; display names are presentation only. Existing IDs are retained. A legacy participant without an ID receives the deterministic match-scoped ID `round:<roundId>:player:<position>` during normalization, which remains stable after persistence. Same-name players are not merged, and renaming a player does not alter the ID.

`state.playerRegistry` is an optional local schema-v1 index of known players. It is populated by stable ID, never name-only matching, and reserves nullable ownership/device fields and aliases. It does not replace the existing Players UI or require interaction, login, Supabase, or network access.

## Saved rosters

`state.savedRosters` is an optional local schema-v1 container. Each roster has a stable `rosterId` and de-duplicated `playerIds`, with nullable trip, event, ownership, creator, and device references. No existing match is automatically converted into a roster. Roster management, invitations, permissions, and sharing are deferred.

## Trip, event, and ownership hooks

Matches and RoundRecord metadata preserve nullable `tripId` and `eventId`. A trip is a multi-round grouping that may later include travel/social context. An event is a competition, tournament, league, or formal grouping. A round may belong to neither or, subject to future product rules, one or both.

Nullable `ownerUserId`, `createdBy`, `deviceId`, and `hostDeviceId` prepare schemas for later synchronization. They do not implement access control and never gate scoring, settlement, reports, or offline use.

## Aggregation contract

A future Trip Ledger must:

1. Select finalized, non-void, non-superseded frozen RoundRecords by `tripId` or an approved grouping key.
2. Reject duplicate round IDs and duplicate transaction IDs rather than double-counting them.
3. Sum each frozen payer/payee transaction by stable player ID.
4. Resolve the current display name through the registry when available, falling back to the frozen player presentation record.
5. Keep same-name IDs separate and retain missing, deleted, or archived players as accounting participants.
6. Never rerun game rules, handicap calculations, scorecards, current defaults, or report prose.
7. Never mutate a source snapshot.

Legacy rounds without snapshots are not immutable ledger inputs. A future import flow may explicitly derive and label them, but v30.3.63 does not bulk-freeze or migrate history. Partial or unsettled rounds are excluded. Currency mismatch must block aggregation until a future currency policy exists. Import/export must preserve IDs, freeze metadata, and transaction bytes. Cloud conflicts must prefer an explicitly authoritative host version and surface conflicting frozen records rather than silently choosing or merging them.

## Reopening, correction, voiding, and supersession

The current product explicitly allows reopening a completed round and later saving it as an overwrite. Reopening moves the frozen snapshot into `roundRecordSnapshotHistory`, stamps `supersededAt` and `supersededReason`, and clears the active snapshot. Confirming the corrected finish creates a new snapshot if eligible. Reports do not perform this transition. A future correction UI should expose this audit history and support explicit void/supersession semantics; it must never silently replace frozen history.

## Legacy and offline compatibility

All fields are additive. Missing registries, rosters, grouping IDs, ownership hooks, and snapshots normalize to safe local defaults. Existing matches remain scoreable and reportable. No startup bulk migration, destructive storage rewrite, Supabase migration, login, or connectivity requirement was added. Classic Scorecard and production settlement behavior are unchanged.

## Known limitations and deferred features

- No Trip Ledger, trip/event, roster-management, correction-history, or player-registry UI.
- No aggregator, multi-round reconciliation, currency conversion, cloud conflict protocol, authentication, ownership enforcement, invitations, or legacy bulk migration.
- Shared snapshot transport uses existing host-authored Shared Match metadata; automated two-device end-to-end coverage remains limited.
- The RoundRecord transaction schema does not yet include an explicit currency field or per-game allocation when the minimum-payment route combines multiple games.

