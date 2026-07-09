import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareScoredLedgers,
  extractLocalScoredLedger,
  extractRemoteScoredLedger,
  mergeRemoteLedgerIntoLocalMatch,
  summarizeLedgerParity,
} from '../scripts/shared-match-ledger.js';

function makeMatch() {
  return {
    players: [
      { playerId: 'p1', playerName: 'Alex', scores: [{ holeNumber: 1, gross: 4 }, { holeNumber: 2, gross: null }] },
      { playerId: 'p2', playerName: 'Blake', scores: [{ holeNumber: 1, gross: 5 }, { holeNumber: 2, gross: null }] },
      { playerId: 'p3', playerName: 'Casey', scores: [{ holeNumber: 1, gross: null }, { holeNumber: 2, gross: null }] },
    ],
  };
}

test('identical scored ledgers confirm parity', () => {
  const match = makeMatch();
  const local = extractLocalScoredLedger(match);
  const remote = extractRemoteScoredLedger(match, [
    { player_id: 'p1', hole_number: 1, gross: 4 },
    { player_id: 'p2', hole_number: 1, gross: 5 },
  ]);
  const comparison = compareScoredLedgers(local, remote);
  assert.equal(comparison.parityConfirmed, true);
  assert.equal(summarizeLedgerParity(comparison).status, 'confirmed');
});

test('remote/shared extra score is reported as missing locally', () => {
  const match = makeMatch();
  const local = extractLocalScoredLedger(match);
  const remote = extractRemoteScoredLedger(match, [
    { player_id: 'p1', hole_number: 1, gross: 4 },
    { player_id: 'p2', hole_number: 1, gross: 5 },
    { player_id: 'p2', hole_number: 2, gross: 4 },
  ]);
  const comparison = compareScoredLedgers(local, remote);
  assert.equal(comparison.parityConfirmed, false);
  assert.deepEqual(comparison.missingLocal.map(entry => `${entry.playerId}:${entry.holeNumber}:${entry.gross}`), ['p2:2:4']);
});

test('local extra score is reported as missing remotely and preserved', () => {
  const match = makeMatch();
  match.players[0].scores[1].gross = 3;
  const local = extractLocalScoredLedger(match);
  const remote = extractRemoteScoredLedger(match, [
    { player_id: 'p1', hole_number: 1, gross: 4 },
    { player_id: 'p2', hole_number: 1, gross: 5 },
  ]);
  const comparison = compareScoredLedgers(local, remote);
  assert.equal(comparison.parityConfirmed, false);
  assert.deepEqual(comparison.missingRemote.map(entry => `${entry.playerId}:${entry.holeNumber}:${entry.gross}`), ['p1:2:3']);
  assert.equal(match.players[0].scores[1].gross, 3);
});

test('different same-player same-hole scores produce a conflict', () => {
  const match = makeMatch();
  const local = extractLocalScoredLedger(match);
  const remote = extractRemoteScoredLedger(match, [
    { player_id: 'p1', hole_number: 1, gross: 6, device_id: 'joined-1' },
    { player_id: 'p2', hole_number: 1, gross: 5 },
  ]);
  const comparison = compareScoredLedgers(local, remote);
  assert.equal(comparison.parityConfirmed, false);
  assert.equal(comparison.conflicts.length, 1);
  assert.equal(comparison.conflicts[0].field, 'gross');
  assert.equal(comparison.conflicts[0].localValue, 4);
  assert.equal(comparison.conflicts[0].remoteValue, 6);
});

test('remote joined-device score is merged into stale host local state', () => {
  const host = makeMatch();
  const remote = extractRemoteScoredLedger(host, [
    { player_id: 'p1', hole_number: 1, gross: 4, participant_id: 'host' },
    { player_id: 'p2', hole_number: 1, gross: 5, participant_id: 'cart-two' },
    { player_id: 'p2', hole_number: 2, gross: 4, participant_id: 'cart-two' },
  ]);
  const result = mergeRemoteLedgerIntoLocalMatch(host, remote);
  assert.equal(result.changed, true);
  assert.equal(host.players[1].scores[1].gross, 4);
});

test('joined-device score is not erased by stale host local state', () => {
  const host = makeMatch();
  host.players[1].scores[1].gross = null;
  const remote = extractRemoteScoredLedger(host, [
    { player_id: 'p2', hole_number: 2, gross: 4, participant_id: 'cart-two' },
  ]);
  mergeRemoteLedgerIntoLocalMatch(host, remote);
  assert.equal(host.players[1].scores[1].gross, 4);
  const emptyRemote = extractRemoteScoredLedger(host, []);
  mergeRemoteLedgerIntoLocalMatch(host, emptyRemote);
  assert.equal(host.players[1].scores[1].gross, 4);
});

test('old/shared matches without new metadata do not crash', () => {
  const comparison = compareScoredLedgers(extractLocalScoredLedger({}), extractRemoteScoredLedger({}, null));
  assert.equal(comparison.parityConfirmed, true);
  assert.equal(summarizeLedgerParity(comparison).status, 'confirmed');
});

test('ledger logic does not assume only two devices', () => {
  const match = makeMatch();
  const remote = extractRemoteScoredLedger(match, [
    { player_id: 'p1', hole_number: 1, gross: 4, participant_id: 'host' },
    { player_id: 'p2', hole_number: 1, gross: 5, participant_id: 'cart-two' },
    { player_id: 'p3', hole_number: 1, gross: 6, participant_id: 'cart-three' },
  ]);
  const comparison = compareScoredLedgers(extractLocalScoredLedger(match), remote);
  assert.equal(comparison.missingLocal.length, 1);
  assert.equal(comparison.missingLocal[0].sourceParticipant, 'cart-three');
});
